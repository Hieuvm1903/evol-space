import * as THREE from "three";
import type {
  AssetTelemetry,
  FacilityKpis,
  FaultKind,
  HealthStatus,
  ReplayEntityPose,
  ReplayFrame,
  SceneObjectData,
  StreamStatus,
  TwinAlert,
  TwinScenario,
  Vec3,
} from "../../lib/workTypes";
import type { Entity, Runtime } from "./runtime";

const MAX_HISTORY = 30;
const MAX_TRAIL = 42;
const MAX_REPLAY_FRAMES = 120; // 60s at 2 Hz
const REPLAY_INTERVAL = 0.5;
const MAX_ALERTS = 40;

const MONITORED_ASSETS = new Set([
  "robot",
  "drone",
  "robot_arm",
  "robot_transfer",
  "humanoid",
  "truck",
  "conveyor",
  "station",
  "charger",
]);

const MOBILE_FLEET_ASSETS = new Set(["robot", "drone", "humanoid", "truck"]);
const AUTOMATION_FLEET_ASSETS = new Set(["robot", "drone", "robot_arm", "robot_transfer"]);
const BATTERY_ASSETS = new Set(["robot", "drone"]);

interface FaultState {
  kind: FaultKind;
  reason: string;
}

interface StreamOverride {
  status?: HealthStatus;
  speedMps?: number;
  batteryPct?: number;
  temperatureC?: number;
  utilizationPct?: number;
  powerKw?: number;
  currentTask?: string;
  faultReason?: string | null;
  pos?: Vec3;
  yaw?: number;
  expiresAt: number;
}

const FAULT_TEXT: Record<FaultKind, { title: string; reason: string; tempSpike?: number; batteryDrop?: number }> = {
  overheat: { title: "Thermal Overload", reason: "Drive motor core > 85°C", tempSpike: 88 },
  battery: { title: "Battery Critical", reason: "Cell pack depleted (< 5%)", batteryDrop: 3 },
  jam: { title: "Mechanical Jam", reason: "Actuator stall / belt obstruction" },
  sensor: { title: "LiDAR / Sensor Fault", reason: "Localization confidence lost" },
};

const _p = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3();

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

export class TwinEngine {
  private telemetry = new Map<string, AssetTelemetry>();
  private faults = new Map<string, FaultState>();
  private speedScales = new Map<string, number>();
  private prevPos = new Map<string, Vec3>();
  private prevCarrying = new Map<string, boolean>();
  private prevPc = new Map<string, number>();
  private alerts: TwinAlert[] = [];
  private replayFrames: ReplayFrame[] = [];
  private streamOverrides = new Map<string, StreamOverride>();
  private ws: WebSocket | null = null;
  private sampleAccum = 0;
  private replayAccum = 0;
  private simUptime = 0;
  private scenario: TwinScenario = "nominal";
  private streamStatus: StreamStatus = "disconnected";
  private alertSeq = 1;
  private cycleTimes: number[] = [];
  private cycleStart = new Map<string, number>();

  private kpis: FacilityKpis = {
    throughputPerHr: 0,
    activeRobots: 0,
    totalRobots: 0,
    avgUtilizationPct: 0,
    avgCycleSec: 0,
    totalPowerKw: 0,
    activeAlerts: 0,
    uptimeSec: 0,
    totalPickups: 0,
    totalDeliveries: 0,
  };

  reset() {
    this.faults.clear();
    this.speedScales.clear();
    this.prevPos.clear();
    this.prevCarrying.clear();
    this.prevPc.clear();
    this.replayFrames = [];
    this.sampleAccum = 0;
    this.replayAccum = 0;
    this.simUptime = 0;
    this.cycleTimes = [];
    this.cycleStart.clear();
    this.scenario = "nominal";
    for (const t of this.telemetry.values()) {
      t.trail = [];
      t.goal = null;
      t.cyclesCompleted = 0;
      t.faultReason = null;
      t.status = "nominal";
      t.speedScale = 1;
    }
  }

