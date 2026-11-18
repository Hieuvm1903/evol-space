import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button, Input, Segmented, Select, Switch, Tag, Tooltip } from "antd";
import {
  Activity,
  Box,
  Briefcase,
  ChevronsDown,
  ChevronsUp,
  Eye,
  EyeOff,
  Magnet,
  Move,
  PanelLeftClose,
  PanelLeftOpen,
  Pause,
  Play,
  Redo2,
  RotateCw,
  Save,
  SaveAll,
  Square,
  Undo2,
  Wrench,
} from "lucide-react";
import type * as THREE from "three";
import { useGLTF } from "@react-three/drei";
import { useAuth } from "../../contexts/AuthContext";
import { useConfirm } from "../../components/ConfirmDialog";
import { notify } from "../../lib/notify";
import { fetchLayout, fileUrl, getModelSet, listModelSets, meshAssets } from "../../lib/modelsService";
import { deleteScene, getScene, listScenes, saveScene } from "../../lib/scenesService";
import {
  cloneSubtree,
  computeWorlds,
  DEFAULT_LIGHT,
  descendantsOf,
  effectiveStatic,
  newId,
  normalizeObject,
  removeSubtree,
  reparent,
  toLocalData,
} from "../../lib/sceneMath";
import type {
  AiModelBlueprint,
  AssetTelemetry,
  CameraMode,
  CameraPreset,
  CanvasBridge,
  FacilityKpis,
  FaultKind,
  JointDef,
  LightType,
  ModelSetRow,
  PerfStats,
  ReplayFrame,
  SceneObjectData,
  SceneSummary,
  StreamStatus,
  TwinAlert,
  TwinOverlayPrefs,
  TwinScenario,
  Vec3,
  ViewPrefs,
  WorkspaceMode,
  ZoneDef,
} from "../../lib/workTypes";
import {
  assembleAndExportGlb,
  downloadBuiltAiAsset,
  requestAiModelBlueprint,
  type BuiltAiAsset,
} from "./aiModelBuilder";
import { extractZones, layoutToObjects } from "./layoutImport";
import { Runtime } from "./runtime";
import { TwinEngine } from "./twinEngine";
import { useUndoable } from "./useUndoable";
import WorkCanvas from "./WorkCanvas";
import WorkInspector from "./WorkInspector";
import WorkSidebar, { DRAG_MIME } from "./WorkSidebar";
import { TwinControlsBar, TwinKpiStrip } from "./TwinHud";
import TwinInspectorPanel from "./TwinInspectorPanel";
import "./WorkPage.css";

const LAST_SCENE_KEY = "evol_work_last_scene";
const PREFS_KEY = "evol_work_prefs";
const UI_KEY = "evol_work_ui";
const OVERLAYS_KEY = "evol_work_twin_overlays";
const AI_BLUEPRINTS_KEY = "evol_work_ai_blueprints";

const DEFAULT_PREFS: ViewPrefs = {
  instancing: true,
  frustumCull: true,
  distanceCull: true,
  cullDistance: 70,
  lod: true,
  lodDistance: 16,
  showGizmos: true,
  defaultLight: true,
  shadows: true,
  space: "world",
  cameraMode: "perspective",
  focusSelection: true,
  forceWebGL: false,
};
const DEFAULT_UI = { all: true, side: true, toolbar: true, inspector: true, log: true };
const DEFAULT_OVERLAYS: TwinOverlayPrefs = {
  statusHalos: true,
  pathTrails: true,
  zoneHeatmap: true,
  floatingLabels: false,
  followSelected: false,
};

function loadJson<T extends object>(key: string, def: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? { ...def, ...JSON.parse(raw) } : def;
  } catch {
    return def;
  }
}
const saveJson = (key: string, v: unknown) => {
  try {
    localStorage.setItem(key, JSON.stringify(v));
  } catch {
    /* ignore */
  }
};
const errMsg = (e: unknown) => (e instanceof Error ? e.message : String((e as any)?.message ?? e));
const snap01 = (n: number) => Math.round(n * 10) / 10;

