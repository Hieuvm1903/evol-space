import React from "react";
import { Button, Slider, Tooltip } from "antd";
import {
  Activity,
  AlertTriangle,
  Camera,
  Crosshair,
  Eye,
  History,
  Layers,
  MapPin,
  Play,
  Route,
  Tag as TagIcon,
  Zap,
} from "lucide-react";
import type {
  CameraMode,
  CameraPreset,
  FacilityKpis,
  ReplayFrame,
  StreamStatus,
  TwinOverlayPrefs,
} from "../../lib/workTypes";

interface KpiStripProps {
  kpis: FacilityKpis;
  playing: boolean;
  paused: boolean;
  replayIndex: number | null;
  replayTimeSec: number | null;
  streamStatus: StreamStatus;
  onAlertClick?: () => void;
}

export function TwinKpiStrip({
  kpis,
  playing,
  paused,
  replayIndex,
  replayTimeSec,
  streamStatus,
  onAlertClick,
}: KpiStripProps) {
  const stateLabel =
    replayIndex !== null
      ? `Replay ${replayTimeSec?.toFixed(1) ?? "0.0"}s`
      : streamStatus === "connected"
        ? "Live Stream"
        : playing && !paused
          ? "Live Sim"
          : paused
            ? "Paused"
            : "Standby";

  return (
    <div className="twin-kpi-strip evol-glass-card">
      <div className="twin-kpi-item">
        <span className="twin-kpi-label">State</span>
        <span className={`twin-kpi-val${replayIndex !== null ? " is-amber" : playing && !paused ? " is-cyan" : ""}`}>
          <Activity size={13} />
          {stateLabel}
        </span>
      </div>
      <span className="twin-kpi-div" />
      <div className="twin-kpi-item">
        <span className="twin-kpi-label">Throughput</span>
        <span className="twin-kpi-val">{kpis.throughputPerHr} /hr</span>
      </div>
      <div className="twin-kpi-item">
        <span className="twin-kpi-label">Fleet Active</span>
        <span className="twin-kpi-val">
          {kpis.activeRobots}/{kpis.totalRobots}
        </span>
      </div>
      <div className="twin-kpi-item">
        <span className="twin-kpi-label">Avg Load</span>
        <span className="twin-kpi-val">{kpis.avgUtilizationPct}%</span>
      </div>
      <div className="twin-kpi-item">
        <span className="twin-kpi-label">Power Draw</span>
        <span className="twin-kpi-val">
          <Zap size={12} />
          {kpis.totalPowerKw.toFixed(2)} kW
        </span>
      </div>
      <button
        type="button"
        className={`twin-kpi-item twin-kpi-alert-btn${kpis.activeAlerts > 0 ? " has-alerts" : ""}`}
        onClick={onAlertClick}
        title="View active facility alerts"
      >
        <span className="twin-kpi-label">Alerts</span>
        <span className="twin-kpi-val">
          <AlertTriangle size={12} />
          {kpis.activeAlerts}
        </span>
      </button>
    </div>
  );
}

interface ControlsBarProps {
  cameraMode: CameraMode;
  onCameraMode: (mode: CameraMode) => void;
  cameraPreset: CameraPreset;
  onCameraPreset: (preset: CameraPreset) => void;
  overlays: TwinOverlayPrefs;
  onOverlays: (patch: Partial<TwinOverlayPrefs>) => void;
  xRayOccluding: boolean;
  onToggleXRay: () => void;
  hasSelection: boolean;
  replayFrames: ReplayFrame[];
  replayIndex: number | null;
  onReplaySeek: (idx: number | null) => void;
}

const PRESETS: { id: CameraPreset; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "isometric", label: "Iso" },
  { id: "top", label: "Top" },
  { id: "conveyor", label: "Conveyor" },
  { id: "dock", label: "Dock" },
];

