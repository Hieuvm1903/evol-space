import type { Server as HttpServer } from "node:http";
import { WebSocketServer, WebSocket } from "ws";

// ---------------------------------------------------------------------------
// Standard ROS 2 / rosbridge_suite v2 JSON protocol types
// ---------------------------------------------------------------------------
export interface RosStamp {
  sec: number;
  nanosec: number;
}

export interface RosHeader {
  stamp: RosStamp;
  frame_id: string;
}

interface RosbridgeInbound {
  op: "subscribe" | "unsubscribe" | "publish" | "advertise" | "unadvertise" | "call_service";
  id?: string;
  topic?: string;
  type?: string;
  throttle_rate?: number;
  msg?: Record<string, unknown>;
  service?: string;
  args?: Record<string, unknown>;
}

interface ClientSub {
  topic: string;
  throttleMs: number;
  lastSentMs: number;
}

interface ClientSession {
  ws: WebSocket;
  subs: Map<string, ClientSub>;
}

interface Box2D {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

interface SimRobot {
  id: string; // e.g. "AMR-1"
  ns: string; // e.g. "/amr_1"
  kind: "amr" | "drone" | "truck";
  x: number; // ROS map frame (m)
  y: number; // ROS map frame (m) = -z_three
  z: number; // ROS map frame (m) = y_three
  yaw: number; // rad, CCW about +Z
  vx: number;
  vy: number;
  vz: number;
  wz: number;
  battery: number; // 0..100
  temperatureC: number;
  mode: "patrol" | "teleop" | "goal" | "fault";
  faultReason: string | null;
  patrol: [number, number][]; // ROS [x, y] waypoints
  patrolIdx: number;
  patrolSpeed: number;
  cruiseZ: number;
  goal: { x: number; y: number } | null;
  cmdVel: { vx: number; vy: number; vz: number; wz: number; expiresAt: number } | null;
  dwellTimer: number;
}

interface SimJointDevice {
  id: string;
  ns: string;
  names: string[];
  positions: number[];
  targets: number[] | null;
  autoMode: boolean;
  phase: number;
}

const TAU = Math.PI * 2;
const wrap = (a: number) => (((a + Math.PI) % TAU) + TAU) % TAU - Math.PI;

function nowStamp(): RosStamp {
  const ms = Date.now();
  const sec = Math.floor(ms / 1000);
  const nanosec = (ms % 1000) * 1_000_000;
  return { sec, nanosec };
}

function yawToQuat(yaw: number) {
  const half = yaw * 0.5;
  return { x: 0, y: 0, z: Math.sin(half), w: Math.cos(half) };
}

// Build 2D warehouse obstacle boxes in ROS (x, y = -z_three) matching model-sand3d/models/layout.py
function buildWarehouseObstacles(): Box2D[] {
  const boxes: Box2D[] = [];
  const bays = 8;
  const pitch = 1.3;
  const rows = 4;
  const rowPitch = 2.5;
  for (let r = 0; r < rows; r++) {
    const zThree = r * rowPitch;
    const yRos = -zThree;
    for (let i = 0; i < bays; i++) {
      const x = (i - (bays - 1) / 2) * pitch;
      boxes.push({
        minX: x - 0.55,
        maxX: x + 0.55,
        minY: yRos - 0.42,
        maxY: yRos + 0.42,
      });
    }
  }
  // Conveyor CV-1 around x=5.75+1.6=7.35, z_three=3.75 => y_ros=-3.75
  boxes.push({ minX: 6.9, maxX: 7.8, minY: -5.2, maxY: -2.3 });
  // Station ST-1 around x=-7.55, z_three=-1.4 => y_ros=1.4
  boxes.push({ minX: -8.1, maxX: -7.0, minY: 0.9, maxY: 1.9 });
  return boxes;
}

function rayIntersectBox(ox: number, oy: number, dx: number, dy: number, b: Box2D): number | null {
  const invX = Math.abs(dx) > 1e-8 ? 1 / dx : 1e8;
  const invY = Math.abs(dy) > 1e-8 ? 1 / dy : 1e8;
  const t1 = (b.minX - ox) * invX;
  const t2 = (b.maxX - ox) * invX;
  const t3 = (b.minY - oy) * invY;
  const t4 = (b.maxY - oy) * invY;
  const tmin = Math.max(Math.min(t1, t2), Math.min(t3, t4));
  const tmax = Math.min(Math.max(t1, t2), Math.max(t3, t4));
  if (tmax < 0 || tmin > tmax) return null;
  return tmin >= 0 ? tmin : tmax;
}

const WAREHOUSE_BOUNDS = { minX: -11.9, maxX: 11.9, minY: -10.9, maxY: 4.9 }; // z_three in [-5, 11] => y_ros in [-11, 5]

function raycastLidar(ox: number, oy: number, yaw: number, obstacles: Box2D[], beams = 72, maxRange = 12.0): number[] {
  const ranges: number[] = [];
  const angleStep = TAU / beams;
  for (let i = 0; i < beams; i++) {
    const a = yaw - Math.PI + i * angleStep;
    const dx = Math.cos(a);
    const dy = Math.sin(a);
    let best = maxRange;

    // Intersect outer warehouse walls
    if (dx > 1e-6) best = Math.min(best, (WAREHOUSE_BOUNDS.maxX - ox) / dx);
    else if (dx < -1e-6) best = Math.min(best, (WAREHOUSE_BOUNDS.minX - ox) / dx);
    if (dy > 1e-6) best = Math.min(best, (WAREHOUSE_BOUNDS.maxY - oy) / dy);
    else if (dy < -1e-6) best = Math.min(best, (WAREHOUSE_BOUNDS.minY - oy) / dy);

    for (let k = 0; k < obstacles.length; k++) {
      const hit = rayIntersectBox(ox, oy, dx, dy, obstacles[k]);
      if (hit !== null && hit > 0.15 && hit < best) best = hit;
    }

    // Add tiny realistic LiDAR noise (+/- 1 cm)
    const noise = (Math.random() - 0.5) * 0.02;
    ranges.push(Number(Math.max(0.15, Math.min(maxRange, best + noise)).toFixed(3)));
  }
  return ranges;
}

export class VirtualRosRuntime {
  private wss: WebSocketServer | null = null;
  private clients = new Set<ClientSession>();
  private robots = new Map<string, SimRobot>();
  private joints = new Map<string, SimJointDevice>();
  private obstacles = buildWarehouseObstacles();
  private paused = false;
  private timer: NodeJS.Timeout | null = null;
  private tickCount = 0;
  private lastTickMs = Date.now();
  private topicRegistry: { topic: string; type: string }[] = [];
  private nodeRegistry: string[] = [
    "/rosbridge_websocket",
    "/rosapi",
    "/sim_fleet_controller",
    "/sim_arm_controller",
    "/sim_xfer_controller",
    "/sim_drone_bridge",
    "/sim_lidar_sensor",
  ];

