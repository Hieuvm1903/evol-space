import React, { useMemo, useState } from "react";
import { Button, Empty, Input, Segmented, Tooltip } from "antd";
import {
  AlertTriangle,
  ArrowLeftRight,
  BatteryCharging,
  Bot,
  Box,
  Check,
  Container,
  Cpu,
  Monitor,
  Plane,
  Radio,
  ShieldAlert,
  Truck,
  User,
  Wifi,
  WifiOff,
} from "lucide-react";
import type {
  AssetTelemetry,
  HealthStatus,
  StreamStatus,
  TwinAlert,
  TwinScenario,
} from "../../lib/workTypes";

interface Props {
  fleet: AssetTelemetry[];
  selectedId: string | null;
  scenario: TwinScenario;
  alerts: TwinAlert[];
  streamStatus: StreamStatus;
  onSelectAsset: (id: string) => void;
  onScenario: (s: TwinScenario) => void;
  onAcknowledgeAlert: (alertId: string) => void;
  onClearAlerts: () => void;
  onConnectStream: (url: string) => void;
  onDisconnectStream: () => void;
}

const ASSET_ICONS: Record<string, React.ReactNode> = {
  robot: <Bot size={14} />,
  drone: <Plane size={14} />,
  robot_arm: <Cpu size={14} />,
  robot_transfer: <ArrowLeftRight size={14} />,
  conveyor: <Container size={14} />,
  station: <Monitor size={14} />,
  charger: <BatteryCharging size={14} />,
  humanoid: <User size={14} />,
  truck: <Truck size={14} />,
};

const MOBILE_ASSETS = new Set(["robot", "drone", "humanoid", "truck"]);

const SCENARIOS: { id: TwinScenario; label: string; hint: string }[] = [
  { id: "nominal", label: "Nominal", hint: "Clear faults and normalize speeds" },
  { id: "peak_rush", label: "Peak Rush", hint: "Boost robot & belt dispatch speed (1.5×)" },
  { id: "conveyor_jam", label: "Belt Jam", hint: "Simulate a mechanical stall on conveyor CV-1" },
  { id: "low_battery", label: "Low Battery", hint: "Trigger reserve battery warnings across AMRs" },
];

