import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { GizmoHelper, GizmoViewcube, OrbitControls, TransformControls } from "@react-three/drei";
import * as THREE from "three";
import { WebGPURenderer } from "three/webgpu";
import { childrenIndex, descendantsOf } from "../../lib/sceneMath";
import type { CanvasBridge, JointDef, PerfStats, SceneObjectData, Vec3, ViewPrefs } from "../../lib/workTypes";
import type { Runtime } from "./runtime";
import StaticBatches, { type LiveDrag, type PerfCounters } from "./StaticBatches";
import { DynNode, StaticProxy, type NodeCtx, type VisEntry } from "./SceneNodes";

// ---------------------------------------------------------------------------
// WebGPU. three's WebGPURenderer uses the WebGPU API when the browser has it and silently falls back to a
// WebGL2 backend when it doesn't. Two things to know:
//   * it must be init()'d (async) before the first render, so render() is a no-op until it's ready;
//   * it can't run hand-written GLSL (ShaderMaterial) — that's why the grid below is built from line
//     meshes instead of drei's <Grid>. Standard materials (everything in the GLBs) work unchanged.
// ---------------------------------------------------------------------------
class ReadyWebGPURenderer extends WebGPURenderer {
  ready = false;
  override render(scene: THREE.Scene, camera: THREE.Camera) {
    if (!this.ready) return;
    return super.render(scene, camera);
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

/** Orbit around the selected object; with nothing selected, go back to the default pivot.
 *  It only *animates* the pivot (a short ease), so panning with the right mouse button still works. */
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
        const obj = getObject();            // may not be mounted yet — try again next frame
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

/** Distance culling + LOD swap for dynamic (non-instanced) models. Frustum culling is three.js's own. */
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
      const far = prefs.lod && d > prefs.lodDistance && e.id !== selectedId;
      e.content.visible = !(prefs.distanceCull && d - r > prefs.cullDistance);
      e.detail.visible = !far;
      e.proxy.visible = far;
    }
  });
  return null;
}

function RuntimeDriver({ runtime, playing, paused, timeScale }: { runtime: Runtime; playing: boolean; paused: boolean; timeScale: number }) {
  useFrame((_, dt) => { if (playing && !paused) runtime.tick(Math.min(dt, 0.05) * timeScale); });
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
    let instNear = 0, instFar = 0, instCulled = 0, instTotal = 0;
    for (const v of Object.values(perf.current)) { instNear += v.near; instFar += v.far; instCulled += v.culled; instTotal += v.total; }
    onStats({
      calls: gl.info?.render?.calls ?? 0, triangles: gl.info?.render?.triangles ?? 0,
      instNear, instFar, instCulled, instTotal, dynamic: vis.current.size,
    });
  });
  return null;
}

// ---------------------------------------------------------------------------
export interface WorkCanvasProps {
  objects: SceneObjectData[];
  worlds: Map<string, THREE.Matrix4>;
  staticIds: Set<string>;
  forced: Set<string>;                 // static objects the simulation turned into real nodes (picked up)
  assetUrls: Record<string, string>;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onTransformEnd: (id: string, world: THREE.Matrix4) => void;
  mode: "translate" | "rotate";
  snap: boolean;
  prefs: ViewPrefs;
  runtime: Runtime;
  playing: boolean;
  paused: boolean;
  timeScale: number;
  epoch: number;
  bridgeRef: React.MutableRefObject<CanvasBridge | null>;
  onJointDefs: (asset: string, defs: JointDef[]) => void;
  onStats: (s: PerfStats) => void;
  onBackend: (label: string) => void;
}

const HOME = new THREE.Vector3(0, 0, 2);