  constructor() {
    this.initEntities();
    this.buildTopicRegistry();
  }

  private initEntities() {
    this.robots.clear();
    this.joints.clear();

    const bays = 8;
    const pitch = 1.3;
    const rowPitch = 2.5;
    const x0 = -(bays - 1) * 0.5 * pitch - 1.2; // -5.75
    const x1 = (bays - 1) * 0.5 * pitch + 1.2; // +5.75

    // 3 AMRs matching layout.py (note y_ros = -z_three)
    for (let k = 0; k < 3; k++) {
      const za = k * rowPitch + rowPitch / 2;
      const zc = -1.0 - 0.4 * k;
      const patrol: [number, number][] = [
        [x0, -za],
        [x1, -za],
        [x1, -zc],
        [x0, -zc],
      ];
      this.robots.set(`AMR-${k + 1}`, {
        id: `AMR-${k + 1}`,
        ns: `/amr_${k + 1}`,
        kind: "amr",
        x: patrol[0][0],
        y: patrol[0][1],
        z: 0,
        yaw: 0,
        vx: 0,
        vy: 0,
        vz: 0,
        wz: 0,
        battery: 88 - k * 6,
        temperatureC: 36 + k * 1.4,
        mode: "patrol",
        faultReason: null,
        patrol,
        patrolIdx: 1,
        patrolSpeed: 1.2,
        cruiseZ: 0,
        goal: null,
        cmdVel: null,
        dwellTimer: 0,
      });
    }

    // 2 Drones matching layout.py
    const mkLoop = (cx: number, czThree: number, rx: number, rz: number, n = 8): [number, number][] => {
      const pts: [number, number][] = [];
      for (let i = 0; i < n; i++) {
        const a = (TAU * i) / n;
        pts.push([Number((cx + rx * Math.cos(a)).toFixed(2)), Number(-(czThree + rz * Math.sin(a)).toFixed(2))]);
      }
      return pts;
    };

    this.robots.set("DR-1", {
      id: "DR-1",
      ns: "/dr_1",
      kind: "drone",
      x: 10.5,
      y: -9.5,
      z: 4.5,
      yaw: 0,
      vx: 0,
      vy: 0,
      vz: 0,
      wz: 0,
      battery: 82,
      temperatureC: 39,
      mode: "patrol",
      faultReason: null,
      patrol: mkLoop(0, 3.0, 9.0, 5.5),
      patrolIdx: 0,
      patrolSpeed: 2.3,
      cruiseZ: 4.5,
      goal: null,
      cmdVel: null,
      dwellTimer: 0,
    });

    this.robots.set("DR-2", {
      id: "DR-2",
      ns: "/dr_2",
      kind: "drone",
      x: -10.5,
      y: -9.5,
      z: 5.5,
      yaw: 0,
      vx: 0,
      vy: 0,
      vz: 0,
      wz: 0,
      battery: 76,
      temperatureC: 38,
      mode: "patrol",
      faultReason: null,
      patrol: mkLoop(0, 3.0, 6.0, 3.5),
      patrolIdx: 0,
      patrolSpeed: 1.9,
      cruiseZ: 5.5,
      goal: null,
      cmdVel: null,
      dwellTimer: 0,
    });

    // Dock truck TR-1
    this.robots.set("TR-1", {
      id: "TR-1",
      ns: "/tr_1",
      kind: "truck",
      x: 0,
      y: 8.8, // z_three = -8.8 => y_ros = +8.8
      z: 0,
      yaw: Math.PI / 2,
      vx: 0,
      vy: 0,
      vz: 0,
      wz: 0,
      battery: 100,
      temperatureC: 42,
      mode: "patrol",
      faultReason: null,
      patrol: [
        [0, 8.8],
        [0, 22.0],
      ],
      patrolIdx: 1,
      patrolSpeed: 1.8,
      cruiseZ: 0,
      goal: null,
      cmdVel: null,
      dwellTimer: 4.0,
    });

    // ARM-1 6-DOF manipulator
    this.joints.set("ARM-1", {
      id: "ARM-1",
      ns: "/arm_1",
      names: ["base_yaw", "shoulder_pitch", "elbow_pitch", "wrist_roll", "finger_l_slide", "finger_r_slide"],
      positions: [0, -0.3, -0.5, 0, 0.02, 0.02],
      targets: null,
      autoMode: true,
      phase: 0,
    });

    // XFER-1 3-axis transfer gantry
    this.joints.set("XFER-1", {
      id: "XFER-1",
      ns: "/xfer_1",
      names: ["travel_slide", "lift_slide", "fork_slide"],
      positions: [0.2, 0.2, 0],
      targets: null,
      autoMode: true,
      phase: 0,
    });
  }