  getScenario(): TwinScenario {
    return this.scenario;
  }

  getStreamStatus(): StreamStatus {
    return this.streamStatus;
  }

  getKpis(): FacilityKpis {
    return { ...this.kpis };
  }

  getTelemetry(id: string): AssetTelemetry | undefined {
    return this.telemetry.get(id);
  }

  getAllTelemetry(): AssetTelemetry[] {
    return Array.from(this.telemetry.values());
  }

  /** Monitored active assets (AMRs, drones, robotic cells, conveyors, stations, chargers, workers, dock trucks). */
  getFleetList(): AssetTelemetry[] {
    const order: Record<string, number> = {
      robot: 2,
      drone: 3,
      robot_arm: 4,
      robot_transfer: 5,
      conveyor: 6,
      station: 7,
      charger: 8,
      humanoid: 9,
      truck: 10,
    };
    const rank = (t: AssetTelemetry) => {
      if (t.status === "fault") return 0;
      if (t.status === "warning") return 1;
      return order[t.asset ?? ""] ?? 11;
    };
    return Array.from(this.telemetry.values())
      .filter((t) => MONITORED_ASSETS.has(t.asset ?? "") || t.status !== "nominal")
      .sort((a, b) => rank(a) - rank(b) || a.label.localeCompare(b.label));
  }

  getAlerts(): TwinAlert[] {
    return [...this.alerts];
  }

  getReplayFrames(): ReplayFrame[] {
    return this.replayFrames;
  }

  private pushAlert(
    objectId: string,
    label: string,
    severity: TwinAlert["severity"],
    title: string,
    detail: string,
  ) {
    // Avoid duplicating an identical unacknowledged alert for the same object
    const dup = this.alerts.find(
      (a) => a.objectId === objectId && a.title === title && !a.acknowledged,
    );
    if (dup) return;
    this.alerts.unshift({
      id: `al-${this.alertSeq++}`,
      objectId,
      label,
      severity,
      title,
      detail,
      timeSec: this.simUptime,
      acknowledged: false,
    });
    if (this.alerts.length > MAX_ALERTS) this.alerts.length = MAX_ALERTS;
  }

  acknowledgeAlert(alertId: string) {
    const a = this.alerts.find((x) => x.id === alertId);
    if (a) a.acknowledged = true;
  }

  clearAcknowledgedAlerts() {
    this.alerts = this.alerts.filter((a) => !a.acknowledged);
  }

  injectFault(id: string, kind: FaultKind, runtime: Runtime) {
    const t = this.telemetry.get(id);
    if (!t) return;
    const spec = FAULT_TEXT[kind];
    this.faults.set(id, { kind, reason: spec.reason });
    runtime.setEntityControl(id, { faulted: true });
    t.status = "fault";
    t.faultReason = spec.reason;
    t.speedMps = 0;
    t.utilizationPct = 0;
    if (spec.tempSpike !== undefined) t.temperatureC = Math.max(t.temperatureC, spec.tempSpike);
    if (spec.batteryDrop !== undefined) t.batteryPct = Math.min(t.batteryPct, spec.batteryDrop);
    if (t.asset === "station") runtime.setStatusLamp(id, "fault");
    this.pushAlert(id, t.label, "fault", spec.title, spec.reason);
  }

  clearFault(id: string, runtime: Runtime) {
    const prev = this.faults.get(id);
    this.faults.delete(id);
    runtime.setEntityControl(id, { faulted: false });
    const t = this.telemetry.get(id);
    if (t) {
      t.faultReason = null;
      t.status = "nominal";
      if (prev?.kind === "overheat") t.temperatureC = 44;
      if (prev?.kind === "battery") t.batteryPct = Math.max(t.batteryPct, 72);
      if (t.asset === "station") runtime.setStatusLamp(id, "nominal");
    }
  }