export default function WorkCanvas(p: WorkCanvasProps) {
  const { objects, worlds, staticIds, forced, prefs, selectedId, onBackend } = p;
  const groups = useRef(new Map<string, THREE.Object3D>());
  const selectedRef = useRef<string | null>(selectedId);
  const gizmoBusy = useRef(false);
  const [selGroup, setSelGroup] = useState<THREE.Object3D | null>(null);
  const vis = useRef(new Map<string, VisEntry>());
  const perf = useRef<PerfCounters>({});
  const live = useRef<LiveDrag | null>(null);
  const dirty = useRef(0);

  const register = useCallback((id: string, node: THREE.Object3D | null) => {
    if (node) groups.current.set(id, node); else groups.current.delete(id);
    if (id === selectedRef.current) setSelGroup(node);
  }, []);

  useEffect(() => {
    selectedRef.current = selectedId;
    setSelGroup(selectedId ? groups.current.get(selectedId) ?? null : null);
  }, [selectedId]);

  // --- which objects are drawn as nodes, which are instanced
  const byId = useMemo(() => new Map(objects.map((o) => [o.id, o])), [objects]);
  const children = useMemo(() => childrenIndex(objects), [objects]);
  const dyn = useMemo(() => {
    const s = new Set<string>();
    for (const o of objects) if (!staticIds.has(o.id) || forced.has(o.id)) s.add(o.id);
    return s;
  }, [objects, staticIds, forced]);
  const roots = useMemo(() => objects.filter((o) => dyn.has(o.id) && !(o.parentId && dyn.has(o.parentId))), [objects, dyn]);
  const statics = useMemo(() => objects.filter((o) => staticIds.has(o.id)), [objects, staticIds]);

  const ctx: NodeCtx = useMemo(() => ({
    byId, children, dyn, worlds, assetUrls: p.assetUrls, selectedId, onSelect: p.onSelect, register,
    runtime: p.runtime, prefs, epoch: p.epoch, vis, onJointDefs: p.onJointDefs,
  }), [byId, children, dyn, worlds, p.assetUrls, selectedId, p.onSelect, register, p.runtime, prefs, p.epoch, p.onJointDefs]);

  const sel = selectedId ? byId.get(selectedId) ?? null : null;
  const selIsStatic = !!sel && staticIds.has(sel.id) && !forced.has(sel.id);

  // --- batches: culling / LOD settings (Infinity switches a stage off)
  const cfg = useMemo(() => ({
    frustum: prefs.frustumCull,
    cullDist: prefs.distanceCull ? prefs.cullDistance : Infinity,
    lodDist: prefs.lod ? prefs.lodDistance : Infinity,
  }), [prefs.frustumCull, prefs.distanceCull, prefs.cullDistance, prefs.lod, prefs.lodDistance]);

  // --- renderer factory (r3f v8 accepts `gl={(canvas) => renderer}`)
  const gpuFactory = useCallback((canvas: HTMLCanvasElement | OffscreenCanvas) => {
    const r = new ReadyWebGPURenderer({
      canvas: canvas as HTMLCanvasElement, antialias: true, powerPreference: "high-performance", forceWebGL: prefs.forceWebGL,
    });
    r.init().then(() => {
      r.ready = true;
      onBackend((r as any).backend?.isWebGPUBackend ? "WebGPU" : "WebGL2");
    }).catch((e: unknown) => onBackend(`error: ${e instanceof Error ? e.message : String(e)}`));
    return r as any;
  }, [prefs.forceWebGL, onBackend]);

  // --- gizmo drag on a STATIC object: move its instances live, commit on release
  const oldInv = useMemo(
    () => (sel && selIsStatic && worlds.get(sel.id) ? worlds.get(sel.id)!.clone().invert() : null), [sel, selIsStatic, worlds]);
  const subtree = useMemo(() => (sel && selIsStatic ? descendantsOf(objects, sel.id) : null), [sel, selIsStatic, objects]);

  return (
    <Canvas
      key={prefs.forceWebGL ? "webgl" : "webgpu"}
      shadows
      dpr={[1, 2]}
      camera={{ position: [9, 7, 11], fov: 40, near: 0.05, far: 300 }}
      gl={gpuFactory}
      // Clicking the transform gizmo counts as "clicking nothing" to r3f — ignore that.
      onPointerMissed={() => { if (!gizmoBusy.current) p.onSelect(null); }}
    >
      <color attach="background" args={["#07060f"]} />
      {prefs.defaultLight ? (
        <>
          <ambientLight intensity={0.7} color="#8f84e0" />
          <hemisphereLight args={["#22d3ee", "#14121f", 0.25]} />
          <directionalLight
            position={[8, 14, 8]} intensity={1.1} castShadow={prefs.shadows}
            shadow-mapSize={[2048, 2048]} shadow-bias={-0.0004}
            shadow-camera-left={-14} shadow-camera-right={14} shadow-camera-top={14} shadow-camera-bottom={-14}
          />
        </>
      ) : (
        <ambientLight intensity={0.04} />
      )}

      <ViewGrid />
      {prefs.showGizmos && <axesHelper args={[1.2]} />}

      <StaticBatches
        statics={statics} worlds={worlds} assetUrls={p.assetUrls} hidden={forced} cfg={cfg}
        live={live} dirty={dirty} perf={perf} onSelect={p.onSelect}
      />

      {roots.map((o) => <DynNode key={`${o.id}:${p.epoch}`} id={o.id} root ctx={ctx} />)}

      {sel && selIsStatic && worlds.get(sel.id) && (
        <StaticProxy
          o={sel} world={worlds.get(sel.id)!} url={sel.asset ? p.assetUrls[sel.asset] : undefined}
          register={register} showGizmos={prefs.showGizmos}
        />
      )}

      {selGroup && sel && !p.playing && (
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

      <OrbitControls makeDefault enableDamping target={HOME.toArray()} minDistance={1.2} maxDistance={80} maxPolarAngle={Math.PI / 2 - 0.02} />
      <FocusController selectedId={selectedId} enabled={prefs.focusSelection} getObject={() => selGroup} home={HOME} />

      {prefs.showGizmos && (
        <GizmoHelper alignment="bottom-right" margin={[84, 84]}>
          <GizmoViewcube color="#1a1830" strokeColor="#8b6ff5" textColor="#e8e6f5" hoverColor="#22d3ee" opacity={0.95} />
        </GizmoHelper>
      )}

      <DynamicVisibility vis={vis} prefs={prefs} selectedId={selectedId} />
      <RuntimeDriver runtime={p.runtime} playing={p.playing} paused={p.paused} timeScale={p.timeScale} />
      <StatsProbe perf={perf} vis={vis} onStats={p.onStats} />
      <Bridge bridgeRef={p.bridgeRef} />
    </Canvas>
  );
}