  private buildTopicRegistry() {
    this.topicRegistry = [
      { topic: "/tf", type: "tf2_msgs/msg/TFMessage" },
      { topic: "/amr_1/odom", type: "nav_msgs/msg/Odometry" },
      { topic: "/amr_2/odom", type: "nav_msgs/msg/Odometry" },
      { topic: "/amr_3/odom", type: "nav_msgs/msg/Odometry" },
      { topic: "/amr_1/scan", type: "sensor_msgs/msg/LaserScan" },
      { topic: "/amr_1/battery_state", type: "sensor_msgs/msg/BatteryState" },
      { topic: "/amr_2/battery_state", type: "sensor_msgs/msg/BatteryState" },
      { topic: "/amr_3/battery_state", type: "sensor_msgs/msg/BatteryState" },
      { topic: "/amr_1/cmd_vel", type: "geometry_msgs/msg/Twist" },
      { topic: "/amr_2/cmd_vel", type: "geometry_msgs/msg/Twist" },
      { topic: "/amr_3/cmd_vel", type: "geometry_msgs/msg/Twist" },
      { topic: "/amr_1/goal_pose", type: "geometry_msgs/msg/PoseStamped" },
      { topic: "/amr_2/goal_pose", type: "geometry_msgs/msg/PoseStamped" },
      { topic: "/amr_3/goal_pose", type: "geometry_msgs/msg/PoseStamped" },
      { topic: "/dr_1/odom", type: "nav_msgs/msg/Odometry" },
      { topic: "/dr_2/odom", type: "nav_msgs/msg/Odometry" },
      { topic: "/dr_1/cmd_vel", type: "geometry_msgs/msg/Twist" },
      { topic: "/dr_2/cmd_vel", type: "geometry_msgs/msg/Twist" },
      { topic: "/tr_1/odom", type: "nav_msgs/msg/Odometry" },
      { topic: "/arm_1/joint_states", type: "sensor_msgs/msg/JointState" },
      { topic: "/arm_1/joint_cmd", type: "sensor_msgs/msg/JointState" },
      { topic: "/xfer_1/joint_states", type: "sensor_msgs/msg/JointState" },
      { topic: "/xfer_1/joint_cmd", type: "sensor_msgs/msg/JointState" },
      { topic: "/fleet/diagnostics", type: "diagnostic_msgs/msg/DiagnosticArray" },
      { topic: "/rosout", type: "rcl_interfaces/msg/Log" },
    ];
  }

