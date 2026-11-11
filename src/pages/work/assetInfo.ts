import * as THREE from "three";
import { useGLTF } from "@react-three/drei";

/** Everything the instancing / culling / LOD code needs to know about one model, computed once. */
export interface AssetInfo {
  /** The model's meshes with their transform relative to the model root. One InstancedMesh per part. */
  parts: { geometry: THREE.BufferGeometry; material: THREE.Material; matrix: THREE.Matrix4 }[];
  bbox: THREE.Box3;
  center: THREE.Vector3;
  radius: number;                 // bounding-sphere radius (for culling)
  boxMatrix: THREE.Matrix4;       // unit box -> this model's bounding box (the LOD proxy)
  color: THREE.Color;             // dominant colour (for the LOD proxy)
  triangles: number;
}

const cache = new WeakMap<THREE.Object3D, AssetInfo>();

export function buildAssetInfo(scene: THREE.Object3D): AssetInfo {
  const hit = cache.get(scene);
  if (hit) return hit;
  scene.updateMatrixWorld(true);

  const parts: AssetInfo["parts"] = [];
  const color = new THREE.Color(0, 0, 0);
  let weight = 0, triangles = 0;
  const pb = new THREE.Box3(), size = new THREE.Vector3();

  scene.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    const material = Array.isArray(m.material) ? m.material[0] : m.material;
    parts.push({ geometry: m.geometry, material, matrix: m.matrixWorld.clone() });
    const pos = m.geometry.getAttribute("position");
    triangles += (m.geometry.index ? m.geometry.index.count : pos.count) / 3;
    // weight the proxy colour by how big each part is
    pb.setFromObject(m).getSize(size);
    const w = Math.max(size.x * size.y * size.z, 1e-6);
    const c = (material as THREE.MeshStandardMaterial).color;
    if (c) { color.r += c.r * w; color.g += c.g * w; color.b += c.b * w; weight += w; }
  });
  if (weight > 0) color.multiplyScalar(1 / weight); else color.set("#8b6ff5");

  const bbox = new THREE.Box3().setFromObject(scene);
  const center = bbox.getCenter(new THREE.Vector3());
  const dims = bbox.getSize(new THREE.Vector3());
  const info: AssetInfo = {
    parts, bbox, center, radius: dims.length() / 2,
    boxMatrix: new THREE.Matrix4().compose(center, new THREE.Quaternion(), dims),
    color, triangles,
  };
  cache.set(scene, info);
  return info;
}

export function useAssetInfo(url: string): { scene: THREE.Object3D; info: AssetInfo } {
  const { scene } = useGLTF(url);
  return { scene, info: buildAssetInfo(scene) };
}
