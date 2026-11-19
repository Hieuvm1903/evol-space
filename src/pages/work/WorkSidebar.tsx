import React, { useEffect, useMemo, useRef, useState } from "react";
import { Button, Dropdown, Empty, Input, Segmented, Select, Slider, Switch, Tabs, Tag, Tooltip } from "antd";
import {
  Activity, AlertCircle, ArrowLeftRight, BatteryCharging, Bot, Box, Boxes, Building2, ChevronDown, ChevronRight, Container, Cpu,
  Download, FilePlus, Folder, FolderOpen, FolderPlus, FolderTree, Layers, Lightbulb, LogIn, Monitor, Package, Plane, Plus, Route,
  ShoppingBag, SlidersHorizontal, Sparkles, Trash2, Truck, User, Zap,
} from "lucide-react";
import { childrenIndex } from "../../lib/sceneMath";
import type { BuiltAiAsset } from "./aiModelBuilder";
import type {
  AssetTelemetry,
  CameraMode,
  LightType,
  ModelSetRow,
  PerfStats,
  SceneObjectData,
  SceneSummary,
  StreamStatus,
  TwinAlert,
  TwinScenario,
  ViewPrefs,
  WorkspaceMode,
  ZoneDef,
} from "../../lib/workTypes";
import AreasSidebarTab from "./AreasSidebarTab";
import TwinSidebarTab from "./TwinSidebarTab";

export const DRAG_MIME = "application/x-work-asset";
const NODE_MIME = "application/x-work-node";

const assetIcon = (asset: string | null, size = 18) => {
  switch (asset) {
    case "warehouse": return <Building2 size={size} />;
    case "rack": return <Boxes size={size} />;
    case "tote": return <Package size={size} />;
    case "robot": return <Bot size={size} />;
    case "conveyor": return <Container size={size} />;
    case "station": return <Monitor size={size} />;
    case "charger": return <BatteryCharging size={size} />;
    case "pallet": return <Layers size={size} />;
    case "goods": return <Box size={size} />;
    case "bag": return <ShoppingBag size={size} />;
    case "track": return <Route size={size} />;
    case "robot_arm": return <Cpu size={size} />;
    case "robot_transfer": return <ArrowLeftRight size={size} />;
    case "humanoid": return <User size={size} />;
    case "drone": return <Plane size={size} />;
    case "truck": return <Truck size={size} />;
    default: return asset?.startsWith("ai_") ? <Sparkles size={size} /> : <Box size={size} />;
  }
};

const AI_QUICK_PROMPTS = [
  { label: "Delivery Rover", prompt: "Autonomous warehouse delivery rover with 4 rugged wheels, cyan lidar dome, and cargo tray" },
  { label: "Charging Kiosk", prompt: "Industrial EV robot charging station kiosk with glowing cyan status screen and power cable" },
  { label: "Gantry Crane", prompt: "Yellow overhead gantry frame crane with trolley beam and hanging lifting hook" },
  { label: "Control Desk", prompt: "Futuristic operator control desk with curved dual monitors and illuminated console" },
];

const when = (iso: string) => new Date(iso).toLocaleString(undefined, { dateStyle: "short", timeStyle: "short" });