  attach(server: HttpServer) {
    if (this.wss) return;
    this.wss = new WebSocketServer({ server, path: "/ws/ros" });

    this.wss.on("connection", (ws) => {
      const session: ClientSession = { ws, subs: new Map() };
      this.clients.add(session);

      this.emitRosout(20, "/rosbridge_websocket", `Client connected (${this.clients.size} active)`);

      ws.on("message", (raw) => {
        try {
          const msg = JSON.parse(String(raw)) as RosbridgeInbound;
          this.handleMessage(session, msg);
        } catch {
          // Ignore malformed rosbridge frames
        }
      });

      ws.on("close", () => {
        this.clients.delete(session);
      });
    });

    this.lastTickMs = Date.now();
    this.timer = setInterval(() => this.stepSimulation(), 50); // 20 Hz ROS control loop
  }

  stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.wss?.close();
    this.wss = null;
  }

  getStatus() {
    return {
      running: Boolean(this.wss),
      paused: this.paused,
      clients: this.clients.size,
      nodes: this.nodeRegistry,
      topicCount: this.topicRegistry.length,
      wsPath: "/ws/ros",
      robots: Array.from(this.robots.values()).map((r) => ({
        id: r.id,
        ns: r.ns,
        mode: r.mode,
        battery: Number(r.battery.toFixed(1)),
      })),
    };
  }

  private handleMessage(session: ClientSession, data: RosbridgeInbound) {
    if (!data || typeof data.op !== "string") return;

    if (data.op === "subscribe" && typeof data.topic === "string") {
      session.subs.set(data.topic, {
        topic: data.topic,
        throttleMs: typeof data.throttle_rate === "number" ? Math.max(0, data.throttle_rate) : 0,
        lastSentMs: 0,
      });
      return;
    }

    if (data.op === "unsubscribe" && typeof data.topic === "string") {
      session.subs.delete(data.topic);
      return;
    }

    if (data.op === "publish" && typeof data.topic === "string" && data.msg) {
      this.handleInboundPublish(data.topic, data.msg);
      return;
    }

    if (data.op === "call_service" && typeof data.service === "string") {
      this.handleServiceCall(session, data.service, data.args ?? {}, data.id);
    }
  }

