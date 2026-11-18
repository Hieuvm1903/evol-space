import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { GizmoHelper, GizmoViewcube, OrbitControls, TransformControls } from "@react-three/drei";
import * as THREE from "three";
import { childrenIndex, descendantsOf } from "../../lib/sceneMath";
import type {
  AssetTelemetry,
  CameraMode,
  CameraPreset,
  CanvasBridge,
  JointDef,
  PerfStats,
  SceneObjectData,
  TwinOverlayPrefs,
  Vec3,
  ViewPrefs,
  WorkspaceMode,
  ZoneDef,
} from "../../lib/workTypes";
import { BASE_ORTHO_SPAN, BASE_PERSP_FOV, cameraLodParams, computeLodTier } from "./lodCompute";
import { updateOcclusionShaderUniforms } from "./occlusionShader";
import type { Runtime } from "./runtime";
import StaticBatches, { type LiveDrag, type PerfCounters } from "./StaticBatches";
import { DynNode, StaticProxy, type NodeCtx, type VisEntry } from "./SceneNodes";
import { StudioEnvironment, TwinCameraController, TwinOverlays } from "./TwinOverlays";
import type { TwinEngine } from "./twinEngine";

/** Keeps a canvas failure from blanking the whole page: shows the error and a retry button instead. */
class CanvasErrorBoundary extends React.Component<
  { children: React.ReactNode; onError?: (msg: string) => void },
  { error: Error | null }
> {
  state: { error: Error | null } = { error: null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  componentDidCatch(error: Error) {
    console.error("[WorkCanvas] render error:", error);
    this.props.onError?.(`error: ${error.message}`);
  }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div style={{
        position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center",
        justifyContent: "center", gap: 12, padding: 24, textAlign: "center", color: "#e8e6f5", background: "#07060f",
      }}>
        <strong>The 3D view failed to render.</strong>
        <code style={{ maxWidth: 560, opacity: 0.8, whiteSpace: "pre-wrap" }}>{this.state.error.message}</code>
        <button
          onClick={() => this.setState({ error: null })}
          style={{ padding: "6px 14px", borderRadius: 6, border: "1px solid #8b6ff5", background: "transparent", color: "#e8e6f5", cursor: "pointer" }}
        >
          Retry
        </button>
      </div>
    );
  }
}

function ViewGrid() {
  const grids = useMemo(() => {
    const fine = new THREE.GridHelper(80, 160, 0x2a2740, 0x1d1a30);
    const coarse = new THREE.GridHelper(80, 16, 0x8b6ff5, 0x4a3fa0);
    coarse.position.y = 0.002;
    for (const g of [fine, coarse]) {
      const m = g.material as THREE.LineBasicMaterial;
      m.transparent = true; m.depthWrite = false; m.opacity = g === fine ? 0.7 : 0.45;
    }
    return [fine, coarse];
  }, []);
  return <>{grids.map((g, i) => <primitive key={i} object={g} />)}</>;
}

/** Lets DOM code ask "where on the floor is this screen point?" */
function Bridge({ bridgeRef }: { bridgeRef: React.MutableRefObject<CanvasBridge | null> }) {
  const camera = useThree((s) => s.camera);
  const gl = useThree((s) => s.gl);
  useEffect(() => {
    const ray = new THREE.Raycaster();
    const floor = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    const hit = new THREE.Vector3();
    const toFloor = (cx: number, cy: number): Vec3 | null => {
      const r = gl.domElement.getBoundingClientRect();
      ray.setFromCamera(new THREE.Vector2(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1), camera);
      return ray.ray.intersectPlane(floor, hit) ? [hit.x, 0, hit.z] : null;
    };
    bridgeRef.current = {
      screenToFloor: toFloor,
      centerOnFloor: () => {
        const r = gl.domElement.getBoundingClientRect();
        return toFloor(r.left + r.width / 2, r.top + r.height / 2);
      },
    };
    return () => { bridgeRef.current = null; };
  }, [camera, gl, bridgeRef]);
  return null;
}

