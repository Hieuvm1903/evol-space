import React, { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useThree } from "@react-three/fiber";
import { OrbitControls, TransformControls, Grid, useGLTF } from "@react-three/drei";
import * as THREE from "three";
import { clone as cloneSkinned } from "three/examples/jsm/utils/SkeletonUtils.js";
import type { CanvasBridge, JointDef, SceneObjectData, Vec3 } from "../../lib/workTypes";

// ---------------------------------------------------------------------------
// Joints. sand3d exports each joint as a named node: `userData.s3d_joint` holds
// { name, type, axis, lower, upper } and the moving part is the node's child.
// The axis is in the NODE's local space, and the node may carry its own rest
// rotation (the robot's wheels do) — so we always apply motion relative to the
// rest pose instead of overwriting it.
// ---------------------------------------------------------------------------
interface JointRig {
  def: JointDef;
  node: THREE.Object3D;
  axis: THREE.Vector3;
  restPos: THREE.Vector3;
  restQuat: THREE.Quaternion;
  parentScale: number; // node units -> metres (sand3d nodes are in mm under a scaled root)
}

function buildRig(root: THREE.Object3D): JointRig[] {
  root.updateMatrixWorld(true);
  const out: JointRig[] = [];
  const v = new THREE.Vector3();
  root.traverse((o) => {
    const j = o.userData?.s3d_joint;
    if (!j || !Array.isArray(j.axis)) return;
    out.push({
      def: { name: j.name ?? o.name, type: j.type, lower: j.lower ?? 0, upper: j.upper ?? 0 },
      node: o,
      axis: new THREE.Vector3(j.axis[0], j.axis[1], j.axis[2]).normalize(),
      restPos: o.position.clone(),
      restQuat: o.quaternion.clone(),
      parentScale: o.parent ? o.parent.getWorldScale(v).x || 1 : 1,
    });
  });
  return out;
}

const _q = new THREE.Quaternion();
function applyJoint(r: JointRig, value: number) {
  if (r.def.type === "prismatic") {
    const d = r.axis.clone().applyQuaternion(r.restQuat).multiplyScalar(value / r.parentScale);
    r.node.position.copy(r.restPos).add(d);
  } else {
    r.node.quaternion.copy(r.restQuat).multiply(_q.setFromAxisAngle(r.axis, value));
  }
}

// ---------------------------------------------------------------------------
// One placed object
// ---------------------------------------------------------------------------
interface SceneObjectProps {
  data: SceneObjectData;
  url: string;
  selected: boolean;
  onSelect: (id: string) => void;
  register: (id: string, node: THREE.Object3D | null) => void;
  onJointDefs: (asset: string, defs: JointDef[]) => void;
}

function SceneObject({ data, url, selected, onSelect, register, onJointDefs }: SceneObjectProps) {
  const { scene } = useGLTF(url);
  // Each placed object needs its own copy of the node tree (own joints, own transform).
  const clone = useMemo(() => cloneSkinned(scene), [scene]);
  const rig = useMemo(() => buildRig(clone), [clone]);
  const helper = useMemo(() => new THREE.Box3Helper(new THREE.Box3().setFromObject(clone), 0x22d3ee), [clone]);

  const setRef = useCallback((n: THREE.Group | null) => register(data.id, n), [register, data.id]);

  useEffect(() => {
    clone.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; }
    });
  }, [clone]);

  useEffect(() => { onJointDefs(data.asset, rig.map((r) => r.def)); }, [rig, data.asset, onJointDefs]);

  useEffect(() => {
    for (const r of rig) applyJoint(r, data.joints[r.def.name] ?? 0);
  }, [rig, data.joints]);

  return (
    <group
      ref={setRef}
      position={data.position}
      rotation={[0, THREE.MathUtils.degToRad(data.rotationY), 0]}
      scale={data.scale}
      onClick={(e) => {
        if (e.delta > 4) return;        // it was an orbit drag, not a click
        e.stopPropagation();
        onSelect(data.id);
      }}
    >
      <primitive object={clone} />
      {selected && <primitive object={helper} />}
    </group>
  );
}

