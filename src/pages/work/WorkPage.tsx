import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button, Input, Segmented, Select, Switch, Tag, Tooltip } from "antd";
import {
  Briefcase, Move, RotateCw, Magnet, Undo2, Redo2, Save, SaveAll, Play, Pause, Square, PanelLeftClose, PanelLeftOpen,
  ChevronsUp, ChevronsDown, Eye, EyeOff,
} from "lucide-react";
import type * as THREE from "three";
import { useAuth } from "../../contexts/AuthContext";
import { useConfirm } from "../../components/ConfirmDialog";
import { notify } from "../../lib/notify";
import { fetchLayout, fileUrl, getModelSet, listModelSets, meshAssets } from "../../lib/modelsService";
import { deleteScene, getScene, listScenes, saveScene } from "../../lib/scenesService";
import {
  cloneSubtree, computeWorlds, descendantsOf, DEFAULT_LIGHT, effectiveStatic, newId, normalizeObject, removeSubtree,
  reparent, toLocalData,
} from "../../lib/sceneMath";
import type {
  CanvasBridge, JointDef, LightType, ModelSetRow, PerfStats, SceneObjectData, SceneSummary, Vec3, ViewPrefs,
} from "../../lib/workTypes";
import { layoutToObjects } from "./layoutImport";
import { Runtime } from "./runtime";
import { useUndoable } from "./useUndoable";
import WorkCanvas from "./WorkCanvas";
import WorkInspector from "./WorkInspector";
import WorkSidebar, { DRAG_MIME } from "./WorkSidebar";
import "./WorkPage.css";

const LAST_SCENE_KEY = "evol_work_last_scene";
const PREFS_KEY = "evol_work_prefs";
const UI_KEY = "evol_work_ui";

const DEFAULT_PREFS: ViewPrefs = {
  instancing: true, frustumCull: true, distanceCull: true, cullDistance: 70, lod: true, lodDistance: 16,
  showGizmos: true, defaultLight: true, shadows: true, space: "world", focusSelection: true, forceWebGL: false,
};
const DEFAULT_UI = { all: true, side: true, toolbar: true, inspector: true, log: true };

function loadJson<T extends object>(key: string, def: T): T {
  try { const raw = localStorage.getItem(key); return raw ? { ...def, ...JSON.parse(raw) } : def; } catch { return def; }
}
const saveJson = (key: string, v: unknown) => { try { localStorage.setItem(key, JSON.stringify(v)); } catch { /* ignore */ } };
const errMsg = (e: unknown) => (e instanceof Error ? e.message : String((e as any)?.message ?? e));
const snap01 = (n: number) => Math.round(n * 10) / 10;