/** Orbit around the selected object; with nothing selected, go back to the default pivot. */
function FocusController({ selectedId, enabled, getObject, home }: {
  selectedId: string | null; enabled: boolean; getObject: () => THREE.Object3D | null; home: THREE.Vector3;
}) {
  const controls = useThree((s) => s.controls) as unknown as { target: THREE.Vector3; update: () => void } | null;
  const goal = useRef<THREE.Vector3 | null>(null);
  const pending = useRef(true);
  const box = useMemo(() => new THREE.Box3(), []);

  useEffect(() => { pending.current = true; goal.current = null; }, [selectedId, enabled]);

  useFrame((_, dt) => {
    if (!controls) return;
    if (pending.current) {
      if (!selectedId || !enabled) { goal.current = home.clone(); pending.current = false; }
      else {
        const obj = getObject();
        if (obj) {
          box.setFromObject(obj);
          if (!box.isEmpty()) goal.current = box.getCenter(new THREE.Vector3());
          pending.current = false;
        }
      }
    }
    if (goal.current) {
      controls.target.lerp(goal.current, 1 - Math.exp(-dt * 9));
      if (controls.target.distanceTo(goal.current) < 0.005) { controls.target.copy(goal.current); goal.current = null; }
      controls.update();
    }
  });
  return null;
}

function setsEqual(a: Set<string>, b: Set<string>): boolean {
  if (a.size !== b.size) return false;
  for (const v of a) if (!b.has(v)) return false;
  return true;
}

/**
 * Multi-ray camera-to-focus occlusion detector (~15 Hz, with 180 ms hysteresis).
 * Flags static/dynamic objects and individual single-instance structural parts (walls, trusses)
 * that sit directly between the camera and the focus point, leaving floors/lanes solid.
 */
