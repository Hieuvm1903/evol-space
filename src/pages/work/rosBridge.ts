import type {
  RosDiagnostic,
  RosJointState,
  RosLaserScan,
  RosLogEntry,
  RosPoseState,
  RosTopicInfo,
  StreamStatus,
  Vec3,
} from "../../lib/workTypes";

interface PendingCall {
  resolve: (values: Record<string, unknown>) => void;
  reject: (err: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

const DEFAULT_SUB_TOPICS: { topic: string; type: string; throttle?: number }[] = [
  { topic: "/tf", type: "tf2_msgs/msg/TFMessage", throttle: 40 },
  { topic: "/odom", type: "nav_msgs/msg/Odometry", throttle: 40 },
  { topic: "/scan", type: "sensor_msgs/msg/LaserScan", throttle: 90 },
  { topic: "/joint_states", type: "sensor_msgs/msg/JointState", throttle: 40 },
  { topic: "/amr_1/odom", type: "nav_msgs/msg/Odometry", throttle: 40 },
  { topic: "/amr_2/odom", type: "nav_msgs/msg/Odometry", throttle: 40 },
  { topic: "/amr_3/odom", type: "nav_msgs/msg/Odometry", throttle: 40 },
  { topic: "/dr_1/odom", type: "nav_msgs/msg/Odometry", throttle: 40 },
  { topic: "/dr_2/odom", type: "nav_msgs/msg/Odometry", throttle: 40 },
  { topic: "/tr_1/odom", type: "nav_msgs/msg/Odometry", throttle: 80 },
  { topic: "/amr_1/scan", type: "sensor_msgs/msg/LaserScan", throttle: 90 },
  { topic: "/amr_1/battery_state", type: "sensor_msgs/msg/BatteryState", throttle: 400 },
  { topic: "/amr_2/battery_state", type: "sensor_msgs/msg/BatteryState", throttle: 400 },
  { topic: "/amr_3/battery_state", type: "sensor_msgs/msg/BatteryState", throttle: 400 },
  { topic: "/arm_1/joint_states", type: "sensor_msgs/msg/JointState", throttle: 40 },
  { topic: "/xfer_1/joint_states", type: "sensor_msgs/msg/JointState", throttle: 40 },
  { topic: "/fleet/diagnostics", type: "diagnostic_msgs/msg/DiagnosticArray", throttle: 350 },
  { topic: "/rosout", type: "rcl_interfaces/msg/Log" },
];

const NS_TO_ID: Record<string, string> = {
  "": "AMR-1",
  "/amr_1": "AMR-1",
  "/amr_2": "AMR-2",
  "/amr_3": "AMR-3",
  "/dr_1": "DR-1",
  "/dr_2": "DR-2",
  "/tr_1": "TR-1",
  "/arm_1": "ARM-1",
  "/xfer_1": "XFER-1",
};

export function robotIdToNs(id: string): string {
  if (!id || id === "ROOT" || id === "/") return "";
  return `/${id.toLowerCase().replace(/-/g, "_")}`;
}

export function normalizeRosWsUrl(raw: string): string {
  let s = raw.trim().replace(/\/+$/, "");
  if (!s) return "";
  if (/^https:\/\//i.test(s)) s = `wss://${s.slice(8)}`;
  else if (/^http:\/\//i.test(s)) s = `ws://${s.slice(7)}`;
  else if (!/^wss?:\/\//i.test(s)) {
    const isLocal = /^(localhost|127\.0\.0\.1)(:|\/|$)/i.test(s);
    s = `${isLocal ? "ws" : "wss"}://${s}`;
  }
  return s;
}

export function defaultRosWsUrl(): string {
  if (typeof window === "undefined") return "ws://localhost:3000/ws/ros";
  const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${proto}//${window.location.host}/ws/ros`;
}

export function rosQuatToYaw(q?: { x?: number; y?: number; z?: number; w?: number }): number {
  const x = q?.x ?? 0;
  const y = q?.y ?? 0;
  const z = q?.z ?? 0;
  const w = q?.w ?? 1;
  return Math.atan2(2 * (w * z + x * y), 1 - 2 * (y * y + z * z));
}

export function rosVecToThree(p?: { x?: number; y?: number; z?: number }): Vec3 {
  const rx = Number(p?.x) || 0;
  const ry = Number(p?.y) || 0;
  const rz = Number(p?.z) || 0;
  // ROS REP-103 (X fwd, Y left, Z up) -> Three.js Y-up (X right, Y up, Z toward viewer)
  return [rx, rz, -ry];
}

export class RosBridgeClient {
  private ws: WebSocket | null = null;
  private status: StreamStatus = "disconnected";
  private url = "";
  private callSeq = 1;
  private pending = new Map<string, PendingCall>();
  private subscribedTopics = new Set<string>();
  private advertisedTopics = new Set<string>();
  private onStatusCb?: (s: StreamStatus, detail?: string) => void;

  // Live telemetry state (read at 60Hz in Three.js useFrame)
  poses = new Map<string, RosPoseState>();
  jointStates = new Map<string, RosJointState>();
  scans = new Map<string, RosLaserScan>();
  batteries = new Map<string, number>();
  diagnostics = new Map<string, RosDiagnostic>();
  topics = new Map<string, RosTopicInfo>();
  nodes: string[] = [];
  logs: RosLogEntry[] = [];
  paused = false;

  private hzWindowStart = Date.now();
  private hzCounts = new Map<string, number>();

  getStatus(): StreamStatus {
    return this.status;
  }

  getUrl(): string {
    return this.url;
  }

  connect(url: string, onStatus?: (s: StreamStatus, detail?: string) => void) {
    this.disconnect();
    const clean = normalizeRosWsUrl(url);
    if (!clean) return;
    this.url = clean;
    this.onStatusCb = onStatus;
    if (
      typeof window !== "undefined" &&
      window.location.protocol === "https:" &&
      clean.startsWith("ws://") &&
      !/^ws:\/\/(localhost|127\.0\.0\.1)(:|\/|$)/i.test(clean)
    ) {
      this.setStatus("error", "HTTPS page requires wss:// (e.g. wss://xxxx.ngrok-free.app)");
      return;
    }
    this.setStatus("connecting");

    try {
      const ws = new WebSocket(clean);
      this.ws = ws;

      ws.onopen = () => {
        this.setStatus("connected");
        for (const sub of DEFAULT_SUB_TOPICS) {
          this.subscribe(sub.topic, sub.type, sub.throttle);
        }
        this.refreshGraph().catch(() => {
          /* external rosbridge may not run rosapi */
        });
      };

      ws.onerror = () => {
        this.setStatus("error", "WebSocket connection failed");
      };

      ws.onclose = () => {
        if (this.status !== "error") this.setStatus("disconnected");
        this.ws = null;
        this.rejectAllPending("ROS WebSocket closed");
      };

      ws.onmessage = (ev) => {
        try {
          const data = JSON.parse(String(ev.data)) as Record<string, unknown>;
          this.handleInbound(data);
        } catch {
          // Ignore malformed rosbridge JSON
        }
      };
    } catch {
      this.setStatus("error", "Invalid WebSocket URL");
    }
  }

  disconnect() {
    if (this.ws) {
      this.ws.onclose = null;
      this.ws.close();
      this.ws = null;
    }
    this.rejectAllPending("Disconnected");
    this.subscribedTopics.clear();
    this.advertisedTopics.clear();
    this.poses.clear();
    this.jointStates.clear();
    this.scans.clear();
    this.batteries.clear();
    this.diagnostics.clear();
    this.topics.clear();
    this.nodes = [];
    this.setStatus("disconnected");
  }

  private setStatus(s: StreamStatus, detail?: string) {
    this.status = s;
    this.onStatusCb?.(s, detail);
  }

  private rejectAllPending(reason: string) {
    for (const p of this.pending.values()) {
      clearTimeout(p.timer);
      p.reject(new Error(reason));
    }
    this.pending.clear();
  }

  private sendRaw(payload: Record<string, unknown>): boolean {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return false;
    this.ws.send(JSON.stringify(payload));
    return true;
  }

  subscribe(topic: string, type?: string, throttleRateMs = 0) {
    if (!this.topics.has(topic)) {
      this.topics.set(topic, {
        topic,
        type: type ?? "unknown",
        hz: 0,
        msgCount: 0,
      });
    }
    if (this.subscribedTopics.has(topic)) return;
    this.subscribedTopics.add(topic);
    this.sendRaw({
      op: "subscribe",
      topic,
      ...(type ? { type } : {}),
      ...(throttleRateMs > 0 ? { throttle_rate: throttleRateMs } : {}),
    });
  }

  unsubscribe(topic: string) {
    this.subscribedTopics.delete(topic);
    this.sendRaw({ op: "unsubscribe", topic });
  }

  advertise(topic: string, type: string) {
    if (this.advertisedTopics.has(topic)) return;
    this.advertisedTopics.add(topic);
    this.sendRaw({ op: "advertise", topic, type });
  }

  publish(topic: string, type: string, msg: Record<string, unknown>): boolean {
    this.advertise(topic, type);
    return this.sendRaw({ op: "publish", topic, msg });
  }

  callService<T = Record<string, unknown>>(
    service: string,
    args: Record<string, unknown> = {},
    timeoutMs = 3500,
  ): Promise<T> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return Promise.reject(new Error("ROS bridge not connected"));
    }
    const id = `call_${this.callSeq++}`;
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Service timeout: ${service}`));
      }, timeoutMs);
      this.pending.set(id, {
        resolve: (v) => resolve(v as T),
        reject,
        timer,
      });
      this.sendRaw({ op: "call_service", id, service, args });
    });
  }

  async refreshGraph() {
    if (this.status !== "connected") return;
    try {
      const [topicsRes, nodesRes] = await Promise.all([
        this.callService<{ topics?: string[]; types?: string[] }>("/rosapi/topics"),
        this.callService<{ nodes?: string[] }>("/rosapi/nodes"),
      ]);
      const tList = topicsRes.topics ?? [];
      const tyList = topicsRes.types ?? [];
      for (let i = 0; i < tList.length; i++) {
        const name = tList[i];
        const existing = this.topics.get(name);
        if (existing) {
          existing.type = tyList[i] ?? existing.type;
        } else {
          this.topics.set(name, {
            topic: name,
            type: tyList[i] ?? "unknown",
            hz: 0,
            msgCount: 0,
          });
        }
      }
      if (Array.isArray(nodesRes.nodes)) {
        this.nodes = nodesRes.nodes;
      }
    } catch {
      /* rosapi optional on external servers */
    }
  }

  // ------------------------------------------------------------------ Publishers & Convenience RPCs
  publishTwist(robotIdOrNs: string, linear: Vec3, angularZ: number) {
    const ns = robotIdOrNs.startsWith("/") ? robotIdOrNs : robotIdToNs(robotIdOrNs);
    this.publish(`${ns}/cmd_vel`, "geometry_msgs/msg/Twist", {
      linear: { x: linear[0], y: linear[1], z: linear[2] },
      angular: { x: 0, y: 0, z: angularZ },
    });
  }

  publishGoalPose(robotIdOrNs: string, xThree: number, zThree: number, yawThree = 0) {
    const ns = robotIdOrNs.startsWith("/") ? robotIdOrNs : robotIdToNs(robotIdOrNs);
    const half = yawThree * 0.5;
    this.publish(`${ns}/goal_pose`, "geometry_msgs/msg/PoseStamped", {
      header: { frame_id: "map" },
      pose: {
        position: { x: Number(xThree.toFixed(3)), y: Number((-zThree).toFixed(3)), z: 0 },
        orientation: { x: 0, y: 0, z: Math.sin(half), w: Math.cos(half) },
      },
    });
  }

  publishJointCmd(robotIdOrNs: string, joints: Record<string, number>) {
    const ns = robotIdOrNs.startsWith("/") ? robotIdOrNs : robotIdToNs(robotIdOrNs);
    const entries = Object.entries(joints);
    this.publish(`${ns}/joint_cmd`, "sensor_msgs/msg/JointState", {
      name: entries.map(([k]) => k),
      position: entries.map(([, v]) => v),
      velocity: [],
      effort: [],
    });
  }

  async setPaused(paused: boolean) {
    const res = await this.callService<{ success?: boolean }>("/sim/set_pause", { data: paused });
    this.paused = paused;
    return res;
  }

  async resetWorld() {
    this.paused = false;
    return this.callService("/sim/reset", {});
  }

  async resumePatrol(robotId?: string) {
    return this.callService("/amr/resume_patrol", robotId ? { robot: robotId } : {});
  }

  async setArmPreset(preset: "home" | "pick" | "place" | "auto") {
    return this.callService("/arm_1/set_preset", { preset });
  }

  async sendFault(id: string, fault: "overheat" | "jam" | "battery" | "clear") {
    return this.callService("/sim/fault", { id, fault });
  }

  // ------------------------------------------------------------------ Inbound message handling
  private handleInbound(data: Record<string, unknown>) {
    const op = data.op;
    if (op === "service_response") {
      const id = typeof data.id === "string" ? data.id : "";
      const p = this.pending.get(id);
      if (p) {
        clearTimeout(p.timer);
        this.pending.delete(id);
        if (data.result === false) {
          p.reject(new Error(String((data.values as Record<string, unknown> | undefined)?.message ?? "Service call failed")));
        } else {
          p.resolve((data.values ?? {}) as Record<string, unknown>);
        }
      }
      return;
    }

    if (op !== "publish" || typeof data.topic !== "string" || !data.msg) return;

    const topic = data.topic;
    const msg = data.msg as Record<string, unknown>;
    const now = Date.now();

    // Update topic stats & Hz rolling window
    let info = this.topics.get(topic);
    if (!info) {
      info = { topic, type: "unknown", hz: 0, msgCount: 0 };
      this.topics.set(topic, info);
    }
    info.msgCount++;
    info.lastMsg = msg;
    this.hzCounts.set(topic, (this.hzCounts.get(topic) ?? 0) + 1);
    const winMs = now - this.hzWindowStart;
    if (winMs >= 1000) {
      const sec = winMs / 1000;
      for (const [tName, tInfo] of this.topics.entries()) {
        tInfo.hz = Number(((this.hzCounts.get(tName) ?? 0) / sec).toFixed(1));
      }
      this.hzCounts.clear();
      this.hzWindowStart = now;
    }

    if (topic === "/tf") {
      const transforms = Array.isArray(msg.transforms) ? (msg.transforms as Record<string, unknown>[]) : [];
      for (const tf of transforms) {
        const child = String(tf.child_frame_id ?? "");
        const robotId = child.split("/")[0];
        if (!robotId) continue;
        const tr = tf.transform as { translation?: { x?: number; y?: number; z?: number }; rotation?: { x?: number; y?: number; z?: number; w?: number } } | undefined;
        if (!tr) continue;
        const prev = this.poses.get(robotId);
        this.poses.set(robotId, {
          id: robotId,
          ns: prev?.ns ?? robotIdToNs(robotId),
          pos: rosVecToThree(tr.translation),
          yaw: rosQuatToYaw(tr.rotation),
          vx: prev?.vx ?? 0,
          vy: prev?.vy ?? 0,
          vz: prev?.vz ?? 0,
          wz: prev?.wz ?? 0,
          updatedAt: now,
        });
      }
      return;
    }

    if (topic.endsWith("/odom")) {
      const ns = topic.slice(0, -"/odom".length);
      const id = NS_TO_ID[ns] ?? ns.replace(/^\//, "").toUpperCase();
      const poseObj = (msg.pose as { pose?: { position?: { x?: number; y?: number; z?: number }; orientation?: { x?: number; y?: number; z?: number; w?: number } } })?.pose;
      const twistObj = (msg.twist as { twist?: { linear?: { x?: number; y?: number; z?: number }; angular?: { z?: number } } })?.twist;
      if (poseObj) {
        this.poses.set(id, {
          id,
          ns,
          pos: rosVecToThree(poseObj.position),
          yaw: rosQuatToYaw(poseObj.orientation),
          vx: Number(twistObj?.linear?.x) || 0,
          vy: Number(twistObj?.linear?.y) || 0,
          vz: Number(twistObj?.linear?.z) || 0,
          wz: Number(twistObj?.angular?.z) || 0,
          updatedAt: now,
        });
      }
      return;
    }

    if (topic.endsWith("/joint_states")) {
      const ns = topic.slice(0, -"/joint_states".length);
      const id = ns === "" ? "ARM-1" : NS_TO_ID[ns] ?? ns.replace(/^\//, "").toUpperCase();
      const names = Array.isArray(msg.name) ? (msg.name as string[]) : [];
      const positions = Array.isArray(msg.position) ? (msg.position as number[]) : [];
      const joints: Record<string, number> = {};
      for (let i = 0; i < names.length; i++) {
        const val = Number(positions[i]);
        if (Number.isFinite(val)) joints[names[i]] = val;
      }
      this.jointStates.set(id, { id, ns, joints, updatedAt: now });
      return;
    }

    if (topic.endsWith("/scan")) {
      const ns = topic.slice(0, -"/scan".length);
      const id = NS_TO_ID[ns] ?? "AMR-1";
      const ranges = Array.isArray(msg.ranges) ? (msg.ranges as number[]).map((r) => Number(r) || 0) : [];
      this.scans.set(id, {
        id,
        frameId: String((msg.header as { frame_id?: string } | undefined)?.frame_id ?? `${id}/laser_link`),
        angleMin: Number(msg.angle_min ?? -Math.PI),
        angleIncrement: Number(msg.angle_increment ?? (Math.PI * 2) / Math.max(1, ranges.length)),
        rangeMin: Number(msg.range_min ?? 0.15),
        rangeMax: Number(msg.range_max ?? 12.0),
        ranges,
        updatedAt: now,
      });
      return;
    }

    if (topic.endsWith("/battery_state")) {
      const ns = topic.slice(0, -"/battery_state".length);
      const id = NS_TO_ID[ns] ?? ns.replace(/^\//, "").toUpperCase();
      const pct = Number(msg.percentage);
      if (Number.isFinite(pct)) {
        this.batteries.set(id, pct <= 1.05 ? pct * 100 : pct);
      }
      return;
    }

    if (topic === "/fleet/diagnostics") {
      const list = Array.isArray(msg.status) ? (msg.status as Record<string, unknown>[]) : [];
      for (const st of list) {
        const id = String(st.name ?? "");
        if (!id) continue;
        const vals = Array.isArray(st.values) ? (st.values as { key?: string; value?: string }[]) : [];
        const kv = new Map(vals.map((v) => [String(v.key ?? ""), String(v.value ?? "")]));
        this.diagnostics.set(id, {
          id,
          level: Number(st.level) || 0,
          message: String(st.message ?? "Nominal"),
          mode: kv.get("mode") ?? "patrol",
          batteryPct: kv.has("battery_pct") ? Number(kv.get("battery_pct")) : undefined,
          temperatureC: kv.has("temperature_c") ? Number(kv.get("temperature_c")) : undefined,
          speedMps: kv.has("speed_mps") ? Number(kv.get("speed_mps")) : undefined,
          updatedAt: now,
        });
      }
      return;
    }

    if (topic === "/rosout") {
      const stampObj = msg.stamp as { sec?: number } | undefined;
      const tSec = stampObj?.sec ? new Date(stampObj.sec * 1000).toLocaleTimeString() : new Date().toLocaleTimeString();
      this.logs.unshift({
        stamp: tSec,
        level: Number(msg.level) || 20,
        name: String(msg.name ?? "/ros"),
        msg: String(msg.msg ?? ""),
      });
      if (this.logs.length > 60) this.logs.length = 60;
    }
  }
}
