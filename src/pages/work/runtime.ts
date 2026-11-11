import * as THREE from "three";
import type { SceneObjectData } from "../../lib/workTypes";
import { World } from "./ecs";
import { applyJoint, type JointRig } from "./rig";
import { parseScript, type Instr } from "./script";

// ---------------------------------------------------------------------------
// Components. An entity has only the ones that apply to it:
//   mover    - can drive (any scripted object)         lift     - has a prismatic lift joint
//   script   - program + interpreter state             carrying / carriedBy - pick & place link
//   belt     - acts as a conveyor                      movable  - can be picked / carried by a belt
//   ctl      - the runtime (not the editor) owns its transform now
// ---------------------------------------------------------------------------
export interface Entity {
  id: string;
  label: string;
  asset: string | null;
  pos: THREE.Vector3;           // world position
  yaw: number;                  // radians about +Y (forward is +X)
  scale: number;
  node?: THREE.Object3D;        // render node (dynamic objects only)
  rig?: JointRig[];
  staticSource?: boolean;       // still lives inside an instanced batch
  promoted?: boolean;           // was static, now rendered as its own node
  movable?: true;
  ctl?: true;
  mover?: { speed: number; turnRate: number; goal: { x: number; z: number } | null; faceYaw: number | null };
  lift?: { value: number; target: number; min: number; max: number; speed: number };
  script?: { program: Instr[]; pc: number; loops: { start: number; remaining: number }[]; timer: number; active: boolean; done: boolean };
  carrying?: Entity;
  carriedBy?: Entity;
  belt?: { speed: number; length: number; width: number; top: number };
}

const REACH = 1.8;       // m, horizontal pick/place reach
const PLACE_REACH = 2.6;
const V_TOL = 0.35;      // m, vertical tolerance when picking
const CARRY_H = 0.156;   // m, platform top above the robot origin
const WHEEL_R = 0.05;
const TRACK = 0.25;      // m, wheel offset from the centreline
const TAU = Math.PI * 2;
const wrap = (a: number) => { a = ((a + Math.PI) % TAU + TAU) % TAU - Math.PI; return a; };
const MOTION_OPS = new Set(["goto", "face", "turn", "lift", "pick", "place"]);

const _m = new THREE.Matrix4();
const _inv = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3();
const _p = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);
const _eu = new THREE.Euler();

export class Runtime {
  world = new World<Entity>();
  byId = new Map<string, Entity>();
  nodes = new Map<string, { group: THREE.Object3D; rig: JointRig[] }>();
  logs: string[] = [];
  logVersion = 0;
  running = false;
  time = 0;
  onPromote?: (id: string) => void;
  private lastLog = new Map<string, number>();

  // ------------------------------------------------------------------ lifecycle
  start(
    objects: SceneObjectData[], worlds: Map<string, THREE.Matrix4>, staticIds: Set<string>,
    onPromote?: (id: string) => void,
  ) {
    this.stop();
    this.onPromote = onPromote;
    this.running = true;
    this.time = 0;
    this.logs = [];
    this.logVersion++;
    for (const o of objects) {
      if (o.kind !== "model") continue;
      const w = worlds.get(o.id);
      if (!w) continue;
      w.decompose(_p, _q, _s);
      const e: Entity = {
        id: o.id, label: o.label, asset: o.asset, pos: _p.clone(),
        yaw: _eu.setFromQuaternion(_q, "YXZ").y, scale: _s.x,
      };
      const isStatic = staticIds.has(o.id);
      if (isStatic) e.staticSource = true;
      this.world.add(e);
      if (!isStatic) this.flag(e, "movable");
      this.byId.set(o.id, e);
      const n = this.nodes.get(o.id);
      if (n && !isStatic) { e.node = n.group; e.rig = n.rig; }

      if (o.script?.trim()) {
        const { program, errors } = parseScript(o.script);
        if (errors.length) {
          for (const er of errors) this.log(`${o.label} line ${er.line}: ${er.message}`);
          continue;
        }
        if (isStatic && program.some((i) => MOTION_OPS.has(i.op))) {
          this.log(`${o.label} is static, so it can't move — untick Static to animate it`);
        }
        this.world.set(e, "mover", { speed: 1, turnRate: 2.5, goal: null, faceYaw: null });
        this.world.set(e, "script", { program, pc: 0, loops: [], timer: 0, active: false, done: false });
        if (!isStatic) this.flag(e, "ctl");
      }
    }
    for (const e of this.world.entities()) this.setupJoints(e);
  }

