import React, { useEffect, useMemo, useRef, useState } from "react";
import { Button, Empty, Input, InputNumber, Segmented, Select, Slider, Switch, Tooltip } from "antd";
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Bot,
  Compass,
  Cpu,
  Crosshair,
  Keyboard,
  Radio,
  RefreshCw,
  Send,
  Square,
  Terminal,
  Wifi,
  WifiOff,
} from "lucide-react";
import type {
  RosConnectionMode,
  RosLogEntry,
  RosTopicInfo,
  StreamStatus,
  Vec3,
} from "../../lib/workTypes";

type ConnTabKind = RosConnectionMode | "json_ws";

interface Props {
  status: StreamStatus;
  mode: RosConnectionMode;
  url: string;
  streamStatus: StreamStatus;
  streamUrl: string;
  driveScene: boolean;
  showLidar: boolean;
  goalPickActive: boolean;
  teleopKeys: boolean;
  selectedRobot: string;
  nodes: string[];
  topics: RosTopicInfo[];
  logs: RosLogEntry[];
  onModeChange: (m: RosConnectionMode) => void;
  onUrlChange: (url: string) => void;
  onConnect: () => void;
  onDisconnect: () => void;
  onStreamUrlChange: (url: string) => void;
  onConnectStream: (url: string) => void;
  onDisconnectStream: () => void;
  onToggleDriveScene: (v: boolean) => void;
  onToggleShowLidar: (v: boolean) => void;
  onToggleGoalPick: () => void;
  onToggleTeleopKeys: (v: boolean) => void;
  onSelectRobot: (id: string) => void;
  onPublishTwist: (robotId: string, linear: Vec3, angularZ: number) => void;
  onSendGoal: (robotId: string, x: number, z: number) => void;
  onResumePatrol: (robotId?: string) => void;
  onArmPreset: (preset: "home" | "pick" | "place" | "auto") => void;
  onArmJointCmd: (joints: Record<string, number>) => void;
  onRefreshGraph: () => void;
}

const TELEOP_ROBOTS = [
  { value: "AMR-1", label: "AMR-1 (/amr_1)" },
  { value: "AMR-2", label: "AMR-2 (/amr_2)" },
  { value: "AMR-3", label: "AMR-3 (/amr_3)" },
  { value: "DR-1", label: "DR-1 (/dr_1)" },
  { value: "DR-2", label: "DR-2 (/dr_2)" },
  { value: "ROOT", label: "Root (/cmd_vel -> AMR-1)" },
];