export function WorkPage() {
  const { user } = useAuth();
  const confirmDialog = useConfirm();

  // --- model sets (from Supabase)
  const [sets, setSets] = useState<ModelSetRow[]>([]);
  const [activeSetId, setActiveSetId] = useState<number | null>(null);
  const [loadingSets, setLoadingSets] = useState(true);

  // --- scene document
  const history = useUndoable<SceneObjectData[]>([]);
  const objects = history.value;
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [sceneId, setSceneId] = useState<number | null>(null);
  const [sceneName, setSceneName] = useState("Untitled scene");
  const [savedKey, setSavedKey] = useState("");
  const [saving, setSaving] = useState(false);
  const [scenes, setScenes] = useState<SceneSummary[]>([]);

  // --- editor + view
  const [mode, setMode] = useState<"translate" | "rotate">("translate");
  const [snap, setSnap] = useState(true);
  const [prefs, setPrefs] = useState<ViewPrefs>(() => loadJson(PREFS_KEY, DEFAULT_PREFS));
  const [ui, setUi] = useState(() => loadJson(UI_KEY, DEFAULT_UI));
  const [jointDefs, setJointDefs] = useState<Record<string, JointDef[]>>({});
  const [stats, setStats] = useState<PerfStats | null>(null);
  const [backend, setBackend] = useState("");
  const bridgeRef = useRef<CanvasBridge | null>(null);
  const restoredRef = useRef(false);

  // --- play mode (simulation)
  const runtimeRef = useRef<Runtime | null>(null);
  if (!runtimeRef.current) runtimeRef.current = new Runtime();
  const runtime = runtimeRef.current;
  const [playing, setPlaying] = useState(false);
  const [paused, setPaused] = useState(false);
  const [timeScale, setTimeScale] = useState(1);
  const [forced, setForced] = useState<Set<string>>(new Set()); // static objects the sim turned into real nodes
  const [epoch, setEpoch] = useState(0);                        // bump to rebuild all nodes (start/stop)
  const [logs, setLogs] = useState<string[]>([]);

  const updatePrefs = useCallback((patch: Partial<ViewPrefs>) => {
    setPrefs((cur) => { const n = { ...cur, ...patch }; saveJson(PREFS_KEY, n); return n; });
    if ("forceWebGL" in patch) { setBackend(""); setStats(null); }
  }, []);
  const updateUi = useCallback((patch: Partial<typeof DEFAULT_UI>) => {
    setUi((cur) => { const n = { ...cur, ...patch }; saveJson(UI_KEY, n); return n; });
  }, []);

  // --- derived
  const worlds = useMemo(() => computeWorlds(objects), [objects]);
  const staticIds = useMemo(() => effectiveStatic(objects, prefs.instancing), [objects, prefs.instancing]);
  const byId = useMemo(() => new Map(objects.map((o) => [o.id, o])), [objects]);
  const latestSet = useMemo(
    () => [...sets].sort((a, b) => b.created_at.localeCompare(a.created_at))[0] ?? null, [sets]);
  const activeSet = sets.find((s) => s.id === activeSetId) ?? null;
  const assets = useMemo(() => meshAssets(activeSet), [activeSet]);
  const assetUrls = useMemo(
    () => (activeSet ? Object.fromEntries(assets.map((a) => [a, fileUrl(activeSet, a)])) : {}) as Record<string, string>,
    [assets, activeSet]);
  const selected = selectedId ? byId.get(selectedId) ?? null : null;
  const missing = objects.filter((o) => o.kind === "model" && (!o.asset || !assets.includes(o.asset))).length;
  const currentKey = useMemo(() => JSON.stringify([activeSet?.version ?? null, objects]), [activeSet, objects]);
  const dirty = sceneId !== null ? currentKey !== savedKey : objects.length > 0;

  // ---------------------------------------------------------------- loading
  useEffect(() => {
    (async () => {
      try {
        const rows = await listModelSets();
        setSets(rows);
        if (rows[0]) setActiveSetId(rows[0].id);
      } catch (e) { notify.error("Couldn't load model sets", errMsg(e)); }
      setLoadingSets(false);
    })();
  }, []);

  const refreshScenes = useCallback(async () => {
    if (!user) { setScenes([]); return; }
    try { setScenes(await listScenes(user.id)); } catch (e) { notify.error("Couldn't load scenes", errMsg(e)); }
  }, [user]);
  useEffect(() => { refreshScenes(); }, [refreshScenes]);

  useEffect(() => {
    if (!dirty) return;
    const h = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [dirty]);

  const onJointDefs = useCallback((asset: string, defs: JointDef[]) => {
    setJointDefs((cur) => (cur[asset] ? cur : { ...cur, [asset]: defs }));
  }, []);

  // ---------------------------------------------------------------- play mode
  function play() {
    if (playing) return;
    runtime.start(objects, worlds, staticIds, (id) => setForced((cur) => (cur.has(id) ? cur : new Set(cur).add(id))));
    setForced(new Set());
    setEpoch((e) => e + 1);
    setPlaying(true);
    setPaused(false);
    updateUi({ log: true });
  }
  function stop() {
    if (!playing) return;
    runtime.stop();
    setPlaying(false);
    setPaused(false);
    setForced(new Set());
    setEpoch((e) => e + 1);   // rebuild every node => everything returns to its authored pose
  }
  useEffect(() => {
    if (!playing) return;
    let last = -1;
    const t = setInterval(() => {
      if (runtime.logVersion !== last) { last = runtime.logVersion; setLogs([...runtime.logs]); }
    }, 300);
    return () => clearInterval(t);
  }, [playing, runtime]);

  // ---------------------------------------------------------------- scene ops
  async function discardOk() {
    return !dirty || confirmDialog({
      title: "Discard unsaved changes?", description: "The current scene has changes that haven't been saved.",
      confirmText: "Discard", danger: true,
    });
  }

  async function openScene(id: number, skipConfirm = false) {
    if (!skipConfirm && !(await discardOk())) return;
    try {
      const row = await getScene(id);
      const objs = (row.data?.objects ?? []).map(normalizeObject);   // also upgrades v1 scenes
      let set = sets.find((s) => s.name === row.model_set_name && s.version === row.model_set_version) ?? null;
      if (!set && row.model_set_name && row.model_set_version) {
        set = await getModelSet(row.model_set_name, row.model_set_version);
        if (set) setSets((cur) => [...cur, set!]);
      }
      if (!set) { set = latestSet; notify.info("Saved model version not found", "Opened with the latest models instead."); }
      if (set) setActiveSetId(set.id);
      if (playing) stop();
      history.reset(objs);
      setSceneId(row.id);
      setSceneName(row.name);
      setSavedKey(JSON.stringify([set?.version ?? null, objs]));
      setSelectedId(null);
      saveJson(LAST_SCENE_KEY, row.id);
    } catch (e) { notify.error("Couldn't open scene", errMsg(e)); }
  }

  useEffect(() => {
    if (restoredRef.current || loadingSets || !user) return;
    restoredRef.current = true;
    try { const id = localStorage.getItem(LAST_SCENE_KEY); if (id) openScene(Number(id), true); } catch { /* ignore */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadingSets, user]);

  async function newScene() {
    if (!(await discardOk())) return;
    if (playing) stop();
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
        set: activeSet, doc: { version: 2, objects },
      });
      setSceneId(row.id);
      setSceneName(row.name);
      setSavedKey(keyNow);
      saveJson(LAST_SCENE_KEY, row.id);
      notify.updated(`"${row.name}" saved.`);
      refreshScenes();
    } catch (e) { notify.error("Couldn't save scene", errMsg(e)); }
    setSaving(false);
  }

  async function removeScene(s: SceneSummary) {
    if (!(await confirmDialog({ title: `Delete "${s.name}"?`, description: "This can't be undone.", confirmText: "Delete", danger: true }))) return;
    try {
      await deleteScene(s.id);
      notify.deleted(`"${s.name}" removed.`);
      if (s.id === sceneId) { setSceneId(null); try { localStorage.removeItem(LAST_SCENE_KEY); } catch { /* ignore */ } }
      refreshScenes();
    } catch (e) { notify.error("Couldn't delete scene", errMsg(e)); }
  }

  // ---------------------------------------------------------------- object ops
  const floorPoint = (at?: Vec3 | null): Vec3 => {
    const b = at ?? bridgeRef.current?.centerOnFloor() ?? [0, 0, 0];
    return snap ? [snap01(b[0]), 0, snap01(b[2])] : [b[0], 0, b[2]];
  };
  const labelFor = (base: string) => `${base}-${objects.filter((o) => o.label.startsWith(`${base}-`)).length + 1}`;

  function addObject(o: Partial<SceneObjectData> & { kind: SceneObjectData["kind"]; label: string }) {
    const obj: SceneObjectData = {
      id: newId(), asset: null, parentId: null, position: [0, 0, 0], rotation: [0, 0, 0], scale: 1, joints: {}, static: false, ...o,
    };
    history.set((cur) => [...cur, obj]);
    setSelectedId(obj.id);
  }
  const addModel = (asset: string, at?: Vec3 | null) =>
    addObject({ kind: "model", asset, label: labelFor(asset), position: floorPoint(at) });
  const addGroup = () => addObject({ kind: "group", label: labelFor("group"), position: floorPoint() });
  const addLight = (type: LightType) => {
    const p = floorPoint();
    addObject({
      kind: "light", label: labelFor(`${type}-light`), position: [p[0], 3, p[2]],
      light: { ...DEFAULT_LIGHT, type, intensity: type === "directional" ? 2 : 12, distance: type === "directional" ? 0 : 12 },
    });
  };

  const updateObject = useCallback((id: string, patch: Partial<SceneObjectData>, key?: string) => {
    history.set((cur) => cur.map((o) => (o.id === id ? { ...o, ...patch } : o)), key);
  }, [history.set]); // eslint-disable-line react-hooks/exhaustive-deps

  const deleteObject = useCallback((id: string) => {
    setSelectedId((s) => (s && descendantsOf(history.value, id).has(s) ? null : s));
    history.set((cur) => removeSubtree(cur, id));
  }, [history.set, history.value]); // eslint-disable-line react-hooks/exhaustive-deps

  function duplicateSelected() {
    if (!selected) return;
    const { copies, rootId } = cloneSubtree(objects, selected.id);
    history.set((cur) => [...cur, ...copies]);
    setSelectedId(rootId);
  }

  const reparentObject = useCallback((id: string, parentId: string | null) => {
    history.set((cur) => reparent(cur, id, parentId, computeWorlds(cur)));
  }, [history.set]);

  function setStaticSubtree(id: string, value: boolean) {
    const ids = descendantsOf(objects, id);
    history.set((cur) => cur.map((o) => (ids.has(o.id) && o.kind !== "light" ? { ...o, static: value } : o)));
  }

  const onTransformEnd = useCallback((id: string, world: THREE.Matrix4) => {
    const o = byId.get(id);
    if (!o) return;
    const data = toLocalData(world, o.parentId ? worlds.get(o.parentId) : undefined);
    history.set((cur) => cur.map((x) => (x.id === id ? { ...x, ...data } : x)));
  }, [byId, worlds, history.set]);

  async function importLayout() {
    if (!activeSet) return;
    if (objects.length && !(await confirmDialog({
      title: "Replace the scene with the warehouse layout?", description: "You can undo this with Ctrl+Z.", confirmText: "Replace",
    }))) return;
    try {
      const layout = await fetchLayout(activeSet);
      if (!layout) { notify.error("This model set has no layout.json"); return; }
      const out = layoutToObjects(layout, assets);
      history.set(out);
      setSelectedId(null);
      notify.added(`Imported ${out.length} objects.`);
    } catch (e) { notify.error("Couldn't import layout", errMsg(e)); }
  }

  // ---------------------------------------------------------------- drag & drop from the palette
  function onDrop(e: React.DragEvent) {
    const asset = e.dataTransfer.getData(DRAG_MIME);
    if (!asset) return;
    e.preventDefault();
    addModel(asset, bridgeRef.current?.screenToFloor(e.clientX, e.clientY));
  }

  // ---------------------------------------------------------------- keyboard shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest("input, textarea, [contenteditable='true'], .ant-select")) return;
      const mod = e.ctrlKey || e.metaKey;
      const k = e.key.toLowerCase();
      if (!mod && k === "h") { updateUi({ all: !ui.all }); return; }
      if (playing) return;   // no editing while the simulation runs
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
  const showUi = ui.all;
  const playControls = (
    <>
      {!playing ? (
        <Tooltip title="Run the behaviour scripts"><Button size="small" type="primary" className="btn-glow" icon={<Play size={13} />} onClick={play}>Play</Button></Tooltip>
      ) : (
        <>
          <Button size="small" icon={paused ? <Play size={13} /> : <Pause size={13} />} onClick={() => setPaused((p) => !p)} />
          <Button size="small" danger icon={<Square size={13} />} onClick={stop}>Stop</Button>
          <Select size="small" value={timeScale} onChange={setTimeScale} style={{ width: 66 }}
            options={[0.5, 1, 2, 4].map((v) => ({ value: v, label: `${v}×` }))} />
        </>
      )}
    </>
  );

  return (
    <div className="page work-page-shell">
      <div className="work-heading">
        <h2>
          <Briefcase size={20} style={{ verticalAlign: -4, marginRight: 8, color: "#8b6ff5" }} />
          Work
        </h2>
        <p className="evol-card-meta">
          W move · E rotate · G snap · Ctrl+Z undo · Ctrl+S save · Ctrl+D duplicate · Del delete · H hide panels
        </p>
      </div>

      <div className="work-layout">
        {showUi && (
          <div className={`work-side-wrap${ui.side ? "" : " collapsed"}`}>
            {ui.side && (
              <aside className="work-side evol-glass-card">
                <WorkSidebar
                  sets={sets} activeSet={activeSet} latestSet={latestSet} assets={assets} hasLayout={!!activeSet?.files.layout}
                  onSelectSet={setActiveSetId} onAddAsset={(a) => addModel(a)} onImportLayout={importLayout}
                  onAddGroup={addGroup} onAddLight={addLight}
                  loggedIn={!!user} scenes={scenes} currentSceneId={sceneId}
                  onNewScene={newScene} onOpenScene={(id) => openScene(id)} onDeleteScene={removeScene}
                  objects={objects} selectedId={selectedId} staticIds={staticIds}
                  onSelectObject={setSelectedId} onDeleteObject={deleteObject} onReparent={reparentObject}
                  prefs={prefs} onPrefs={updatePrefs} stats={stats} backend={backend}
                />
              </aside>
            )}
            <button type="button" className="work-side-toggle" onClick={() => updateUi({ side: !ui.side })}
              title={ui.side ? "Collapse panel" : "Expand panel"}>
              {ui.side ? <PanelLeftClose size={15} /> : <PanelLeftOpen size={15} />}
            </button>
          </div>
        )}

        <div className="work-stage"
          onDragOver={(e) => { if (e.dataTransfer.types.includes(DRAG_MIME)) e.preventDefault(); }} onDrop={onDrop}>
          <WorkCanvas
            objects={objects} worlds={worlds} staticIds={staticIds} forced={forced} assetUrls={assetUrls}
            selectedId={selectedId} onSelect={setSelectedId} onTransformEnd={onTransformEnd}
            mode={mode} snap={snap} prefs={prefs} runtime={runtime} playing={playing} paused={paused}
            timeScale={timeScale} epoch={epoch} bridgeRef={bridgeRef} onJointDefs={onJointDefs}
            onStats={setStats} onBackend={setBackend}
          />

          {showUi && (
            <div className={`work-toolbar evol-glass-card${ui.toolbar ? "" : " compact"}`}>
              {ui.toolbar && (
                <>
                  <Input size="small" className="work-scene-name" value={sceneName}
                    onChange={(e) => setSceneName(e.target.value)} placeholder="Scene name" />
                  {dirty && <Tag color="gold" style={{ marginRight: 0 }}>unsaved</Tag>}
                  <Tooltip title={user ? "Save (Ctrl+S)" : "Log in to save"}>
                    <Button size="small" type="primary" className="btn-glow" icon={<Save size={13} />}
                      loading={saving} disabled={!user || !activeSet || playing} onClick={() => save(false)}>Save</Button>
                  </Tooltip>
                  <Tooltip title="Save as a new scene">
                    <Button size="small" icon={<SaveAll size={13} />} disabled={!user || !activeSet || playing} onClick={() => save(true)} />
                  </Tooltip>
                  <span className="work-toolbar-sep" />
                  <Segmented size="small" value={mode} onChange={(v) => setMode(v as "translate" | "rotate")}
                    options={[
                      { value: "translate", label: <span title="Move (W)"><Move size={13} style={{ verticalAlign: -2 }} /></span> },
                      { value: "rotate", label: <span title="Rotate (E)"><RotateCw size={13} style={{ verticalAlign: -2 }} /></span> },
                    ]} />
                  <Tooltip title="Snap: 0.1 m / 15° (G)">
                    <span className="work-snap"><Magnet size={13} /><Switch size="small" checked={snap} onChange={setSnap} /></span>
                  </Tooltip>
                  <span className="work-toolbar-sep" />
                  <Button size="small" icon={<Undo2 size={13} />} disabled={!history.canUndo || playing} onClick={history.undo} title="Undo (Ctrl+Z)" />
                  <Button size="small" icon={<Redo2 size={13} />} disabled={!history.canRedo || playing} onClick={history.redo} title="Redo" />
                  <span className="work-toolbar-sep" />
                </>
              )}
              {playControls}
              {ui.toolbar && backend && <Tag color={backend === "WebGPU" ? "green" : "gold"} style={{ marginRight: 0 }}>{backend}</Tag>}
              <Button size="small" type="text" onClick={() => updateUi({ toolbar: !ui.toolbar })}
                title={ui.toolbar ? "Collapse toolbar" : "Expand toolbar"}
                icon={ui.toolbar ? <ChevronsUp size={14} /> : <ChevronsDown size={14} />} />
            </div>
          )}

          {showUi && missing > 0 && (
            <div className="work-warning evol-glass-card">
              {missing} model{missing === 1 ? "" : "s"} aren't in this model set, so they're hidden.
            </div>
          )}

          {showUi && selected && !playing && (
            <WorkInspector
              object={selected} objects={objects} joints={selected.asset ? jointDefs[selected.asset] ?? [] : []}
              collapsed={!ui.inspector} onToggleCollapsed={() => updateUi({ inspector: !ui.inspector })}
              onChange={(patch, key) => updateObject(selected.id, patch, key)}
              onReparent={(pid) => reparentObject(selected.id, pid)}
              onStaticSubtree={(v) => setStaticSubtree(selected.id, v)}
              onDuplicate={duplicateSelected} onDelete={() => deleteObject(selected.id)}
            />
          )}

          {showUi && (playing || logs.length > 0) && (
            <div className={`work-log evol-glass-card${ui.log ? "" : " collapsed"}`}>
              <div className="work-log-head" onClick={() => updateUi({ log: !ui.log })}>
                <span>Simulation log {playing ? `· ${runtime.entityCount} entities` : ""}</span>
                {ui.log ? <ChevronsDown size={13} /> : <ChevronsUp size={13} />}
              </div>
              {ui.log && (
                <div className="work-log-body">
                  {logs.length === 0 ? <div className="work-hint">No warnings. Scripts are running.</div>
                    : logs.slice(-12).map((l, i) => <div key={i}>{l}</div>)}
                </div>
              )}
            </div>
          )}

          <button type="button" className="work-ui-toggle" onClick={() => updateUi({ all: !ui.all })} title="Show / hide all panels (H)">
            {showUi ? <EyeOff size={14} /> : <Eye size={14} />}
          </button>

          {!loadingSets && sets.length === 0 && (
            <div className="work-empty-hint">No model sets yet — run the GitHub Action in your models repo first.</div>
          )}
        </div>
      </div>
    </div>
  );
}