  private handleInboundPublish(topic: string, msg: Record<string, unknown>) {
    const now = Date.now();

    // Check /<ns>/cmd_vel
    for (const r of this.robots.values()) {
      if (topic === `${r.ns}/cmd_vel`) {
        const lin = (msg.linear ?? {}) as { x?: number; y?: number; z?: number };
        const ang = (msg.angular ?? {}) as { z?: number };
        const vx = Math.max(-3.0, Math.min(3.0, Number(lin.x) || 0));
        const vy = Math.max(-2.5, Math.min(2.5, Number(lin.y) || 0));
        const vz = Math.max(-2.0, Math.min(2.0, Number(lin.z) || 0));
        const wz = Math.max(-3.0, Math.min(3.0, Number(ang.z) || 0));
        if (r.mode !== "fault") {
          r.mode = "teleop";
          r.goal = null;
          r.cmdVel = { vx, vy, vz, wz, expiresAt: now + 2200 };
        }
        return;
      }

      if (topic === `${r.ns}/goal_pose`) {
        const pose = (msg.pose ?? msg) as { position?: { x?: number; y?: number } };
        const gx = Number(pose.position?.x);
        const gy = Number(pose.position?.y);
        if (Number.isFinite(gx) && Number.isFinite(gy) && r.mode !== "fault") {
          r.goal = {
            x: Math.max(-11.5, Math.min(11.5, gx)),
            y: Math.max(-10.5, Math.min(4.5, gy)),
          };
          r.cmdVel = null;
          r.mode = "goal";
          this.emitRosout(
            20,
            "/sim_fleet_controller",
            `${r.id} received NavGoal -> (${r.goal.x.toFixed(2)}, ${r.goal.y.toFixed(2)})`,
          );
        }
        return;
      }
    }

    // Joint commands (/arm_1/joint_cmd, /xfer_1/joint_cmd)
    for (const dev of this.joints.values()) {
      if (topic === `${dev.ns}/joint_cmd`) {
        const names = Array.isArray(msg.name) ? (msg.name as string[]) : dev.names;
        const pos = Array.isArray(msg.position) ? (msg.position as number[]) : [];
        if (pos.length > 0) {
          const nextTargets = [...(dev.targets ?? dev.positions)];
          names.forEach((n, idx) => {
            const jIdx = dev.names.indexOf(n);
            const val = Number(pos[idx]);
            if (jIdx >= 0 && Number.isFinite(val)) {
              nextTargets[jIdx] = val;
            }
          });
          dev.targets = nextTargets;
          dev.autoMode = false;
        }
        return;
      }
    }
  }

  private handleServiceCall(
    session: ClientSession,
    service: string,
    args: Record<string, unknown>,
    id?: string,
  ) {
    const reply = (result: boolean, values: Record<string, unknown>) => {
      if (session.ws.readyState !== WebSocket.OPEN) return;
      session.ws.send(
        JSON.stringify({
          op: "service_response",
          ...(id ? { id } : {}),
          service,
          result,
          values,
        }),
      );
    };

    if (service === "/rosapi/topics") {
      reply(true, {
        topics: this.topicRegistry.map((t) => t.topic),
        types: this.topicRegistry.map((t) => t.type),
      });
      return;
    }

    if (service === "/rosapi/nodes") {
      reply(true, { nodes: this.nodeRegistry });
      return;
    }

    if (service === "/rosapi/services") {
      reply(true, {
        services: [
          "/rosapi/topics",
          "/rosapi/nodes",
          "/rosapi/services",
          "/sim/set_pause",
          "/sim/reset",
          "/amr/resume_patrol",
          "/arm_1/set_preset",
          "/sim/fault",
        ],
      });
      return;
    }

    if (service === "/sim/set_pause") {
      this.paused = Boolean(args.data);
      this.emitRosout(20, "/sim_fleet_controller", this.paused ? "Simulation paused" : "Simulation resumed");
      reply(true, { success: true, message: this.paused ? "Paused" : "Running" });
      return;
    }

    if (service === "/sim/reset") {
      this.paused = false;
      this.initEntities();
      this.emitRosout(20, "/sim_fleet_controller", "World reset to nominal initial poses");
      reply(true, { success: true, message: "Virtual ROS simulation reset" });
      return;
    }

    if (service === "/amr/resume_patrol") {
      const targetId = typeof args.robot === "string" ? args.robot : null;
      for (const r of this.robots.values()) {
        if (!targetId || r.id === targetId || r.ns === targetId) {
          if (r.mode !== "fault") {
            r.mode = "patrol";
            r.goal = null;
            r.cmdVel = null;
          }
        }
      }
      this.emitRosout(20, "/sim_fleet_controller", `Resumed autonomous patrol (${targetId ?? "all"})`);
      reply(true, { success: true, message: "Patrol resumed" });
      return;
    }

    if (service === "/arm_1/set_preset") {
      const arm = this.joints.get("ARM-1");
      const preset = typeof args.preset === "string" ? args.preset : "home";
      if (!arm) {
        reply(false, { message: "ARM-1 not found" });
        return;
      }
      if (preset === "auto") {
        arm.autoMode = true;
        arm.targets = null;
      } else if (preset === "pick") {
        arm.autoMode = false;
        arm.targets = [0.0, -0.45, -0.85, 0.0, 0.035, 0.035];
      } else if (preset === "place") {
        arm.autoMode = false;
        arm.targets = [1.57, -0.35, -0.45, 0.3, 0.035, 0.035];
      } else {
        arm.autoMode = false;
        arm.targets = [0, 0, 0, 0, 0.01, 0.01];
      }
      this.emitRosout(20, "/sim_arm_controller", `ARM-1 preset -> ${preset}`);
      reply(true, { success: true, preset });
      return;
    }

    if (service === "/sim/fault") {
      const idVal = typeof args.id === "string" ? args.id : "AMR-1";
      const faultVal = typeof args.fault === "string" ? args.fault : "clear";
      const r = this.robots.get(idVal);
      if (!r) {
        reply(false, { message: `Unknown robot ${idVal}` });
        return;
      }
      if (faultVal === "clear") {
        r.mode = "patrol";
        r.faultReason = null;
        r.temperatureC = 40;
        r.battery = Math.max(r.battery, 72);
        this.emitRosout(20, "/sim_fleet_controller", `${r.id} fault cleared -> patrol`);
      } else {
        r.mode = "fault";
        r.cmdVel = null;
        r.goal = null;
        r.vx = 0;
        r.vy = 0;
        r.wz = 0;
        if (faultVal === "overheat") {
          r.faultReason = "Drive motor core > 85°C";
          r.temperatureC = 89;
        } else if (faultVal === "battery") {
          r.faultReason = "Battery critical (< 5%)";
          r.battery = 3;
        } else {
          r.faultReason = "Actuator stall / obstacle lock";
        }
        this.emitRosout(40, "/sim_fleet_controller", `${r.id} FAULT: ${r.faultReason}`);
      }
      reply(true, { success: true, id: r.id, mode: r.mode });
      return;
    }

    reply(false, { message: `Unknown service: ${service}` });
  }

