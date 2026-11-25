import React from "react";
import { Button, ColorPicker, Empty, Input, InputNumber, Select, Switch, Tag, Tooltip } from "antd";
import { Layers, PenTool, Plus, RotateCcw, Trash2, X } from "lucide-react";
import type { WorkspaceMode, ZoneDef } from "../../lib/workTypes";
import { ZONE_PALETTE } from "./TwinOverlays";
import HelpTip from "../../components/HelpTip";

interface Props {
  zones: ZoneDef[];
  selectedZoneId: string | null;
  drawingArea: boolean;
  showAreasInAuthor: boolean;
  workspaceMode: WorkspaceMode;
  onSelectZone: (id: string | null) => void;
  onAddZone: () => void;
  onToggleDrawArea: () => void;
  onToggleShowAreasInAuthor: (v: boolean) => void;
  onUpdateZone: (id: string, patch: Partial<ZoneDef>) => void;
  onDeleteZone: (id: string) => void;
  onResetZones: () => void;
}

const KIND_OPTIONS = [
  { value: "dock", label: "Receiving / Dock" },
  { value: "racking", label: "Storage / Racking" },
  { value: "robot_cell", label: "Robotic Cell" },
  { value: "conveyor", label: "Conveyor / Shipping" },
  { value: "amr_parking", label: "Charging / Parking" },
  { value: "staging", label: "Staging Bay" },
  { value: "safety", label: "Safety / Restricted" },
  { value: "custom", label: "Custom Area" },
];

const QUICK_COLORS = [
  "#10b981",
  "#6366f1",
  "#ec4899",
  "#22d3ee",
  "#f59e0b",
  "#8b6ff5",
  "#ef4444",
  "#38bdf8",
];

function zoneCenterSize(z: ZoneDef) {
  const x0 = Math.min(z.x[0], z.x[1]);
  const x1 = Math.max(z.x[0], z.x[1]);
  const z0 = Math.min(z.z[0], z.z[1]);
  const z1 = Math.max(z.z[0], z.z[1]);
  const w = Math.max(0.5, Number((x1 - x0).toFixed(2)));
  const d = Math.max(0.5, Number((z1 - z0).toFixed(2)));
  const cx = Number(((x0 + x1) / 2).toFixed(2));
  const cz = Number(((z0 + z1) / 2).toFixed(2));
  return { x0, x1, z0, z1, cx, cz, w, d };
}