function OcclusionController({
  enabled,
  selectedId,
  worlds,
  vis,
  runtime,
  occludedIds,
  occludedParts,
  occlusionSeq,
}: {
  enabled: boolean;
  selectedId: string | null;
  worlds: Map<string, THREE.Matrix4>;
  vis: React.MutableRefObject<Map<string, VisEntry>>;
  runtime: Runtime;
  occludedIds: React.MutableRefObject<Set<string>>;
  occludedParts: React.MutableRefObject<Set<string>>;
  occlusionSeq: React.MutableRefObject<number>;
}) {
  const scene = useThree((s) => s.scene);
  const controls = useThree((s) => s.controls) as unknown as { target: THREE.Vector3 } | null;

  const accum = useRef(0);
  const clockRef = useRef(0);
  const expiryIds = useRef(new Map<string, number>());
  const expiryParts = useRef(new Map<string, number>());

  const scratch = useMemo(() => ({
    ray: new THREE.Raycaster(),
    targetPos: new THREE.Vector3(),
    dir: new THREE.Vector3(),
    rayOrigin: new THREE.Vector3(),
    effCamPos: new THREE.Vector3(),
    up: new THREE.Vector3(0, 1, 0),
    right: new THREE.Vector3(),
    orthoUp: new THREE.Vector3(),
    samplePts: [
      new THREE.Vector3(),
      new THREE.Vector3(),
      new THREE.Vector3(),
      new THREE.Vector3(),
      new THREE.Vector3(),
    ],
    hits: [] as THREE.Intersection[],
    seenIds: new Set<string>(),
    seenParts: new Set<string>(),
    nextIds: new Set<string>(),
    nextParts: new Set<string>(),
  }), []);

  useEffect(() => {
    if (!enabled && (occludedIds.current.size > 0 || occludedParts.current.size > 0)) {
      expiryIds.current.clear();
      expiryParts.current.clear();
      occludedIds.current = new Set();
      occludedParts.current = new Set();
      occlusionSeq.current++;
    }
  }, [enabled, occludedIds, occludedParts, occlusionSeq]);

  useFrame(({ camera }, dt) => {
    if (!enabled) return;
    clockRef.current += dt;

    // Resolve view target: selected entity/object if any, else orbit target
    const s = scratch;
    let hasTarget = false;
    if (selectedId) {
      const ent = runtime.byId.get(selectedId);
      const visEntry = vis.current.get(selectedId);
      if (ent) {
        s.targetPos.copy(ent.pos);
        s.targetPos.y = Math.max(s.targetPos.y + 0.55, 0.55);
        hasTarget = true;
      } else if (visEntry) {
        s.targetPos.copy(visEntry.center).applyMatrix4(visEntry.group.matrixWorld);
        hasTarget = true;
      } else {
        const wm = worlds.get(selectedId);
        if (wm) {
          s.targetPos.setFromMatrixPosition(wm);
          s.targetPos.y = Math.max(s.targetPos.y + 0.65, 0.65);
          hasTarget = true;
        }
      }
    }
    if (!hasTarget) {
      if (controls) {
        s.targetPos.copy(controls.target);
        s.targetPos.y = Math.max(s.targetPos.y, 0.55);
      } else {
        s.targetPos.set(0, 0.8, 2.2);
      }
    }

    const isOrtho = !!(camera as THREE.OrthographicCamera).isOrthographicCamera;
    let orthoStandOff = 32;
    if (isOrtho) {
      camera.getWorldDirection(s.dir);
      orthoStandOff = Math.max(32, s.targetPos.distanceTo(camera.position));
      s.effCamPos.copy(s.targetPos).addScaledVector(s.dir, -orthoStandOff);
    } else {
      s.effCamPos.copy(camera.position);
    }

    // Update shared GLSL sightline corridor uniforms at full frame rate
    updateOcclusionShaderUniforms(s.effCamPos, s.targetPos, selectedId ? 2.2 : 2.8);

    accum.current += dt;
    if (accum.current < 0.05) return;
    accum.current = 0;

    if (!isOrtho) {
      s.dir.subVectors(s.targetPos, camera.position);
      const dist = s.dir.length();
      if (dist < 1.2) return;
      s.dir.multiplyScalar(1 / dist);
    }

    // Orthonormal basis perpendicular to view ray for 5-point diamond sampling
    s.right.crossVectors(s.dir, s.up);
    if (s.right.lengthSq() < 1e-4) s.right.set(1, 0, 0);
    else s.right.normalize();
    s.orthoUp.crossVectors(s.right, s.dir).normalize();

    s.samplePts[0].copy(s.targetPos);
    s.samplePts[1].copy(s.targetPos).addScaledVector(s.right, 0.48);
    s.samplePts[2].copy(s.targetPos).addScaledVector(s.right, -0.48);
    s.samplePts[3].copy(s.targetPos).addScaledVector(s.orthoUp, 0.36);
    s.samplePts[4].copy(s.targetPos).addScaledVector(s.orthoUp, -0.36);

    s.seenIds.clear();
    s.seenParts.clear();

    const perspDist = isOrtho ? orthoStandOff : s.targetPos.distanceTo(camera.position);
    const maxFar = Math.max(0.25, perspDist - 0.45);
    s.ray.near = 0.05;

    for (let i = 0; i < s.samplePts.length; i++) {
      const pt = s.samplePts[i];
      if (isOrtho) {
        s.rayOrigin.copy(pt).addScaledVector(s.dir, -orthoStandOff);
        s.ray.far = Math.max(0.25, orthoStandOff - 0.38);
        s.ray.set(s.rayOrigin, s.dir);
      } else {
        s.dir.subVectors(pt, camera.position);
        const rayDist = s.dir.length();
        if (rayDist < 0.4) continue;
        s.dir.multiplyScalar(1 / rayDist);
        s.ray.far = Math.min(maxFar, rayDist - 0.38);
        s.ray.set(camera.position, s.dir);
      }

      s.hits.length = 0;
      s.ray.intersectObjects(scene.children, true, s.hits);

      for (let h = 0; h < s.hits.length; h++) {
        const hit = s.hits[h];
        const obj = hit.object;
        if (!obj.visible) continue;
        if (obj.userData?.isFloor || obj.userData?.isGhost) continue;

        if (obj.userData?.twinBatch) {
          const idsRef = obj.userData.instanceIdsRef as React.MutableRefObject<string[]> | undefined;
          const hitId = hit.instanceId !== undefined ? idsRef?.current[hit.instanceId] : undefined;
          if (!hitId || hitId === selectedId) continue;

          if (idsRef && idsRef.current.length === 1) {
            if (obj.userData.isLod0) {
              s.seenParts.add(`${obj.userData.twinAsset}:${obj.userData.partIndex}`);
            } else {
              s.seenIds.add(hitId);
            }
          } else {
            s.seenIds.add(hitId);
          }
        } else if (obj.userData?.twinObjId) {
          const hitId = obj.userData.twinObjId as string;
          if (hitId && hitId !== selectedId) {
            s.seenIds.add(hitId);
          }
        }
      }
    }

    const now = clockRef.current;
    const hold = 0.18;
    for (const id of s.seenIds) expiryIds.current.set(id, now + hold);
    for (const part of s.seenParts) expiryParts.current.set(part, now + hold);

    s.nextIds.clear();
    for (const [id, exp] of expiryIds.current.entries()) {
      if (exp >= now && id !== selectedId) s.nextIds.add(id);
      else expiryIds.current.delete(id);
    }

    s.nextParts.clear();
    for (const [part, exp] of expiryParts.current.entries()) {
      if (exp >= now) s.nextParts.add(part);
      else expiryParts.current.delete(part);
    }

    if (!setsEqual(s.nextIds, occludedIds.current) || !setsEqual(s.nextParts, occludedParts.current)) {
      occludedIds.current = new Set(s.nextIds);
      occludedParts.current = new Set(s.nextParts);
      occlusionSeq.current++;
    }
  });

  return null;
}