  private stepSimulation() {
    const now = Date.now();
    const dt = Math.min(0.1, Math.max(0.005, (now - this.lastTickMs) / 1000));
    this.lastTickMs = now;
    this.tickCount++;

    if (!this.paused) {
      this.stepRobots(dt, now);
      this.stepJointDevices(dt);
    }

    if (this.clients.size === 0) return;

    const stamp = nowStamp();

    // Publish /tf & per-robot odom at 20 Hz
    const tfTransforms: Record<string, unknown>[] = [];
    for (const r of this.robots.values()) {
      const q = yawToQuat(r.yaw);
      tfTransforms.push({
        header: { stamp, frame_id: "map" },
        child_frame_id: `${r.id}/base_link`,
        transform: {
          translation: { x: Number(r.x.toFixed(4)), y: Number(r.y.toFixed(4)), z: Number(r.z.toFixed(4)) },
          rotation: q,
        },
      });

      this.broadcast(`${r.ns}/odom`, {
        header: { stamp, frame_id: "map" },
        child_frame_id: `${r.id}/base_link`,
        pose: {
          pose: {
            position: { x: Number(r.x.toFixed(4)), y: Number(r.y.toFixed(4)), z: Number(r.z.toFixed(4)) },
            orientation: q,
          },
        },
        twist: {
          twist: {
            linear: { x: Number(r.vx.toFixed(3)), y: Number(r.vy.toFixed(3)), z: Number(r.vz.toFixed(3)) },
            angular: { x: 0, y: 0, z: Number(r.wz.toFixed(3)) },
          },
        },
      });
    }

    this.broadcast("/tf", { transforms: tfTransforms });

    // Publish JointStates at 20 Hz
    for (const dev of this.joints.values()) {
      this.broadcast(`${dev.ns}/joint_states`, {
        header: { stamp, frame_id: dev.id },
        name: dev.names,
        position: dev.positions.map((p) => Number(p.toFixed(4))),
        velocity: dev.names.map(() => 0),
        effort: dev.names.map(() => 0),
      });
    }

    // Publish 2D LaserScan for AMR-1 at 10 Hz
    if (this.tickCount % 2 === 0) {
      const amr1 = this.robots.get("AMR-1");
      if (amr1) {
        const beams = 72;
        this.broadcast("/amr_1/scan", {
          header: { stamp, frame_id: "AMR-1/laser_link" },
          angle_min: -Math.PI,
          angle_max: Math.PI,
          angle_increment: TAU / beams,
          range_min: 0.15,
          range_max: 12.0,
          ranges: raycastLidar(amr1.x, amr1.y, amr1.yaw, this.obstacles, beams, 12.0),
        });
      }
    }

    // Publish battery & diagnostics at 2 Hz
    if (this.tickCount % 10 === 0) {
      for (const r of this.robots.values()) {
        if (r.kind === "amr") {
          this.broadcast(`${r.ns}/battery_state`, {
            header: { stamp, frame_id: `${r.id}/base_link` },
            voltage: Number((23.2 + (r.battery / 100) * 5.2).toFixed(2)),
            percentage: Number((r.battery / 100).toFixed(3)),
            power_supply_status: r.mode === "fault" ? 3 : 2,
          });
        }
      }

      this.broadcast("/fleet/diagnostics", {
        header: { stamp, frame_id: "map" },
        status: Array.from(this.robots.values()).map((r) => ({
          level: r.mode === "fault" ? 2 : r.battery < 20 || r.temperatureC > 72 ? 1 : 0,
          name: r.id,
          message:
            r.faultReason ??
            (r.mode === "teleop"
              ? "ROS cmd_vel teleop"
              : r.mode === "goal"
                ? "Nav2 goal active"
                : "Autonomous patrol"),
          hardware_id: r.ns,
          values: [
            { key: "mode", value: r.mode },
            { key: "battery_pct", value: r.battery.toFixed(1) },
            { key: "temperature_c", value: r.temperatureC.toFixed(1) },
            { key: "speed_mps", value: Math.hypot(r.vx, r.vy, r.vz).toFixed(2) },
          ],
        })),
      });
    }
  }