export function TwinControlsBar({
  cameraMode,
  onCameraMode,
  cameraPreset,
  onCameraPreset,
  overlays,
  onOverlays,
  xRayOccluding,
  onToggleXRay,
  hasSelection,
  replayFrames,
  replayIndex,
  onReplaySeek,
}: ControlsBarProps) {
  const maxIdx = Math.max(0, replayFrames.length - 1);
  const currentIdx = replayIndex === null ? maxIdx : Math.min(replayIndex, maxIdx);
  const currentTime = replayFrames[currentIdx]?.timeSec ?? 0;

  return (
    <div className="twin-bottom-dock evol-glass-card">
      <div className="twin-dock-row">
        <div className="twin-dock-group">
          <span className="twin-dock-tag">
            <Camera size={12} />
          </span>
          {PRESETS.map((p) => (
            <button
              key={p.id}
              type="button"
              className={`twin-dock-btn${cameraPreset === p.id ? " active" : ""}`}
              onClick={() => onCameraPreset(p.id)}
            >
              {p.label}
            </button>
          ))}
          <Tooltip title={hasSelection ? "Track selected asset smoothly" : "Select an asset to follow"}>
            <button
              type="button"
              disabled={!hasSelection}
              className={`twin-dock-btn${overlays.followSelected ? " active" : ""}`}
              onClick={() => onOverlays({ followSelected: !overlays.followSelected })}
            >
              <Crosshair size={12} /> Follow
            </button>
          </Tooltip>
          <span className="work-toolbar-sep" />
          <Tooltip title="Perspective projection — natural depth perception (V)">
            <button
              type="button"
              className={`twin-dock-btn${cameraMode === "perspective" ? " active" : ""}`}
              onClick={() => onCameraMode("perspective")}
            >
              Perspective
            </button>
          </Tooltip>
          <Tooltip title="Orthogonal projection — parallel CAD view (V)">
            <button
              type="button"
              className={`twin-dock-btn${cameraMode === "orthographic" ? " active" : ""}`}
              onClick={() => onCameraMode("orthographic")}
            >
              Orthogonal
            </button>
          </Tooltip>
        </div>

        <span className="work-toolbar-sep" />

        <div className="twin-dock-group">
          <button
            type="button"
            className={`twin-dock-btn${overlays.statusHalos ? " active" : ""}`}
            onClick={() => onOverlays({ statusHalos: !overlays.statusHalos })}
            title="Toggle asset health status halos"
          >
            <MapPin size={12} /> Halos
          </button>
          <button
            type="button"
            className={`twin-dock-btn${overlays.pathTrails ? " active" : ""}`}
            onClick={() => onOverlays({ pathTrails: !overlays.pathTrails })}
            title="Toggle robot path trails & goal targets"
          >
            <Route size={12} /> Trails
          </button>
          <button
            type="button"
            className={`twin-dock-btn${overlays.zoneHeatmap ? " active" : ""}`}
            onClick={() => onOverlays({ zoneHeatmap: !overlays.zoneHeatmap })}
            title="Toggle spatial floor utilization zones"
          >
            <Layers size={12} /> Zones
          </button>
          <button
            type="button"
            className={`twin-dock-btn${overlays.floatingLabels ? " active" : ""}`}
            onClick={() => onOverlays({ floatingLabels: !overlays.floatingLabels })}
            title="Toggle floating 3D asset telemetry badges"
          >
            <TagIcon size={12} /> Labels
          </button>
          <button
            type="button"
            className={`twin-dock-btn${xRayOccluding ? " active" : ""}`}
            onClick={onToggleXRay}
            title="Auto-fade objects blocking camera line of sight"
          >
            <Eye size={12} /> X-Ray
          </button>
        </div>
      </div>

      {replayFrames.length > 1 && (
        <div className="twin-replay-row">
          <span className="twin-replay-label">
            <History size={12} />
            Replay
          </span>
          <Slider
            className="twin-replay-slider"
            min={0}
            max={maxIdx}
            value={currentIdx}
            tooltip={{ formatter: (v) => `${replayFrames[v ?? 0]?.timeSec.toFixed(1) ?? "0.0"}s` }}
            onChange={(val) => onReplaySeek(val)}
          />
          <span className="twin-replay-time">{currentTime.toFixed(1)}s</span>
          {replayIndex !== null && (
            <Button size="small" type="primary" icon={<Play size={11} />} onClick={() => onReplaySeek(null)}>
              Live
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