  setSpeedScale(id: string, scale: number, runtime: Runtime) {
    const s = clamp(scale, 0.25, 2.5);
    this.speedScales.set(id, s);
    runtime.setEntityControl(id, { speedScale: s });
    const t = this.telemetry.get(id);
    if (t) t.speedScale = s;
  }

  applyScenario(scenario: TwinScenario, runtime: Runtime) {
    this.scenario = scenario;
    const all = Array.from(this.telemetry.values());

    if (scenario === "nominal") {
      for (const t of all) {
        this.clearFault(t.id, runtime);
        this.setSpeedScale(t.id, 1, runtime);
        t.batteryPct = Math.max(t.batteryPct, 82);
        t.temperatureC = Math.min(t.temperatureC, 42);
      }
      this.pushAlert("facility", "Facility", "info", "Nominal Operations", "All faults cleared and fleet speeds normalized.");
      return;
    }

    if (scenario === "peak_rush") {
      for (const t of all) {
        this.clearFault(t.id, runtime);
        if (AUTOMATION_FLEET_ASSETS.has(t.asset ?? "") || t.asset === "humanoid") {
          this.setSpeedScale(t.id, 1.5, runtime);
        } else if (t.asset === "conveyor") {
          this.setSpeedScale(t.id, 1.35, runtime);
        }
      }
      this.pushAlert("facility", "Facility", "warning", "Peak Rush Dispatch", "Fleet & robotic workcells running at 1.5× cadence.");
      return;
    }

    if (scenario === "conveyor_jam") {
      const conv = all.find((t) => t.asset === "conveyor");
      if (conv) {
        this.injectFault(conv.id, "jam", runtime);
      } else if (all[0]) {
        this.injectFault(all[0].id, "jam", runtime);
      }
      return;
    }

    if (scenario === "low_battery") {
      const powered = all.filter((t) => BATTERY_ASSETS.has(t.asset ?? ""));
      powered.forEach((r, idx) => {
        this.clearFault(r.id, runtime);
        r.batteryPct = idx === 0 ? 11 : 19 + idx * 5;
        r.status = "warning";
        this.pushAlert(r.id, r.label, "warning", "Low Battery Reserve", `Charge at ${r.batteryPct.toFixed(0)}% — route to CHG bay.`);
      });
    }
  }

