import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button, Input, Segmented, Switch, Tag, Tooltip } from "antd";
import { Briefcase, Move, RotateCw, Magnet, Undo2, Redo2, Save, SaveAll } from "lucide-react";
import { useAuth } from "../../contexts/AuthContext";
import { useConfirm } from "../../components/ConfirmDialog";
import { notify } from "../../lib/notify";
import { fetchLayout, fileUrl, getModelSet, listModelSets, meshAssets } from "../../lib/modelsService";
import { deleteScene, getScene, listScenes, saveScene } from "../../lib/scenesService";
import type {
  CanvasBridge, JointDef, ModelSetRow, SceneObjectData, SceneSummary, Vec3,
} from "../../lib/workTypes";
import { useUndoable } from "./useUndoable";
import WorkCanvas from "./WorkCanvas";
import WorkSidebar, { DRAG_MIME } from "./WorkSidebar";
import WorkInspector from "./WorkInspector";
import "./WorkPage.css";

const LAST_SCENE_KEY = "evol_work_last_scene";
const errMsg = (e: unknown) => (e instanceof Error ? e.message : String((e as any)?.message ?? e));
const snap01 = (n: number) => Math.round(n * 10) / 10;

export function WorkPage() {
  const { user } = useAuth();
  const confirmDialog = useConfirm();

  // --- model sets (from Supabase) ---
  const [sets, setSets] = useState<ModelSetRow[]>([]);
  const [activeSetId, setActiveSetId] = useState<number | null>(null);
  const [loadingSets, setLoadingSets] = useState(true);

  // --- scene ---
  const history = useUndoable<SceneObjectData[]>([]);
  const objects = history.value;
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [sceneId, setSceneId] = useState<number | null>(null);
  const [sceneName, setSceneName] = useState("Untitled scene");
  const [savedKey, setSavedKey] = useState("");
  const [saving, setSaving] = useState(false);
  const [scenes, setScenes] = useState<SceneSummary[]>([]);

  // --- editor ---
  const [mode, setMode] = useState<"translate" | "rotate">("translate");
  const [snap, setSnap] = useState(true);
  const [jointDefs, setJointDefs] = useState<Record<string, JointDef[]>>({});
  const bridgeRef = useRef<CanvasBridge | null>(null);
  const restoredRef = useRef(false);

  const latestSet = useMemo(
    () => [...sets].sort((a, b) => b.created_at.localeCompare(a.created_at))[0] ?? null, [sets]);
  const activeSet = sets.find((s) => s.id === activeSetId) ?? null;
  const assets = useMemo(() => meshAssets(activeSet), [activeSet]);
  const assetUrls = useMemo(
    () => Object.fromEntries(assets.map((a) => [a, fileUrl(activeSet!, a)])) as Record<string, string>,
    [assets, activeSet]);
  const selected = objects.find((o) => o.id === selectedId) ?? null;
  const missing = objects.filter((o) => !assets.includes(o.asset)).length;

  const currentKey = useMemo(() => JSON.stringify([activeSet?.version ?? null, objects]), [activeSet, objects]);
  const dirty = sceneId !== null ? currentKey !== savedKey : objects.length > 0;

  // ---------------------------------------------------------------- loading
  useEffect(() => {
    (async () => {
      try {
        const rows = await listModelSets();
        setSets(rows);
        if (rows[0]) setActiveSetId(rows[0].id);
      } catch (e) {
        notify.error("Couldn't load model sets", errMsg(e));
      }
      setLoadingSets(false);
    })();
  }, []);

  const refreshScenes = useCallback(async () => {
    if (!user) { setScenes([]); return; }
    try { setScenes(await listScenes(user.id)); } catch (e) { notify.error("Couldn't load scenes", errMsg(e)); }
  }, [user]);
  useEffect(() => { refreshScenes(); }, [refreshScenes]);

  // warn before closing the tab with unsaved work
  useEffect(() => {
    if (!dirty) return;
    const h = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [dirty]);

  const onJointDefs = useCallback((asset: string, defs: JointDef[]) => {
    setJointDefs((cur) => (cur[asset] ? cur : { ...cur, [asset]: defs }));
  }, []);

  // ---------------------------------------------------------------- scene ops
  async function openScene(id: number, skipConfirm = false) {
    if (!skipConfirm && dirty && !(await confirmDialog({
      title: "Discard unsaved changes?", description: "The current scene has changes that haven't been saved.",
      confirmText: "Discard", danger: true,
    }))) return;
    try {
      const row = await getScene(id);
      // Open with the model version the scene was saved with, so old scenes keep looking the same.
      let set = sets.find((s) => s.name === row.model_set_name && s.version === row.model_set_version) ?? null;
      if (!set && row.model_set_name && row.model_set_version) {
        set = await getModelSet(row.model_set_name, row.model_set_version);
        if (set) setSets((cur) => [...cur, set!]);
      }
      if (!set) {
        set = latestSet;
        notify.info("Saved model version not found", "Opened with the latest models instead.");
      }
      if (set) setActiveSetId(set.id);
      history.reset(row.data.objects);
      setSceneId(row.id);
      setSceneName(row.name);
      setSavedKey(JSON.stringify([set?.version ?? null, row.data.objects]));
      setSelectedId(null);
      try { localStorage.setItem(LAST_SCENE_KEY, String(row.id)); } catch { /* ignore */ }
    } catch (e) {
      notify.error("Couldn't open scene", errMsg(e));
    }
  }

  // reopen the last scene once models + login are ready
  useEffect(() => {
    if (restoredRef.current || loadingSets || !user) return;
    restoredRef.current = true;
    let id: string | null = null;
    try { id = localStorage.getItem(LAST_SCENE_KEY); } catch { /* ignore */ }
    if (id) openScene(Number(id), true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadingSets, user]);

  async function newScene() {
    if (dirty && !(await confirmDialog({
      title: "Discard unsaved changes?", description: "The current scene has changes that haven't been saved.",
      confirmText: "Discard", danger: true,
    }))) return;
    history.reset([]);
    setSceneId(null);
    setSceneName("Untitled scene");
    setSelectedId(null);
    try { localStorage.removeItem(LAST_SCENE_KEY); } catch { /* ignore */ }
  }

  async function save(asNew: boolean) {
    if (!user) { notify.info("Log in to save scenes"); return; }
    if (!activeSet) return;
    setSaving(true);
    try {
      const keyNow = currentKey;
      const row = await saveScene({
        id: asNew ? null : sceneId, userId: user.id, name: sceneName.trim() || "Untitled scene",
        set: activeSet, doc: { version: 1, objects },
      });
      setSceneId(row.id);
      setSceneName(row.name);
      setSavedKey(keyNow);
      try { localStorage.setItem(LAST_SCENE_KEY, String(row.id)); } catch { /* ignore */ }
      notify.updated(`"${row.name}" saved.`);
      refreshScenes();
    } catch (e) {
      notify.error("Couldn't save scene", errMsg(e));
    }
    setSaving(false);
  }

  async function removeScene(s: SceneSummary) {
    const ok = await confirmDialog({
      title: `Delete "${s.name}"?`, description: "This can't be undone.", confirmText: "Delete", danger: true,
    });
    if (!ok) return;
    try {
      await deleteScene(s.id);
      notify.deleted(`"${s.name}" removed.`);
      if (s.id === sceneId) {
        setSceneId(null);
        try { localStorage.removeItem(LAST_SCENE_KEY); } catch { /* ignore */ }
      }
      refreshScenes();
    } catch (e) {
      notify.error("Couldn't delete scene", errMsg(e));
    }
  }

  // ---------------------------------------------------------------- object ops
  function addObject(asset: string, at?: Vec3 | null) {
    const base = at ?? bridgeRef.current?.centerOnFloor() ?? [0, 0, 0];
    const position: Vec3 = snap ? [snap01(base[0]), 0, snap01(base[2])] : [base[0], 0, base[2]];
    const n = objects.filter((o) => o.asset === asset).length + 1;
    const obj: SceneObjectData = {
      id: crypto.randomUUID(), asset, label: `${asset} ${n}`, position, rotationY: 0, scale: 1, joints: {},
    };
    history.set((cur) => [...cur, obj]);
    setSelectedId(obj.id);
  }

  const updateObject = useCallback((id: string, patch: Partial<SceneObjectData>, key?: string) => {
    history.set((cur) => cur.map((o) => (o.id === id ? { ...o, ...patch } : o)), key);
  }, [history.set]); // eslint-disable-line react-hooks/exhaustive-deps

  function deleteObject(id: string) {
    history.set((cur) => cur.filter((o) => o.id !== id));
    if (selectedId === id) setSelectedId(null);
  }

  function duplicateSelected() {
    if (!selected) return;
    const copy: SceneObjectData = {
      ...selected, id: crypto.randomUUID(), label: `${selected.label} copy`,
      position: [selected.position[0] + 1, selected.position[1], selected.position[2]], joints: { ...selected.joints },
    };
    history.set((cur) => [...cur, copy]);
    setSelectedId(copy.id);
  }

  async function importLayout() {
    if (!activeSet) return;
    if (objects.length && !(await confirmDialog({
      title: "Replace the scene with the warehouse layout?", description: "You can undo this with Ctrl+Z.",
      confirmText: "Replace",
    }))) return;
    try {
      const layout = await fetchLayout(activeSet);
      if (!layout) { notify.error("This model set has no layout.json"); return; }
      const out: SceneObjectData[] = [];
      for (const [asset, list] of Object.entries<any[]>(layout.instances ?? {})) {
        // totes are skipped: hundreds of them want GPU instancing, not one scene node each
        if (asset === "tote" || !assets.includes(asset)) continue;
        for (const it of list) {
          out.push({ id: crypto.randomUUID(), asset, label: it.id, position: it.position,
            rotationY: it.rotationY ?? 0, scale: 1, joints: {} });
        }
      }
      if (assets.includes("robot")) {
        for (const r of layout.robots ?? []) {
          out.push({ id: crypto.randomUUID(), asset: "robot", label: r.id, position: r.start,
            rotationY: 0, scale: 1, joints: {} });
        }
      }
      history.set(out);
      setSelectedId(null);
      notify.added(`Imported ${out.length} objects.`);
    } catch (e) {
      notify.error("Couldn't import layout", errMsg(e));
    }
  }

  // ---------------------------------------------------------------- drag & drop from the palette
  function onDrop(e: React.DragEvent) {
    const asset = e.dataTransfer.getData(DRAG_MIME);
    if (!asset) return;
    e.preventDefault();
    addObject(asset, bridgeRef.current?.screenToFloor(e.clientX, e.clientY));
  }

  // ---------------------------------------------------------------- keyboard shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest("input, textarea, [contenteditable='true'], .ant-select")) return;
      const mod = e.ctrlKey || e.metaKey;
      const k = e.key.toLowerCase();
      if (mod && k === "z") { e.preventDefault(); e.shiftKey ? history.redo() : history.undo(); }
      else if (mod && k === "y") { e.preventDefault(); history.redo(); }
      else if (mod && k === "s") { e.preventDefault(); save(false); }
      else if (mod && k === "d") { e.preventDefault(); duplicateSelected(); }
      else if (!mod && k === "w") setMode("translate");
      else if (!mod && k === "e") setMode("rotate");
      else if (!mod && k === "g") setSnap((s) => !s);
      else if ((k === "delete" || k === "backspace") && selectedId) { e.preventDefault(); deleteObject(selectedId); }
      else if (k === "escape") setSelectedId(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  // ---------------------------------------------------------------- render
  return (
    <div className="page work-page-shell">
      <div className="work-heading">
        <h2>
          <Briefcase size={20} style={{ verticalAlign: -4, marginRight: 8, color: "#8b6ff5" }} />
          Work
        </h2>
        <p className="evol-card-meta">
          Pick models from Supabase, arrange them, save the scene. W move · E rotate · G snap · Ctrl+Z undo · Ctrl+S save · Del delete
        </p>
      </div>

      <div className="work-layout">
        <WorkSidebar
          sets={sets} activeSet={activeSet} latestSet={latestSet} assets={assets}
          hasLayout={!!activeSet?.files.layout}
          onSelectSet={setActiveSetId} onAddAsset={(a) => addObject(a)} onImportLayout={importLayout}
          loggedIn={!!user} scenes={scenes} currentSceneId={sceneId}
          onNewScene={newScene} onOpenScene={(id) => openScene(id)} onDeleteScene={removeScene}
          objects={objects} selectedId={selectedId} onSelectObject={setSelectedId} onDeleteObject={deleteObject}
        />

        <div className="work-stage" onDragOver={(e) => { if (e.dataTransfer.types.includes(DRAG_MIME)) e.preventDefault(); }} onDrop={onDrop}>
          <WorkCanvas
            objects={objects} assetUrls={assetUrls} selectedId={selectedId} onSelect={setSelectedId}
            onTransformEnd={(id, position, rotationY) => updateObject(id, { position, rotationY })}
            mode={mode} snap={snap} bridgeRef={bridgeRef} onJointDefs={onJointDefs}
          />

          <div className="work-toolbar evol-glass-card">
            <Input
              size="small" className="work-scene-name" value={sceneName}
              onChange={(e) => setSceneName(e.target.value)} placeholder="Scene name"
            />
            {dirty && <Tag color="gold" style={{ marginRight: 0 }}>unsaved</Tag>}
            <Tooltip title={user ? "Save (Ctrl+S)" : "Log in to save"}>
              <Button size="small" type="primary" className="btn-glow" icon={<Save size={13} />}
                loading={saving} disabled={!user || !activeSet} onClick={() => save(false)}>Save</Button>
            </Tooltip>
            <Tooltip title="Save as a new scene">
              <Button size="small" icon={<SaveAll size={13} />} disabled={!user || !activeSet} onClick={() => save(true)} />
            </Tooltip>
            <span className="work-toolbar-sep" />
            <Segmented
              size="small" value={mode} onChange={(v) => setMode(v as "translate" | "rotate")}
              options={[
                { value: "translate", label: <span title="Move (W)"><Move size={13} style={{ verticalAlign: -2 }} /></span> },
                { value: "rotate", label: <span title="Rotate (E)"><RotateCw size={13} style={{ verticalAlign: -2 }} /></span> },
              ]}
            />
            <Tooltip title="Snap to grid (G)">
              <span className="work-snap"><Magnet size={13} /><Switch size="small" checked={snap} onChange={setSnap} /></span>
            </Tooltip>
            <span className="work-toolbar-sep" />
            <Button size="small" icon={<Undo2 size={13} />} disabled={!history.canUndo} onClick={history.undo} title="Undo (Ctrl+Z)" />
            <Button size="small" icon={<Redo2 size={13} />} disabled={!history.canRedo} onClick={history.redo} title="Redo (Ctrl+Shift+Z)" />
          </div>

          {missing > 0 && (
            <div className="work-warning evol-glass-card">
              {missing} object{missing === 1 ? "" : "s"} use models that aren't in this model set, so they're hidden.
            </div>
          )}

          {selected && (
            <WorkInspector
              object={selected} joints={jointDefs[selected.asset] ?? []}
              onChange={(patch, key) => updateObject(selected.id, patch, key)}
              onDuplicate={duplicateSelected} onDelete={() => deleteObject(selected.id)}
            />
          )}

          {!loadingSets && sets.length === 0 && (
            <div className="work-empty-hint">No model sets yet — run the GitHub Action in your models repo first.</div>
          )}
        </div>
      </div>
    </div>
  );
}
