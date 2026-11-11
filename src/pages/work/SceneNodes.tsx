import React, { Suspense, useCallback, useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { clone as cloneSkinned } from "three/examples/jsm/utils/SkeletonUtils.js";
import type { JointDef, LightProps, SceneObjectData, Vec3, ViewPrefs } from "../../lib/workTypes";
import { useAssetInfo } from "./assetInfo";
import { applyJoint, buildRig } from "./rig";
import type { Runtime } from "./runtime";

const D2R = Math.PI / 180;

/** Per-model handles used by the visibility system (distance culling + LOD swap). */
export interface VisEntry {
  id: string;
  group: THREE.Object3D;    // the node (its matrixWorld places the model)
  content: THREE.Object3D;  // this node's own geometry — NOT its child nodes
  detail: THREE.Object3D;   // full-detail model
  proxy: THREE.Object3D;    // box stand-in used beyond the LOD distance
  center: THREE.Vector3;
  radius: number;
}

export interface NodeCtx {
  byId: Map<string, SceneObjectData>;
  children: Map<string | null, string[]>;
  dyn: Set<string>;                       // objects rendered as real nodes (the rest are instanced)
  worlds: Map<string, THREE.Matrix4>;
  assetUrls: Record<string, string>;
  selectedId: string | null;
  onSelect: (id: string) => void;
  register: (id: string, node: THREE.Object3D | null) => void;
  runtime: Runtime;
  prefs: ViewPrefs;
  epoch: number;
  vis: React.MutableRefObject<Map<string, VisEntry>>;
  onJointDefs: (asset: string, defs: JointDef[]) => void;
}

export function worldProps(m: THREE.Matrix4): { position: Vec3; quaternion: [number, number, number, number]; scale: number } {
  const p = new THREE.Vector3(), q = new THREE.Quaternion(), s = new THREE.Vector3();
  m.decompose(p, q, s);
  return { position: [p.x, p.y, p.z], quaternion: [q.x, q.y, q.z, q.w], scale: s.x };
}

// ---------------------------------------------------------------------------
// A node in the scene graph. Roots take their WORLD transform from the math in sceneMath (their parent
// may be an instanced/static object that isn't drawn as a node); nested nodes use their LOCAL transform
// and let three.js apply the parent chain.
// ---------------------------------------------------------------------------
export function DynNode({ id, root, ctx }: { id: string; root: boolean; ctx: NodeCtx }) {
  const o = ctx.byId.get(id);
  const groupRef = useRef<THREE.Group | null>(null);
  const contentRef = useRef<THREE.Group>(null);
  const { register } = ctx;
  const setRef = useCallback((n: THREE.Group | null) => { groupRef.current = n; register(id, n); }, [register, id]);
  if (!o) return null;

  const selected = ctx.selectedId === id;
  const url = o.asset ? ctx.assetUrls[o.asset] : undefined;
  const tf = root
    ? worldProps(ctx.worlds.get(id) ?? new THREE.Matrix4())
    : { position: o.position, rotation: [o.rotation[0] * D2R, o.rotation[1] * D2R, o.rotation[2] * D2R] as Vec3, scale: o.scale };
  const kids = (ctx.children.get(id) ?? []).filter((c) => ctx.dyn.has(c));

  return (
    <group
      ref={setRef}
      {...(tf as any)}
      onClick={(e) => { if (e.delta > 4) return; e.stopPropagation(); ctx.onSelect(id); }}
    >
      <group ref={contentRef}>
        {o.kind === "model" && url && (
          <Suspense fallback={null}>
            <ModelContent o={o} url={url} ctx={ctx} groupRef={groupRef} contentRef={contentRef} selected={selected} />
          </Suspense>
        )}
        {o.kind === "light" && o.light && (
          <LightContent light={o.light} selected={selected} showGizmo={ctx.prefs.showGizmos} shadows={ctx.prefs.shadows} />
        )}
        {o.kind === "group" && ctx.prefs.showGizmos && <axesHelper args={[selected ? 0.7 : 0.3]} />}
      </group>
      {kids.map((c) => <DynNode key={`${c}:${ctx.epoch}`} id={c} root={false} ctx={ctx} />)}
    </group>
  );
}

// ---------------------------------------------------------------------------
// A model: its own clone of the glTF node tree (own joints), a box LOD proxy, selection box.
// ---------------------------------------------------------------------------
interface ModelProps {
  o: SceneObjectData; url: string; ctx: NodeCtx; selected: boolean;
  groupRef: React.MutableRefObject<THREE.Group | null>;
  contentRef: React.RefObject<THREE.Group>;
}

function ModelContent({ o, url, ctx, selected, groupRef, contentRef }: ModelProps) {
  const { scene, info } = useAssetInfo(url);
  const clone = useMemo(() => cloneSkinned(scene), [scene]);
  const rig = useMemo(() => buildRig(clone), [clone]);
  const proxy = useMemo(() => {
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ color: info.color, roughness: 0.85 }));
    mesh.matrixAutoUpdate = false;
    mesh.matrix.copy(info.boxMatrix);
    mesh.castShadow = true;
    mesh.visible = false;
    return mesh;
  }, [info]);
  const helper = useMemo(() => new THREE.Box3Helper(info.bbox, 0x22d3ee), [info]);
  const { runtime, vis, onJointDefs, prefs } = ctx;

  useEffect(() => () => { proxy.geometry.dispose(); (proxy.material as THREE.Material).dispose(); }, [proxy]);

  useEffect(() => {
    clone.traverse((x) => {
      const m = x as THREE.Mesh;
      if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; m.frustumCulled = prefs.frustumCull; }
    });
  }, [clone, prefs.frustumCull]);

  useEffect(() => { onJointDefs(o.asset!, rig.map((r) => r.def)); }, [rig, o.asset, onJointDefs]);
  useEffect(() => { for (const r of rig) applyJoint(r, o.joints[r.def.name] ?? 0); }, [rig, o.joints]);

  // let the runtime drive this node, and the visibility system cull / LOD it
  useEffect(() => {
    const g = groupRef.current, c = contentRef.current;
    if (!g || !c) return;
    runtime.attach(o.id, g, rig);
    vis.current.set(o.id, { id: o.id, group: g, content: c, detail: clone, proxy, center: info.center, radius: info.radius });
    return () => { runtime.detach(o.id, g); vis.current.delete(o.id); };
  }, [o.id, rig, clone, proxy, info, runtime, vis, groupRef, contentRef]);

  return (
    <>
      <primitive object={clone} />
      <primitive object={proxy} />
      {selected && prefs.showGizmos && <primitive object={helper} />}
    </>
  );
}