export default function TwinSidebarTab({
  fleet,
  selectedId,
  scenario,
  alerts,
  streamStatus,
  onSelectAsset,
  onScenario,
  onAcknowledgeAlert,
  onClearAlerts,
  onConnectStream,
  onDisconnectStream,
}: Props) {
  const [filter, setFilter] = useState<"all" | HealthStatus>("all");
  const [wsUrl, setWsUrl] = useState("ws://localhost:8765/twin");

  const filtered = useMemo(() => {
    if (filter === "all") return fleet;
    return fleet.filter((f) => f.status === filter);
  }, [fleet, filter]);

  const unackCount = alerts.filter((a) => !a.acknowledged).length;

  return (
    <div className="work-side-body twin-side-body">
      <div className="work-field-label">Simulation Scenarios</div>
      <div className="twin-scenario-grid">
        {SCENARIOS.map((s) => (
          <Tooltip key={s.id} title={s.hint}>
            <button
              type="button"
              className={`twin-scenario-btn${scenario === s.id ? " active" : ""}`}
              onClick={() => onScenario(s.id)}
            >
              {s.label}
            </button>
          </Tooltip>
        ))}
      </div>

      <div className="twin-section-head">
        <span className="work-field-label" style={{ margin: 0 }}>
          Fleet & Equipment ({fleet.length})
        </span>
      </div>
      <Segmented
        size="small"
        block
        value={filter}
        onChange={(v) => setFilter(v as "all" | HealthStatus)}
        options={[
          { value: "all", label: "All" },
          { value: "nominal", label: "OK" },
          { value: "warning", label: "Warn" },
          { value: "fault", label: "Fault" },
        ]}
        style={{ marginBottom: 8 }}
      />

      <div className="twin-fleet-list">
        {filtered.length === 0 && (
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No matching assets" />
        )}
        {filtered.map((item) => (
          <button
            key={item.id}
            type="button"
            className={`twin-fleet-row${selectedId === item.id ? " active" : ""}`}
            onClick={() => onSelectAsset(item.id)}
          >
            <span className={`twin-status-bar status-${item.status}`} />
            <span className="twin-fleet-icon">{ASSET_ICONS[item.asset ?? ""] ?? <Box size={14} />}</span>
            <div className="twin-fleet-main">
              <div className="twin-fleet-top">
                <span className="twin-fleet-name">{item.label}</span>
                <span className="twin-fleet-stat">
                  {item.status === "fault"
                    ? "FAULT"
                    : MOBILE_ASSETS.has(item.asset ?? "")
                      ? `${item.speedMps.toFixed(1)} m/s`
                      : `${Math.round(item.utilizationPct)}%`}
                </span>
              </div>
              <div className="twin-fleet-sub">{item.currentTask}</div>
            </div>
          </button>
        ))}
      </div>

      <div className="twin-section-head" style={{ marginTop: 14 }}>
        <span className="work-field-label" style={{ margin: 0 }}>
          Alert Feed {unackCount > 0 ? `(${unackCount})` : ""}
        </span>
        {alerts.some((a) => a.acknowledged) && (
          <button type="button" className="twin-link-btn" onClick={onClearAlerts}>
            Clear acked
          </button>
        )}
      </div>

      <div className="twin-alert-list">
        {alerts.length === 0 && <div className="work-hint">All subsystems nominal.</div>}
        {alerts.slice(0, 8).map((a) => (
          <div
            key={a.id}
            className={`twin-alert-row severity-${a.severity}${a.acknowledged ? " is-acked" : ""}`}
            onClick={() => {
              if (a.objectId !== "facility") onSelectAsset(a.objectId);
            }}
          >
            <span className="twin-alert-ico">
              {a.severity === "fault" ? (
                <ShieldAlert size={13} />
              ) : a.severity === "warning" ? (
                <AlertTriangle size={13} />
              ) : (
                <Radio size={13} />
              )}
            </span>
            <div className="twin-alert-copy">
              <div className="twin-alert-title">
                <span>{a.label}: {a.title}</span>
                <span className="twin-alert-time">{a.timeSec.toFixed(0)}s</span>
              </div>
              <div className="twin-alert-detail">{a.detail}</div>
            </div>
            {!a.acknowledged && (
              <button
                type="button"
                className="work-row-btn"
                title="Acknowledge alert"
                onClick={(e) => {
                  e.stopPropagation();
                  onAcknowledgeAlert(a.id);
                }}
              >
                <Check size={12} />
              </button>
            )}
          </div>
        ))}
      </div>

      <div className="twin-section-head" style={{ marginTop: 14 }}>
        <span className="work-field-label" style={{ margin: 0 }}>
          Live WebSocket Telemetry
        </span>
        <Tooltip title='Accepts JSON: { "id": "AMR-1", "speedMps": 1.2, "batteryPct": 82, "temperatureC": 43, "position": [x,y,z] }'>
          <span className={`twin-stream-state status-${streamStatus}`}>
            {streamStatus === "connected" ? <Wifi size={12} /> : <WifiOff size={12} />}
            {streamStatus}
          </span>
        </Tooltip>
      </div>
      <div className="twin-stream-box">
        <Input
          size="small"
          value={wsUrl}
          onChange={(e) => setWsUrl(e.target.value)}
          placeholder="ws://localhost:8765/twin"
          disabled={streamStatus === "connected" || streamStatus === "connecting"}
        />
        {streamStatus === "connected" || streamStatus === "connecting" ? (
          <Button size="small" danger onClick={onDisconnectStream}>
            Disconnect
          </Button>
        ) : (
          <Button size="small" onClick={() => onConnectStream(wsUrl)}>
            Connect
          </Button>
        )}
      </div>
    </div>
  );
}
