import * as THREE from "three";
import { useGLTF } from "@react-three/drei";
import { buildCalculatedLodTiers, triangleCount, type ComputedLod, type SourcePart } from "./lodCompute";

/** Everything the instancing / culling / LOD / occlusion code needs to know about one Supabase GLTF model, computed once. */
export interface AssetInfo {
  /** The model's meshes with their transform relative to the model root. One InstancedMesh per part. */
  parts: SourcePart[];
  /** Calculated medium-detail LOD1 (~45% tris, micro-parts filtered, material-bucket merged). */
  lod1: ComputedLod;
  /** Calculated coarse-detail LOD2 (~18% tris, structural silhouette preserved). */
  lod2: ComputedLod;
  bbox: THREE.Box3;
  center: THREE.Vector3;
  radius: number;                 // bounding-sphere radius (for culling & LOD scaling)
  boxMatrix: THREE.Matrix4;       // unit box -> bounding box matrix (for gizmo helpers)
  color: THREE.Color;             // dominant colour
  triangles: number;              // LOD0 triangle count
  lod1Triangles: number;
  lod2Triangles: number;
}

const cache = new WeakMap<THREE.Object3D, AssetInfo>();
const FLOOR_NAME_RE = /floor|lane|track|ground|slab|apron/i;

export function buildAssetInfo(scene: THREE.Object3D): AssetInfo {
  const hit = cache.get(scene);
  if (hit) return hit;
  scene.updateMatrixWorld(true);

  const parts: SourcePart[] = [];
  const color = new THREE.Color(0, 0, 0);
  let weight = 0;
  let triangles = 0;
  const pb = new THREE.Box3();
  const size = new THREE.Vector3();
  const partCenter = new THREE.Vector3();

  scene.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh || !m.geometry) return;
    const material = Array.isArray(m.material) ? m.material[0] : m.material;
    pb.setFromObject(m);
    pb.getSize(size);
    pb.getCenter(partCenter);
    const diag = size.length();
    const isFloor = FLOOR_NAME_RE.test(m.name || "") || (size.y < 0.25 && partCenter.y < 0.2);

    parts.push({
      geometry: m.geometry,
      material,
      matrix: m.matrixWorld.clone(),
      name: m.name || `part_${parts.length}`,
      isFloor,
      diag,
    });

    triangles += triangleCount(m.geometry);

    const w = Math.max(size.x * size.y * size.z, 1e-6);
    const c = (material as THREE.MeshStandardMaterial)?.color;
    if (c) {
      color.r += c.r * w;
      color.g += c.g * w;
      color.b += c.b * w;
      weight += w;
    }
  });

  if (weight > 0) color.multiplyScalar(1 / weight);
  else color.set("#8b6ff5");

  const bbox = new THREE.Box3().setFromObject(scene);
  const center = bbox.getCenter(new THREE.Vector3());
  const dims = bbox.getSize(new THREE.Vector3());
  const radius = dims.length() / 2;
  const { lod1, lod2 } = buildCalculatedLodTiers(parts, radius);

  const info: AssetInfo = {
    parts,
    lod1,
    lod2,
    bbox,
    center,
    radius,
    boxMatrix: new THREE.Matrix4().compose(center, new THREE.Quaternion(), dims),
    color,
    triangles,
    lod1Triangles: lod1.triangles,
    lod2Triangles: lod2.triangles,
  };
  cache.set(scene, info);
  return info;
}

export function useAssetInfo(url: string): { scene: THREE.Object3D; info: AssetInfo } {
  const { scene } = useGLTF(url);
  return { scene, info: buildAssetInfo(scene) };
}