/** Distance culling + calculated multi-tier LOD swap for dynamic (non-instanced) models. */
function DynamicVisibility({ vis, prefs, selectedId }: {
  vis: React.MutableRefObject<Map<string, VisEntry>>; prefs: ViewPrefs; selectedId: string | null;
}) {
  const tmp = useMemo(() => ({ cam: new THREE.Vector3(), c: new THREE.Vector3() }), []);
  const n = useRef(0);
  useFrame(({ camera }) => {
    if (++n.current % 3) return;
    tmp.cam.setFromMatrixPosition(camera.matrixWorld);
    for (const e of vis.current.values()) {
      const wm = e.group.matrixWorld;
      tmp.c.copy(e.center).applyMatrix4(wm);
      const r = e.radius * wm.getMaxScaleOnAxis();
      const d = tmp.c.distanceTo(tmp.cam);
      const { effDistance, fovDeg } = cameraLodParams(camera, d);
      const tier = prefs.lod && e.id !== selectedId ? computeLodTier(effDistance, r, prefs.lodDistance, fovDeg) : 0;
      e.content.visible = !(prefs.distanceCull && effDistance - r > prefs.cullDistance);
      e.detail.visible = tier === 0;
      e.lod1.visible = tier === 1;
      e.lod2.visible = tier === 2;
    }
  });
  return null;
}

/**
 * Maintains persistent Perspective and Orthographic camera instances in R3F and performs
 * lossless framing conversion (zoom <-> distance) on projection switch without remounting the canvas.
 */
