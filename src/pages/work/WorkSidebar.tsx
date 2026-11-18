import React, { useEffect, useMemo, useRef, useState } from "react";
import { Button, Dropdown, Empty, Segmented, Select, Slider, Switch, Tabs, Tag, Tooltip } from "antd";
import {
  ArrowLeftRight, BatteryCharging, Bot, Box, Boxes, Building2, ChevronDown, ChevronRight, Container, Cpu, Download,
  FilePlus, Folder, FolderPlus, Layers, Lightbulb, LogIn, Monitor, Package, Plane, Plus, Route, ShoppingBag, Trash2,
  Truck, User, Zap,
} from "lucide-react";
import { childrenIndex } from "../../lib/sceneMath";
import type {
  AssetTelemetry,
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
} from "../../lib/workTypes";
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
    default: return <Box size={size} />;
  }
};

const when = (iso: string) => new Date(iso).toLocaleString(undefined, { dateStyle: "short", timeStyle: "short" });

interface Props {
  // models
  sets: ModelSetRow[]; activeSet: ModelSetRow | null; latestSet: ModelSetRow | null; assets: string[]; hasLayout: boolean;
  onSelectSet: (id: number) => void; onAddAsset: (asset: string) => void; onImportLayout: () => void;
  onAddGroup: () => void; onAddLight: (t: LightType) => void;
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
}

export default function WorkSidebar(p: Props) {
  const twinItem = {
    key: "twin",
    label: `Twin${p.alerts.some((a) => !a.acknowledged) ? ` (${p.alerts.filter((a) => !a.acknowledged).length})` : ""}`,
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

  const authorItems = [
    { key: "models", label: "Models", children: <ModelsTab {...p} /> },
    { key: "tree", label: "Hierarchy", children: <HierarchyTab {...p} /> },
    { key: "scenes", label: "Scenes", children: <ScenesTab {...p} /> },
    { key: "view", label: "View", children: <ViewTab {...p} /> },
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
  return (
    <div className="work-side-body">
      <div className="work-field-label">Model set (from Supabase)</div>
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
        <span>Backend</span>
        <Tag color={backend === "WebGPU" ? "green" : backend.startsWith("error") ? "red" : "gold"} style={{ marginRight: 0 }}>{backend || "starting…"}</Tag>
      </div>
      {sw("Force WebGL2 backend", "forceWebGL", "Skip WebGPU — for troubleshooting")}

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
      {sw("Transparent if blocking view", "autoTransparentOccluding", "Automatically fades walls & racks between camera and focus point")}
      {prefs.autoTransparentOccluding && (
        <div className="work-pref-slider">
          <span>{Math.round(prefs.occlusionOpacity * 100)}%</span>
          <Slider
            min={8}
            max={60}
            step={2}
            value={Math.round(prefs.occlusionOpacity * 100)}
            onChange={(v) => onPrefs({ occlusionOpacity: v / 100 })}
          />
        </div>
      )}
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
