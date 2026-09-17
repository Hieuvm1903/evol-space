import React, { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { useLoader, useFrame } from "@react-three/fiber";
import { OBJLoader } from "three/examples/jsm/loaders/OBJLoader.js";
import { STLLoader } from "three/examples/jsm/loaders/STLLoader.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import type { BehaviorState, LoadedModel, ModelStats, TransformState } from "./types";
import type { DriveKeys } from "./useKeyboardDrive";

interface ModelMeshProps {
  model: LoadedModel;
  transform: TransformState;
  behavior: BehaviorState;
  driveKeysRef: React.MutableRefObject<DriveKeys>;
  onStats: (s: ModelStats) => void;
  resetToken: number;
}

function computeStats(root: THREE.Object3D): ModelStats {
  let triangles = 0;
  let vertices = 0;
  let objects = 0;
  root.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (!mesh.isMesh || !mesh.geometry) return;
    objects++;
    const geom = mesh.geometry;
    const pos = geom.getAttribute("position");
    if (pos) vertices += pos.count;
    if (geom.index) triangles += geom.index.count / 3;
    else if (pos) triangles += pos.count / 3;
  });
  return { triangles: Math.round(triangles), vertices, objects: objects || 1 };
}

/** Shared frame-loop + auto-fit logic for any loaded THREE.Object3D,
 * regardless of which loader produced it. */
function AnimatedModel({
  object, transform, behavior, driveKeysRef, onStats, resetToken,
}: ModelMeshProps & { object: THREE.Object3D }) {
  const groupRef = useRef<THREE.Group>(null);
  const [fit, setFit] = useState<{ scale: number; center: THREE.Vector3 }>({
    scale: 1, center: new THREE.Vector3(),
  });

  const onStatsRef = useRef(onStats);
  onStatsRef.current = onStats;

  useEffect(() => {
    const box = new THREE.Box3().setFromObject(object);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z) || 1;
    setFit({ scale: 2 / maxDim, center });
    onStatsRef.current(computeStats(object));
  }, [object]);

  const driveOffset = useRef(new THREE.Vector3());
  const driveYaw = useRef(0);
  const spinAngle = useRef(0);
  const bobPhase = useRef(0);

  useEffect(() => {
    driveOffset.current.set(0, 0, 0);
    driveYaw.current = 0;
    spinAngle.current = 0;
    bobPhase.current = 0;
  }, [resetToken, object]);

  useFrame((_, delta) => {
    const group = groupRef.current;
    if (!group) return;

    if (behavior.driveEnabled) {
      const keys = driveKeysRef.current;
      if (keys.turnLeft) driveYaw.current += behavior.turnSpeed * delta;
      if (keys.turnRight) driveYaw.current -= behavior.turnSpeed * delta;

      const forward = new THREE.Vector3(0, 0, -1).applyAxisAngle(new THREE.Vector3(0, 1, 0), driveYaw.current);
      const right = new THREE.Vector3(1, 0, 0).applyAxisAngle(new THREE.Vector3(0, 1, 0), driveYaw.current);
      const move = new THREE.Vector3();
      if (keys.forward) move.add(forward);
      if (keys.backward) move.addScaledVector(forward, -1);
      if (keys.right) move.addScaledVector(right, 1);
      if (keys.left) move.addScaledVector(right, -1);
      if (move.lengthSq() > 0) {
        move.normalize().multiplyScalar(behavior.driveSpeed * delta);
        driveOffset.current.add(move);
      }
    }

    if (behavior.autoRotate) spinAngle.current += behavior.rotateSpeed * delta;
    if (behavior.bobbing) bobPhase.current += delta * behavior.bobSpeed;
    const bobY = behavior.bobbing ? Math.sin(bobPhase.current) * behavior.bobAmplitude : 0;

    group.position.set(
      transform.position[0] + driveOffset.current.x,
      transform.position[1] + driveOffset.current.y + bobY,
      transform.position[2] + driveOffset.current.z,
    );
    group.rotation.set(
      transform.rotation[0] + (behavior.autoRotate && behavior.rotateAxis === "x" ? spinAngle.current : 0),
      transform.rotation[1] + driveYaw.current + (behavior.autoRotate && behavior.rotateAxis === "y" ? spinAngle.current : 0),
      transform.rotation[2] + (behavior.autoRotate && behavior.rotateAxis === "z" ? spinAngle.current : 0),
    );
    group.scale.setScalar(transform.scale);
  });

  return (
    <group ref={groupRef}>
      <group
        position={[-fit.center.x * fit.scale, -fit.center.y * fit.scale, -fit.center.z * fit.scale]}
        scale={fit.scale}
      >
        <primitive object={object} />
      </group>
    </group>
  );
}

// One tiny wrapper per format so each only ever calls its own loader hook
// (keeps things rules-of-hooks safe — the parent switches which of these
// mounts, rather than branching inside a single component).
function ObjModel(props: ModelMeshProps) {
  const object = useLoader(OBJLoader, props.model.url);
  return <AnimatedModel {...props} object={object} />;
}

function StlModel(props: ModelMeshProps) {
  const geometry = useLoader(STLLoader, props.model.url);
  const object = useMemo(() => {
    if (!geometry.getAttribute("normal")) geometry.computeVertexNormals();
    return new THREE.Mesh(
      geometry,
      new THREE.MeshStandardMaterial({ color: "#8b6ff5", metalness: 0.15, roughness: 0.55 }),
    );
  }, [geometry]);
  return <AnimatedModel {...props} object={object} />;
}

function GlbModel(props: ModelMeshProps) {
  const gltf = useLoader(GLTFLoader, props.model.url);
  return <AnimatedModel {...props} object={gltf.scene} />;
}

export default function ModelMesh(props: ModelMeshProps) {
  switch (props.model.format) {
    case "obj": return <ObjModel {...props} />;
    case "stl": return <StlModel {...props} />;
    case "glb":
    case "gltf": return <GlbModel {...props} />;
    default: return null;
  }
}