function CameraRig({ cameraMode }: { cameraMode: CameraMode }) {
  const camera = useThree((s) => s.camera);
  const set = useThree((s) => s.set);
  const size = useThree((s) => s.size);
  const controls = useThree((s) => s.controls) as unknown as {
    object: THREE.Camera;
    target: THREE.Vector3;
    update: () => void;
  } | null;

  const perspRef = useRef<THREE.PerspectiveCamera | null>(null);
  const orthoRef = useRef<THREE.OrthographicCamera | null>(null);
  const activeModeRef = useRef<CameraMode>("perspective");

  if (!perspRef.current && !(camera as THREE.OrthographicCamera).isOrthographicCamera) {
    perspRef.current = camera as THREE.PerspectiveCamera;
  }
  if (!orthoRef.current) {
    const aspect = size.width / Math.max(1, size.height);
    const halfH = BASE_ORTHO_SPAN / 2;
    const ortho = new THREE.OrthographicCamera(-halfH * aspect, halfH * aspect, halfH, -halfH, 0.05, 400);
    ortho.position.set(14.5, 11.5, 17.5);
    ortho.lookAt(HOME);
    orthoRef.current = ortho;
  }

  // Keep both camera frustums synchronized when the viewport resizes
  useLayoutEffect(() => {
    const aspect = size.width / Math.max(1, size.height);
    const halfH = BASE_ORTHO_SPAN / 2;
    const ortho = orthoRef.current;
    if (ortho) {
      ortho.left = -halfH * aspect;
      ortho.right = halfH * aspect;
      ortho.top = halfH;
      ortho.bottom = -halfH;
      ortho.updateProjectionMatrix();
    }
    const persp = perspRef.current;
    if (persp) {
      persp.aspect = aspect;
      persp.updateProjectionMatrix();
    }
  }, [size.width, size.height]);

  // Ensure OrbitControls tracks the currently active camera when mounted/switched
  useLayoutEffect(() => {
    if (controls && controls.object !== camera) {
      controls.object = camera;
      controls.update();
    }
  }, [controls, camera]);

  // Convert camera pose <-> orthographic zoom losslessly when mode changes
  useLayoutEffect(() => {
    const persp = perspRef.current;
    const ortho = orthoRef.current;
    if (!persp || !ortho || activeModeRef.current === cameraMode) return;

    const target = controls ? controls.target : HOME;
    const halfFovRad = THREE.MathUtils.degToRad(persp.fov || BASE_PERSP_FOV) / 2;
    const tanHalfFov = Math.tan(halfFovRad);

    if (cameraMode === "orthographic") {
      const dir = persp.position.clone().sub(target);
      const dist = Math.max(0.5, dir.length());
      if (dir.lengthSq() < 1e-6) dir.set(14.5, 10.5, 15.3);
      dir.normalize();
      const visH = 2 * dist * tanHalfFov;
      ortho.zoom = THREE.MathUtils.clamp(BASE_ORTHO_SPAN / Math.max(0.1, visH), 0.15, 25);
      // Park ortho camera >= 32m along the ray so near-plane never clips foreground warehouse walls
      ortho.position.copy(target).addScaledVector(dir, Math.max(dist, 32));
      ortho.up.copy(persp.up);
      ortho.lookAt(target);
      ortho.updateProjectionMatrix();
      ortho.updateMatrixWorld();

      activeModeRef.current = "orthographic";
      set({ camera: ortho });
      if (controls) {
        controls.object = ortho;
        controls.update();
      }
    } else {
      const dir = ortho.position.clone().sub(target);
      if (dir.lengthSq() < 1e-6) dir.set(14.5, 10.5, 15.3);
      dir.normalize();
      const visH = BASE_ORTHO_SPAN / Math.max(0.01, ortho.zoom);
      const newDist = THREE.MathUtils.clamp(visH / (2 * tanHalfFov), 1.5, 80);
      persp.position.copy(target).addScaledVector(dir, newDist);
      persp.up.copy(ortho.up);
      persp.lookAt(target);
      persp.updateProjectionMatrix();
      persp.updateMatrixWorld();

      activeModeRef.current = "perspective";
      set({ camera: persp });
      if (controls) {
        controls.object = persp;
        controls.update();
      }
    }
  }, [cameraMode, controls, set]);

  return null;
}

function RuntimeDriver({
  runtime,
  twinEngine,
  objects,
  worlds,
  playing,
  paused,
  timeScale,
}: {
  runtime: Runtime;
  twinEngine: TwinEngine;
  objects: SceneObjectData[];
  worlds: Map<string, THREE.Matrix4>;
  playing: boolean;
  paused: boolean;
  timeScale: number;
}) {
  useFrame((_, dt) => {
    const clamped = Math.min(dt, 0.05) * timeScale;
    if (playing && !paused) runtime.tick(clamped);
    twinEngine.tick(clamped, runtime, objects, worlds, playing, paused);
  });
  return null;
}

