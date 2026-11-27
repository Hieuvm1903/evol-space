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
  Gauge,
  Magnet,
  Move,
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
import { useTheme } from "../../contexts/ThemeContext";
import { useConfirm } from "../../components/ConfirmDialog";
import { PanelEdgeToggle } from "../../components/PanelEdgeToggle";
import HelpTip from "../../components/HelpTip";
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
import {
  getEntityAsset,
  getEntityScript,
  isRobotAsset,
  type AiGenerateOptions,
  type AiModelBlueprint,
  type AssetTelemetry,
  type CameraMode,
  type CameraPreset,
  type CanvasBridge,
  type FacilityKpis,
  type FaultKind,
  type JointDef,
  type LightType,
  type ModelSetRow,
  type PerfStats,
  type ReplayFrame,
  type RosConnectionMode,
  type RosLogEntry,
  type RosTopicInfo,
  type SceneObjectData,
  type SceneSummary,
  type StreamStatus,
  type TwinAlert,
  type TwinOverlayPrefs,
  type TwinScenario,
  type Vec3,
  type ViewPrefs,
  type WorkspaceMode,
  type ZoneDef,
} from "../../lib/workTypes";
import {
  assembleAndExportGlb,
  downloadBuiltAiAsset,
  requestAiModelBlueprint,
  type BuiltAiAsset,
} from "./aiModelBuilder";
import {
  downloadUploadedAsset,
  loadUploadedModelFile,
  type UploadedModelAsset,
} from "./uploadedModelLoader";
import { extractZones, layoutToObjects } from "./layoutImport";
import { Runtime } from "./runtime";
import { defaultRosWsUrl, normalizeRosWsUrl, RosBridgeClient } from "./rosBridge";
import { TwinEngine } from "./twinEngine";
import { useUndoable } from "./useUndoable";
import WorkCanvas from "./WorkCanvas";
import WorkInspector from "./WorkInspector";
import WorkSidebar, { DRAG_MIME } from "./WorkSidebar";
import { TwinControlsBar, TwinKpiStrip } from "./TwinHud";
import TelemetryHud from "./TelemetryHud";
import TwinInspectorPanel from "./TwinInspectorPanel";
import { DEFAULT_ZONES } from "./TwinOverlays";
import { resolveCanvasBackdrop } from "./canvasBackdrop";
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
  canvasBg: "auto",
  focusSelection: true,
  forceWebGL: false,
};
const DEFAULT_UI = { all: true, side: true, toolbar: true, inspector: true, log: true, telemetry: true, telemetryExpanded: true };
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
  const { user, isAdmin } = useAuth();
  const { themeId } = useTheme();
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
  const [zones, setZones] = useState<ZoneDef[]>(() =>
    DEFAULT_ZONES.map((z) => ({ ...z, x: [...z.x] as [number, number], z: [...z.z] as [number, number] })),
  );
  const [selectedZoneId, setSelectedZoneId] = useState<string | null>(null);
  const [drawingArea, setDrawingArea] = useState(false);
  const [showAreasInAuthor, setShowAreasInAuthor] = useState(true);
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

  const rosRef = useRef<RosBridgeClient | null>(null);
  if (!rosRef.current) rosRef.current = new RosBridgeClient();
  const rosClient = rosRef.current;

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
  const [streamUrl, setStreamUrl] = useState("ws://localhost:8765/twin");

  // --- ROS 2 bridge UI state
  const [rosMode, setRosMode] = useState<RosConnectionMode>("builtin");
  const [rosUrl, setRosUrl] = useState<string>(() => defaultRosWsUrl());
  const [rosStatus, setRosStatus] = useState<StreamStatus>("disconnected");
  const [rosDriveScene, setRosDriveScene] = useState(true);
  const [rosShowLidar, setRosShowLidar] = useState(true);
  const [rosGoalPick, setRosGoalPick] = useState(false);
  const [rosActiveGoal, setRosActiveGoal] = useState<[number, number] | null>(null);
  const [rosTeleopKeys, setRosTeleopKeys] = useState(false);
  const [rosSelectedRobot, setRosSelectedRobot] = useState("AMR-1");
  const [rosNodes, setRosNodes] = useState<string[]>([]);
  const [rosTopics, setRosTopics] = useState<RosTopicInfo[]>([]);
  const [rosLogs, setRosLogs] = useState<RosLogEntry[]>([]);

  // --- AI generated 3D models (procedural GLB assets)
  const [aiAssets, setAiAssets] = useState<Record<string, BuiltAiAsset>>({});
  const aiAssetsRef = useRef<Record<string, BuiltAiAsset>>({});
  const [aiGenerating, setAiGenerating] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);

  // --- Uploaded local 3D model files (.glb, .gltf, .obj, .stl)
  const [uploadedAssets, setUploadedAssets] = useState<Record<string, UploadedModelAsset>>({});
  const uploadedAssetsRef = useRef<Record<string, UploadedModelAsset>>({});
  const [uploadingModels, setUploadingModels] = useState(false);

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
    for (const [id, item] of Object.entries(uploadedAssets)) {
      urls[id] = item.url;
    }
    return urls;
  }, [assets, activeSet, aiAssets, uploadedAssets]);
  const aiAssetList = useMemo(
    () => Object.values(aiAssets).sort((a, b) => b.blueprint.createdAt.localeCompare(a.blueprint.createdAt)),
    [aiAssets],
  );
  const uploadedAssetList = useMemo(
    () => Object.values(uploadedAssets).sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [uploadedAssets],
  );
  const selected = selectedId ? byId.get(selectedId) ?? null : null;
  const selectedTelemetry = useMemo(
    () => (selectedId ? allTelemetry.find((t) => t.id === selectedId) : undefined),
    [selectedId, allTelemetry],
  );
  const missing = objects.filter((o) => Boolean(o.components.renderer) && (!o.components.renderer?.asset || !assetUrls[o.components.renderer.asset])).length;
  const currentKey = useMemo(() => JSON.stringify([activeSet?.version ?? null, objects, zones]), [activeSet, objects, zones]);
  const dirty = sceneId !== null ? currentKey !== savedKey : objects.length > 0 && savedKey !== currentKey;

  useEffect(() => {
    aiAssetsRef.current = aiAssets;
  }, [aiAssets]);

  useEffect(() => {
    uploadedAssetsRef.current = uploadedAssets;
  }, [uploadedAssets]);

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
      rosClient.disconnect();
      for (const item of Object.values(aiAssetsRef.current)) {
        useGLTF.clear(item.url);
        URL.revokeObjectURL(item.url);
      }
      for (const item of Object.values(uploadedAssetsRef.current)) {
        useGLTF.clear(item.url);
        URL.revokeObjectURL(item.url);
      }
    };
  }, [twinEngine, rosClient]);

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
    (objs: SceneObjectData[], setRef: ModelSetRow | null, zonesSnap?: ZoneDef[]) => {
      const w = computeWorlds(objs);
      const st = effectiveStatic(objs, prefs.instancing);
      runtime.start(objs, w, st, (id) => setForced((cur) => (cur.has(id) ? cur : new Set(cur).add(id))));
      setForced(new Set());
      setReplayIndex(null);
      setEpoch((e) => e + 1);
      setPlaying(true);
      setPaused(false);
      if (setRef) {
        setSavedKey(JSON.stringify([setRef.version, objs, zonesSnap ?? zones]));
      }
    },
    [prefs.instancing, runtime, zones],
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
    if (rosClient.getStatus() === "connected") {
      setRosActiveGoal(null);
      rosClient.resetWorld().catch(() => {});
    }
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
      setRosStatus(rosClient.getStatus());
      setRosNodes([...rosClient.nodes]);
      setRosTopics(Array.from(rosClient.topics.values()));
      setRosLogs([...rosClient.logs]);
      if (playing) {
        setLogs([...runtime.logs]);
      }
    }, 250);
    return () => clearInterval(t);
  }, [playing, runtime, twinEngine, rosClient]);

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
      const loadedZones = Array.isArray(row.data?.zones)
        ? row.data.zones
        : DEFAULT_ZONES.map((z) => ({ ...z, x: [...z.x] as [number, number], z: [...z.z] as [number, number] }));
      history.reset(objs);
      setZones(loadedZones);
      setSelectedZoneId(null);
      setDrawingArea(false);
      setSceneId(row.id);
      setSceneName(row.name);
      setSavedKey(JSON.stringify([set?.version ?? null, objs, loadedZones]));
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
          const extracted = extractZones(layout);
          const nextZones =
            extracted.length > 0
              ? extracted
              : DEFAULT_ZONES.map((z) => ({ ...z, x: [...z.x] as [number, number], z: [...z.z] as [number, number] }));
          setZones(nextZones);
          history.reset(out);
          setSceneName("sand3d Warehouse Twin");
          startSimulation(out, activeSet, nextZones);
        }
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadingSets, activeSet, user]);

  async function newScene() {
    if (!(await discardOk())) return;
    if (playing) stop();
    history.reset([]);
    setZones([]);
    setSelectedZoneId(null);
    setDrawingArea(false);
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
        const asset = getEntityAsset(o);
        if (asset && aiAssets[asset]) {
          aiBlueprints[asset] = aiAssets[asset].blueprint;
        }
      }
      const row = await saveScene({
        id: asNew ? null : sceneId,
        userId: user.id,
        name: sceneName.trim() || "Untitled scene",
        set: activeSet,
        doc: {
          version: 3,
          objects,
          zones,
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

  function addEntity(obj: SceneObjectData) {
    history.set((cur) => [...cur, obj]);
    setSelectedId(obj.id);
  }

  const addModel = (asset: string, at?: Vec3 | null) => {
    const robot = isRobotAsset(asset);
    addEntity({
      id: newId(),
      kind: robot ? "robot" : "obstacle",
      label: labelFor(asset),
      parentId: null,
      transform: { position: floorPoint(at), rotation: [0, 0, 0], scale: 1 },
      components: {
        renderer: { asset, static: false, joints: {} },
        ...(robot ? { robot: { script: "" } } : {}),
      },
    });
  };

  const handleGenerateAiModel = async (options: AiGenerateOptions) => {
    if (!isAdmin) {
      const msg = "Only users with role = admin can generate AI 3D models.";
      setAiError(msg);
      notify.error("Permission denied", msg);
      return false;
    }
    setAiGenerating(true);
    setAiError(null);
    try {
      const blueprint = await requestAiModelBlueprint(options);
      const built = await assembleAndExportGlb(blueprint);
      setAiAssets((cur) => {
        const next = { ...cur, [blueprint.id]: built };
        persistAiBlueprints(next);
        return next;
      });
      const jointNote = built.jointCount > 0 ? `, ${built.jointCount} joints` : "";
      notify.added(`Generated "${built.blueprint.name}" (${built.partCount} parts${jointNote}).`);
      if (options.autoPlace) {
        const nice = blueprint.name
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "_")
          .replace(/^_+|_+$/g, "") || blueprint.id;
        const label = `${nice}-${objects.filter((o) => o.label.startsWith(`${nice}-`)).length + 1}`;
        addEntity({
          id: newId(),
          kind: "obstacle",
          label,
          parentId: null,
          transform: { position: floorPoint(), rotation: [0, 0, 0], scale: 1 },
          components: { renderer: { asset: blueprint.id, static: false, joints: {} } },
        });
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
    const usedInScene = objects.some((o) => getEntityAsset(o) === assetId);
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
      history.set((cur) => cur.filter((o) => getEntityAsset(o) !== assetId));
      setSelectedId((s) => {
        const curObj = s ? objects.find((o) => o.id === s) : null;
        return curObj && getEntityAsset(curObj) === assetId ? null : s;
      });
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

  const handleUploadModelFiles = async (files: FileList | File[]) => {
    const list = Array.from(files);
    if (!list.length) return;
    setUploadingModels(true);
    try {
      const loaded: UploadedModelAsset[] = [];
      for (const file of list) {
        try {
          loaded.push(await loadUploadedModelFile(file));
        } catch (e) {
          notify.error(`Could not load "${file.name}"`, errMsg(e));
        }
      }
      if (!loaded.length) return;
      setUploadedAssets((cur) => {
        const next = { ...cur };
        for (const item of loaded) next[item.id] = item;
        return next;
      });
      if (!playing) {
        for (const item of loaded) {
          const nice = item.name
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "_")
            .replace(/^_+|_+$/g, "") || item.id;
          const label = `${nice}-${objects.filter((o) => o.label.startsWith(`${nice}-`)).length + 1}`;
          addEntity({
            id: newId(),
            kind: "obstacle",
            label,
            parentId: null,
            transform: { position: floorPoint(), rotation: [0, 0, 0], scale: 1 },
            components: { renderer: { asset: item.id, static: false, joints: {} } },
          });
        }
      }
      notify.added(
        loaded.length === 1
          ? `Uploaded "${loaded[0].name}" (${loaded[0].format.toUpperCase()}).`
          : `Uploaded ${loaded.length} 3D models.`,
      );
    } finally {
      setUploadingModels(false);
    }
  };

  const handleDownloadUploadedAsset = (assetId: string) => {
    const item = uploadedAssets[assetId];
    if (item) downloadUploadedAsset(item);
  };

  const handleDeleteUploadedAsset = async (assetId: string) => {
    const item = uploadedAssets[assetId];
    if (!item) return;
    const usedInScene = objects.some((o) => getEntityAsset(o) === assetId);
    if (
      usedInScene &&
      !(await confirmDialog({
        title: `Remove "${item.name}"?`,
        description: "Instances of this uploaded model in the current scene will also be removed.",
        confirmText: "Remove",
        danger: true,
      }))
    ) {
      return;
    }
    if (usedInScene) {
      history.set((cur) => cur.filter((o) => getEntityAsset(o) !== assetId));
      setSelectedId((s) => {
        const curObj = s ? objects.find((o) => o.id === s) : null;
        return curObj && getEntityAsset(curObj) === assetId ? null : s;
      });
    }
    setUploadedAssets((cur) => {
      const next = { ...cur };
      delete next[assetId];
      return next;
    });
    useGLTF.clear(item.url);
    URL.revokeObjectURL(item.url);
    notify.deleted(`Removed "${item.name}".`);
  };

  const addGroup = () =>
    addEntity({
      id: newId(),
      kind: "group",
      label: labelFor("group"),
      parentId: null,
      transform: { position: floorPoint(), rotation: [0, 0, 0], scale: 1 },
      components: {},
    });

  const addLight = (type: LightType) => {
    const p = floorPoint();
    addEntity({
      id: newId(),
      kind: "light",
      label: labelFor(`${type}-light`),
      parentId: null,
      transform: { position: [p[0], 3, p[2]], rotation: [0, 0, 0], scale: 1 },
      components: {
        light: { ...DEFAULT_LIGHT, type, intensity: type === "directional" ? 2 : 12, distance: type === "directional" ? 0 : 12 },
      },
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
    history.set((cur) =>
      cur.map((o) =>
        ids.has(o.id) && o.components.renderer
          ? { ...o, components: { ...o.components, renderer: { ...o.components.renderer, static: value } } }
          : o,
      ),
    );
  }

  const onTransformEnd = useCallback(
    (id: string, world: THREE.Matrix4) => {
      const o = byId.get(id);
      if (!o) return;
      const tf = toLocalData(world, o.parentId ? worlds.get(o.parentId) : undefined);
      history.set((cur) => cur.map((x) => (x.id === id ? { ...x, transform: tf } : x)));
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
      const extracted = extractZones(layout);
      const nextZones =
        extracted.length > 0
          ? extracted
          : DEFAULT_ZONES.map((z) => ({ ...z, x: [...z.x] as [number, number], z: [...z.z] as [number, number] }));
      setZones(nextZones);
      setSelectedZoneId(null);
      setDrawingArea(false);
      history.set(out);
      setSelectedId(null);
      notify.added(`Imported ${out.length} objects.`);
      if (workspaceMode === "twin") {
        startSimulation(out, activeSet, nextZones);
      }
    } catch (e) {
      notify.error("Couldn't import layout", errMsg(e));
    }
  }

  // ---------------------------------------------------------------- Area / Zone ops
  const handleAddZone = useCallback(() => {
    const center = floorPoint();
    const id = `area_${newId().slice(0, 6)}`;
    const idx = zones.length + 1;
    const nextZone: ZoneDef = {
      id,
      name: `Area ${idx}`,
      kind: "staging",
      x: [Number((center[0] - 2).toFixed(2)), Number((center[0] + 2).toFixed(2))],
      z: [Number((center[2] - 1.5).toFixed(2)), Number((center[2] + 1.5).toFixed(2))],
      color: "#8b6ff5",
    };
    setZones((cur) => [...cur, nextZone]);
    setSelectedZoneId(id);
    setShowAreasInAuthor(true);
    setDrawingArea(false);
    notify.added(`Added "${nextZone.name}".`);
  }, [zones.length, floorPoint]);

  const handleFinishDrawArea = useCallback(
    (x: [number, number], z: [number, number]) => {
      const id = `area_${newId().slice(0, 6)}`;
      const idx = zones.length + 1;
      const nextZone: ZoneDef = {
        id,
        name: `Area ${idx}`,
        kind: "staging",
        x,
        z,
        color: "#22d3ee",
      };
      setZones((cur) => [...cur, nextZone]);
      setSelectedZoneId(id);
      setShowAreasInAuthor(true);
      setDrawingArea(false);
      notify.added(`Created "${nextZone.name}".`);
    },
    [zones.length],
  );

  const handleUpdateZone = useCallback((id: string, patch: Partial<ZoneDef>) => {
    setZones((cur) => cur.map((z) => (z.id === id ? { ...z, ...patch } : z)));
  }, []);

  const handleDeleteZone = useCallback(
    (id: string) => {
      const target = zones.find((z) => z.id === id);
      setZones((cur) => cur.filter((z) => z.id !== id));
      setSelectedZoneId((cur) => (cur === id ? null : cur));
      if (target) notify.deleted(`Removed "${target.name || target.id}".`);
    },
    [zones],
  );

  const handleResetZones = useCallback(async () => {
    let nextZones = DEFAULT_ZONES.map((z) => ({
      ...z,
      x: [...z.x] as [number, number],
      z: [...z.z] as [number, number],
    }));
    if (activeSet?.files.layout) {
      try {
        const layout = await fetchLayout(activeSet);
        const extracted = extractZones(layout);
        if (extracted.length > 0) nextZones = extracted;
      } catch {
        /* fallback to DEFAULT_ZONES */
      }
    }
    setZones(nextZones);
    setSelectedZoneId(null);
    setDrawingArea(false);
    notify.updated("Restored default floor areas.");
  }, [activeSet]);

  // ---------------------------------------------------------------- Digital Twin handlers
  const handleModeChange = (next: WorkspaceMode) => {
    setWorkspaceMode(next);
    if (next === "twin") {
      setSidebarTab("twin");
      if (!playing && objects.some((o) => Boolean(getEntityScript(o)?.trim()))) {
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
    if (!playing && objects.some((o) => Boolean(getEntityScript(o)?.trim()))) {
      play();
    }
    twinEngine.applyScenario(s, runtime);
    setScenario(s);
    setAlerts(twinEngine.getAlerts());
    setFleet(twinEngine.getFleetList());
  };

  const handleInjectFault = (id: string, kind: FaultKind) => {
    twinEngine.injectFault(id, kind, runtime);
    if (rosClient.getStatus() === "connected" && rosDriveScene) {
      const obj = byId.get(id);
      if (obj) {
        const mapped = kind === "overheat" || kind === "battery" ? kind : "jam";
        rosClient.sendFault(obj.label, mapped).catch(() => {});
      }
    }
    setAlerts(twinEngine.getAlerts());
    setFleet(twinEngine.getFleetList());
    setAllTelemetry(twinEngine.getAllTelemetry());
  };

  const handleClearFault = (id: string) => {
    twinEngine.clearFault(id, runtime);
    if (rosClient.getStatus() === "connected" && rosDriveScene) {
      const obj = byId.get(id);
      if (obj) rosClient.sendFault(obj.label, "clear").catch(() => {});
    }
    setAlerts(twinEngine.getAlerts());
    setFleet(twinEngine.getFleetList());
    setAllTelemetry(twinEngine.getAllTelemetry());
  };

  const handleSpeedScale = (id: string, scale: number) => {
    twinEngine.setSpeedScale(id, scale, runtime);
    setAllTelemetry(twinEngine.getAllTelemetry());
  };

  // ---------------------------------------------------------------- ROS 2 handlers
  const handleRosModeChange = (m: RosConnectionMode) => {
    setRosMode(m);
    setRosUrl(m === "builtin" ? defaultRosWsUrl() : "ws://localhost:9090");
  };

  const handleRosConnect = () => {
    const rawUrl = rosMode === "builtin" ? defaultRosWsUrl() : rosUrl;
    const targetUrl = rosMode === "builtin" ? rawUrl : normalizeRosWsUrl(rawUrl);
    if (!targetUrl) {
      notify.error("ROS 2 URL required", "Enter a WebSocket URL (e.g. wss://xxxx.ngrok-free.app)");
      return;
    }
    setRosUrl(targetUrl);
    if (!playing && objects.length > 0) {
      startSimulation(objects, activeSet);
    }
    rosClient.connect(targetUrl, (s, detail) => {
      setRosStatus(s);
      if (s === "connected") {
        notify.success("ROS 2 bridge connected", rosMode === "builtin" ? "Virtual ROS 2 stack running on /ws/ros" : targetUrl);
      } else if (s === "error") {
        notify.error("ROS 2 connection error", detail ?? "Could not reach rosbridge WebSocket");
      }
    });
  };

  const handleConnectStream = (rawUrl: string) => {
    const target = normalizeRosWsUrl(rawUrl);
    if (!target) {
      notify.error("WebSocket URL required", "Enter a WebSocket URL (e.g. ws://localhost:8765/twin)");
      return;
    }
    setStreamUrl(target);
    if (!playing && objects.length > 0) {
      startSimulation(objects, activeSet);
    }
    twinEngine.connectStream(target, (s, detail) => {
      setStreamStatus(s);
      if (s === "connected") {
        notify.success("JSON telemetry stream connected", target);
      } else if (s === "error") {
        notify.error("WebSocket stream error", detail ?? "Could not connect to JSON telemetry stream");
      }
    });
  };

  const handleRosDisconnect = () => {
    rosClient.disconnect();
    setRosStatus("disconnected");
    setRosGoalPick(false);
    setRosTeleopKeys(false);
    setRosActiveGoal(null);
  };

  const handlePickRosGoal = useCallback(
    (x: number, z: number) => {
      rosClient.publishGoalPose(rosSelectedRobot, x, z);
      setRosActiveGoal([x, z]);
      setRosGoalPick(false);
      notify.info(`Sent NavGoal to ${rosSelectedRobot}`, `ROS map (${x.toFixed(1)}, ${(-z).toFixed(1)})`);
    },
    [rosClient, rosSelectedRobot],
  );

  // WASD keyboard teleop publisher when rosTeleopKeys is enabled
  useEffect(() => {
    if (!rosTeleopKeys || rosStatus !== "connected") return;
    const held = new Set<string>();
    const onDown = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest("input, textarea, [contenteditable='true'], .ant-select")) return;
      const k = e.key.toLowerCase();
      if (["w", "a", "s", "d", "q", "e", "r", "f"].includes(k)) {
        e.preventDefault();
        held.add(k);
      }
    };
    const onUp = (e: KeyboardEvent) => {
      held.delete(e.key.toLowerCase());
    };
    window.addEventListener("keydown", onDown);
    window.addEventListener("keyup", onUp);
    let wasZero = true;
    const timer = setInterval(() => {
      const vx = (held.has("w") ? 1.2 : 0) + (held.has("s") ? -1.0 : 0);
      const wz = (held.has("a") || held.has("q") ? 1.5 : 0) + (held.has("d") || held.has("e") ? -1.5 : 0);
      const vz = (held.has("r") ? 1.0 : 0) + (held.has("f") ? -1.0 : 0);
      const isZero = vx === 0 && wz === 0 && vz === 0;
      if (!isZero || !wasZero) {
        rosClient.publishTwist(rosSelectedRobot, [vx, 0, vz], wz);
        wasZero = isZero;
      }
    }, 100);
    return () => {
      window.removeEventListener("keydown", onDown);
      window.removeEventListener("keyup", onUp);
      clearInterval(timer);
    };
  }, [rosTeleopKeys, rosStatus, rosSelectedRobot, rosClient]);

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
      if (k === "escape" && (drawingArea || rosGoalPick)) {
        setDrawingArea(false);
        setRosGoalPick(false);
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
                const nextPaused = !paused;
                setPaused(nextPaused);
                if (rosClient.getStatus() === "connected") {
                  rosClient.setPaused(nextPaused).catch(() => {});
                }
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
        <h2 style={{ gap: 8 }}>
          <Briefcase size={20} style={{ color: "#8b6ff5" }} />
          <span>Work · {workspaceMode === "twin" ? "sand3d Digital Twin" : "Scene Author"}</span>
          <HelpTip
            size="md"
            content={
              workspaceMode === "twin"
                ? "Live warehouse telemetry, fault injection, camera presets & 60s replay · V camera projection · H hide panels"
                : "W move · E rotate · G snap · V camera projection · Ctrl+Z undo · Ctrl+S save · Ctrl+D duplicate · Del delete · H hide panels"
            }
          />
        </h2>
      </div>

      <div className={`work-layout${!showUi || !ui.side ? " side-collapsed" : ""}`}>
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
                  isAdmin={isAdmin}
                  aiAssets={aiAssetList}
                  aiGenerating={aiGenerating}
                  aiError={aiError}
                  onGenerateAiModel={handleGenerateAiModel}
                  onDownloadAiAsset={handleDownloadAiAsset}
                  onDeleteAiAsset={handleDeleteAiAsset}
                  uploadedAssets={uploadedAssetList}
                  uploadingModels={uploadingModels}
                  onUploadModelFiles={handleUploadModelFiles}
                  onDownloadUploadedAsset={handleDownloadUploadedAsset}
                  onDeleteUploadedAsset={handleDeleteUploadedAsset}
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
                  onTabChange={(k) => {
                    setSidebarTab(k);
                    if (k !== "areas") setDrawingArea(false);
                  }}
                  fleet={fleet}
                  scenario={scenario}
                  alerts={alerts}
                  streamStatus={streamStatus}
                  streamUrl={streamUrl}
                  onScenario={handleScenario}
                  onAcknowledgeAlert={(id) => {
                    twinEngine.acknowledgeAlert(id);
                    setAlerts(twinEngine.getAlerts());
                  }}
                  onClearAlerts={() => {
                    twinEngine.clearAcknowledgedAlerts();
                    setAlerts(twinEngine.getAlerts());
                  }}
                  onStreamUrlChange={setStreamUrl}
                  onConnectStream={handleConnectStream}
                  onDisconnectStream={() => {
                    twinEngine.disconnectStream();
                    setStreamStatus("disconnected");
                  }}
                  zones={zones}
                  selectedZoneId={selectedZoneId}
                  drawingArea={drawingArea}
                  showAreasInAuthor={showAreasInAuthor}
                  onSelectZone={setSelectedZoneId}
                  onAddZone={handleAddZone}
                  onToggleDrawArea={() => setDrawingArea((d) => !d)}
                  onToggleShowAreasInAuthor={setShowAreasInAuthor}
                  onUpdateZone={handleUpdateZone}
                  onDeleteZone={handleDeleteZone}
                  onResetZones={handleResetZones}
                  rosStatus={rosStatus}
                  rosMode={rosMode}
                  rosUrl={rosUrl}
                  rosDriveScene={rosDriveScene}
                  rosShowLidar={rosShowLidar}
                  rosGoalPick={rosGoalPick}
                  rosTeleopKeys={rosTeleopKeys}
                  rosSelectedRobot={rosSelectedRobot}
                  rosNodes={rosNodes}
                  rosTopics={rosTopics}
                  rosLogs={rosLogs}
                  onRosModeChange={handleRosModeChange}
                  onRosUrlChange={setRosUrl}
                  onRosConnect={handleRosConnect}
                  onRosDisconnect={handleRosDisconnect}
                  onToggleRosDriveScene={setRosDriveScene}
                  onToggleRosShowLidar={setRosShowLidar}
                  onToggleRosGoalPick={() => setRosGoalPick((g) => !g)}
                  onToggleRosTeleopKeys={setRosTeleopKeys}
                  onRosSelectRobot={setRosSelectedRobot}
                  onRosPublishTwist={(id, lin, wz) => rosClient.publishTwist(id, lin, wz)}
                  onRosSendGoal={(id, x, z) => {
                    rosClient.publishGoalPose(id, x, z);
                    setRosActiveGoal([x, z]);
                    notify.info(`Sent NavGoal to ${id}`, `ROS map (${x.toFixed(1)}, ${(-z).toFixed(1)})`);
                  }}
                  onRosResumePatrol={(id) => {
                    setRosActiveGoal(null);
                    rosClient.resumePatrol(id).catch((e) => notify.error("ROS service failed", errMsg(e)));
                  }}
                  onRosArmPreset={(preset) => {
                    rosClient.setArmPreset(preset).catch((e) => notify.error("ROS service failed", errMsg(e)));
                  }}
                  onRosArmJointCmd={(joints) => rosClient.publishJointCmd("ARM-1", joints)}
                  onRosRefreshGraph={() => rosClient.refreshGraph()}
                />
              </aside>
            )}
            <PanelEdgeToggle
              collapsed={!ui.side}
              onToggle={() => updateUi({ side: !ui.side })}
              side="left"
              label={ui.side ? "Collapse panel" : "Expand panel"}
              className="work-side-edge"
            />
          </div>
        )}

        <div
          className="work-stage"
          style={{ background: resolveCanvasBackdrop(prefs.canvasBg, themeId).bg }}
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
            rosClient={rosClient}
            rosDriveScene={rosDriveScene}
            rosShowLidar={rosShowLidar}
            rosGoalPick={rosGoalPick}
            rosActiveGoal={rosActiveGoal}
            onPickRosGoal={handlePickRosGoal}
            workspaceMode={workspaceMode}
            telemetryList={allTelemetry}
            zones={zones}
            selectedZoneId={selectedZoneId}
            interactiveZones={sidebarTab === "areas"}
            showAreasInAuthor={showAreasInAuthor || sidebarTab === "areas"}
            drawingArea={drawingArea}
            onSelectZone={(id) => {
              setSelectedZoneId(id);
              setSidebarTab("areas");
              updateUi({ side: true });
            }}
            onFinishDrawArea={handleFinishDrawArea}
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
              <div className="work-top-hud-row">
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
                  rosStatus={rosStatus}
                  onAlertClick={() => {
                    updateUi({ side: true });
                    setSidebarTab("twin");
                  }}
                />
              )}
              </div>

              {ui.telemetry && (
                <TelemetryHud
                  stats={stats}
                  backend={backend}
                  expanded={ui.telemetryExpanded}
                  onToggleExpanded={() => updateUi({ telemetryExpanded: !ui.telemetryExpanded })}
                  onClose={() => updateUi({ telemetry: false })}
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
              joints={(() => {
                const a = getEntityAsset(selected);
                return a ? jointDefs[a] ?? [] : [];
              })()}
              assetUrls={assetUrls}
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
              onToggleCollapsed={() => updateUi({ inspector: !ui.inspector })}
              onOpacityChange={(op) => {
                if (!selected.components.renderer) return;
                updateObject(
                  selected.id,
                  { components: { ...selected.components, renderer: { ...selected.components.renderer, opacity: op } } },
                  `opacity:${selected.id}`,
                );
              }}
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

          <div className="work-stage-toggles">
            {showUi && (
              <button
                type="button"
                className={`work-ui-toggle${ui.telemetry ? " active" : ""}`}
                onClick={() => updateUi({ telemetry: !ui.telemetry })}
                title={ui.telemetry ? "Hide telemetry HUD" : "Show telemetry HUD (FPS, calls, memory)"}
              >
                <Gauge size={14} />
              </button>
            )}
            <button
              type="button"
              className="work-ui-toggle"
              onClick={() => updateUi({ all: !ui.all })}
              title="Show / hide all panels (H)"
            >
              {showUi ? <EyeOff size={14} /> : <Eye size={14} />}
            </button>
          </div>

          {!loadingSets && sets.length === 0 && (
            <div
              className="work-empty-hint"
              style={{ color: resolveCanvasBackdrop(prefs.canvasBg, themeId).isLight ? "#4b486b" : "#9c97b8" }}
            >
              No model sets yet — run the GitHub Action in your models repo first.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