// ---------------------------------------------------------------------------
// Light sources. Spot and directional lights shine along the node's local -Y; rotate the node to aim.
// ---------------------------------------------------------------------------
function LightContent({ light, selected, showGizmo, shadows }: { light: LightProps; selected: boolean; showGizmo: boolean; shadows: boolean }) {
  const target = useMemo(() => new THREE.Object3D(), []);
  const arrow = useMemo(
    () => new THREE.ArrowHelper(new THREE.Vector3(0, -1, 0), new THREE.Vector3(), 0.9, light.color, 0.22, 0.12), [light.color]);
  const cast = shadows && light.castShadow;

  return (
    <>
      {light.type === "point" && (
        <pointLight color={light.color} intensity={light.intensity} distance={light.distance} decay={2}
          castShadow={cast} shadow-mapSize={[1024, 1024]} shadow-bias={-0.0005} />
      )}
      {light.type === "spot" && (
        <>
          <spotLight color={light.color} intensity={light.intensity} distance={light.distance} decay={2}
            angle={light.angle * D2R} penumbra={0.4} castShadow={cast} target={target}
            shadow-mapSize={[1024, 1024]} shadow-bias={-0.0005} />
          <primitive object={target} position={[0, -1, 0]} />
        </>
      )}
      {light.type === "directional" && (
        <>
          <directionalLight color={light.color} intensity={light.intensity} castShadow={cast} target={target}
            shadow-mapSize={[2048, 2048]} shadow-bias={-0.0004}
            shadow-camera-left={-14} shadow-camera-right={14} shadow-camera-top={14} shadow-camera-bottom={-14} />
          <primitive object={target} position={[0, -1, 0]} />
        </>
      )}
      {showGizmo && (
        <>
          <mesh>
            <sphereGeometry args={[selected ? 0.17 : 0.11, 16, 12]} />
            <meshBasicMaterial color={light.color} />
          </mesh>
          {light.type !== "point" && <primitive object={arrow} />}
        </>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// A selected STATIC object isn't a node (it lives in an instanced batch), but the transform gizmo needs
// something to hold on to — this invisible stand-in carries the gizmo and a selection box.
// ---------------------------------------------------------------------------
export function StaticProxy({ o, world, url, register, showGizmos }: {
  o: SceneObjectData; world: THREE.Matrix4; url?: string; register: NodeCtx["register"]; showGizmos: boolean;
}) {
  const tf = useMemo(() => worldProps(world), [world]);
  const setRef = useCallback((n: THREE.Group | null) => register(o.id, n), [register, o.id]);
  return (
    <group ref={setRef} {...(tf as any)}>
      {o.kind === "model" && url ? (
        <Suspense fallback={null}><ProxyBox url={url} show={showGizmos} /></Suspense>
      ) : (
        showGizmos && <axesHelper args={[0.7]} />
      )}
    </group>
  );
}

function ProxyBox({ url, show }: { url: string; show: boolean }) {
  const { info } = useAssetInfo(url);
  const helper = useMemo(() => new THREE.Box3Helper(info.bbox, 0x22d3ee), [info]);
  return show ? <primitive object={helper} /> : null;
}