function StatsProbe({ perf, vis, onStats }: {
  perf: React.MutableRefObject<PerfCounters>; vis: React.MutableRefObject<Map<string, VisEntry>>; onStats: (s: PerfStats) => void;
}) {
  const gl = useThree((s) => s.gl) as unknown as { info?: { render?: { calls: number; triangles: number } } };
  const t = useRef(0);
  useFrame((_, dt) => {
    t.current += dt;
    if (t.current < 0.5) return;
    t.current = 0;
    let instNear = 0, instMid = 0, instFar = 0, instCulled = 0, instTotal = 0;
    for (const v of Object.values(perf.current)) {
      instNear += v.near;
      instMid += v.mid;
      instFar += v.far;
      instCulled += v.culled;
      instTotal += v.total;
    }
    onStats({
      calls: gl.info?.render?.calls ?? 0,
      triangles: gl.info?.render?.triangles ?? 0,
      instNear,
      instMid,
      instFar,
      instCulled,
      instTotal,
      dynamic: vis.current.size,
    });
  });
  return null;
}

export interface WorkCanvasProps {
  objects: SceneObjectData[];
  worlds: Map<string, THREE.Matrix4>;
  staticIds: Set<string>;
  forced: Set<string>;
  assetUrls: Record<string, string>;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onTransformEnd: (id: string, world: THREE.Matrix4) => void;
  mode: "translate" | "rotate";
  snap: boolean;
  prefs: ViewPrefs;
  runtime: Runtime;
  twinEngine: TwinEngine;
  workspaceMode: WorkspaceMode;
  telemetryList: AssetTelemetry[];
  zones: ZoneDef[];
  overlays: TwinOverlayPrefs;
  cameraPreset: CameraPreset;
  cameraPresetSeq: number;
  playing: boolean;
  paused: boolean;
  timeScale: number;
  epoch: number;
  bridgeRef: React.MutableRefObject<CanvasBridge | null>;
  onJointDefs: (asset: string, defs: JointDef[]) => void;
  onStats: (s: PerfStats) => void;
  onBackend: (label: string) => void;
}

const HOME_ARR: [number, number, number] = [0.0, 1.0, 2.2];
const HOME = new THREE.Vector3(...HOME_ARR);

export default function WorkCanvas(p: WorkCanvasProps) {
  return (
    <CanvasErrorBoundary onError={p.onBackend}>
      <WorkCanvasInner {...p} />
    </CanvasErrorBoundary>
  );
}