// ---------------------------------------------------------------------------
// Lets DOM code ask "where on the floor is this screen point?"
// ---------------------------------------------------------------------------
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

// ---------------------------------------------------------------------------
// The canvas
// ---------------------------------------------------------------------------
export interface WorkCanvasProps {
  objects: SceneObjectData[];
  assetUrls: Record<string, string>;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onTransformEnd: (id: string, position: Vec3, rotationY: number) => void;
  mode: "translate" | "rotate";
  snap: boolean;
  bridgeRef: React.MutableRefObject<CanvasBridge | null>;
  onJointDefs: (asset: string, defs: JointDef[]) => void;
}

export default function WorkCanvas({
  objects, assetUrls, selectedId, onSelect, onTransformEnd, mode, snap, bridgeRef, onJointDefs,
}: WorkCanvasProps) {
  const groups = useRef(new Map<string, THREE.Object3D>());
  const selectedRef = useRef<string | null>(selectedId);
  const gizmoBusy = useRef(false);
  const [selGroup, setSelGroup] = useState<THREE.Object3D | null>(null);

  const register = useCallback((id: string, node: THREE.Object3D | null) => {
    if (node) groups.current.set(id, node); else groups.current.delete(id);
    if (id === selectedRef.current) setSelGroup(node);
  }, []);

  useEffect(() => {
    selectedRef.current = selectedId;
    setSelGroup(selectedId ? groups.current.get(selectedId) ?? null : null);
  }, [selectedId]);

  return (
    <Canvas
      shadows
      dpr={[1, 2]}
      camera={{ position: [9, 7, 11], fov: 40, near: 0.05, far: 300 }}
      // Clicking the transform gizmo counts as "clicking nothing" to r3f — ignore that.
      onPointerMissed={() => { if (!gizmoBusy.current) onSelect(null); }}
    >
      <color attach="background" args={["#07060f"]} />
      <ambientLight intensity={0.7} color="#8f84e0" />
      <directionalLight
        position={[8, 14, 8]} intensity={1.1} castShadow
        shadow-mapSize={[2048, 2048]} shadow-bias={-0.0004}
        shadow-camera-left={-14} shadow-camera-right={14} shadow-camera-top={14} shadow-camera-bottom={-14}
      />
      <hemisphereLight args={["#22d3ee", "#14121f", 0.25]} />

      <Grid
        position={[0, 0.001, 0]} infiniteGrid cellSize={0.5} sectionSize={2.5}
        cellColor="#2a2740" sectionColor="#8b6ff5" cellThickness={0.6} sectionThickness={1.2}
        fadeDistance={45} fadeStrength={1.5}
      />

      {objects.map((o) =>
        assetUrls[o.asset] ? (
          <Suspense key={o.id} fallback={null}>
            <SceneObject
              data={o} url={assetUrls[o.asset]} selected={o.id === selectedId}
              onSelect={onSelect} register={register} onJointDefs={onJointDefs}
            />
          </Suspense>
        ) : null,
      )}

      {selGroup && (
        <TransformControls
          object={selGroup}
          mode={mode}
          // Objects stay on the floor: move on X/Z, rotate around Y.
          showX={mode === "translate"} showY={mode === "rotate"} showZ={mode === "translate"}
          translationSnap={snap ? 0.1 : null}
          rotationSnap={snap ? THREE.MathUtils.degToRad(15) : null}
          onMouseDown={() => { gizmoBusy.current = true; }}
          onMouseUp={() => {
            const g = selGroup;
            if (selectedRef.current) {
              onTransformEnd(
                selectedRef.current,
                [round(g.position.x), round(g.position.y), round(g.position.z)],
                Math.round(THREE.MathUtils.radToDeg(g.rotation.y) * 10) / 10,
              );
            }
            setTimeout(() => { gizmoBusy.current = false; }, 60);
          }}
        />
      )}

      <OrbitControls
        makeDefault enableDamping target={[0, 0, 2]}
        minDistance={1.5} maxDistance={60} maxPolarAngle={Math.PI / 2 - 0.03}
      />
      <Bridge bridgeRef={bridgeRef} />
    </Canvas>
  );
}

const round = (n: number) => Math.round(n * 1000) / 1000;