export default function AreasSidebarTab({
  zones,
  selectedZoneId,
  drawingArea,
  showAreasInAuthor,
  workspaceMode,
  onSelectZone,
  onAddZone,
  onToggleDrawArea,
  onToggleShowAreasInAuthor,
  onUpdateZone,
  onDeleteZone,
  onResetZones,
}: Props) {
  const selected = zones.find((z) => z.id === selectedZoneId) ?? null;
  const geom = selected ? zoneCenterSize(selected) : null;

  const updateGeom = (next: { cx?: number; cz?: number; w?: number; d?: number }) => {
    if (!selected || !geom) return;
    const cx = next.cx ?? geom.cx;
    const cz = next.cz ?? geom.cz;
    const w = Math.max(0.5, next.w ?? geom.w);
    const d = Math.max(0.5, next.d ?? geom.d);
    onUpdateZone(selected.id, {
      x: [Number((cx - w / 2).toFixed(2)), Number((cx + w / 2).toFixed(2))],
      z: [Number((cz - d / 2).toFixed(2)), Number((cz + d / 2).toFixed(2))],
    });
  };

  return (
    <div className="work-side-body">
      <div className="work-area-actions">
        <Button size="small" type="primary" className="btn-glow" icon={<Plus size={13} />} onClick={onAddZone}>
          Add Area
        </Button>
        <Tooltip title="Click two opposite corners on the 3D floor to create an area">
          <Button
            size="small"
            type={drawingArea ? "primary" : "default"}
            ghost={drawingArea}
            icon={<PenTool size={13} />}
            onClick={onToggleDrawArea}
          >
            {drawingArea ? "Cancel Draw" : "Draw on Floor"}
          </Button>
        </Tooltip>
        <Tooltip title="Restore default facility areas">
          <Button size="small" icon={<RotateCcw size={13} />} onClick={onResetZones} />
        </Tooltip>
        <HelpTip content="Draw on Floor: click two opposite corners on the 3D floor to place a new area. Press Esc to cancel." />
      </div>

      {workspaceMode === "author" && (
        <div className="work-pref-row" style={{ marginBottom: 8 }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            <Layers size={13} /> Show areas in 3D
          </span>
          <Switch size="small" checked={showAreasInAuthor} onChange={onToggleShowAreasInAuthor} />
        </div>
      )}

      <div className="work-field-label">Floor Areas ({zones.length})</div>

      <div className="work-area-list">
        {zones.length === 0 && (
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No areas defined" />
        )}
        {zones.map((z) => {
          const color = z.color ?? ZONE_PALETTE[z.kind] ?? "#6366f1";
          const g = zoneCenterSize(z);
          const isSelected = z.id === selectedZoneId;
          return (
            <div
              key={z.id}
              className={`work-area-row${isSelected ? " active" : ""}`}
              onClick={() => onSelectZone(isSelected ? null : z.id)}
            >
              <span className="work-area-dot" style={{ background: color }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="work-list-title">{z.name || z.id}</div>
                <div className="work-list-sub">
                  {z.kind} · {g.w.toFixed(1)}×{g.d.toFixed(1)}m
                </div>
              </div>
              <Tooltip title="Delete area">
                <button
                  type="button"
                  className="work-row-btn"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDeleteZone(z.id);
                  }}
                >
                  <Trash2 size={13} />
                </button>
              </Tooltip>
            </div>
          );
        })}
      </div>

      {selected && geom && (
        <div className="work-area-editor">
          <div className="work-area-editor-head">
            <span className="work-field-label" style={{ margin: 0 }}>
              Edit Area
            </span>
            <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <Tag color="cyan" style={{ marginRight: 0 }}>
                {geom.w.toFixed(1)}×{geom.d.toFixed(1)}m
              </Tag>
              <button
                type="button"
                className="work-row-btn"
                title="Close area editor"
                onClick={() => onSelectZone(null)}
              >
                <X size={13} />
              </button>
            </div>
          </div>

          <Input
            size="small"
            value={selected.name ?? ""}
            placeholder="Area name"
            maxLength={48}
            onChange={(e) => onUpdateZone(selected.id, { name: e.target.value })}
          />

          <Select
            size="small"
            style={{ width: "100%" }}
            value={selected.kind}
            options={KIND_OPTIONS}
            onChange={(kind) => {
              const suggested = ZONE_PALETTE[kind];
              onUpdateZone(selected.id, {
                kind,
                ...(suggested ? { color: suggested } : {}),
              });
            }}
          />

          <div className="work-area-swatches">
            {QUICK_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                className={`work-area-swatch${(selected.color ?? ZONE_PALETTE[selected.kind]) === c ? " active" : ""}`}
                style={{ background: c }}
                onClick={() => onUpdateZone(selected.id, { color: c })}
                title={c}
              />
            ))}
            <ColorPicker
              size="small"
              value={selected.color ?? ZONE_PALETTE[selected.kind] ?? "#6366f1"}
              onChange={(c) => onUpdateZone(selected.id, { color: c.toHexString() })}
            />
          </div>

          <div className="work-area-grid">
            <label>
              <span>Center X (m)</span>
              <InputNumber
                size="small"
                step={0.5}
                value={geom.cx}
                onChange={(v) => updateGeom({ cx: v ?? 0 })}
              />
            </label>
            <label>
              <span>Center Z (m)</span>
              <InputNumber
                size="small"
                step={0.5}
                value={geom.cz}
                onChange={(v) => updateGeom({ cz: v ?? 0 })}
              />
            </label>
            <label>
              <span>Width (m)</span>
              <InputNumber
                size="small"
                step={0.5}
                min={0.5}
                max={80}
                value={geom.w}
                onChange={(v) => updateGeom({ w: v ?? 1 })}
              />
            </label>
            <label>
              <span>Depth (m)</span>
              <InputNumber
                size="small"
                step={0.5}
                min={0.5}
                max={80}
                value={geom.d}
                onChange={(v) => updateGeom({ d: v ?? 1 })}
              />
            </label>
          </div>

          <div className="work-area-bounds">
            X [{geom.x0.toFixed(1)}, {geom.x1.toFixed(1)}] · Z [{geom.z0.toFixed(1)}, {geom.z1.toFixed(1)}]
          </div>

          <Button
            size="small"
            danger
            block
            icon={<Trash2 size={13} />}
            onClick={() => onDeleteZone(selected.id)}
          >
            Delete Area
          </Button>
        </div>
      )}
    </div>
  );
}
