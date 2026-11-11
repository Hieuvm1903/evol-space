import * as THREE from "three";
import type { LightProps, SceneObjectData, Vec3 } from "./workTypes";

const D2R = Math.PI / 180;
const R2D = 180 / Math.PI;
const _e = new THREE.Euler();
const _q = new THREE.Quaternion();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();

export const DEFAULT_LIGHT: LightProps = {
  type: "point", color: "#ffffff", intensity: 6, distance: 10, angle: 40, castShadow: false,
};

export function newId(): string {
  const c = (globalThis as any).crypto;
  return c?.randomUUID ? c.randomUUID() : `id-${Math.random().toString(36).slice(2)}-${Date.now().toString(36)}`;
}

export function localMatrix(
  o: Pick<SceneObjectData, "position" | "rotation" | "scale">, out = new THREE.Matrix4(),
): THREE.Matrix4 {
  _e.set(o.rotation[0] * D2R, o.rotation[1] * D2R, o.rotation[2] * D2R, "XYZ");
  _q.setFromEuler(_e);
  return out.compose(_p.set(o.position[0], o.position[1], o.position[2]), _q, _s.setScalar(o.scale));
}

/** World matrix of every object (parent chain applied). Cycles are tolerated (treated as roots). */
export function computeWorlds(objects: SceneObjectData[]): Map<string, THREE.Matrix4> {
  const byId = new Map(objects.map((o) => [o.id, o]));
  const out = new Map<string, THREE.Matrix4>();
  const visiting = new Set<string>();
  const get = (o: SceneObjectData): THREE.Matrix4 => {
    const hit = out.get(o.id);
    if (hit) return hit;
    let m = localMatrix(o);
    const parent = o.parentId ? byId.get(o.parentId) : undefined;
    if (parent && !visiting.has(o.id)) {
      visiting.add(o.id);
      m = new THREE.Matrix4().multiplyMatrices(get(parent), m);
      visiting.delete(o.id);
    }
    out.set(o.id, m);
    return m;
  };
  for (const o of objects) get(o);
  return out;
}

export function childrenIndex(objects: SceneObjectData[]): Map<string | null, string[]> {
  const ids = new Set(objects.map((o) => o.id));
  const idx = new Map<string | null, string[]>();
  for (const o of objects) {
    const key = o.parentId && ids.has(o.parentId) ? o.parentId : null;
    const list = idx.get(key);
    if (list) list.push(o.id); else idx.set(key, [o.id]);
  }
  return idx;
}

/** The object and everything below it. */
export function descendantsOf(objects: SceneObjectData[], id: string): Set<string> {
  const idx = childrenIndex(objects);
  const out = new Set<string>();
  const walk = (i: string) => {
    if (out.has(i)) return;
    out.add(i);
    for (const c of idx.get(i) ?? []) walk(c);
  };
  walk(id);
  return out;
}

/** Static = drawn by instancing and never moves. An object only counts if its whole ancestor
 *  chain is static too — otherwise it would drift away from a moving parent. */
export function effectiveStatic(objects: SceneObjectData[], enabled: boolean): Set<string> {
  const out = new Set<string>();
  if (!enabled) return out;
  const byId = new Map(objects.map((o) => [o.id, o]));
  const memo = new Map<string, boolean>();
  const es = (o: SceneObjectData, depth = 0): boolean => {
    const hit = memo.get(o.id);
    if (hit !== undefined) return hit;
    let r = o.static && o.kind !== "light";
    if (r && o.parentId && depth < 64) {
      const p = byId.get(o.parentId);
      if (p) r = es(p, depth + 1);
    }
    memo.set(o.id, r);
    return r;
  };
  for (const o of objects) if (es(o)) out.add(o.id);
  return out;
}

const r3 = (n: number) => Math.round(n * 1000) / 1000;
const r2 = (n: number) => Math.round(n * 100) / 100;

export function decomposeToData(m: THREE.Matrix4): { position: Vec3; rotation: Vec3; scale: number } {
  m.decompose(_p, _q, _s);
  _e.setFromQuaternion(_q, "XYZ");
  return {
    position: [r3(_p.x), r3(_p.y), r3(_p.z)],
    rotation: [r2(_e.x * R2D), r2(_e.y * R2D), r2(_e.z * R2D)],
    scale: r3((_s.x + _s.y + _s.z) / 3),
  };
}

/** A world matrix expressed relative to a parent's world matrix. */
export function toLocalData(world: THREE.Matrix4, parentWorld?: THREE.Matrix4) {
  if (!parentWorld) return decomposeToData(world);
  return decomposeToData(new THREE.Matrix4().multiplyMatrices(parentWorld.clone().invert(), world));
}

export function wouldCycle(objects: SceneObjectData[], id: string, newParentId: string | null): boolean {
  return !!newParentId && descendantsOf(objects, id).has(newParentId);
}

/** Move `id` under `newParentId` (or to the root) keeping its place in the world. */
export function reparent(
  objects: SceneObjectData[], id: string, newParentId: string | null, worlds: Map<string, THREE.Matrix4>,
): SceneObjectData[] {
  if (wouldCycle(objects, id, newParentId)) return objects;
  const world = worlds.get(id);
  if (!world) return objects;
  const data = toLocalData(world, newParentId ? worlds.get(newParentId) : undefined);
  return objects.map((o) => (o.id === id ? { ...o, parentId: newParentId, ...data } : o));
}

export function removeSubtree(objects: SceneObjectData[], id: string): SceneObjectData[] {
  const gone = descendantsOf(objects, id);
  return objects.filter((o) => !gone.has(o.id));
}

export function cloneSubtree(objects: SceneObjectData[], id: string, offset: Vec3 = [1, 0, 0]) {
  const ids = descendantsOf(objects, id);
  const map = new Map<string, string>();
  for (const i of ids) map.set(i, newId());
  const copies: SceneObjectData[] = [];
  for (const o of objects) {
    if (!ids.has(o.id)) continue;
    const isRoot = o.id === id;
    copies.push({
      ...o, id: map.get(o.id)!, joints: { ...o.joints },
      parentId: isRoot ? o.parentId : map.get(o.parentId!) ?? null,
      label: isRoot ? `${o.label}-copy` : o.label,
      position: isRoot ? [o.position[0] + offset[0], o.position[1] + offset[1], o.position[2] + offset[2]] : o.position,
    });
  }
  return { copies, rootId: map.get(id)! };
}

/** Accepts scene objects of any saved version (v1 had only { asset, position, rotationY, ... }). */
export function normalizeObject(raw: any): SceneObjectData {
  const kind = raw.kind ?? "model";
  const rotation: Vec3 = Array.isArray(raw.rotation) ? raw.rotation : [0, raw.rotationY ?? 0, 0];
  return {
    id: raw.id ?? newId(),
    kind,
    asset: raw.asset ?? null,
    label: raw.label ?? raw.asset ?? "object",
    parentId: raw.parentId ?? null,
    position: raw.position ?? [0, 0, 0],
    rotation,
    scale: raw.scale ?? 1,
    joints: raw.joints ?? {},
    static: !!raw.static,
    light: kind === "light" ? { ...DEFAULT_LIGHT, ...(raw.light ?? {}) } : undefined,
    script: raw.script,
  };
}