interface Props {
  // models
  sets: ModelSetRow[]; activeSet: ModelSetRow | null; latestSet: ModelSetRow | null; assets: string[]; hasLayout: boolean;
  onSelectSet: (id: number) => void; onAddAsset: (asset: string) => void; onImportLayout: () => void;
  onAddGroup: () => void; onAddLight: (t: LightType) => void;
  // AI 3D generator
  aiAssets: BuiltAiAsset[];
  aiGenerating: boolean;
  aiError: string | null;
  onGenerateAiModel: (prompt: string, targetHeight: number, autoPlace: boolean) => Promise<boolean>;
  onDownloadAiAsset: (assetId: string) => void;
  onDeleteAiAsset: (assetId: string) => void;
  // scenes
  loggedIn: boolean; scenes: SceneSummary[]; currentSceneId: number | null;
  onNewScene: () => void; onOpenScene: (id: number) => void; onDeleteScene: (s: SceneSummary) => void;
  // hierarchy
  objects: SceneObjectData[]; selectedId: string | null; staticIds: Set<string>;
  onSelectObject: (id: string) => void; onDeleteObject: (id: string) => void;
  onReparent: (id: string, parentId: string | null) => void;
  // view
  prefs: ViewPrefs; onPrefs: (patch: Partial<ViewPrefs>) => void; stats: PerfStats | null; backend: string;
  // digital twin
  workspaceMode: WorkspaceMode;
  activeTab: string;
  onTabChange: (key: string) => void;
  fleet: AssetTelemetry[];
  scenario: TwinScenario;
  alerts: TwinAlert[];
  streamStatus: StreamStatus;
  onScenario: (s: TwinScenario) => void;
  onAcknowledgeAlert: (alertId: string) => void;
  onClearAlerts: () => void;
  onConnectStream: (url: string) => void;
  onDisconnectStream: () => void;
  // areas / zones
  zones: ZoneDef[];
  selectedZoneId: string | null;
  drawingArea: boolean;
  showAreasInAuthor: boolean;
  onSelectZone: (id: string | null) => void;
  onAddZone: () => void;
  onToggleDrawArea: () => void;
  onToggleShowAreasInAuthor: (v: boolean) => void;
  onUpdateZone: (id: string, patch: Partial<ZoneDef>) => void;
  onDeleteZone: (id: string) => void;
  onResetZones: () => void;
}

const renderTabIcon = (title: string, icon: React.ReactNode, badgeCount?: number) => (
  <Tooltip title={title} placement="bottom" mouseEnterDelay={0.15}>
    <span className="work-side-tab-icon" aria-label={title}>
      {icon}
      {badgeCount !== undefined && badgeCount > 0 && (
        <span className="work-side-tab-badge">{badgeCount > 99 ? "99+" : badgeCount}</span>
      )}
    </span>
  </Tooltip>
);

export default function WorkSidebar(p: Props) {
  const unackAlerts = p.alerts.filter((a) => !a.acknowledged).length;

  const twinItem = {
    key: "twin",
    label: renderTabIcon(
      unackAlerts > 0 ? `Digital Twin (${unackAlerts} alert${unackAlerts === 1 ? "" : "s"})` : "Digital Twin",
      <Activity size={16} />,
      unackAlerts,
    ),
    children: (
      <TwinSidebarTab
        fleet={p.fleet}
        selectedId={p.selectedId}
        scenario={p.scenario}
        alerts={p.alerts}
        streamStatus={p.streamStatus}
        onSelectAsset={p.onSelectObject}
        onScenario={p.onScenario}
        onAcknowledgeAlert={p.onAcknowledgeAlert}
        onClearAlerts={p.onClearAlerts}
        onConnectStream={p.onConnectStream}
        onDisconnectStream={p.onDisconnectStream}
      />
    ),
  };

  const areasItem = {
    key: "areas",
    label: renderTabIcon(
      `Floor Areas (${p.zones.length})`,
      <Layers size={16} />,
    ),
    children: (
      <AreasSidebarTab
        zones={p.zones}
        selectedZoneId={p.selectedZoneId}
        drawingArea={p.drawingArea}
        showAreasInAuthor={p.showAreasInAuthor}
        workspaceMode={p.workspaceMode}
        onSelectZone={p.onSelectZone}
        onAddZone={p.onAddZone}
        onToggleDrawArea={p.onToggleDrawArea}
        onToggleShowAreasInAuthor={p.onToggleShowAreasInAuthor}
        onUpdateZone={p.onUpdateZone}
        onDeleteZone={p.onDeleteZone}
        onResetZones={p.onResetZones}
      />
    ),
  };

  const authorItems = [
    { key: "models", label: renderTabIcon("Models & AI 3D Generator", <Boxes size={16} />), children: <ModelsTab {...p} /> },
    areasItem,
    { key: "tree", label: renderTabIcon("Scene Hierarchy", <FolderTree size={16} />), children: <HierarchyTab {...p} /> },
    { key: "scenes", label: renderTabIcon("Saved Scenes", <FolderOpen size={16} />), children: <ScenesTab {...p} /> },
    { key: "view", label: renderTabIcon("View & Renderer", <SlidersHorizontal size={16} />), children: <ViewTab {...p} /> },
  ];

  const items = p.workspaceMode === "twin" ? [twinItem, ...authorItems] : [...authorItems, twinItem];

  return (
    <Tabs
      className="work-side-tabs"
      activeKey={p.activeTab}
      onChange={p.onTabChange}
      items={items}
    />
  );
}