  /** Syncs telemetry state cleanly from live Runtime + SceneObjects. */
  tick(
    dt: number,
    runtime: Runtime,
    objects: SceneObjectData[],
    worlds: Map<string, THREE.Matrix4>,
    playing: boolean,
    paused: boolean,
  ) {
    const active = playing && !paused;
    if (active) this.simUptime += dt;

    const presentIds = new Set<string>();
    const nowMs = Date.now();

    for (const o of objects) {
      if (o.kind !== "model") continue;
      presentIds.add(o.id);

      let t = this.telemetry.get(o.id);
      if (!t) {
        const seedOffset = (o.label.charCodeAt(0) % 7) * 2.1;
        t = {
          id: o.id,
          label: o.label,
          asset: o.asset,
          kind: o.kind,
          status: "nominal",
          utilizationPct: 0,
          speedMps: 0,
          batteryPct: BATTERY_ASSETS.has(o.asset ?? "") ? Math.round(78 + (seedOffset % 18)) : 100,
          temperatureC: 34 + (seedOffset % 6),
          powerKw: 0.08,
          cyclesCompleted: 0,
          carrying: false,
          currentTask: "Standby",
          faultReason: null,
          speedScale: this.speedScales.get(o.id) ?? 1,
          history: [],
          trail: [],
          goal: null,
        };
        this.telemetry.set(o.id, t);
      } else {
        t.label = o.label;
      }

      const entity: Entity | undefined = runtime.byId.get(o.id);
      const scale = this.speedScales.get(o.id) ?? 1;
      t.speedScale = scale;

      if (entity) {
        const faulted = this.faults.has(o.id);
        if (Boolean(entity.faulted) !== faulted || (entity.speedScale ?? 1) !== scale) {
          runtime.setEntityControl(o.id, { faulted, speedScale: scale });
        }
      }

      let pos: Vec3 = o.position;
      if (entity) {
        pos = [entity.pos.x, entity.pos.y, entity.pos.z];
      } else {
        const wm = worlds.get(o.id);
        if (wm) {
          wm.decompose(_p, _q, _s);
          pos = [_p.x, _p.y, _p.z];
        }
      }

      const prev = this.prevPos.get(o.id);
      let speedMps = 0;
      if (active && prev && dt > 1e-4) {
        const distXZ = Math.hypot(pos[0] - prev[0], pos[2] - prev[2]);
        const dist3D = Math.hypot(pos[0] - prev[0], pos[1] - prev[1], pos[2] - prev[2]);
        speedMps = (o.asset === "drone" ? dist3D : distXZ) / dt;
        if (MOBILE_FLEET_ASSETS.has(o.asset ?? "")) {
          const minStep = o.asset === "truck" ? 0.45 : o.asset === "drone" ? 0.35 : 0.22;
          const trailY = o.asset === "drone" ? Math.max(0.05, pos[1] - 0.08) : 0.03;
          const lastTrail = t.trail[t.trail.length - 1];
          if (!lastTrail || Math.hypot(pos[0] - lastTrail[0], pos[2] - lastTrail[2]) > minStep) {
            t.trail.push([pos[0], trailY, pos[2]]);
            if (t.trail.length > MAX_TRAIL) t.trail.shift();
          }
        }
      }
      this.prevPos.set(o.id, pos);

      const carryingNow = Boolean(entity?.carrying);
      const wasCarrying = this.prevCarrying.get(o.id) ?? false;
      t.carrying = carryingNow;
      if (!wasCarrying && carryingNow) {
        this.cycleStart.set(o.id, this.simUptime);
      } else if (wasCarrying && !carryingNow) {
        t.cyclesCompleted++;
        const started = this.cycleStart.get(o.id);
        if (started !== undefined) {
          this.cycleTimes.push(Math.max(1, this.simUptime - started));
          if (this.cycleTimes.length > 20) this.cycleTimes.shift();
        }
      }
      this.prevCarrying.set(o.id, carryingNow);

      if (entity?.script) {
        const pPc = this.prevPc.get(o.id) ?? 0;
        if (entity.script.pc < pPc && !wasCarrying && MONITORED_ASSETS.has(o.asset ?? "")) {
          t.cyclesCompleted++;
        }
        this.prevPc.set(o.id, entity.script.pc);
      }

      if (entity?.mover?.goal && !this.faults.has(o.id)) {
        const goalY = o.asset === "drone" ? Math.max(0.05, pos[1]) : 0.04;
        t.goal = [entity.mover.goal.x, goalY, entity.mover.goal.z];
      } else {
        t.goal = null;
      }

      if (active && entity?.belt && !this.faults.has(o.id)) {
        speedMps = entity.belt.speed * scale;
      }

      const fault = this.faults.get(o.id);
      if (fault) {
        t.speedMps = 0;
        t.utilizationPct = 0;
        t.powerKw = 0.04;
        t.status = "fault";
        t.faultReason = fault.reason;
        t.currentTask = `HALTED · ${fault.reason}`;
      } else {
        t.faultReason = null;
        if (o.asset === "robot") {
          t.speedMps = active ? t.speedMps * 0.65 + speedMps * 0.35 : 0;
          const targetUtil = !active ? 8 : speedMps > 0.05 ? clamp((speedMps / 1.4) * 92, 35, 98) : 28;
          t.utilizationPct += (targetUtil - t.utilizationPct) * Math.min(1, dt * 3);
          t.powerKw = active ? 0.22 + t.speedMps * 0.48 + (carryingNow ? 0.18 : 0) : 0.06;

          if (active) {
            const drain = this.scenario === "low_battery" ? 0.45 : 0.07;
            t.batteryPct = clamp(t.batteryPct - drain * (0.6 + t.utilizationPct / 100) * dt, 0, 100);
          }
          const targetTemp = active
            ? 36 + t.utilizationPct * 0.24 + (this.scenario === "peak_rush" ? 8 : 0)
            : 31;
          t.temperatureC += (targetTemp - t.temperatureC) * Math.min(1, dt * 0.6);

          if (t.batteryPct <= 3 && active) {
            this.injectFault(o.id, "battery", runtime);
          } else if (t.batteryPct < 18) {
            t.status = "warning";
            this.pushAlert(o.id, t.label, "warning", "Low Battery Reserve", `${t.batteryPct.toFixed(0)}% remaining`);
          } else if (t.temperatureC >= 72) {
            t.status = "warning";
            this.pushAlert(o.id, t.label, "warning", "Elevated Drive Temp", `${t.temperatureC.toFixed(1)}°C`);
          } else {
            t.status = "nominal";
          }
          t.currentTask = describeTask(entity, playing, paused);
        } else if (o.asset === "drone") {
          t.speedMps = active ? t.speedMps * 0.6 + speedMps * 0.4 : 0;
          const targetUtil = !active ? 6 : clamp((speedMps / 2.4) * 86, 42, 96);
          t.utilizationPct += (targetUtil - t.utilizationPct) * Math.min(1, dt * 3);
          t.powerKw = active ? 0.34 + t.speedMps * 0.22 : 0.04;
          if (active) {
            const drain = this.scenario === "low_battery" ? 0.52 : 0.1;
            t.batteryPct = clamp(t.batteryPct - drain * (0.7 + t.utilizationPct / 100) * dt, 0, 100);
          }
          const targetTemp = active ? 38 + t.utilizationPct * 0.26 : 29;
          t.temperatureC += (targetTemp - t.temperatureC) * Math.min(1, dt * 0.6);
          if (t.batteryPct <= 3 && active) {
            this.injectFault(o.id, "battery", runtime);
          } else if (t.batteryPct < 18) {
            t.status = "warning";
            this.pushAlert(o.id, t.label, "warning", "Drone Reserve Low", `${t.batteryPct.toFixed(0)}% · RTL pending`);
          } else {
            t.status = t.temperatureC >= 72 ? "warning" : "nominal";
          }
          const task = describeTask(entity, playing, paused);
          t.currentTask = pos[1] > 0.2 ? `Alt ${pos[1].toFixed(1)}m · ${task}` : task;
        } else if (o.asset === "robot_arm") {
          t.speedMps = active ? 0.75 * scale : 0;
          const targetUtil = active ? clamp(76 * scale, 30, 96) : 6;
          t.utilizationPct += (targetUtil - t.utilizationPct) * Math.min(1, dt * 2.5);
          t.powerKw = active ? 0.82 * scale : 0.09;
          const targetTemp = active ? 41 + t.utilizationPct * 0.2 : 30;
          t.temperatureC += (targetTemp - t.temperatureC) * Math.min(1, dt * 0.5);
          t.status = t.temperatureC >= 72 ? "warning" : "nominal";
          t.currentTask = describeTask(entity, playing, paused);
        } else if (o.asset === "robot_transfer") {
          t.speedMps = active ? 0.9 * scale : 0;
          const targetUtil = active ? clamp(68 * scale, 25, 95) : 6;
          t.utilizationPct += (targetUtil - t.utilizationPct) * Math.min(1, dt * 2.5);
          t.powerKw = active ? 0.95 * scale : 0.11;
          const targetTemp = active ? 39 + t.utilizationPct * 0.19 : 29;
          t.temperatureC += (targetTemp - t.temperatureC) * Math.min(1, dt * 0.5);
          t.status = t.temperatureC >= 72 ? "warning" : "nominal";
          t.currentTask = describeTask(entity, playing, paused);
        } else if (o.asset === "humanoid") {
          t.speedMps = active ? t.speedMps * 0.65 + speedMps * 0.35 : 0;
          const targetUtil = active ? (speedMps > 0.05 ? 68 : 34) : 0;
          t.utilizationPct += (targetUtil - t.utilizationPct) * Math.min(1, dt * 2.5);
          t.powerKw = 0;
          t.temperatureC = 36.8;
          t.status = "nominal";
          t.currentTask = active ? describeTask(entity, playing, paused) : "Shift Standby";
        } else if (o.asset === "truck") {
          t.speedMps = active ? t.speedMps * 0.65 + speedMps * 0.35 : 0;
          const targetUtil = active ? (speedMps > 0.08 ? 78 : 42) : 0;
          t.utilizationPct += (targetUtil - t.utilizationPct) * Math.min(1, dt * 2.5);
          t.powerKw = active && speedMps > 0.08 ? 1.45 : 0.08;
          t.temperatureC += ((active ? 44 : 28) - t.temperatureC) * Math.min(1, dt * 0.4);
          t.status = "nominal";
          t.currentTask = active && speedMps <= 0.08 ? "Docked · Bay D-2" : describeTask(entity, playing, paused);
        } else if (o.asset === "conveyor") {
          t.speedMps = active && entity?.belt ? entity.belt.speed * scale : 0;
          const targetUtil = active && entity?.belt ? clamp(54 * scale, 20, 96) : 5;
          t.utilizationPct += (targetUtil - t.utilizationPct) * Math.min(1, dt * 2.5);
          t.powerKw = active ? 0.65 + t.speedMps * 0.85 : 0.1;
          const targetTemp = active ? 39 + t.utilizationPct * 0.22 : 30;
          t.temperatureC += (targetTemp - t.temperatureC) * Math.min(1, dt * 0.5);
          t.status = t.temperatureC > 72 ? "warning" : "nominal";
          t.currentTask = active && entity?.belt
            ? `Belt active · ${t.speedMps.toFixed(2)} m/s`
            : paused ? "Belt paused" : "Standby";
        } else if (o.asset === "station") {
          const targetUtil = active ? 62 : 10;
          t.utilizationPct += (targetUtil - t.utilizationPct) * Math.min(1, dt * 2);
          t.powerKw = active ? 1.15 : 0.18;
          t.temperatureC += ((active ? 41 : 31) - t.temperatureC) * Math.min(1, dt * 0.4);
          t.status = t.temperatureC >= 70 ? "warning" : "nominal";
          t.currentTask = active ? "Workstation Online · Tower Active" : "Station Standby";
        } else if (o.asset === "charger") {
          const targetUtil = active ? 52 : 8;
          t.utilizationPct += (targetUtil - t.utilizationPct) * Math.min(1, dt * 2);
          t.powerKw = active ? 3.2 : 0.08;
          t.temperatureC += ((active ? 38 : 27) - t.temperatureC) * Math.min(1, dt * 0.4);
          t.status = "nominal";
          t.currentTask = active ? "Inductive Dock Ready · 3.2 kW" : "Charger Standby";
        } else {
          t.speedMps = 0;
          t.utilizationPct = active ? 45 : 0;
          t.powerKw = 0;
          t.status = "nominal";
          t.currentTask = o.asset === "rack" ? "Storage bay static" : carryingNow ? "In transit (AMR)" : "Stored inventory";
        }
      }

      // Apply live WebSocket stream override if recent (< 15s)
      const ov = this.streamOverrides.get(o.id) ?? this.streamOverrides.get(o.label);
      if (ov && ov.expiresAt > nowMs) {
        if (ov.status) t.status = ov.status;
        if (ov.speedMps !== undefined) t.speedMps = ov.speedMps;
        if (ov.batteryPct !== undefined) t.batteryPct = ov.batteryPct;
        if (ov.temperatureC !== undefined) t.temperatureC = ov.temperatureC;
        if (ov.utilizationPct !== undefined) t.utilizationPct = ov.utilizationPct;
        if (ov.powerKw !== undefined) t.powerKw = ov.powerKw;
        if (ov.currentTask) t.currentTask = ov.currentTask;
        if (ov.faultReason !== undefined) t.faultReason = ov.faultReason;
        if (ov.pos) {
          const n = runtime.nodes.get(o.id);
          if (n) {
            n.group.position.set(ov.pos[0], ov.pos[1], ov.pos[2]);
            if (ov.yaw !== undefined) n.group.rotation.y = ov.yaw;
          }
        }
      }

      if (o.asset === "station") {
        runtime.setStatusLamp(o.id, t.status);
      }
    }

    for (const id of this.telemetry.keys()) {
      if (!presentIds.has(id)) {
        this.telemetry.delete(id);
        this.faults.delete(id);
        this.prevPos.delete(id);
      }
    }

    this.sampleAccum += dt;
    if (this.sampleAccum >= 0.5) {
      this.sampleAccum = 0;
      for (const t of this.telemetry.values()) {
        t.history.push({
          speed: Number(t.speedMps.toFixed(2)),
          temp: Number(t.temperatureC.toFixed(1)),
          util: Math.round(t.utilizationPct),
        });
        if (t.history.length > MAX_HISTORY) t.history.shift();
      }
    }

    const fleetUnits = Array.from(this.telemetry.values()).filter((t) => AUTOMATION_FLEET_ASSETS.has(t.asset ?? ""));
    const monitored = Array.from(this.telemetry.values()).filter((t) => MONITORED_ASSETS.has(t.asset ?? ""));
    const activeRobots = fleetUnits.filter((r) => active && r.status !== "fault").length;
    const avgUtil = monitored.length
      ? monitored.reduce((s, m) => s + m.utilizationPct, 0) / monitored.length
      : 0;
    const totalPowerKw = monitored.reduce((s, m) => s + m.powerKw, 0);
    const totalCycles = monitored.reduce((s, r) => s + r.cyclesCompleted, 0) + runtime.deliveries;
    const uptimeHr = Math.max(this.simUptime / 3600, 1 / 120);
    const throughputPerHr = active || totalCycles > 0 ? Math.round(totalCycles / uptimeHr) : 0;
    const avgCycleSec = this.cycleTimes.length
      ? this.cycleTimes.reduce((a, b) => a + b, 0) / this.cycleTimes.length
      : activeRobots > 0 ? 11.4 : 0;

    this.kpis = {
      throughputPerHr,
      activeRobots,
      totalRobots: fleetUnits.length,
      avgUtilizationPct: Math.round(avgUtil),
      avgCycleSec: Number(avgCycleSec.toFixed(1)),
      totalPowerKw: Number(totalPowerKw.toFixed(2)),
      activeAlerts: this.alerts.filter((a) => !a.acknowledged).length,
      uptimeSec: Math.floor(this.simUptime),
      totalPickups: runtime.pickups,
      totalDeliveries: runtime.deliveries,
    };

    if (active) {
      this.replayAccum += dt;
      if (this.replayAccum >= REPLAY_INTERVAL) {
        this.replayAccum = 0;
        const entities: Record<string, ReplayEntityPose> = {};
        for (const e of runtime.byId.values()) {
          if (e.staticSource && !e.promoted) continue;
          const t = this.telemetry.get(e.id);
          entities[e.id] = {
            pos: [e.pos.x, e.pos.y, e.pos.z],
            yaw: e.yaw,
            lift: e.lift?.value ?? 0,
            carrying: Boolean(e.carrying),
            status: t?.status ?? "nominal",
          };
        }
        this.replayFrames.push({
          timeSec: Number(this.simUptime.toFixed(1)),
          entities,
          kpis: { ...this.kpis },
        });
        if (this.replayFrames.length > MAX_REPLAY_FRAMES) this.replayFrames.shift();
      }
    }
  }