  stop() {
    this.running = false;
    this.world.clear();
    this.byId.clear();
  }

  /** Called by the renderer whenever a dynamic object's node (re)mounts. */
  attach(id: string, group: THREE.Object3D, rig: JointRig[]) {
    this.nodes.set(id, { group, rig });
    const e = this.byId.get(id);
    if (e) { e.node = group; e.rig = rig; this.setupJoints(e); }
  }
  detach(id: string, group?: THREE.Object3D) {
    const n = this.nodes.get(id);
    if (n && (!group || n.group === group)) this.nodes.delete(id);
    const e = this.byId.get(id);
    if (e && (!group || e.node === group)) { e.node = undefined; e.rig = undefined; }
  }

  private setupJoints(e: Entity) {
    if (!e.rig || e.lift || !e.mover) return;
    const lift = e.rig.find((r) => r.def.type === "prismatic");
    if (lift) this.world.set(e, "lift", { value: 0, target: 0, min: lift.def.lower, max: lift.def.upper, speed: 0.15 });
  }

  log(msg: string) {
    const last = this.lastLog.get(msg);
    if (last !== undefined && this.time - last < 3) return;
    this.lastLog.set(msg, this.time);
    this.logs.push(`[${this.time.toFixed(1)}s] ${msg}`);
    if (this.logs.length > 80) this.logs.shift();
    this.logVersion++;
  }

  // ------------------------------------------------------------------ tick
  tick(dt: number) {
    if (!this.running || dt <= 0) return;
    this.time += dt;
    for (const e of this.world.with("script", "mover")) if (!e.script!.done) this.step(e, dt);
    this.motion(dt);
    this.lifts(dt);
    this.carry();
    this.belts(dt);
    this.sync();
  }

  // ------------------------------------------------------------------ script interpreter
  private find(label: string, from: Entity): Entity | null {
    const key = label.toLowerCase();
    let best: Entity | null = null, bd = Infinity;
    for (const e of this.world.entities()) {
      if (e === from) continue;
      if (e.label.toLowerCase() !== key && e.asset?.toLowerCase() !== key) continue;
      const d = e.pos.distanceToSquared(from.pos);
      if (d < bd) { bd = d; best = e; }
    }
    return best;
  }