// ------------------------------------------------------------------ models
function ModelsTab(p: Props) {
  const isLatest = !!p.activeSet && !!p.latestSet && p.activeSet.id === p.latestSet.id;
  const [aiPrompt, setAiPrompt] = useState("");
  const [targetHeight, setTargetHeight] = useState<number>(1.5);
  const [autoPlace, setAutoPlace] = useState(true);

  const handleGenerate = async () => {
    const clean = aiPrompt.trim();
    if (!clean || p.aiGenerating) return;
    await p.onGenerateAiModel(clean, targetHeight, autoPlace);
  };

  return (
    <div className="work-side-body">
      <div className="work-ai-box">
        <div className="work-ai-head">
          <span className="work-ai-title">
            <Sparkles size={13} />
            AI 3D Generator
          </span>
          <span className="work-ai-badge">GLB</span>
        </div>

        <Input.TextArea
          value={aiPrompt}
          onChange={(e) => setAiPrompt(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.ctrlKey || e.metaKey || !e.shiftKey)) {
              e.preventDefault();
              handleGenerate();
            }
          }}
          placeholder="Describe a 3D model (e.g. forklift, solar kiosk, robotic arm)..."
          autoSize={{ minRows: 2, maxRows: 4 }}
          maxLength={600}
          disabled={p.aiGenerating}
        />

        <div className="work-ai-presets">
          {AI_QUICK_PROMPTS.map((q) => (
            <button
              key={q.label}
              type="button"
              className="work-ai-preset-btn"
              disabled={p.aiGenerating}
              onClick={() => setAiPrompt(q.prompt)}
            >
              {q.label}
            </button>
          ))}
        </div>

        <div className="work-ai-controls">
          <Select
            size="small"
            value={targetHeight}
            onChange={setTargetHeight}
            disabled={p.aiGenerating}
            style={{ width: 92 }}
            options={[
              { value: 0, label: "Auto size" },
              { value: 0.8, label: "0.8 m" },
              { value: 1.5, label: "1.5 m" },
              { value: 2.5, label: "2.5 m" },
              { value: 4.0, label: "4.0 m" },
            ]}
          />
          <label className="work-ai-autoplace" title="Automatically place generated model at floor center">
            <Switch size="small" checked={autoPlace} onChange={setAutoPlace} disabled={p.aiGenerating} />
            <span>Place</span>
          </label>
          <Button
            size="small"
            type="primary"
            className="btn-glow"
            icon={<Sparkles size={12} />}
            loading={p.aiGenerating}
            disabled={!aiPrompt.trim()}
            onClick={handleGenerate}
            style={{ marginLeft: "auto" }}
          >
            Generate
          </Button>
        </div>

        {p.aiError && (
          <div className="work-ai-error">
            <AlertCircle size={13} style={{ flexShrink: 0, marginTop: 1 }} />
            <span>{p.aiError}</span>
          </div>
        )}
      </div>

      {p.aiAssets.length > 0 && (
        <>
          <div className="work-field-label" style={{ marginTop: 14 }}>
            AI Models ({p.aiAssets.length})
          </div>
          <div className="work-asset-grid">
            {p.aiAssets.map((item) => (
              <div
                key={item.blueprint.id}
                className="work-asset-card work-ai-asset-card cursor-target"
                draggable
                title={item.blueprint.description}
                onDragStart={(e) => {
                  e.dataTransfer.setData(DRAG_MIME, item.blueprint.id);
                  e.dataTransfer.effectAllowed = "copy";
                }}
              >
                <span className="work-asset-icon work-ai-asset-icon">
                  <Sparkles size={17} />
                </span>
                <span className="work-asset-name work-ai-asset-name">{item.blueprint.name}</span>
                <span className="work-ai-asset-meta">
                  {item.partCount}p · {item.bounds[1]}m
                </span>
                <Tooltip title="Add to scene">
                  <button
                    type="button"
                    className="work-asset-add"
                    onClick={() => p.onAddAsset(item.blueprint.id)}
                  >
                    <Plus size={14} />
                  </button>
                </Tooltip>
                <Tooltip title="Download .glb">
                  <button
                    type="button"
                    className="work-ai-mini-btn work-ai-dl"
                    onClick={() => p.onDownloadAiAsset(item.blueprint.id)}
                  >
                    <Download size={11} />
                  </button>
                </Tooltip>
                <Tooltip title="Remove from palette">
                  <button
                    type="button"
                    className="work-ai-mini-btn work-ai-del"
                    onClick={() => p.onDeleteAiAsset(item.blueprint.id)}
                  >
                    <Trash2 size={11} />
                  </button>
                </Tooltip>
              </div>
            ))}
          </div>
        </>
      )}

      <div className="work-field-label" style={{ marginTop: 14 }}>Model set (from Supabase)</div>
      <Select
        style={{ width: "100%" }} value={p.activeSet?.id} onChange={p.onSelectSet} placeholder="No model sets found"
        options={p.sets.map((s) => ({ value: s.id, label: `${s.name} · ${s.version} · ${when(s.created_at)}` }))}
      />
      {p.activeSet && (
        <div className="work-set-meta">
          {isLatest ? <Tag color="cyan">latest</Tag> : (
            <Button size="small" type="link" onClick={() => p.latestSet && p.onSelectSet(p.latestSet.id)}>Update to latest</Button>
          )}
          <span>{p.assets.length} models</span>
        </div>
      )}

      <div className="work-field-label" style={{ marginTop: 14 }}>Drag onto the scene, or click +</div>
      <div className="work-asset-grid">
        {p.assets.map((a) => (
          <div key={a} className="work-asset-card cursor-target" draggable
            onDragStart={(e) => { e.dataTransfer.setData(DRAG_MIME, a); e.dataTransfer.effectAllowed = "copy"; }}>
            <span className="work-asset-icon">{assetIcon(a)}</span>
            <span className="work-asset-name">{a}</span>
            <Tooltip title="Add to scene">
              <button type="button" className="work-asset-add" onClick={() => p.onAddAsset(a)}><Plus size={14} /></button>
            </Tooltip>
          </div>
        ))}
        {p.assets.length === 0 && <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Nothing published yet" />}
      </div>

      <div className="work-field-label" style={{ marginTop: 14 }}>Other objects</div>
      <div className="work-btn-row">
        <Button size="small" icon={<FolderPlus size={13} />} onClick={p.onAddGroup}>Group</Button>
        <Dropdown
          trigger={["click"]}
          menu={{
            items: [
              { key: "point", label: "Point light" },
              { key: "spot", label: "Spot light" },
              { key: "directional", label: "Directional light" },
            ],
            onClick: ({ key }) => p.onAddLight(key as LightType),
          }}
        >
          <Button size="small" icon={<Lightbulb size={13} />}>Light ▾</Button>
        </Dropdown>
      </div>

      {p.hasLayout && (
        <Button block icon={<Download size={14} />} onClick={p.onImportLayout} style={{ marginTop: 14 }}>
          Import warehouse layout
        </Button>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ hierarchy
function HierarchyTab(p: Props) {
  const idx = useMemo(() => childrenIndex(p.objects), [p.objects]);
  const byId = useMemo(() => new Map(p.objects.map((o) => [o.id, o])), [p.objects]);
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [dropId, setDropId] = useState<string | "root" | null>(null);
  const dragId = useRef<string | null>(null);

  // keep the selected object visible: expand its ancestors
  useEffect(() => {
    if (!p.selectedId) return;
    const ids: string[] = [];
    for (let o = byId.get(p.selectedId); o?.parentId && ids.length < 64; o = byId.get(o.parentId)) ids.push(o.parentId);
    if (ids.length) setOpen((cur) => (ids.every((i) => cur.has(i)) ? cur : new Set([...cur, ...ids])));
  }, [p.selectedId, byId]);

  const toggle = (id: string) => setOpen((cur) => { const n = new Set(cur); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  const drop = (target: string | null) => {
    const id = dragId.current;
    dragId.current = null;
    setDropId(null);
    if (id && id !== target) p.onReparent(id, target);
  };

  const row = (id: string, depth: number): React.ReactNode => {
    const o = byId.get(id);
    if (!o) return null;
    const kids = idx.get(id) ?? [];
    const expanded = open.has(id);
    const isStatic = p.staticIds.has(id);
    return (
      <React.Fragment key={id}>
        <div
          className={`work-tree-row${id === p.selectedId ? " active" : ""}${dropId === id ? " drop" : ""}`}
          style={{ paddingLeft: 6 + depth * 14 }}
          draggable
          onClick={() => p.onSelectObject(id)}
          onDragStart={(e) => { dragId.current = id; e.dataTransfer.setData(NODE_MIME, id); e.dataTransfer.effectAllowed = "move"; }}
          onDragOver={(e) => { if (e.dataTransfer.types.includes(NODE_MIME)) { e.preventDefault(); setDropId(id); } }}
          onDragLeave={() => setDropId((d) => (d === id ? null : d))}
          onDrop={(e) => { e.preventDefault(); e.stopPropagation(); drop(id); }}
        >
          <button type="button" className="work-tree-chev" style={{ visibility: kids.length ? "visible" : "hidden" }}
            onClick={(e) => { e.stopPropagation(); toggle(id); }}>
            {expanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
          </button>
          <span className="work-tree-icon">
            {o.kind === "group" ? <Folder size={13} /> : o.kind === "light" ? <Lightbulb size={13} /> : assetIcon(o.asset, 13)}
          </span>
          <span className="work-tree-label">{o.label}</span>
          {kids.length > 0 && <span className="work-tree-count">{kids.length}</span>}
          {o.script?.trim() && <Tooltip title="Has a behaviour script"><Zap size={11} className="work-tree-badge" /></Tooltip>}
          {isStatic && <Tooltip title="Static (instanced)"><span className="work-tree-s">S</span></Tooltip>}
          <button type="button" className="work-row-btn" title="Delete (with children)"
            onClick={(e) => { e.stopPropagation(); p.onDeleteObject(id); }}><Trash2 size={12} /></button>
        </div>
        {expanded && kids.map((k) => row(k, depth + 1))}
      </React.Fragment>
    );
  };

  const roots = idx.get(null) ?? [];
  return (
    <div className="work-side-body">
      <div
        className={`work-tree-root${dropId === "root" ? " drop" : ""}`}
        onDragOver={(e) => { if (e.dataTransfer.types.includes(NODE_MIME)) { e.preventDefault(); setDropId("root"); } }}
        onDragLeave={() => setDropId((d) => (d === "root" ? null : d))}
        onDrop={(e) => { e.preventDefault(); drop(null); }}
      >
        {p.objects.length} objects · drag a row onto another to make it a child, or here to unparent
      </div>
      {p.objects.length === 0 && <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Scene is empty" />}
      {roots.map((r) => row(r, 0))}
    </div>
  );
}

// ------------------------------------------------------------------ scenes
function ScenesTab(p: Props) {
  return (
    <div className="work-side-body">
      {!p.loggedIn ? (
        <div className="work-login-hint"><LogIn size={16} /> Log in to save and open scenes.</div>
      ) : (
        <>
          <Button block icon={<FilePlus size={14} />} onClick={p.onNewScene}>New scene</Button>
          <div className="work-list">
            {p.scenes.length === 0 && <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No saved scenes" />}
            {p.scenes.map((s) => (
              <div key={s.id} className={`work-list-row${s.id === p.currentSceneId ? " active" : ""}`} onClick={() => p.onOpenScene(s.id)}>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div className="work-list-title">{s.name}</div>
                  <div className="work-list-sub">{when(s.updated_at)}{s.model_set_version ? ` · v ${s.model_set_version}` : ""}</div>
                </div>
                <button type="button" className="work-row-btn" title="Delete scene"
                  onClick={(e) => { e.stopPropagation(); p.onDeleteScene(s); }}><Trash2 size={13} /></button>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ view / performance
function ViewTab({ prefs, onPrefs, stats, backend }: Props) {
  const [webgpuStatus, setWebgpuStatus] = useState<string>("checking…");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const nav = navigator as Navigator & { gpu?: { requestAdapter?: () => Promise<unknown | null> } };
      if (!nav.gpu?.requestAdapter) {
        if (!cancelled) setWebgpuStatus("Not supported");
        return;
      }
      try {
        const adapter = await nav.gpu.requestAdapter();
        if (!cancelled) setWebgpuStatus(adapter ? "Available" : "No adapter");
      } catch {
        if (!cancelled) setWebgpuStatus("Unavailable");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const sw = (label: string, key: keyof ViewPrefs, hint?: string) => (
    <div className="work-pref-row" title={hint}>
      <span>{label}</span>
      <Switch size="small" checked={prefs[key] as boolean} onChange={(v) => onPrefs({ [key]: v } as Partial<ViewPrefs>)} />
    </div>
  );
  return (
    <div className="work-side-body">
      <div className="work-field-label">Renderer</div>
      <div className="work-pref-row">
        <span>Active backend</span>
        <Tag color={backend.startsWith("error") ? "red" : backend ? "green" : "gold"} style={{ marginRight: 0 }}>
          {backend || "starting…"}
        </Tag>
      </div>
      <div className="work-pref-row">
        <span>Browser WebGPU</span>
        <Tag color={webgpuStatus === "Available" ? "cyan" : "default"} style={{ marginRight: 0 }}>
          {webgpuStatus}
        </Tag>
      </div>
      <div className="work-hint">
        3D viewport uses WebGL2 so PBR, shadows, and GLSL shaders run across all browsers even when WebGPU is unavailable.
      </div>

      <div className="work-field-label" style={{ marginTop: 12 }}>Performance</div>
      {sw("Instance static objects", "instancing", "Static objects share a few draw calls via InstancedMesh")}
      {sw("Frustum culling", "frustumCull")}
      {sw("Distance culling", "distanceCull")}
      {prefs.distanceCull && (
        <div className="work-pref-slider">
          <span>{prefs.cullDistance} m</span>
          <Slider min={10} max={200} value={prefs.cullDistance} onChange={(v) => onPrefs({ cullDistance: v })} />
        </div>
      )}
      {sw("Level of detail", "lod", "Calculates mid/coarse GLTF meshes by perspective distance")}
      {prefs.lod && (
        <div className="work-pref-slider">
          <span>{prefs.lodDistance} m</span>
          <Slider min={3} max={60} value={prefs.lodDistance} onChange={(v) => onPrefs({ lodDistance: v })} />
        </div>
      )}
      {sw("Shadows", "shadows")}

      <div className="work-field-label" style={{ marginTop: 12 }}>Viewport</div>
      <div className="work-pref-row">
        <span>Camera projection</span>
        <Segmented
          size="small"
          value={prefs.cameraMode}
          onChange={(v) => onPrefs({ cameraMode: v as CameraMode })}
          options={[
            { value: "perspective", label: "Perspective" },
            { value: "orthographic", label: "Orthogonal" },
          ]}
        />
      </div>
      {sw("Show gizmos", "showGizmos", "View cube, light icons, group axes, selection box")}
      {sw("Editor lighting", "defaultLight", "Turn off to see only the lights you added")}
      {sw("Orbit around selection", "focusSelection")}
      <div className="work-pref-row">
        <span>Gizmo space</span>
        <Segmented size="small" value={prefs.space} onChange={(v) => onPrefs({ space: v as "world" | "local" })}
          options={[{ value: "world", label: "World" }, { value: "local", label: "Local" }]} />
      </div>

      <div className="work-field-label" style={{ marginTop: 12 }}>Live stats</div>
      {stats ? (
        <div className="work-stats">
          <span>Draw calls</span><b>{stats.calls}</b>
          <span>Triangles</span><b>{stats.triangles.toLocaleString()}</b>
          <span>Instances</span><b>{stats.instTotal}</b>
          <span>· LOD 0 (full)</span><b>{stats.instNear}</b>
          <span>· LOD 1 (calc mid)</span><b>{stats.instMid}</b>
          <span>· LOD 2 (calc far)</span><b>{stats.instFar}</b>
          <span>· culled</span><b>{stats.instCulled}</b>
          <span>Dynamic nodes</span><b>{stats.dynamic}</b>
        </div>
      ) : <div className="work-list-sub">Waiting for the first frames…</div>}
    </div>
  );
}