  // ---------------------------------------------------------------- WebSocket live stream
  connectStream(url: string, onStatus: (s: StreamStatus, detail?: string) => void) {
    this.disconnectStream();
    if (!url.trim()) return;
    this.streamStatus = "connecting";
    onStatus("connecting");
    try {
      const ws = new WebSocket(url.trim());
      this.ws = ws;
      ws.onopen = () => {
        this.streamStatus = "connected";
        onStatus("connected");
      };
      ws.onerror = () => {
        this.streamStatus = "error";
        onStatus("error", "WebSocket connection failed");
      };
      ws.onclose = () => {
        if (this.streamStatus !== "error") this.streamStatus = "disconnected";
        this.ws = null;
        onStatus(this.streamStatus);
      };
      ws.onmessage = (ev) => {
        try {
          const payload = JSON.parse(String(ev.data));
          const list = Array.isArray(payload)
            ? payload
            : Array.isArray(payload?.entities)
              ? payload.entities
              : Array.isArray(payload?.telemetry)
                ? payload.telemetry
                : [payload];
          const exp = Date.now() + 15000;
          for (const item of list) {
            const key = item?.id ?? item?.label;
            if (!key || typeof key !== "string") continue;
            this.streamOverrides.set(key, {
              status: item.status,
              speedMps: typeof item.speedMps === "number" ? item.speedMps : undefined,
              batteryPct: typeof item.batteryPct === "number" ? item.batteryPct : undefined,
              temperatureC: typeof item.temperatureC === "number" ? item.temperatureC : undefined,
              utilizationPct: typeof item.utilizationPct === "number" ? item.utilizationPct : undefined,
              powerKw: typeof item.powerKw === "number" ? item.powerKw : undefined,
              currentTask: typeof item.currentTask === "string" ? item.currentTask : undefined,
              faultReason: item.faultReason,
              pos: Array.isArray(item.position) && item.position.length === 3 ? item.position : undefined,
              yaw: typeof item.yaw === "number" ? item.yaw : undefined,
              expiresAt: exp,
            });
          }
        } catch {
          // Ignore malformed external frames
        }
      };
    } catch {
      this.streamStatus = "error";
      onStatus("error", "Invalid WebSocket URL");
    }
  }