export function WorkPage() {
  const { user } = useAuth();
  const confirmDialog = useConfirm();

  // --- workspace mode
  const [workspaceMode, setWorkspaceMode] = useState<WorkspaceMode>("twin");
  const [sidebarTab, setSidebarTab] = useState<string>("twin");

  // --- model sets
  const [sets, setSets] = useState<ModelSetRow[]>([]);
  const [activeSetId, setActiveSetId] = useState<number | null>(null);
  const [loadingSets, setLoadingSets] = useState(true);

  // --- scene document
  const history = useUndoable<SceneObjectData[]>([]);
  const objects = history.value;
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [sceneId, setSceneId] = useState<number | null>(null);
  const [sceneName, setSceneName] = useState("Warehouse Twin");
  const [savedKey, setSavedKey] = useState("");
  const [saving, setSaving] = useState(false);
  const [scenes, setScenes] = useState<SceneSummary[]>([]);

  // --- editor + view
  const [mode, setMode] = useState<"translate" | "rotate">("translate");
  const [snap, setSnap] = useState(true);
  const [prefs, setPrefs] = useState<ViewPrefs>(() => loadJson(PREFS_KEY, DEFAULT_PREFS));
  const [ui, setUi] = useState(() => loadJson(UI_KEY, DEFAULT_UI));
  const [overlays, setOverlays] = useState<TwinOverlayPrefs>(() => loadJson(OVERLAYS_KEY, DEFAULT_OVERLAYS));
  const [cameraPreset, setCameraPreset] = useState<CameraPreset>("overview");
  const [cameraPresetSeq, setCameraPresetSeq] = useState(0);
  const [zones, setZones] = useState<ZoneDef[]>([]);
  const [jointDefs, setJointDefs] = useState<Record<string, JointDef[]>>({});
  const [stats, setStats] = useState<PerfStats | null>(null);
  const [backend, setBackend] = useState("");
  const bridgeRef = useRef<CanvasBridge | null>(null);
  const restoredRef = useRef(false);

  // --- play mode + digital twin engine
  const runtimeRef = useRef<Runtime | null>(null);
  if (!runtimeRef.current) runtimeRef.current = new Runtime();
  const runtime = runtimeRef.current;

  const twinRef = useRef<TwinEngine | null>(null);
  if (!twinRef.current) twinRef.current = new TwinEngine();
  const twinEngine = twinRef.current;

  const [playing, setPlaying] = useState(false);
  const [paused, setPaused] = useState(false);
  const [timeScale, setTimeScale] = useState(1);
  const [forced, setForced] = useState<Set<string>>(new Set());
  const [epoch, setEpoch] = useState(0);
  const [logs, setLogs] = useState<string[]>([]);

  // --- twin UI snapshot (polled at 4Hz from TwinEngine)
  const [kpis, setKpis] = useState<FacilityKpis>(() => twinEngine.getKpis());
  const [fleet, setFleet] = useState<AssetTelemetry[]>([]);
  const [allTelemetry, setAllTelemetry] = useState<AssetTelemetry[]>([]);
  const [alerts, setAlerts] = useState<TwinAlert[]>([]);
  const [replayFrames, setReplayFrames] = useState<ReplayFrame[]>([]);
  const [replayIndex, setReplayIndex] = useState<number | null>(null);
  const [scenario, setScenario] = useState<TwinScenario>("nominal");
  const [streamStatus, setStreamStatus] = useState<StreamStatus>("disconnected");

  // --- AI generated 3D models (procedural GLB assets)
  const [aiAssets, setAiAssets] = useState<Record<string, BuiltAiAsset>>({});
  const aiAssetsRef = useRef<Record<string, BuiltAiAsset>>({});
  const [aiGenerating, setAiGenerating] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);

  const updatePrefs = useCallback((patch: Partial<ViewPrefs>) => {
    setPrefs((cur) => {
      const n = { ...cur, ...patch };
      saveJson(PREFS_KEY, n);
      return n;
    });
  }, []);

  const updateUi = useCallback((patch: Partial<typeof DEFAULT_UI>) => {
    setUi((cur) => {
      const n = { ...cur, ...patch };
      saveJson(UI_KEY, n);
      return n;
    });
  }, []);

  const updateOverlays = useCallback((patch: Partial<TwinOverlayPrefs>) => {
    setOverlays((cur) => {
      const n = { ...cur, ...patch };
      saveJson(OVERLAYS_KEY, n);
      return n;
    });
  }, []);

  // --- derived
  const worlds = useMemo(() => computeWorlds(objects), [objects]);
  const staticIds = useMemo(() => effectiveStatic(objects, prefs.instancing), [objects, prefs.instancing]);
  const byId = useMemo(() => new Map(objects.map((o) => [o.id, o])), [objects]);
  const latestSet = useMemo(() => [...sets].sort((a, b) => b.created_at.localeCompare(a.created_at))[0] ?? null, [sets]);
  const activeSet = sets.find((s) => s.id === activeSetId) ?? null;
  const assets = useMemo(() => meshAssets(activeSet), [activeSet]);
  const assetUrls = useMemo(() => {
    const urls: Record<string, string> = activeSet
      ? Object.fromEntries(assets.map((a) => [a, fileUrl(activeSet, a)]))
      : {};
    for (const [id, item] of Object.entries(aiAssets)) {
      urls[id] = item.url;
    }
    return urls;
  }, [assets, activeSet, aiAssets]);
  const aiAssetList = useMemo(
    () => Object.values(aiAssets).sort((a, b) => b.blueprint.createdAt.localeCompare(a.blueprint.createdAt)),
    [aiAssets],
  );
  const selected = selectedId ? byId.get(selectedId) ?? null : null;
  const selectedTelemetry = useMemo(
    () => (selectedId ? allTelemetry.find((t) => t.id === selectedId) : undefined),
    [selectedId, allTelemetry],
  );
  const missing = objects.filter((o) => o.kind === "model" && (!o.asset || !assetUrls[o.asset])).length;
  const currentKey = useMemo(() => JSON.stringify([activeSet?.version ?? null, objects]), [activeSet, objects]);
  const dirty = sceneId !== null ? currentKey !== savedKey : objects.length > 0 && savedKey !== currentKey;

  useEffect(() => {
    aiAssetsRef.current = aiAssets;
  }, [aiAssets]);

  const persistAiBlueprints = useCallback((map: Record<string, BuiltAiAsset>) => {
    const bps: Record<string, AiModelBlueprint> = {};
    for (const [id, item] of Object.entries(map)) bps[id] = item.blueprint;
    saveJson(AI_BLUEPRINTS_KEY, bps);
  }, []);

  // ---------------------------------------------------------------- loading
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const rows = await listModelSets();
        if (!cancelled) {
          setSets(rows);
          if (rows[0]) setActiveSetId(rows[0].id);
        }
      } catch (e) {
        if (!cancelled) notify.error("Couldn't load model sets", errMsg(e));
      }
      if (!cancelled) setLoadingSets(false);
    })();

    (async () => {
      try {
        const raw = localStorage.getItem(AI_BLUEPRINTS_KEY);
        if (!raw) return;
        const parsed = JSON.parse(raw) as Record<string, AiModelBlueprint>;
        const entries = Object.values(parsed ?? {});
        if (!entries.length) return;
        const builtEntries = await Promise.all(
          entries.map(async (bp) => [bp.id, await assembleAndExportGlb(bp)] as const),
        );
        if (cancelled) {
          for (const [, built] of builtEntries) URL.revokeObjectURL(built.url);
          return;
        }
        setAiAssets((cur) => ({ ...Object.fromEntries(builtEntries), ...cur }));
      } catch {
        /* ignore corrupt cache */
      }
    })();

    return () => {
      cancelled = true;
      twinEngine.disconnectStream();
      for (const item of Object.values(aiAssetsRef.current)) {
        useGLTF.clear(item.url);
        URL.revokeObjectURL(item.url);
      }
    };
  }, [twinEngine]);

  const refreshScenes = useCallback(async () => {
    if (!user) {
      setScenes([]);
      return;
    }
    try {
      setScenes(await listScenes(user.id));
    } catch (e) {
      notify.error("Couldn't load scenes", errMsg(e));
    }
  }, [user]);
  useEffect(() => {
    refreshScenes();
  }, [refreshScenes]);

  useEffect(() => {
    if (!dirty || workspaceMode === "twin") return;
    const h = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [dirty, workspaceMode]);

  const onJointDefs = useCallback((asset: string, defs: JointDef[]) => {
    setJointDefs((cur) => (cur[asset] ? cur : { ...cur, [asset]: defs }));
  }, []);

  // ---------------------------------------------------------------- play mode
  const startSimulation = useCallback(
    (objs: SceneObjectData[], setRef: ModelSetRow | null) => {
      const w = computeWorlds(objs);
      const st = effectiveStatic(objs, prefs.instancing);
      runtime.start(objs, w, st, (id) => setForced((cur) => (cur.has(id) ? cur : new Set(cur).add(id))));
      setForced(new Set());
      setReplayIndex(null);
      setEpoch((e) => e + 1);
      setPlaying(true);
      setPaused(false);
      if (setRef) {
        setSavedKey(JSON.stringify([setRef.version, objs]));
      }
    },
    [prefs.instancing, runtime],
  );

  function play() {
    if (playing) return;
    runtime.start(objects, worlds, staticIds, (id) => setForced((cur) => (cur.has(id) ? cur : new Set(cur).add(id))));
    setForced(new Set());
    setReplayIndex(null);
    setEpoch((e) => e + 1);
    setPlaying(true);
    setPaused(false);
    if (workspaceMode === "author") updateUi({ log: true });
  }

  function stop() {
    if (!playing) return;
    runtime.stop();
    twinEngine.reset();
    setPlaying(false);
    setPaused(false);
    setReplayIndex(null);
    setScenario("nominal");
    setForced(new Set());
    setEpoch((e) => e + 1);
  }

  useEffect(() => {
    const t = setInterval(() => {
      setKpis(twinEngine.getKpis());
      setFleet(twinEngine.getFleetList());
      setAllTelemetry(twinEngine.getAllTelemetry());
      setAlerts(twinEngine.getAlerts());
      setReplayFrames([...twinEngine.getReplayFrames()]);
      setScenario(twinEngine.getScenario());
      setStreamStatus(twinEngine.getStreamStatus());
      if (playing) {
        setLogs([...runtime.logs]);
      }
    }, 250);
    return () => clearInterval(t);
  }, [playing, runtime, twinEngine]);

  // ---------------------------------------------------------------- scene ops
  async function discardOk() {
    return (
      !dirty ||
      confirmDialog({
        title: "Discard unsaved changes?",
        description: "The current scene has changes that haven't been saved.",
        confirmText: "Discard",
        danger: true,
      })
    );
  }

  async function openScene(id: number, skipConfirm = false) {
    if (!skipConfirm && !(await discardOk())) return;
    try {
      const row = await getScene(id);
      const objs = (row.data?.objects ?? []).map(normalizeObject);

      const savedBlueprints = row.data?.aiBlueprints;
      if (savedBlueprints && typeof savedBlueprints === "object") {
        const toBuild = Object.values(savedBlueprints).filter((bp) => !aiAssetsRef.current[bp.id]);
        if (toBuild.length > 0) {
          const rebuilt = await Promise.all(
            toBuild.map(async (bp) => [bp.id, await assembleAndExportGlb(bp)] as const),
          );
          setAiAssets((cur) => {
            const next = { ...cur, ...Object.fromEntries(rebuilt) };
            persistAiBlueprints(next);
            return next;
          });
        }
      }

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
      if (playing) stop();
      history.reset(objs);
      setSceneId(row.id);
      setSceneName(row.name);
      setSavedKey(JSON.stringify([set?.version ?? null, objs]));
      setSelectedId(null);
      saveJson(LAST_SCENE_KEY, row.id);
    } catch (e) {
      notify.error("Couldn't open scene", errMsg(e));
    }
  }

  // Restore last scene if logged in, otherwise auto-bootstrap the built-in Digital Twin demo layout
  useEffect(() => {
    if (restoredRef.current || loadingSets || !activeSet) return;
    restoredRef.current = true;
    (async () => {
      if (user) {
        try {
          const id = localStorage.getItem(LAST_SCENE_KEY);
          if (id) {
            await openScene(Number(id), true);
            return;
          }
        } catch {
          /* fall back to demo layout */
        }
      }
      if (activeSet.files.layout) {
        const layout = await fetchLayout(activeSet);
        if (layout) {
          const out = layoutToObjects(layout, meshAssets(activeSet));
          setZones(extractZones(layout));
          history.reset(out);
          setSceneName("sand3d Warehouse Twin");
          startSimulation(out, activeSet);
        }
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadingSets, activeSet, user]);

  async function newScene() {
    if (!(await discardOk())) return;
    if (playing) stop();
    history.reset([]);
    setSceneId(null);
    setSceneName("Untitled scene");
    setSavedKey("");
    setSelectedId(null);
    try {
      localStorage.removeItem(LAST_SCENE_KEY);
    } catch {
      /* ignore */
    }
  }

  async function save(asNew: boolean) {
    if (!user) {
      notify.info("Log in to save scenes");
      return;
    }
    if (!activeSet) return;
    setSaving(true);
    try {
      const keyNow = currentKey;
      const aiBlueprints: Record<string, AiModelBlueprint> = {};
      for (const o of objects) {
        if (o.kind === "model" && o.asset && aiAssets[o.asset]) {
          aiBlueprints[o.asset] = aiAssets[o.asset].blueprint;
        }
      }
      const row = await saveScene({
        id: asNew ? null : sceneId,
        userId: user.id,
        name: sceneName.trim() || "Untitled scene",
        set: activeSet,
        doc: {
          version: 2,
          objects,
          ...(Object.keys(aiBlueprints).length > 0 ? { aiBlueprints } : {}),
        },
      });
      setSceneId(row.id);
      setSceneName(row.name);
      setSavedKey(keyNow);
      saveJson(LAST_SCENE_KEY, row.id);
      notify.updated(`"${row.name}" saved.`);
      refreshScenes();
    } catch (e) {
      notify.error("Couldn't save scene", errMsg(e));
    }
    setSaving(false);
  }

  async function removeScene(s: SceneSummary) {
    if (
      !(await confirmDialog({
        title: `Delete "${s.name}"?`,
        description: "This can't be undone.",
        confirmText: "Delete",
        danger: true,
      }))
    )
      return;
    try {
      await deleteScene(s.id);
      notify.deleted(`"${s.name}" removed.`);
      if (s.id === sceneId) {
        setSceneId(null);
        try {
          localStorage.removeItem(LAST_SCENE_KEY);
        } catch {
          /* ignore */
        }
      }
      refreshScenes();
    } catch (e) {
      notify.error("Couldn't delete scene", errMsg(e));
    }
  }

  // ---------------------------------------------------------------- object ops
  const floorPoint = (at?: Vec3 | null): Vec3 => {
    const b = at ?? bridgeRef.current?.centerOnFloor() ?? [0, 0, 0];
    return snap ? [snap01(b[0]), 0, snap01(b[2])] : [b[0], 0, b[2]];
  };
  const labelFor = (base: string) => {
    const nice = aiAssets[base]?.blueprint.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "") || base;
    return `${nice}-${objects.filter((o) => o.label.startsWith(`${nice}-`)).length + 1}`;
  };

  function addObject(o: Partial<SceneObjectData> & { kind: SceneObjectData["kind"]; label: string }) {
    const obj: SceneObjectData = {
      id: newId(),
      asset: null,
      parentId: null,
      position: [0, 0, 0],
      rotation: [0, 0, 0],
      scale: 1,
      joints: {},
      static: false,
      ...o,
    };
    history.set((cur) => [...cur, obj]);
    setSelectedId(obj.id);
  }
  const addModel = (asset: string, at?: Vec3 | null) =>
    addObject({ kind: "model", asset, label: labelFor(asset), position: floorPoint(at) });

  const handleGenerateAiModel = async (prompt: string, targetHeight: number, autoPlace: boolean) => {
    setAiGenerating(true);
    setAiError(null);
    try {
      const blueprint = await requestAiModelBlueprint(prompt, targetHeight);
      const built = await assembleAndExportGlb(blueprint);
      setAiAssets((cur) => {
        const next = { ...cur, [blueprint.id]: built };
        persistAiBlueprints(next);
        return next;
      });
      notify.added(`Generated "${built.blueprint.name}" (${built.partCount} parts).`);
      if (autoPlace) {
        const nice = blueprint.name
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "_")
          .replace(/^_+|_+$/g, "") || blueprint.id;
        const label = `${nice}-${objects.filter((o) => o.label.startsWith(`${nice}-`)).length + 1}`;
        addObject({ kind: "model", asset: blueprint.id, label, position: floorPoint() });
      }
      return true;
    } catch (e) {
      const msg = errMsg(e);
      setAiError(msg);
      notify.error("AI 3D generation failed", msg);
      return false;
    } finally {
      setAiGenerating(false);
    }
  };

  const handleDownloadAiAsset = (assetId: string) => {
    const item = aiAssets[assetId];
    if (item) downloadBuiltAiAsset(item);
  };

  const handleDeleteAiAsset = async (assetId: string) => {
    const item = aiAssets[assetId];
    if (!item) return;
    const usedInScene = objects.some((o) => o.asset === assetId);
    if (
      usedInScene &&
      !(await confirmDialog({
        title: `Remove "${item.blueprint.name}"?`,
        description: "Instances of this AI model in the current scene will also be removed.",
        confirmText: "Remove",
        danger: true,
      }))
    ) {
      return;
    }
    if (usedInScene) {
      history.set((cur) => cur.filter((o) => o.asset !== assetId));
      setSelectedId((s) => (s && objects.find((o) => o.id === s)?.asset === assetId ? null : s));
    }
    setAiAssets((cur) => {
      const next = { ...cur };
      delete next[assetId];
      persistAiBlueprints(next);
      return next;
    });
    useGLTF.clear(item.url);
    URL.revokeObjectURL(item.url);
    notify.deleted(`Removed "${item.blueprint.name}".`);
  };

  const addGroup = () => addObject({ kind: "group", label: labelFor("group"), position: floorPoint() });
  const addLight = (type: LightType) => {
    const p = floorPoint();
    addObject({
      kind: "light",
      label: labelFor(`${type}-light`),
      position: [p[0], 3, p[2]],
      light: { ...DEFAULT_LIGHT, type, intensity: type === "directional" ? 2 : 12, distance: type === "directional" ? 0 : 12 },
    });
  };

  const updateObject = useCallback(
    (id: string, patch: Partial<SceneObjectData>, key?: string) => {
      history.set((cur) => cur.map((o) => (o.id === id ? { ...o, ...patch } : o)), key);
    },
    [history.set], // eslint-disable-line react-hooks/exhaustive-deps
  );

  const deleteObject = useCallback(
    (id: string) => {
      setSelectedId((s) => (s && descendantsOf(history.value, id).has(s) ? null : s));
      history.set((cur) => removeSubtree(cur, id));
    },
    [history.set, history.value], // eslint-disable-line react-hooks/exhaustive-deps
  );

  function duplicateSelected() {
    if (!selected) return;
    const { copies, rootId } = cloneSubtree(objects, selected.id);
    history.set((cur) => [...cur, ...copies]);
    setSelectedId(rootId);
  }

  const reparentObject = useCallback(
    (id: string, parentId: string | null) => {
      history.set((cur) => reparent(cur, id, parentId, computeWorlds(cur)));
    },
    [history.set],
  );

  function setStaticSubtree(id: string, value: boolean) {
    const ids = descendantsOf(objects, id);
    history.set((cur) => cur.map((o) => (ids.has(o.id) && o.kind !== "light" ? { ...o, static: value } : o)));
  }

  const onTransformEnd = useCallback(
    (id: string, world: THREE.Matrix4) => {
      const o = byId.get(id);
      if (!o) return;
      const data = toLocalData(world, o.parentId ? worlds.get(o.parentId) : undefined);
      history.set((cur) => cur.map((x) => (x.id === id ? { ...x, ...data } : x)));
    },
    [byId, worlds, history.set],
  );

  async function importLayout() {
    if (!activeSet) return;
    if (
      objects.length &&
      !(await confirmDialog({
        title: "Replace the scene with the warehouse layout?",
        description: "You can undo this with Ctrl+Z.",
        confirmText: "Replace",
      }))
    )
      return;
    try {
      const layout = await fetchLayout(activeSet);
      if (!layout) {
        notify.error("This model set has no layout.json");
        return;
      }
      if (playing) stop();
      const out = layoutToObjects(layout, assets);
      setZones(extractZones(layout));
      history.set(out);
      setSelectedId(null);
      notify.added(`Imported ${out.length} objects.`);
      if (workspaceMode === "twin") {
        startSimulation(out, activeSet);
      }
    } catch (e) {
      notify.error("Couldn't import layout", errMsg(e));
    }
  }

  // ---------------------------------------------------------------- Digital Twin handlers
  const handleModeChange = (next: WorkspaceMode) => {
    setWorkspaceMode(next);
    if (next === "twin") {
      setSidebarTab("twin");
      if (!playing && objects.some((o) => o.script?.trim())) {
        play();
      }
    } else {
      setReplayIndex(null);
      updateOverlays({ followSelected: false });
      setSidebarTab((cur) => (cur === "twin" ? "models" : cur));
    }
  };

  const handleCameraPreset = (preset: CameraPreset) => {
    updateOverlays({ followSelected: false });
    setCameraPreset(preset);
    setCameraPresetSeq((n) => n + 1);
  };

  const handleReplaySeek = (idx: number | null) => {
    if (idx === null) {
      setReplayIndex(null);
      setPaused(false);
      return;
    }
    const frames = twinEngine.getReplayFrames();
    const frame = frames[idx];
    if (!frame) return;
    setReplayIndex(idx);
    setPaused(true);
    runtime.applyReplayPoses(frame.entities);
  };

  const handleScenario = (s: TwinScenario) => {
    if (!playing && objects.some((o) => o.script?.trim())) {
      play();
    }
    twinEngine.applyScenario(s, runtime);
    setScenario(s);
    setAlerts(twinEngine.getAlerts());
    setFleet(twinEngine.getFleetList());
  };

  const handleInjectFault = (id: string, kind: FaultKind) => {
    twinEngine.injectFault(id, kind, runtime);
    setAlerts(twinEngine.getAlerts());
    setFleet(twinEngine.getFleetList());
    setAllTelemetry(twinEngine.getAllTelemetry());
  };

  const handleClearFault = (id: string) => {
    twinEngine.clearFault(id, runtime);
    setAlerts(twinEngine.getAlerts());
    setFleet(twinEngine.getFleetList());
    setAllTelemetry(twinEngine.getAllTelemetry());
  };

  const handleSpeedScale = (id: string, scale: number) => {
    twinEngine.setSpeedScale(id, scale, runtime);
    setAllTelemetry(twinEngine.getAllTelemetry());
  };

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
      if (!mod && k === "h") {
        updateUi({ all: !ui.all });
        return;
      }
      if (!mod && k === "v") {
        updatePrefs({ cameraMode: prefs.cameraMode === "perspective" ? "orthographic" : "perspective" });
        return;
      }
      if (playing || workspaceMode === "twin") return;
      if (mod && k === "z") {
        e.preventDefault();
        e.shiftKey ? history.redo() : history.undo();
      } else if (mod && k === "y") {
        e.preventDefault();
        history.redo();
      } else if (mod && k === "s") {
        e.preventDefault();
        save(false);
      } else if (mod && k === "d") {
        e.preventDefault();
        duplicateSelected();
      } else if (!mod && k === "w") setMode("translate");
      else if (!mod && k === "e") setMode("rotate");
      else if (!mod && k === "g") setSnap((s) => !s);
      else if ((k === "delete" || k === "backspace") && selectedId) {
        e.preventDefault();
        deleteObject(selectedId);
      } else if (k === "escape") setSelectedId(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  // ---------------------------------------------------------------- render
  const showUi = ui.all;
  const activeKpis = replayIndex !== null && replayFrames[replayIndex] ? replayFrames[replayIndex].kpis : kpis;
  const playControls = (
    <>
      {!playing ? (
        <Tooltip title="Start live facility simulation">
          <Button size="small" type="primary" className="btn-glow" icon={<Play size={13} />} onClick={play}>
            Play
          </Button>
        </Tooltip>
      ) : (
        <>
          <Button
            size="small"
            icon={paused ? <Play size={13} /> : <Pause size={13} />}
            onClick={() => {
              if (replayIndex !== null) {
                handleReplaySeek(null);
              } else {
                setPaused((p) => !p);
              }
            }}
            title={paused ? "Resume simulation" : "Pause simulation"}
          />
          <Button size="small" danger icon={<Square size={13} />} onClick={stop} title="Reset facility simulation" />
          <Select
            size="small"
            value={timeScale}
            onChange={setTimeScale}
            style={{ width: 66 }}
            options={[0.5, 1, 2, 4].map((v) => ({ value: v, label: `${v}×` }))}
          />
        </>
      )}
    </>
  );

  return (
    <div className="page work-page-shell">
      <div className="work-heading">
        <h2>
          <Briefcase size={20} style={{ verticalAlign: -4, marginRight: 8, color: "#8b6ff5" }} />
          Work · {workspaceMode === "twin" ? "sand3d Digital Twin" : "Scene Author"}
        </h2>
        <p className="evol-card-meta">
          {workspaceMode === "twin"
            ? "Live warehouse telemetry, fault injection, camera presets & 60s replay · V camera projection · H hide panels"
            : "W move · E rotate · G snap · V camera projection · Ctrl+Z undo · Ctrl+S save · Ctrl+D duplicate · Del delete · H hide panels"}
        </p>
      </div>

      <div className="work-layout">
        {showUi && (
          <div className={`work-side-wrap${ui.side ? "" : " collapsed"}`}>
            {ui.side && (
              <aside className="work-side evol-glass-card">
                <WorkSidebar
                  sets={sets}
                  activeSet={activeSet}
                  latestSet={latestSet}
                  assets={assets}
                  hasLayout={!!activeSet?.files.layout}
                  onSelectSet={setActiveSetId}
                  onAddAsset={(a) => addModel(a)}
                  onImportLayout={importLayout}
                  onAddGroup={addGroup}
                  onAddLight={addLight}
                  aiAssets={aiAssetList}
                  aiGenerating={aiGenerating}
                  aiError={aiError}
                  onGenerateAiModel={handleGenerateAiModel}
                  onDownloadAiAsset={handleDownloadAiAsset}
                  onDeleteAiAsset={handleDeleteAiAsset}
                  loggedIn={!!user}
                  scenes={scenes}
                  currentSceneId={sceneId}
                  onNewScene={newScene}
                  onOpenScene={(id) => openScene(id)}
                  onDeleteScene={removeScene}
                  objects={objects}
                  selectedId={selectedId}
                  staticIds={staticIds}
                  onSelectObject={(id) => setSelectedId(id)}
                  onDeleteObject={deleteObject}
                  onReparent={reparentObject}
                  prefs={prefs}
                  onPrefs={updatePrefs}
                  stats={stats}
                  backend={backend}
                  workspaceMode={workspaceMode}
                  activeTab={sidebarTab}
                  onTabChange={setSidebarTab}
                  fleet={fleet}
                  scenario={scenario}
                  alerts={alerts}
                  streamStatus={streamStatus}
                  onScenario={handleScenario}
                  onAcknowledgeAlert={(id) => {
                    twinEngine.acknowledgeAlert(id);
                    setAlerts(twinEngine.getAlerts());
                  }}
                  onClearAlerts={() => {
                    twinEngine.clearAcknowledgedAlerts();
                    setAlerts(twinEngine.getAlerts());
                  }}
                  onConnectStream={(url) => twinEngine.connectStream(url, (s) => setStreamStatus(s))}
                  onDisconnectStream={() => {
                    twinEngine.disconnectStream();
                    setStreamStatus("disconnected");
                  }}
                />
              </aside>
            )}
            <button
              type="button"
              className="work-side-toggle"
              onClick={() => updateUi({ side: !ui.side })}
              title={ui.side ? "Collapse panel" : "Expand panel"}
            >
              {ui.side ? <PanelLeftClose size={15} /> : <PanelLeftOpen size={15} />}
            </button>
          </div>
        )}

        <div
          className="work-stage"
          onDragOver={(e) => {
            if (workspaceMode === "author" && e.dataTransfer.types.includes(DRAG_MIME)) e.preventDefault();
          }}
          onDrop={workspaceMode === "author" ? onDrop : undefined}
        >
          <WorkCanvas
            objects={objects}
            worlds={worlds}
            staticIds={staticIds}
            forced={forced}
            assetUrls={assetUrls}
            selectedId={selectedId}
            onSelect={setSelectedId}
            onTransformEnd={onTransformEnd}
            mode={mode}
            snap={snap}
            prefs={prefs}
            runtime={runtime}
            twinEngine={twinEngine}
            workspaceMode={workspaceMode}
            telemetryList={allTelemetry}
            zones={zones}
            overlays={overlays}
            cameraPreset={cameraPreset}
            cameraPresetSeq={cameraPresetSeq}
            playing={playing}
            paused={paused}
            timeScale={timeScale}
            epoch={epoch}
            bridgeRef={bridgeRef}
            onJointDefs={onJointDefs}
            onStats={setStats}
            onBackend={setBackend}
          />

          {showUi && (
            <div className="work-top-hud">
              <div className={`work-toolbar evol-glass-card${ui.toolbar ? "" : " compact"}`}>
                <Segmented
                  size="small"
                  value={workspaceMode}
                  onChange={(v) => handleModeChange(v as WorkspaceMode)}
                  options={[
                    {
                      value: "twin",
                      label: (
                        <span className="work-mode-pill">
                          <Activity size={12} /> Twin
                        </span>
                      ),
                    },
                    {
                      value: "author",
                      label: (
                        <span className="work-mode-pill">
                          <Wrench size={12} /> Author
                        </span>
                      ),
                    },
                  ]}
                />

                {ui.toolbar && (
                  <>
                    <span className="work-toolbar-sep" />
                    <Tooltip title="Camera projection (V)">
                      <Segmented
                        size="small"
                        value={prefs.cameraMode}
                        onChange={(v) => updatePrefs({ cameraMode: v as CameraMode })}
                        options={[
                          {
                            value: "perspective",
                            label: (
                              <span className="work-mode-pill">
                                <Eye size={12} /> Perspective
                              </span>
                            ),
                          },
                          {
                            value: "orthographic",
                            label: (
                              <span className="work-mode-pill">
                                <Box size={12} /> Orthogonal
                              </span>
                            ),
                          },
                        ]}
                      />
                    </Tooltip>
                    <span className="work-toolbar-sep" />
                    <Input
                      size="small"
                      className="work-scene-name"
                      value={sceneName}
                      onChange={(e) => setSceneName(e.target.value)}
                      placeholder="Scene name"
                    />
                    {workspaceMode === "author" && (
                      <>
                        {dirty && (
                          <Tag color="gold" style={{ marginRight: 0 }}>
                            unsaved
                          </Tag>
                        )}
                        <Tooltip title={user ? "Save (Ctrl+S)" : "Log in to save"}>
                          <Button
                            size="small"
                            type="primary"
                            className="btn-glow"
                            icon={<Save size={13} />}
                            loading={saving}
                            disabled={!user || !activeSet || playing}
                            onClick={() => save(false)}
                          >
                            Save
                          </Button>
                        </Tooltip>
                        <Tooltip title="Save as a new scene">
                          <Button
                            size="small"
                            icon={<SaveAll size={13} />}
                            disabled={!user || !activeSet || playing}
                            onClick={() => save(true)}
                          />
                        </Tooltip>
                        <span className="work-toolbar-sep" />
                        <Segmented
                          size="small"
                          value={mode}
                          onChange={(v) => setMode(v as "translate" | "rotate")}
                          options={[
                            {
                              value: "translate",
                              label: (
                                <span title="Move (W)">
                                  <Move size={13} style={{ verticalAlign: -2 }} />
                                </span>
                              ),
                            },
                            {
                              value: "rotate",
                              label: (
                                <span title="Rotate (E)">
                                  <RotateCw size={13} style={{ verticalAlign: -2 }} />
                                </span>
                              ),
                            },
                          ]}
                        />
                        <Tooltip title="Snap: 0.1 m / 15° (G)">
                          <span className="work-snap">
                            <Magnet size={13} />
                            <Switch size="small" checked={snap} onChange={setSnap} />
                          </span>
                        </Tooltip>
                        <span className="work-toolbar-sep" />
                        <Button
                          size="small"
                          icon={<Undo2 size={13} />}
                          disabled={!history.canUndo || playing}
                          onClick={history.undo}
                          title="Undo (Ctrl+Z)"
                        />
                        <Button
                          size="small"
                          icon={<Redo2 size={13} />}
                          disabled={!history.canRedo || playing}
                          onClick={history.redo}
                          title="Redo"
                        />
                        <span className="work-toolbar-sep" />
                      </>
                    )}
                  </>
                )}
                {playControls}
                <Button
                  size="small"
                  type="text"
                  onClick={() => updateUi({ toolbar: !ui.toolbar })}
                  title={ui.toolbar ? "Collapse toolbar" : "Expand toolbar"}
                  icon={ui.toolbar ? <ChevronsUp size={14} /> : <ChevronsDown size={14} />}
                />
              </div>

              {workspaceMode === "twin" && (
                <TwinKpiStrip
                  kpis={activeKpis}
                  playing={playing}
                  paused={paused}
                  replayIndex={replayIndex}
                  replayTimeSec={replayIndex !== null ? replayFrames[replayIndex]?.timeSec ?? 0 : null}
                  streamStatus={streamStatus}
                  onAlertClick={() => {
                    updateUi({ side: true });
                    setSidebarTab("twin");
                  }}
                />
              )}
            </div>
          )}

          {showUi && missing > 0 && (
            <div className="work-warning evol-glass-card">
              {missing} model{missing === 1 ? "" : "s"} aren&apos;t in this model set, so they&apos;re hidden.
            </div>
          )}

          {showUi && selected && workspaceMode === "author" && !playing && (
            <WorkInspector
              object={selected}
              objects={objects}
              joints={selected.asset ? jointDefs[selected.asset] ?? [] : []}
              collapsed={!ui.inspector}
              onToggleCollapsed={() => updateUi({ inspector: !ui.inspector })}
              onChange={(patch, key) => updateObject(selected.id, patch, key)}
              onReparent={(pid) => reparentObject(selected.id, pid)}
              onStaticSubtree={(v) => setStaticSubtree(selected.id, v)}
              onDuplicate={duplicateSelected}
              onDelete={() => deleteObject(selected.id)}
            />
          )}

          {showUi && selected && workspaceMode === "twin" && (
            <TwinInspectorPanel
              object={selected}
              telemetry={selectedTelemetry}
              collapsed={!ui.inspector}
              following={overlays.followSelected}
              onToggleCollapsed={() => updateUi({ inspector: !ui.inspector })}
              onToggleFollow={() => updateOverlays({ followSelected: !overlays.followSelected })}
              onOpacityChange={(op) => updateObject(selected.id, { opacity: op }, `opacity:${selected.id}`)}
              onSpeedScale={(sc) => handleSpeedScale(selected.id, sc)}
              onInjectFault={(k) => handleInjectFault(selected.id, k)}
              onClearFault={() => handleClearFault(selected.id)}
              onSwitchToAuthor={() => {
                if (playing) stop();
                handleModeChange("author");
              }}
              onCloseSelection={() => setSelectedId(null)}
            />
          )}

          {showUi && workspaceMode === "twin" && (
            <TwinControlsBar
              cameraMode={prefs.cameraMode}
              onCameraMode={(m) => updatePrefs({ cameraMode: m })}
              cameraPreset={cameraPreset}
              onCameraPreset={handleCameraPreset}
              overlays={overlays}
              onOverlays={updateOverlays}
              hasSelection={!!selected}
              replayFrames={replayFrames}
              replayIndex={replayIndex}
              onReplaySeek={handleReplaySeek}
            />
          )}

          {showUi && workspaceMode === "author" && (playing || logs.length > 0) && (
            <div className={`work-log evol-glass-card${ui.log ? "" : " collapsed"}`}>
              <div className="work-log-head" onClick={() => updateUi({ log: !ui.log })}>
                <span>Simulation log {playing ? `· ${runtime.entityCount} entities` : ""}</span>
                {ui.log ? <ChevronsDown size={13} /> : <ChevronsUp size={13} />}
              </div>
              {ui.log && (
                <div className="work-log-body">
                  {logs.length === 0 ? (
                    <div className="work-hint">No warnings. Scripts are running.</div>
                  ) : (
                    logs.slice(-12).map((l, i) => <div key={i}>{l}</div>)
                  )}
                </div>
              )}
            </div>
          )}

          <button
            type="button"
            className="work-ui-toggle"
            onClick={() => updateUi({ all: !ui.all })}
            title="Show / hide all panels (H)"
          >
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