function WorkCanvasInner(p: WorkCanvasProps) {
  const { objects, worlds, staticIds, forced, prefs, selectedId, onBackend } = p;
  const groups = useRef(new Map<string, THREE.Object3D>());
  const selectedRef = useRef<string | null>(selectedId);
  const gizmoBusy = useRef(false);
  const [selGroup, setSelGroup] = useState<THREE.Object3D | null>(null);
  const vis = useRef(new Map<string, VisEntry>());
  const perf = useRef<PerfCounters>({});
  const live = useRef<LiveDrag | null>(null);
  const dirty = useRef(0);
  const occludedIds = useRef<Set<string>>(new Set());
  const occludedParts = useRef<Set<string>>(new Set());
  const occlusionSeq = useRef(0);

  useEffect(() => { onBackend("WebGL2"); }, [onBackend]);

  const register = useCallback((id: string, node: THREE.Object3D | null) => {
    if (node) groups.current.set(id, node); else groups.current.delete(id);
    if (id === selectedRef.current) setSelGroup(node);
  }, []);

  useEffect(() => {
    selectedRef.current = selectedId;
    setSelGroup(selectedId ? groups.current.get(selectedId) ?? null : null);
  }, [selectedId]);

  // --- Route dynamic objects (non-static, runtime-forced, or manually transparent) to DynNode
  const byId = useMemo(() => new Map(objects.map((o) => [o.id, o])), [objects]);
  const children = useMemo(() => childrenIndex(objects), [objects]);
  const dyn = useMemo(() => {
    const s = new Set<string>();
    for (const o of objects) {
      const hasCustomOpacity = o.opacity !== undefined && o.opacity < 0.99;
      if (!staticIds.has(o.id) || forced.has(o.id) || hasCustomOpacity) s.add(o.id);
    }
    return s;
  }, [objects, staticIds, forced]);
  const roots = useMemo(() => objects.filter((o) => dyn.has(o.id) && !(o.parentId && dyn.has(o.parentId))), [objects, dyn]);
  const statics = useMemo(
    () => objects.filter((o) => staticIds.has(o.id) && !(o.opacity !== undefined && o.opacity < 0.99)),
    [objects, staticIds],
  );

  const ctx: NodeCtx = useMemo(() => ({
    byId, children, dyn, worlds, assetUrls: p.assetUrls, selectedId, onSelect: p.onSelect, register,
    runtime: p.runtime, prefs, epoch: p.epoch, vis, occludedIds, onJointDefs: p.onJointDefs,
  }), [byId, children, dyn, worlds, p.assetUrls, selectedId, p.onSelect, register, p.runtime, prefs, p.epoch, p.onJointDefs]);

  const sel = selectedId ? byId.get(selectedId) ?? null : null;
  const selIsStatic = !!sel && staticIds.has(sel.id) && !dyn.has(sel.id);

  // --- batches: culling / LOD settings (Infinity switches a stage off)
  const cfg = useMemo(() => ({
    frustum: prefs.frustumCull,
    cullDist: prefs.distanceCull ? prefs.cullDistance : Infinity,
    lodDist: prefs.lod ? prefs.lodDistance : Infinity,
  }), [prefs.frustumCull, prefs.distanceCull, prefs.cullDistance, prefs.lod, prefs.lodDistance]);

  // --- gizmo drag on a STATIC object: move its instances live, commit on release
  const oldInv = useMemo(
    () => (sel && selIsStatic && worlds.get(sel.id) ? worlds.get(sel.id)!.clone().invert() : null), [sel, selIsStatic, worlds]);
  const subtree = useMemo(() => (sel && selIsStatic ? descendantsOf(objects, sel.id) : null), [sel, selIsStatic, objects]);

  return (
    <Canvas
      shadows
      dpr={[1, 2]}
      camera={{ position: [14.5, 11.5, 17.5], fov: 42, near: 0.05, far: 300 }}
      gl={{ antialias: true, powerPreference: "high-performance", toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 1.05 }}
      onCreated={({ gl }) => {
        gl.domElement.addEventListener("webglcontextlost", (e) => {
          e.preventDefault();
          onBackend("error: context lost");
        });
        gl.domElement.addEventListener("webglcontextrestored", () => {
          onBackend("WebGL2");
        });
      }}
      // Clicking the transform gizmo counts as "clicking nothing" to r3f — ignore that.
      onPointerMissed={() => { if (!gizmoBusy.current) p.onSelect(null); }}
    >
      <color attach="background" args={["#07060f"]} />
      <StudioEnvironment />
      {prefs.defaultLight ? (
        <>
          <ambientLight intensity={0.45} color="#8f84e0" />
          <hemisphereLight args={["#22d3ee", "#14121f", 0.25]} />
          <directionalLight
            position={[10, 16, 10]} intensity={1.15} castShadow={prefs.shadows}
            shadow-mapSize={[2048, 2048]} shadow-bias={-0.0004}
            shadow-camera-left={-16} shadow-camera-right={16} shadow-camera-top={16} shadow-camera-bottom={-16}
          />
        </>
      ) : (
        <ambientLight intensity={0.04} />
      )}

      <ViewGrid />
      {prefs.showGizmos && p.workspaceMode === "author" && <axesHelper args={[1.2]} />}

      <StaticBatches
        statics={statics}
        byId={byId}
        worlds={worlds}
        assetUrls={p.assetUrls}
        hidden={forced}
        cfg={cfg}
        live={live}
        dirty={dirty}
        perf={perf}
        occludedIds={occludedIds}
        occludedParts={occludedParts}
        occlusionSeq={occlusionSeq}
        occlusionOpacity={prefs.occlusionOpacity}
        onSelect={p.onSelect}
      />

      {roots.map((o) => <DynNode key={`${o.id}:${p.epoch}`} id={o.id} root ctx={ctx} />)}

      <TwinOverlays
        workspaceMode={p.workspaceMode}
        objects={objects}
        worlds={worlds}
        telemetryList={p.telemetryList}
        zones={p.zones}
        selectedId={selectedId}
        overlays={p.overlays}
        runtime={p.runtime}
      />

      {sel && selIsStatic && worlds.get(sel.id) && (
        <StaticProxy
          o={sel} world={worlds.get(sel.id)!} url={sel.asset ? p.assetUrls[sel.asset] : undefined}
          register={register} showGizmos={prefs.showGizmos}
        />
      )}

      {selGroup && sel && !p.playing && p.workspaceMode === "author" && (
        <TransformControls
          key={sel.id}
          object={selGroup}
          mode={p.mode}
          space={prefs.space}
          size={0.9}
          translationSnap={p.snap ? 0.1 : null}
          rotationSnap={p.snap ? THREE.MathUtils.degToRad(15) : null}
          onMouseDown={() => { gizmoBusy.current = true; }}
          onObjectChange={() => {
            if (!selIsStatic || !oldInv || !subtree) return;
            selGroup.updateWorldMatrix(true, false);
            live.current = { ids: subtree, delta: new THREE.Matrix4().multiplyMatrices(selGroup.matrixWorld, oldInv) };
            dirty.current++;
          }}
          onMouseUp={() => {
            selGroup.updateWorldMatrix(true, false);
            p.onTransformEnd(sel.id, selGroup.matrixWorld.clone());
            live.current = null;
            dirty.current++;
            setTimeout(() => { gizmoBusy.current = false; }, 60);
          }}
        />
      )}

      <OrbitControls
        makeDefault
        enableDamping
        target={HOME_ARR}
        minDistance={1.2}
        maxDistance={80}
        minZoom={0.15}
        maxZoom={25}
        maxPolarAngle={Math.PI / 2 - 0.02}
      />
      <CameraRig cameraMode={prefs.cameraMode} />
      <FocusController
        selectedId={selectedId}
        enabled={prefs.focusSelection && !(p.workspaceMode === "twin" && p.overlays.followSelected)}
        getObject={() => selGroup}
        home={HOME}
      />
      <TwinCameraController
        preset={p.cameraPreset}
        presetSeq={p.cameraPresetSeq}
        followId={selectedId}
        followEnabled={p.workspaceMode === "twin" && p.overlays.followSelected}
        runtime={p.runtime}
        worlds={worlds}
      />

      {prefs.showGizmos && (
        <GizmoHelper alignment="bottom-right" margin={[84, 84]}>
          <GizmoViewcube color="#1a1830" strokeColor="#8b6ff5" textColor="#e8e6f5" hoverColor="#22d3ee" opacity={0.95} />
        </GizmoHelper>
      )}

      <OcclusionController
        enabled={prefs.autoTransparentOccluding}
        selectedId={selectedId}
        worlds={worlds}
        vis={vis}
        runtime={p.runtime}
        occludedIds={occludedIds}
        occludedParts={occludedParts}
        occlusionSeq={occlusionSeq}
      />
      <DynamicVisibility vis={vis} prefs={prefs} selectedId={selectedId} />
      <RuntimeDriver
        runtime={p.runtime}
        twinEngine={p.twinEngine}
        objects={objects}
        worlds={worlds}
        playing={p.playing}
        paused={p.paused}
        timeScale={p.timeScale}
      />
      <StatsProbe perf={perf} vis={vis} onStats={p.onStats} />
      <Bridge bridgeRef={p.bridgeRef} />
    </Canvas>
  );
}