  private step(e: Entity, dt: number) {
    const s = e.script!, m = e.mover!;
    for (let guard = 0; guard < 32; guard++) {
      const ins = s.program[s.pc];
      if (!ins) { s.done = true; return; }
      switch (ins.op) {
        case "speed": m.speed = ins.value; s.pc++; break;
        case "loop": s.loops.push({ start: s.pc, remaining: ins.count }); s.pc++; break;
        case "end": {
          const top = s.loops[s.loops.length - 1];
          if (!top) { s.pc++; break; }
          top.remaining--;
          if (top.remaining > 0) s.pc = top.start + 1; else { s.loops.pop(); s.pc++; }
          break;
        }
        case "halt": s.done = true; return;
        case "belt":
          this.world.set(e, "belt", { speed: ins.speed, length: ins.length, width: ins.width, top: ins.top });
          s.pc++; break;
        case "wait":
          if (!s.active) { s.timer = ins.seconds; s.active = true; }
          s.timer -= dt;
          if (s.timer <= 0) { s.active = false; s.pc++; break; }
          return;
        case "goto": {
          if (!s.active) {
            let x = ins.x, z = ins.z;
            if (ins.label) {
              const t = this.find(ins.label, e);
              if (!t) { this.log(`${e.label}: goto '${ins.label}' — no such object`); s.pc++; break; }
              x = t.pos.x + ins.dx; z = t.pos.z + ins.dz;
            }
            m.goal = { x, z }; s.active = true;
          }
          if (m.goal === null) { s.active = false; s.pc++; break; }
          return;
        }
        case "face": {
          if (!s.active) {
            const t = this.find(ins.label, e);
            if (!t) { this.log(`${e.label}: face '${ins.label}' — no such object`); s.pc++; break; }
            m.faceYaw = Math.atan2(-(t.pos.z - e.pos.z), t.pos.x - e.pos.x); s.active = true;
          }
          if (m.faceYaw === null) { s.active = false; s.pc++; break; }
          return;
        }
        case "turn":
          if (!s.active) { m.faceYaw = wrap(e.yaw + (ins.deg * Math.PI) / 180); s.active = true; }
          if (m.faceYaw === null) { s.active = false; s.pc++; break; }
          return;
        case "lift": {
          if (!e.lift) { this.log(`${e.label}: no lift joint — 'lift' ignored`); s.pc++; break; }
          if (!s.active) { e.lift.target = Math.min(e.lift.max, Math.max(e.lift.min, ins.value)); s.active = true; }
          if (Math.abs(e.lift.value - e.lift.target) < 1e-3) { s.active = false; s.pc++; break; }
          return;
        }
        case "pick": {
          s.pc++;
          if (e.carrying) { this.log(`${e.label}: already carrying something`); break; }
          const it = this.findItem(e, ins.query);
          if (!it) { this.log(`${e.label}: pick '${ins.query}' — nothing in reach (check position and lift height)`); break; }
          this.grab(e, it);
          break;
        }
        case "place": {
          s.pc++;
          const it = e.carrying;
          if (!it) { this.log(`${e.label}: place with nothing carried`); break; }
          const t = this.find(ins.label, e);
          if (!t) { this.log(`${e.label}: place '${ins.label}' — no such object`); break; }
          if (Math.hypot(t.pos.x - e.pos.x, t.pos.z - e.pos.z) > PLACE_REACH) {
            this.log(`${e.label}: '${ins.label}' is out of reach for place`); break;
          }
          it.pos.set(t.pos.x + ins.dx, t.pos.y + ins.dy, t.pos.z + ins.dz);
          this.release(e, it);
          break;
        }
      }
    }
  }

  private findItem(carrier: Entity, query: string): Entity | null {
    const key = query.toLowerCase();
    const platformY = carrier.pos.y + CARRY_H * carrier.scale + (carrier.lift?.value ?? 0);
    let best: Entity | null = null, bd = Infinity;
    for (const it of this.world.entities()) {
      if (it === carrier || it.mover || it.carriedBy) continue;
      if (it.label.toLowerCase() !== key && it.asset?.toLowerCase() !== key) continue;
      const d = Math.hypot(it.pos.x - carrier.pos.x, it.pos.z - carrier.pos.z);
      if (d > REACH || Math.abs(it.pos.y - platformY) > V_TOL) continue;
      if (d < bd) { bd = d; best = it; }
    }
    return best;
  }

  private grab(carrier: Entity, it: Entity) {
    this.world.set(carrier, "carrying", it);
    this.world.set(it, "carriedBy", carrier);
    this.flag(it, "ctl");
    this.flag(it, "movable");
    if (it.staticSource && !it.promoted) {   // leave its instanced batch and become a real node
      it.promoted = true;
      this.onPromote?.(it.id);
    }
  }

  private flag(e: Entity, key: "ctl" | "movable") {
    if (!e[key]) this.world.set(e, key, true);
  }

  private release(carrier: Entity, it: Entity) {
    this.world.unset(carrier, "carrying");
    this.world.unset(it, "carriedBy");
  }