  private stepRobots(dt: number, now: number) {
    for (const r of this.robots.values()) {
      if (r.mode === "fault") {
        r.vx = 0;
        r.vy = 0;
        r.vz = 0;
        r.wz = 0;
        continue;
      }

      if (r.mode === "teleop") {
        if (!r.cmdVel || r.cmdVel.expiresAt < now) {
          r.vx = 0;
          r.vy = 0;
          r.vz = 0;
          r.wz = 0;
        } else {
          const { vx, vy, vz, wz } = r.cmdVel;
          r.yaw = wrap(r.yaw + wz * dt);
          const worldVx = Math.cos(r.yaw) * vx - Math.sin(r.yaw) * vy;
          const worldVy = Math.sin(r.yaw) * vx + Math.cos(r.yaw) * vy;
          r.x = Math.max(-11.8, Math.min(11.8, r.x + worldVx * dt));
          r.y = Math.max(-10.8, Math.min(24.0, r.y + worldVy * dt));
          r.z = r.kind === "drone" ? Math.max(0.2, Math.min(7.5, r.z + vz * dt)) : 0;
          r.vx = vx;
          r.vy = vy;
          r.vz = vz;
          r.wz = wz;
        }
      } else {
        // Goal navigation or autonomous patrol
        let target: [number, number] | null = null;
        if (r.mode === "goal" && r.goal) {
          target = [r.goal.x, r.goal.y];
        } else if (r.patrol.length > 0) {
          if (r.dwellTimer > 0) {
            r.dwellTimer = Math.max(0, r.dwellTimer - dt);
            r.vx = 0;
            r.vy = 0;
            r.wz = 0;
            continue;
          }
          target = r.patrol[r.patrolIdx % r.patrol.length];
        }

        if (target) {
          const dx = target[0] - r.x;
          const dy = target[1] - r.y;
          const dist = Math.hypot(dx, dy);
          if (dist < 0.14) {
            if (r.mode === "goal") {
              r.goal = null;
              r.vx = 0;
              r.vy = 0;
              r.wz = 0;
              this.emitRosout(20, "/sim_fleet_controller", `${r.id} reached NavGoal`);
            } else {
              r.patrolIdx = (r.patrolIdx + 1) % r.patrol.length;
              if (r.kind === "truck") r.dwellTimer = 3.5;
            }
          } else {
            const desiredYaw = Math.atan2(dy, dx);
            const err = wrap(desiredYaw - r.yaw);
            const maxTurn = 2.6;
            const wz = Math.max(-maxTurn, Math.min(maxTurn, err * 3.0));
            r.yaw = wrap(r.yaw + wz * dt);
            r.wz = wz;

            const speed = Math.abs(err) < 0.5 ? Math.min(r.patrolSpeed, dist / dt) : r.patrolSpeed * 0.25;
            r.x += Math.cos(r.yaw) * speed * dt;
            r.y += Math.sin(r.yaw) * speed * dt;
            r.vx = speed;
            r.vy = 0;
          }
        }

        if (r.kind === "drone") {
          const dz = r.cruiseZ - r.z;
          const vz = Math.max(-1.6, Math.min(1.6, dz * 2.0));
          r.z += vz * dt;
          r.vz = vz;
        }
      }

      // Battery & thermal physics
      const speed = Math.hypot(r.vx, r.vy, r.vz);
      if (r.kind === "amr" || r.kind === "drone") {
        // Charging pad near [-10.4, -5.0] in ROS coords (z_three ~ 5.0)
        const nearCharger = r.x < -8.0 && r.y < -3.0 && r.y > -7.0 && r.kind === "amr";
        if (nearCharger) {
          r.battery = Math.min(100, r.battery + 3.5 * dt);
        } else {
          r.battery = Math.max(4, r.battery - (0.04 + speed * 0.03) * dt);
        }
      }
      const targetTemp = 34 + speed * 5.2 + (r.mode === "teleop" ? 2.5 : 0);
      r.temperatureC += (targetTemp - r.temperatureC) * Math.min(1, dt * 0.4);
    }
  }