  disconnectStream() {
    if (this.ws) {
      this.ws.onclose = null;
      this.ws.close();
      this.ws = null;
    }
    this.streamOverrides.clear();
    this.streamStatus = "disconnected";
  }
}

function describeTask(entity: Entity | undefined, playing: boolean, paused: boolean): string {
  if (!playing) return "Standby (Simulation idle)";
  if (paused) return "Paused";
  if (!entity?.script) return "Manual / Idle";
  if (entity.script.done) return "Cycle complete";
  const ins = entity.script.program[entity.script.pc];
  if (!ins) return "Idle";
  switch (ins.op) {
    case "goto":
      return ins.label ? `Transit → ${ins.label}` : `Transit → [${ins.x.toFixed(1)}, ${ins.z.toFixed(1)}]`;
    case "face":
      return `Aligning → ${ins.label}`;
    case "turn":
      return `Rotating ${ins.deg}°`;
    case "lift":
      return `Lift → ${ins.value.toFixed(2)} m`;
    case "alt":
      return `Cruise Alt → ${ins.value.toFixed(1)} m`;
    case "joint":
      return `Joint ${ins.name.replace(/_/g, " ")} → ${ins.value.toFixed(2)}`;
    case "pick":
      return `Picking ${ins.query}`;
    case "place":
      return `Placing → ${ins.label}`;
    case "wait":
      return `Dwell ${entity.script.timer.toFixed(1)}s`;
    case "belt":
      return `Conveying (${ins.speed.toFixed(2)} m/s)`;
    case "halt":
      return "Halted";
    default:
      return "Executing loop";
  }
}