  // ------------------------------------------------------------------ systems
  private motion(dt: number) {
    for (const e of this.world.with("mover")) {
      const m = e.mover!;
      let dist = 0, dyaw = 0;
      if (m.faceYaw !== null) {
        const err = wrap(m.faceYaw - e.yaw), step = m.turnRate * dt;
        if (Math.abs(err) <= step) { e.yaw = m.faceYaw; dyaw = err; m.faceYaw = null; }
        else { dyaw = Math.sign(err) * step; e.yaw += dyaw; }
      } else if (m.goal) {
        const dx = m.goal.x - e.pos.x, dz = m.goal.z - e.pos.z, d = Math.hypot(dx, dz);
        if (d < 0.03) m.goal = null;
        else {
          const err = wrap(Math.atan2(-dz, dx) - e.yaw);
          dyaw = Math.max(-m.turnRate * dt, Math.min(m.turnRate * dt, err));
          e.yaw += dyaw;
          if (Math.abs(wrap(Math.atan2(-dz, dx) - e.yaw)) < 0.35) {
            dist = Math.min(m.speed * dt, d);
            e.pos.x += Math.cos(e.yaw) * dist;
            e.pos.z -= Math.sin(e.yaw) * dist;
          }
        }
      }
      if ((dist || dyaw) && e.rig) {
        for (const r of e.rig) {
          if (!r.def.name.startsWith("wheel")) continue;
          const v = dist + dyaw * TRACK * r.side;   // left wheel (+Z) speeds up when turning counter-clockwise
          applyJoint(r, r.value + (v / WHEEL_R) * r.spinSign);
        }
      }
    }
  }

  private lifts(dt: number) {
    for (const e of this.world.with("lift")) {
      const l = e.lift!;
      const diff = l.target - l.value, step = l.speed * dt;
      if (Math.abs(diff) <= step) l.value = l.target; else l.value += Math.sign(diff) * step;
      const r = e.rig?.find((x) => x.def.type === "prismatic");
      if (r) applyJoint(r, l.value);
    }
  }

  private carry() {
    for (const e of this.world.with("carrying")) {
      const it = e.carrying!;
      it.pos.set(e.pos.x, e.pos.y + CARRY_H * e.scale + (e.lift?.value ?? 0), e.pos.z);
      it.yaw = e.yaw;
    }
  }

  private belts(dt: number) {
    const belts = this.world.with("belt");
    if (!belts.length) return;
    for (const b of belts) {
      const cfg = b.belt!;
      const dx = Math.cos(b.yaw), dz = -Math.sin(b.yaw);   // belt direction (local +X)
      const top = b.pos.y + cfg.top;
      // everything resting on this belt, with its position along / across it
      const onBelt: { it: Entity; along: number; across: number }[] = [];
      for (const it of this.world.with("movable")) {
        if (it === b || it.mover || it.carriedBy) continue;
        const rx = it.pos.x - b.pos.x, rz = it.pos.z - b.pos.z;
        const along = rx * dx + rz * dz, across = rx * -dz + rz * dx;
        if (Math.abs(across) > cfg.width / 2 || Math.abs(along) > cfg.length / 2 || Math.abs(it.pos.y - top) > 0.15) continue;
        onBelt.push({ it, along, across });
      }
      // front-most first: each item stops one tote-length behind the one ahead, so they queue at the end
      onBelt.sort((a, c) => c.along - a.along);
      let limit = cfg.length / 2 - 0.3;
      for (const e of onBelt) {
        // never slide backwards: on a full belt an item simply waits (or overlaps) instead of being pushed off
        const along = Math.max(e.along, Math.min(e.along + cfg.speed * dt, limit));
        limit = along - 0.65;
        e.it.pos.set(b.pos.x + dx * along - dz * e.across, top, b.pos.z + dz * along + dx * e.across);
        this.flag(e.it, "ctl");
      }
    }
  }

  /** Writes runtime-owned transforms to the render nodes (world -> the node's local space). */
  private sync() {
    for (const e of this.world.with("ctl")) {
      const n = e.node;
      if (!n?.parent) continue;
      _q.setFromAxisAngle(_up, e.yaw);
      _m.compose(e.pos, _q, _s.setScalar(e.scale));
      n.parent.updateWorldMatrix(true, false);
      _inv.copy(n.parent.matrixWorld).invert();
      _m.premultiply(_inv).decompose(n.position, n.quaternion, n.scale);
    }
  }

  get entityCount() { return this.world.size; }
}