  private stepJointDevices(dt: number) {
    for (const dev of this.joints.values()) {
      if (dev.autoMode) {
        dev.phase += dt;
        if (dev.id === "ARM-1") {
          const t = dev.phase;
          const cycle = [
            Math.sin(t * 0.7) * 1.2,
            -0.35 + Math.sin(t * 1.4) * 0.25,
            -0.65 + Math.cos(t * 1.4) * 0.3,
            Math.sin(t * 2.1) * 0.8,
            0.02 + Math.sin(t * 1.4) * 0.015,
            0.02 + Math.sin(t * 1.4) * 0.015,
          ];
          for (let i = 0; i < dev.positions.length; i++) {
            dev.positions[i] += (cycle[i] - dev.positions[i]) * Math.min(1, dt * 4);
          }
        } else if (dev.id === "XFER-1") {
          const t = dev.phase;
          const cycle = [
            1.3 + Math.sin(t * 0.55) * 1.1,
            0.65 + Math.sin(t * 1.1) * 0.5,
            0.22 + Math.max(0, Math.cos(t * 1.1)) * 0.25,
          ];
          for (let i = 0; i < dev.positions.length; i++) {
            dev.positions[i] += (cycle[i] - dev.positions[i]) * Math.min(1, dt * 3.5);
          }
        }
      } else if (dev.targets) {
        for (let i = 0; i < dev.positions.length; i++) {
          const diff = dev.targets[i] - dev.positions[i];
          const step = 1.6 * dt;
          dev.positions[i] = Math.abs(diff) <= step ? dev.targets[i] : dev.positions[i] + Math.sign(diff) * step;
        }
      }
    }
  }

  private emitRosout(level: number, name: string, msg: string) {
    this.broadcast("/rosout", {
      stamp: nowStamp(),
      level,
      name,
      msg,
    });
  }

  private broadcast(topic: string, msg: Record<string, unknown>) {
    if (this.clients.size === 0) return;
    const now = Date.now();
    let serialized: string | null = null;

    for (const client of this.clients) {
      if (client.ws.readyState !== WebSocket.OPEN) continue;
      const sub = client.subs.get(topic);
      if (!sub) continue;
      if (sub.throttleMs > 0 && now - sub.lastSentMs < sub.throttleMs) continue;
      sub.lastSentMs = now;
      if (!serialized) {
        serialized = JSON.stringify({ op: "publish", topic, msg });
      }
      client.ws.send(serialized);
    }
  }
}
