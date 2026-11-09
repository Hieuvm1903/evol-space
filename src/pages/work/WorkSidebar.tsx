import React from "react";
import { Button, Empty, Select, Tabs, Tag, Tooltip } from "antd";
import { Box, Bot, Boxes, Container, Monitor, Package, Plus, Trash2, Download, FilePlus, LogIn } from "lucide-react";
import type { ModelSetRow, SceneObjectData, SceneSummary } from "../../lib/workTypes";

const ASSET_ICONS: Record<string, React.ReactNode> = {
  rack: <Boxes size={18} />, tote: <Package size={18} />, robot: <Bot size={18} />,
  conveyor: <Container size={18} />, station: <Monitor size={18} />,
};
const iconFor = (asset: string) => ASSET_ICONS[asset] ?? <Box size={18} />;

export const DRAG_MIME = "application/x-work-asset";

interface Props {
  // models
  sets: ModelSetRow[];
  activeSet: ModelSetRow | null;
  latestSet: ModelSetRow | null;
  assets: string[];
  hasLayout: boolean;
  onSelectSet: (id: number) => void;
  onAddAsset: (asset: string) => void;
  onImportLayout: () => void;
  // scenes
  loggedIn: boolean;
  scenes: SceneSummary[];
  currentSceneId: number | null;
  onNewScene: () => void;
  onOpenScene: (id: number) => void;
  onDeleteScene: (s: SceneSummary) => void;
  // objects
  objects: SceneObjectData[];
  selectedId: string | null;
  onSelectObject: (id: string) => void;
  onDeleteObject: (id: string) => void;
}

const when = (iso: string) => new Date(iso).toLocaleString(undefined, { dateStyle: "short", timeStyle: "short" });

export default function WorkSidebar(p: Props) {
  const isLatest = !!p.activeSet && !!p.latestSet && p.activeSet.id === p.latestSet.id;

  const modelsTab = (
    <div className="work-side-body">
      <div className="work-field-label">Model set (from Supabase)</div>
      <Select
        style={{ width: "100%" }}
        value={p.activeSet?.id}
        onChange={p.onSelectSet}
        placeholder="No model sets found"
        options={p.sets.map((s) => ({ value: s.id, label: `${s.name} · ${s.version} · ${when(s.created_at)}` }))}
      />
      {p.activeSet && (
        <div className="work-set-meta">
          {isLatest ? <Tag color="cyan">latest</Tag> : (
            <Button size="small" type="link" onClick={() => p.latestSet && p.onSelectSet(p.latestSet.id)}>
              Update to latest
            </Button>
          )}
          <span>{p.assets.length} models</span>
        </div>
      )}

      <div className="work-field-label" style={{ marginTop: 14 }}>Drag onto the scene, or click +</div>
      <div className="work-asset-grid">
        {p.assets.map((a) => (
          <div
            key={a}
            className="work-asset-card cursor-target"
            draggable
            onDragStart={(e) => { e.dataTransfer.setData(DRAG_MIME, a); e.dataTransfer.effectAllowed = "copy"; }}
          >
            <span className="work-asset-icon">{iconFor(a)}</span>
            <span className="work-asset-name">{a}</span>
            <Tooltip title="Add to scene">
              <button type="button" className="work-asset-add" onClick={() => p.onAddAsset(a)}><Plus size={14} /></button>
            </Tooltip>
          </div>
        ))}
        {p.assets.length === 0 && <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Nothing published yet" />}
      </div>

      {p.hasLayout && (
        <Button block icon={<Download size={14} />} onClick={p.onImportLayout} style={{ marginTop: 12 }}>
          Import warehouse layout
        </Button>
      )}
    </div>
  );

  const scenesTab = (
    <div className="work-side-body">
      {!p.loggedIn ? (
        <div className="work-login-hint"><LogIn size={16} /> Log in to save and open scenes.</div>
      ) : (
        <>
          <Button block icon={<FilePlus size={14} />} onClick={p.onNewScene}>New scene</Button>
          <div className="work-list">
            {p.scenes.length === 0 && <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No saved scenes" />}
            {p.scenes.map((s) => (
              <div
                key={s.id}
                className={`work-list-row${s.id === p.currentSceneId ? " active" : ""}`}
                onClick={() => p.onOpenScene(s.id)}
              >
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div className="work-list-title">{s.name}</div>
                  <div className="work-list-sub">{when(s.updated_at)}{s.model_set_version ? ` · v ${s.model_set_version}` : ""}</div>
                </div>
                <button
                  type="button" className="work-row-btn" title="Delete scene"
                  onClick={(e) => { e.stopPropagation(); p.onDeleteScene(s); }}
                ><Trash2 size={13} /></button>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );

  const objectsTab = (
    <div className="work-side-body">
      <div className="work-list">
        {p.objects.length === 0 && <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Scene is empty" />}
        {p.objects.map((o) => (
          <div
            key={o.id}
            className={`work-list-row${o.id === p.selectedId ? " active" : ""}`}
            onClick={() => p.onSelectObject(o.id)}
          >
            <span className="work-asset-icon small">{iconFor(o.asset)}</span>
            <div className="work-list-title" style={{ flex: 1 }}>{o.label}</div>
            <button
              type="button" className="work-row-btn" title="Delete"
              onClick={(e) => { e.stopPropagation(); p.onDeleteObject(o.id); }}
            ><Trash2 size={13} /></button>
          </div>
        ))}
      </div>
    </div>
  );

  return (
    <aside className="work-side evol-glass-card">
      <Tabs
        className="work-side-tabs"
        defaultActiveKey="models"
        items={[
          { key: "models", label: "Models", children: modelsTab },
          { key: "scenes", label: "Scenes", children: scenesTab },
          { key: "objects", label: `Objects (${p.objects.length})`, children: objectsTab },
        ]}
      />
    </aside>
  );
}
