import React, { Suspense, useCallback, useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { clone as cloneSkinned } from "three/examples/jsm/utils/SkeletonUtils.js";
import type { JointDef, LightProps, SceneObjectData, Vec3, ViewPrefs } from "../../lib/workTypes";
import { useAssetInfo, type AssetInfo } from "./assetInfo";
import type { LodPart } from "./lodCompute";
import {
  installOcclusionShader,
  stepOcclusionMaterial,
  type OcclusionShaderHandle,
} from "./occlusionShader";
import { applyJoint, buildRig } from "./rig";
import type { Runtime } from "./runtime";

const D2R = Math.PI / 180;
const FLOOR_NAME_RE = /floor|lane|track|ground|slab|apron/i;

/** Per-model handles used by the visibility system (distance culling + calculated 3-tier LOD swap). */
export interface VisEntry {
  id: string;
  group: THREE.Object3D;    // the node (its matrixWorld places the model)
  content: THREE.Object3D;  // this node's own geometry — NOT its child nodes
  detail: THREE.Object3D;   // LOD0: full-detail model
  lod1: THREE.Object3D;     // LOD1: calculated medium-detail model
  lod2: THREE.Object3D;     // LOD2: calculated coarse-detail model
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
  occludedIds: React.MutableRefObject<Set<string>>;
  onJointDefs: (asset: string, defs: JointDef[]) => void;
}

export function worldProps(m: THREE.Matrix4): { position: Vec3; quaternion: [number, number, number, number]; scale: number } {
  const p = new THREE.Vector3(), q = new THREE.Quaternion(), s = new THREE.Vector3();
  m.decompose(p, q, s);
  return { position: [p.x, p.y, p.z], quaternion: [q.x, q.y, q.z, q.w], scale: s.x };
}

// ---------------------------------------------------------------------------
// A node in the scene graph.
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
      onClick={(e) => {
        if (e.delta > 4) return;
        // Let clicks pass through dynamically occluded blockers to objects behind them
        if (ctx.occludedIds.current.has(id) && !selected) return;
        e.stopPropagation();
        ctx.onSelect(id);
      }}
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
// A model: clones the Supabase glTF tree, builds calculated LOD1/LOD2 groups,
// and manages smooth manual + occlusion opacity transitions.
// ---------------------------------------------------------------------------
interface ModelProps {
  o: SceneObjectData; url: string; ctx: NodeCtx; selected: boolean;
  groupRef: React.MutableRefObject<THREE.Group | null>;
  contentRef: React.RefObject<THREE.Group>;
}

function ModelContent(props: ModelProps) {
  const { scene, info } = useAssetInfo(props.url);
  return <ModelRigRenderer {...props} scene={scene} info={info} />;
}

interface ClonedMatEntry {
  mat: THREE.Material;
  handle: OcclusionShaderHandle;
  isFloor: boolean;
}

function cloneObjectMaterials(root: THREE.Object3D, objId: string, assetName: string | null): ClonedMatEntry[] {
  const entries: ClonedMatEntry[] = [];
  root.traverse((x) => {
    const m = x as THREE.Mesh;
    if (!m.isMesh) return;
    const isFloor = FLOOR_NAME_RE.test(m.name || "") || FLOOR_NAME_RE.test(assetName || "");
    m.userData.twinObjId = objId;
    m.userData.isFloor = isFloor;
    const srcMats = Array.isArray(m.material) ? m.material : [m.material];
    const cloned = srcMats.map((src) => {
      const c = src.clone();
      const handle = installOcclusionShader(c);
      entries.push({ mat: c, handle, isFloor });
      return c;
    });
    m.material = Array.isArray(m.material) ? cloned : cloned[0];
  });
  return entries;
}

function buildLodGroup(
  parts: LodPart[],
  objId: string,
  assetName: string | null,
  castShadow: boolean,
  entries: ClonedMatEntry[],
): THREE.Group {
  const group = new THREE.Group();
  group.visible = false;
  for (const p of parts) {
    const mat = p.material.clone();
    const isFloor = p.isFloor || FLOOR_NAME_RE.test(assetName || "");
    const handle = installOcclusionShader(mat);
    entries.push({ mat, handle, isFloor });
    const mesh = new THREE.Mesh(p.geometry, mat);
    mesh.matrixAutoUpdate = false;
    mesh.matrix.copy(p.matrix);
    mesh.castShadow = castShadow;
    mesh.receiveShadow = true;
    mesh.userData.twinObjId = objId;
    mesh.userData.isFloor = isFloor;
    group.add(mesh);
  }
  return group;
}

function ModelRigRenderer({ o, ctx, selected, groupRef, contentRef, scene, info }: ModelProps & { scene: THREE.Object3D; info: AssetInfo }) {
  const clone = useMemo(() => cloneSkinned(scene), [scene]);
  const rig = useMemo(() => buildRig(clone), [clone]);

  const { lod1Group, lod2Group, matEntries } = useMemo(() => {
    const entries = cloneObjectMaterials(clone, o.id, o.asset);
    const l1Parts = info.lod1.parts.length > 0 ? info.lod1.parts : info.parts;
    const l2Parts = info.lod2.parts.length > 0 ? info.lod2.parts : l1Parts;
    const l1 = buildLodGroup(l1Parts, o.id, o.asset, true, entries);
    const l2 = buildLodGroup(l2Parts, o.id, o.asset, false, entries);
    return { lod1Group: l1, lod2Group: l2, matEntries: entries };
  }, [clone, info, o.id, o.asset]);

  const helper = useMemo(() => new THREE.Box3Helper(info.bbox, 0x22d3ee), [info]);
  const { runtime, vis, occludedIds, onJointDefs, prefs } = ctx;

  // Dispose only the cloned materials (geometries belong to cached AssetInfo / GLTF)
  useEffect(() => () => {
    for (const e of matEntries) e.mat.dispose();
  }, [matEntries]);

  useEffect(() => {
    const applyCull = (root: THREE.Object3D, cast: boolean) => {
      root.traverse((x) => {
        const m = x as THREE.Mesh;
        if (m.isMesh) {
          m.castShadow = cast;
          m.receiveShadow = true;
          m.frustumCulled = prefs.frustumCull;
        }
      });
    };
    applyCull(clone, true);
    applyCull(lod1Group, true);
    applyCull(lod2Group, false);
  }, [clone, lod1Group, lod2Group, prefs.frustumCull]);

  useEffect(() => { onJointDefs(o.asset!, rig.map((r) => r.def)); }, [rig, o.asset, onJointDefs]);
  useEffect(() => { for (const r of rig) applyJoint(r, o.joints[r.def.name] ?? 0); }, [rig, o.joints]);

  // Let runtime drive joints and visibility system cull / swap calculated LODs
  useEffect(() => {
    const g = groupRef.current;
    const c = contentRef.current;
    if (!g || !c) return;
    runtime.attach(o.id, g, rig);
    vis.current.set(o.id, {
      id: o.id,
      group: g,
      content: c,
      detail: clone,
      lod1: lod1Group,
      lod2: lod2Group,
      center: info.center,
      radius: info.radius,
    });
    return () => {
      runtime.detach(o.id, g);
      vis.current.delete(o.id);
    };
  }, [o.id, rig, clone, lod1Group, lod2Group, info, runtime, vis, groupRef, contentRef]);

  // Smoothly interpolate GLSL occlusion alpha-blending shader + manual object opacity
  const manualOpacity = o.opacity ?? 1;
  useFrame((_, dt) => {
    const blocked = prefs.autoTransparentOccluding && occludedIds.current.has(o.id);
    for (let i = 0; i < matEntries.length; i++) {
      const entry = matEntries[i];
      stepOcclusionMaterial(
        entry.mat,
        entry.handle,
        blocked && !entry.isFloor,
        prefs.occlusionOpacity,
        manualOpacity,
        dt,
      );
    }
  });

  return (
    <>
      <primitive object={clone} />
      <primitive object={lod1Group} />
      <primitive object={lod2Group} />
      {selected && prefs.showGizmos && <primitive object={helper} />}
    </>
  );
}

// ---------------------------------------------------------------------------
// Light sources.
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
// Selection gizmo stand-in for static instanced objects.
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
  if (!show) return null;
  return <primitive object={helper} />;
}