export default function RosSidebarTab({
  status,
  mode,
  url,
  streamStatus,
  streamUrl,
  driveScene,
  showLidar,
  goalPickActive,
  teleopKeys,
  selectedRobot,
  nodes,
  topics,
  logs,
  onModeChange,
  onUrlChange,
  onConnect,
  onDisconnect,
  onStreamUrlChange,
  onConnectStream,
  onDisconnectStream,
  onToggleDriveScene,
  onToggleShowLidar,
  onToggleGoalPick,
  onToggleTeleopKeys,
  onSelectRobot,
  onPublishTwist,
  onSendGoal,
  onResumePatrol,
  onArmPreset,
  onArmJointCmd,
  onRefreshGraph,
}: Props) {
  const [connKind, setConnKind] = useState<ConnTabKind>(mode);
  const [linSpeed, setLinSpeed] = useState(1.2);
  const [angSpeed, setAngSpeed] = useState(1.6);
  const [goalX, setGoalX] = useState(2.5);
  const [goalZ, setGoalZ] = useState(1.25);
  const [echoTopic, setEchoTopic] = useState<string>("/amr_1/odom");
  const [topicFilter, setTopicFilter] = useState("");
  const [armYaw, setArmYaw] = useState(0);
  const [armShoulder, setArmShoulder] = useState(-0.35);
  const holdTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    setConnKind((cur) => (cur === "json_ws" ? cur : mode));
  }, [mode]);

  const rosConnected = status === "connected";
  const jsonConnected = streamStatus === "connected";
  const activeStatus = connKind === "json_ws" ? streamStatus : status;
  const isDrone = selectedRobot.startsWith("DR-");

  useEffect(() => {
    return () => {
      if (holdTimerRef.current) clearInterval(holdTimerRef.current);
    };
  }, []);

  const stopHold = (sendZero = false) => {
    if (holdTimerRef.current) {
      clearInterval(holdTimerRef.current);
      holdTimerRef.current = null;
    }
    if (sendZero && rosConnected) {
      onPublishTwist(selectedRobot, [0, 0, 0], 0);
    }
  };

  const startHold = (linear: Vec3, angularZ: number) => {
    if (!rosConnected) return;
    stopHold(false);
    onPublishTwist(selectedRobot, linear, angularZ);
    holdTimerRef.current = setInterval(() => {
      onPublishTwist(selectedRobot, linear, angularZ);
    }, 100);
  };

  const filteredTopics = useMemo(() => {
    const q = topicFilter.trim().toLowerCase();
    const sorted = [...topics].sort((a, b) => a.topic.localeCompare(b.topic));
    return q ? sorted.filter((t) => t.topic.toLowerCase().includes(q) || t.type.toLowerCase().includes(q)) : sorted;
  }, [topics, topicFilter]);

  const activeEcho = useMemo(() => topics.find((t) => t.topic === echoTopic), [topics, echoTopic]);

  const handleKindChange = (val: ConnTabKind) => {
    setConnKind(val);
    if (val === "builtin" || val === "external") {
      onModeChange(val);
    }
  };

  return (
    <div className="work-side-body ros-side-body">
      <div className="twin-section-head">
        <span className="work-field-label" style={{ margin: 0 }}>
          {connKind === "json_ws" ? "JSON WebSocket Stream" : "ROS 2 Bridge (rosbridge v2)"}
        </span>
        <span className={`twin-stream-state status-${activeStatus}`}>
          {activeStatus === "connected" ? <Wifi size={12} /> : <WifiOff size={12} />}
          {activeStatus}
        </span>
      </div>

      <Segmented
        size="small"
        block
        value={connKind}
        onChange={(v) => handleKindChange(v as ConnTabKind)}
        options={[
          { value: "builtin", label: "Virtual ROS", disabled: rosConnected && mode !== "builtin" },
          { value: "external", label: "External ROS", disabled: rosConnected && mode !== "external" },
          { value: "json_ws", label: "JSON WS" },
        ]}
        style={{ marginBottom: 8 }}
      />

      {connKind === "json_ws" ? (
        <>
          <div className="twin-stream-box">
            <Input
              size="small"
              value={streamUrl}
              onChange={(e) => onStreamUrlChange(e.target.value)}
              placeholder="ws://localhost:8765/twin or wss://xxxx.ngrok-free.app"
              disabled={jsonConnected || streamStatus === "connecting"}
            />
            {jsonConnected || streamStatus === "connecting" ? (
              <Button size="small" danger onClick={onDisconnectStream}>
                Disconnect
              </Button>
            ) : (
              <Button size="small" type="primary" className="btn-glow" onClick={() => onConnectStream(streamUrl)}>
                Connect
              </Button>
            )}
          </div>
          <div className="ros-hint-card">
            Streams generic JSON telemetry frames: <code>{'{ "id": "AMR-1", "speedMps": 1.2, "batteryPct": 82, "position": [x,y,z] }'}</code>.
          </div>
        </>
      ) : (
        <>
          <div className="twin-stream-box">
            <Input
              size="small"
              value={url}
              onChange={(e) => onUrlChange(e.target.value)}
              disabled={mode === "builtin" || rosConnected || status === "connecting"}
              placeholder="wss://xxxx.ngrok-free.app or ws://localhost:9090"
            />
            {rosConnected || status === "connecting" ? (
              <Button size="small" danger onClick={onDisconnect}>
                Disconnect
              </Button>
            ) : (
              <Button size="small" type="primary" className="btn-glow" onClick={onConnect}>
                {mode === "builtin" ? "Start & Wire" : "Connect"}
              </Button>
            )}
          </div>

          {mode === "builtin" && !rosConnected && (
            <div className="ros-hint-card">
              Runs a virtual ROS 2 stack on the server (<code>/tf</code>, <code>/odom</code>, <code>/scan</code>,{" "}
              <code>/joint_states</code>, <code>/cmd_vel</code>) — no real robot required.
            </div>
          )}

          {mode === "external" && !rosConnected && (
            <div className="ros-hint-card">
              Exposing local ROS with ngrok? Run <code>ngrok http 9090</code> and paste{" "}
              <code>wss://your-id.ngrok-free.app</code> (or <code>https://...</code>).
            </div>
          )}

          <div className="ros-switch-list">
            <div className="work-pref-row" title="Apply /tf, /odom, and /joint_states directly to 3D models">
              <span>Drive 3D Scene from ROS</span>
              <Switch size="small" checked={driveScene} onChange={onToggleDriveScene} />
            </div>
            <div className="work-pref-row" title="Render live /amr_1/scan LaserScan point cloud in 3D">
              <span>3D LiDAR (/amr_1/scan)</span>
              <Switch size="small" checked={showLidar} onChange={onToggleShowLidar} />
            </div>
          </div>

          {rosConnected && (
            <div style={{ marginTop: 8 }}>
              <Button size="small" block icon={<Bot size={12} />} onClick={() => onResumePatrol()}>
                Resume Auto Patrol
              </Button>
            </div>
          )}

          <div className="twin-section-head" style={{ marginTop: 12 }}>
            <span className="work-field-label" style={{ margin: 0 }}>
              Teleop (/cmd_vel) & Nav2 Goal
            </span>
            <Tooltip title="Drive selected robot with W/A/S/D keys (Q/E turn, R/F drone alt)">
              <button
                type="button"
                className={`ros-mini-toggle${teleopKeys ? " active" : ""}`}
                disabled={!rosConnected}
                onClick={() => onToggleTeleopKeys(!teleopKeys)}
              >
                <Keyboard size={11} /> WASD
              </button>
            </Tooltip>
          </div>

          <Select
            size="small"
            style={{ width: "100%", marginBottom: 8 }}
            value={selectedRobot}
            onChange={onSelectRobot}
            options={TELEOP_ROBOTS}
          />

          <div className="ros-speed-sliders">
            <div className="ros-slider-col">
              <div className="work-joint-label">
                <span>Linear</span>
                <em>{linSpeed.toFixed(1)} m/s</em>
              </div>
              <Slider min={0.2} max={2.5} step={0.1} value={linSpeed} onChange={setLinSpeed} />
            </div>
            <div className="ros-slider-col">
              <div className="work-joint-label">
                <span>Angular</span>
                <em>{angSpeed.toFixed(1)} r/s</em>
              </div>
              <Slider min={0.3} max={3.0} step={0.1} value={angSpeed} onChange={setAngSpeed} />
            </div>
          </div>

          <div className="ros-dpad">
            <div />
            <button
              type="button"
              className="ros-pad-btn"
              disabled={!rosConnected}
              title="Forward (+X)"
              onMouseDown={() => startHold([linSpeed, 0, 0], 0)}
              onMouseUp={() => stopHold(true)}
              onMouseLeave={() => stopHold(false)}
              onTouchStart={() => startHold([linSpeed, 0, 0], 0)}
              onTouchEnd={() => stopHold(true)}
            >
              <ArrowUp size={14} />
            </button>
            {isDrone ? (
              <button
                type="button"
                className="ros-pad-btn is-alt"
                disabled={!rosConnected}
                title="Climb (+Z)"
                onMouseDown={() => startHold([0, 0, 1.0], 0)}
                onMouseUp={() => stopHold(true)}
                onMouseLeave={() => stopHold(false)}
              >
                +Z
              </button>
            ) : (
              <div />
            )}

            <button
              type="button"
              className="ros-pad-btn"
              disabled={!rosConnected}
              title="Turn Left (+Yaw)"
              onMouseDown={() => startHold([0, 0, 0], angSpeed)}
              onMouseUp={() => stopHold(true)}
              onMouseLeave={() => stopHold(false)}
              onTouchStart={() => startHold([0, 0, 0], angSpeed)}
              onTouchEnd={() => stopHold(true)}
            >
              <ArrowLeft size={14} />
            </button>
            <button
              type="button"
              className="ros-pad-btn is-stop"
              disabled={!rosConnected}
              title="Zero Twist (Stop)"
              onClick={() => stopHold(true)}
            >
              <Square size={12} />
            </button>
            <button
              type="button"
              className="ros-pad-btn"
              disabled={!rosConnected}
              title="Turn Right (-Yaw)"
              onMouseDown={() => startHold([0, 0, 0], -angSpeed)}
              onMouseUp={() => stopHold(true)}
              onMouseLeave={() => stopHold(false)}
              onTouchStart={() => startHold([0, 0, 0], -angSpeed)}
              onTouchEnd={() => stopHold(true)}
            >
              <ArrowRight size={14} />
            </button>

            <div />
            <button
              type="button"
              className="ros-pad-btn"
              disabled={!rosConnected}
              title="Reverse (-X)"
              onMouseDown={() => startHold([-linSpeed, 0, 0], 0)}
              onMouseUp={() => stopHold(true)}
              onMouseLeave={() => stopHold(false)}
              onTouchStart={() => startHold([-linSpeed, 0, 0], 0)}
              onTouchEnd={() => stopHold(true)}
            >
              <ArrowDown size={14} />
            </button>
            {isDrone ? (
              <button
                type="button"
                className="ros-pad-btn is-alt"
                disabled={!rosConnected}
                title="Descend (-Z)"
                onMouseDown={() => startHold([0, 0, -1.0], 0)}
                onMouseUp={() => stopHold(true)}
                onMouseLeave={() => stopHold(false)}
              >
                -Z
              </button>
            ) : (
              <div />
            )}
          </div>

          <div className="ros-goal-box">
            <Button
              size="small"
              block
              type={goalPickActive ? "primary" : "default"}
              className={goalPickActive ? "btn-glow" : ""}
              disabled={!rosConnected}
              icon={<Crosshair size={12} />}
              onClick={onToggleGoalPick}
            >
              {goalPickActive ? "Click Floor to Send NavGoal…" : `Click Floor -> ${selectedRobot} NavGoal`}
            </Button>
            <div className="ros-goal-inputs">
              <InputNumber
                size="small"
                step={0.5}
                value={goalX}
                onChange={(v) => setGoalX(v ?? 0)}
                prefix={<span className="ros-coord-tag">X</span>}
              />
              <InputNumber
                size="small"
                step={0.5}
                value={goalZ}
                onChange={(v) => setGoalZ(v ?? 0)}
                prefix={<span className="ros-coord-tag">Z</span>}
              />
              <Button
                size="small"
                disabled={!rosConnected}
                icon={<Send size={12} />}
                onClick={() => onSendGoal(selectedRobot, goalX, goalZ)}
                title="Publish PoseStamped to /goal_pose"
              />
            </div>
          </div>

          <div className="twin-section-head" style={{ marginTop: 12 }}>
            <span className="work-field-label" style={{ margin: 0 }}>
              ARM-1 (/arm_1/joint_cmd)
            </span>
          </div>
          <div className="ros-arm-presets">
            <Button size="small" disabled={!rosConnected} onClick={() => onArmPreset("auto")}>
              Auto
            </Button>
            <Button size="small" disabled={!rosConnected} onClick={() => onArmPreset("home")}>
              Home
            </Button>
            <Button size="small" disabled={!rosConnected} onClick={() => onArmPreset("pick")}>
              Pick
            </Button>
            <Button size="small" disabled={!rosConnected} onClick={() => onArmPreset("place")}>
              Place
            </Button>
          </div>
          <div className="ros-speed-sliders" style={{ marginTop: 4 }}>
            <div className="ros-slider-col">
              <div className="work-joint-label">
                <span>base_yaw</span>
                <em>{armYaw.toFixed(2)}</em>
              </div>
              <Slider
                min={-3.14}
                max={3.14}
                step={0.05}
                disabled={!rosConnected}
                value={armYaw}
                onChange={(v) => {
                  setArmYaw(v);
                  onArmJointCmd({ base_yaw: v, shoulder_pitch: armShoulder });
                }}
              />
            </div>
            <div className="ros-slider-col">
              <div className="work-joint-label">
                <span>shoulder</span>
                <em>{armShoulder.toFixed(2)}</em>
              </div>
              <Slider
                min={-1.2}
                max={0.8}
                step={0.05}
                disabled={!rosConnected}
                value={armShoulder}
                onChange={(v) => {
                  setArmShoulder(v);
                  onArmJointCmd({ base_yaw: armYaw, shoulder_pitch: v });
                }}
              />
            </div>
          </div>

          <div className="twin-section-head" style={{ marginTop: 12 }}>
            <span className="work-field-label" style={{ margin: 0 }}>
              <Cpu size={11} style={{ verticalAlign: -1, marginRight: 4 }} />
              ROS Graph ({nodes.length} nodes · {topics.length} topics)
            </span>
            {rosConnected && (
              <button type="button" className="twin-link-btn" onClick={onRefreshGraph} title="Refresh rosapi graph">
                <RefreshCw size={11} />
              </button>
            )}
          </div>

          {nodes.length > 0 && (
            <div className="ros-node-chips">
              {nodes.map((n) => (
                <span key={n} className="ros-node-chip">
                  {n}
                </span>
              ))}
            </div>
          )}

          <Input
            size="small"
            allowClear
            value={topicFilter}
            onChange={(e) => setTopicFilter(e.target.value)}
            placeholder="Filter topics (/odom, /scan, /tf)..."
            style={{ marginBottom: 6 }}
          />

          <div className="ros-topic-list">
            {filteredTopics.length === 0 ? (
              <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={rosConnected ? "No matching topics" : "Connect to inspect topics"} />
            ) : (
              filteredTopics.map((t) => (
                <button
                  key={t.topic}
                  type="button"
                  className={`ros-topic-row${echoTopic === t.topic ? " active" : ""}`}
                  onClick={() => setEchoTopic(t.topic)}
                >
                  <div className="ros-topic-top">
                    <span className="ros-topic-name">{t.topic}</span>
                    <span className="ros-topic-hz">{t.hz > 0 ? `${t.hz} Hz` : `${t.msgCount}`}</span>
                  </div>
                  <div className="ros-topic-type">{t.type}</div>
                </button>
              ))
            )}
          </div>

          {activeEcho && activeEcho.lastMsg !== undefined && (
            <div className="ros-echo-box">
              <div className="ros-echo-head">
                <span>
                  <Compass size={11} /> echo {activeEcho.topic}
                </span>
                <span>{activeEcho.hz} Hz</span>
              </div>
              <pre className="ros-echo-pre">{JSON.stringify(activeEcho.lastMsg, null, 2).slice(0, 520)}</pre>
            </div>
          )}

          <div className="twin-section-head" style={{ marginTop: 12 }}>
            <span className="work-field-label" style={{ margin: 0 }}>
              <Terminal size={11} style={{ verticalAlign: -1, marginRight: 4 }} />
              /rosout
            </span>
          </div>
          <div className="ros-log-box">
            {logs.length === 0 ? (
              <div className="work-hint">
                <Radio size={11} style={{ verticalAlign: -1, marginRight: 4 }} />
                Waiting for ROS logs…
              </div>
            ) : (
              logs.slice(0, 12).map((l, idx) => (
                <div key={idx} className={`ros-log-line level-${l.level >= 40 ? "err" : l.level >= 30 ? "warn" : "info"}`}>
                  <span className="ros-log-t">[{l.stamp}]</span> <b>{l.name}:</b> {l.msg}
                </div>
              ))
            )}
          </div>
        </>
      )}
    </div>
  );
}
