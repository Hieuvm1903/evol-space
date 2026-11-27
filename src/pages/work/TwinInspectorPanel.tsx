import React from "react";
import { Button, Segmented, Slider } from "antd";
import {
  AlertOctagon,
  BatteryCharging,
  ChevronRight,
  Flame,
  RotateCcw,
  SlidersHorizontal,
  Thermometer,
  Wrench,
  X,
} from "lucide-react";
import { getEntityAsset, type AssetTelemetry, type FaultKind, type SceneObjectData } from "../../lib/workTypes";

interface Props {
  object: SceneObjectData;
  telemetry: AssetTelemetry | undefined;
  collapsed: boolean;
  onToggleCollapsed: () => void;
  onOpacityChange: (opacity: number) => void;
  onSpeedScale: (scale: number) => void;
  onInjectFault: (kind: FaultKind) => void;
  onClearFault: () => void;
  onSwitchToAuthor: () => void;
  onCloseSelection: () => void;
}

function Sparkline({
  values,
  color,
  min,
  max,
}: {
  values: number[];
  color: string;
  min: number;
  max: number;
}) {
  const w = 108;
  const h = 26;
  const pts = values.length >= 2 ? values : [values[0] ?? 0, values[0] ?? 0];
  const span = Math.max(1e-3, max - min);
  const d = pts
    .map((v, i) => {
      const x = (i / Math.max(1, pts.length - 1)) * w;
      const y = h - ((Math.max(min, Math.min(max, v)) - min) / span) * (h - 4) - 2;
      return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");

  return (
    <svg width={w} height={h} className="twin-sparkline" viewBox={`0 0 ${w} ${h}`}>
      <path d={d} fill="none" stroke={color} strokeWidth="1.6" strokeLinejoin="round" />
    </svg>
  );
}

export default function TwinInspectorPanel({
  object,
  telemetry,
  collapsed,
  onToggleCollapsed,
  onOpacityChange,
  onSpeedScale,
  onInjectFault,
  onClearFault,
  onSwitchToAuthor,
  onCloseSelection,
}: Props) {
  if (collapsed) {
    return (
      <div className="work-inspector evol-glass-card">
        <div className="work-inspector-head">
          <button type="button" className="work-tree-chev" onClick={onToggleCollapsed} title="Expand inspector">
            <ChevronRight size={14} />
          </button>
          <span className="work-inspector-title">{object.label}</span>
          <button type="button" className="work-row-btn" onClick={onCloseSelection} title="Deselect">
            <X size={13} />
          </button>
        </div>
      </div>
    );
  }

  const asset = getEntityAsset(object);
  const renderer = object.components.renderer;
  const { position, rotation, scale } = object.transform;

  // Non-robot entities (obstacles, groups, lights) expose Transform only — no speed/temp/faults
  if (object.kind !== "robot") {
    return (
      <div className="work-inspector twin-inspector evol-glass-card">
        <div className="work-inspector-head">
          <button type="button" className="work-tree-chev" onClick={onToggleCollapsed} title="Collapse inspector">
            <ChevronRight size={14} style={{ transform: "rotate(90deg)" }} />
          </button>
          <span className="work-inspector-title">{object.label}</span>
          <span className={`work-kind-pill kind-${object.kind}`}>{object.kind}</span>
          <button type="button" className="work-row-btn" onClick={onCloseSelection} title="Deselect">
            <X size={13} />
          </button>
        </div>

        <div className="work-inspector-sub" style={{ marginTop: 4 }}>
          Transform{asset ? ` · ${asset}` : ""}
        </div>

        <div className="twin-kv-row" style={{ marginTop: 6 }}>
          <span>Position</span>
          <b>{position[0].toFixed(2)}, {position[1].toFixed(2)}, {position[2].toFixed(2)} m</b>
          <span>Rotation</span>
          <b>{rotation[0].toFixed(0)}°, {rotation[1].toFixed(0)}°, {rotation[2].toFixed(0)}°</b>
          <span>Scale</span>
          <b>{scale.toFixed(2)}×</b>
          {renderer && (
            <>
              <span>Static</span>
              <b>{renderer.static ? "Yes (instanced)" : "No"}</b>
            </>
          )}
        </div>

        {renderer && (
          <div className="twin-ctrl-block">
            <div className="work-joint-label">
              <span>Opacity</span>
              <em>{Math.round((renderer.opacity ?? 1) * 100)}%</em>
            </div>
            <Slider
              min={10}
              max={100}
              step={5}
              value={Math.round((renderer.opacity ?? 1) * 100)}
              onChange={(v) => onOpacityChange(v / 100)}
            />
          </div>
        )}

        <div className="twin-footer-actions">
          <Button block size="small" icon={<Wrench size={12} />} onClick={onSwitchToAuthor}>
            Edit in Author
          </Button>
        </div>
      </div>
    );
  }

  const status = telemetry?.status ?? "nominal";
  const speed = telemetry?.speedMps ?? 0;
  const temp = telemetry?.temperatureC ?? 32;
  const util = telemetry?.utilizationPct ?? 0;
  const battery = telemetry?.batteryPct ?? 100;
  const power = telemetry?.powerKw ?? 0;
  const cycles = telemetry?.cyclesCompleted ?? 0;
  const history = telemetry?.history ?? [];
  const isFaulted = status === "fault";

  return (
    <div className="work-inspector twin-inspector evol-glass-card">
      <div className="work-inspector-head">
        <button type="button" className="work-tree-chev" onClick={onToggleCollapsed} title="Collapse inspector">
          <ChevronRight size={14} style={{ transform: "rotate(90deg)" }} />
        </button>
        <span className="work-inspector-title">{object.label}</span>
        <span className={`twin-health-chip status-${status}`}>{status.toUpperCase()}</span>
        <button type="button" className="work-row-btn" onClick={onCloseSelection} title="Deselect">
          <X size={13} />
        </button>
      </div>

      <div className="twin-insp-task">{telemetry?.currentTask ?? "Telemetry synchronized"}</div>

      <div className="twin-metric-grid">
        <div className="twin-metric-card">
          <div className="twin-metric-head">
            <span>Speed</span>
            <b>{speed.toFixed(2)} m/s</b>
          </div>
          <Sparkline values={history.map((h) => h.speed)} color="#22d3ee" min={0} max={2.8} />
        </div>
        <div className="twin-metric-card">
          <div className="twin-metric-head">
            <span>
              <Thermometer size={11} /> Temp
            </span>
            <b>{temp.toFixed(1)}°C</b>
          </div>
          <Sparkline values={history.map((h) => h.temp)} color={temp > 70 ? "#ef4444" : "#f5c46b"} min={20} max={95} />
        </div>
      </div>

      <div className="twin-bars">
        <div className="twin-bar-row">
          <span>Utilization</span>
          <div className="twin-bar-track">
            <div className="twin-bar-fill is-cyan" style={{ width: `${Math.round(util)}%` }} />
          </div>
          <b>{Math.round(util)}%</b>
        </div>
        {(asset === "robot" || asset === "drone") && (
          <div className="twin-bar-row">
            <span>
              <BatteryCharging size={11} /> Battery
            </span>
            <div className="twin-bar-track">
              <div
                className={`twin-bar-fill${battery < 20 ? " is-red" : " is-violet"}`}
                style={{ width: `${Math.round(battery)}%` }}
              />
            </div>
            <b>{Math.round(battery)}%</b>
          </div>
        )}
      </div>

      <div className="twin-kv-row">
        <span>Position</span>
        <b>{position[0].toFixed(1)}, {position[1].toFixed(1)}, {position[2].toFixed(1)}</b>
        <span>Power Draw</span>
        <b>{power.toFixed(2)} kW</b>
        <span>Cycles</span>
        <b>{cycles}</b>
        <span>Asset</span>
        <b>{asset ?? "robot"}</b>
      </div>

      <div className="twin-ctrl-block">
        <div className="work-field-label" style={{ marginBottom: 4 }}>
          <SlidersHorizontal size={11} style={{ verticalAlign: -1, marginRight: 4 }} />
          Speed Throttle
        </div>
        <Segmented
          size="small"
          block
          value={telemetry?.speedScale ?? 1}
          onChange={(v) => onSpeedScale(Number(v))}
          options={[
            { value: 0.5, label: "0.5×" },
            { value: 1, label: "1.0×" },
            { value: 1.5, label: "1.5×" },
            { value: 2, label: "2.0×" },
          ]}
        />
      </div>

      {renderer && (
        <div className="twin-ctrl-block">
          <div className="work-joint-label">
            <span>Opacity</span>
            <em>{Math.round((renderer.opacity ?? 1) * 100)}%</em>
          </div>
          <Slider
            min={10}
            max={100}
            step={5}
            value={Math.round((renderer.opacity ?? 1) * 100)}
            onChange={(v) => onOpacityChange(v / 100)}
          />
        </div>
      )}

      <div className="twin-ctrl-block">
        <div className="work-field-label" style={{ marginBottom: 4 }}>
          Diagnostics & Control
        </div>
        {isFaulted ? (
          <Button block size="small" type="primary" icon={<RotateCcw size={12} />} onClick={onClearFault}>
            Clear Fault & Resume
          </Button>
        ) : (
          <div className="twin-fault-btns">
            <Button size="small" icon={<Flame size={12} />} onClick={() => onInjectFault("overheat")}>
              Overheat
            </Button>
            <Button size="small" icon={<AlertOctagon size={12} />} onClick={() => onInjectFault("jam")}>
              Jam
            </Button>
            {(asset === "robot" || asset === "drone") && (
              <Button size="small" icon={<BatteryCharging size={12} />} onClick={() => onInjectFault("battery")}>
                Low Bat
              </Button>
            )}
          </div>
        )}
      </div>

      <div className="twin-footer-actions">
        <Button block size="small" icon={<Wrench size={12} />} onClick={onSwitchToAuthor}>
          Edit in Author
        </Button>
      </div>
    </div>
  );
}
