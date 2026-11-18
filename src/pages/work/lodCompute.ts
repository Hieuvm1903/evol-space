import * as THREE from "three";
import { SimplifyModifier } from "three/examples/jsm/modifiers/SimplifyModifier.js";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

export interface SourcePart {
  geometry: THREE.BufferGeometry;
  material: THREE.Material;
  matrix: THREE.Matrix4;
  name: string;
  isFloor: boolean;
  diag: number;
}

export interface LodPart {
  geometry: THREE.BufferGeometry;
  material: THREE.Material;
  matrix: THREE.Matrix4;
  name: string;
  isFloor: boolean;
}

export interface ComputedLod {
  parts: LodPart[];
  triangles: number;
}

const _simplify = new SimplifyModifier();
const IDENTITY = new THREE.Matrix4();

export function triangleCount(geom: THREE.BufferGeometry): number {
  const pos = geom.getAttribute("position");
  if (!pos) return 0;
  return Math.floor((geom.index ? geom.index.count : pos.count) / 3);
}

export const BASE_PERSP_FOV = 42;
export const BASE_ORTHO_SPAN = 20;

/** Returns equivalent perspective distance + fov for either PerspectiveCamera or OrthographicCamera. */
export function cameraLodParams(
  camera: THREE.Camera,
  distanceToObj: number,
): { effDistance: number; fovDeg: number } {
  if ((camera as THREE.OrthographicCamera).isOrthographicCamera) {
    const ortho = camera as THREE.OrthographicCamera;
    const visH = Math.abs(ortho.top - ortho.bottom) / Math.max(0.01, ortho.zoom);
    const equivDist = visH / (2 * Math.tan((BASE_PERSP_FOV * Math.PI) / 360));
    return { effDistance: equivDist, fovDeg: BASE_PERSP_FOV };
  }
  const persp = camera as THREE.PerspectiveCamera;
  return { effDistance: distanceToObj, fovDeg: persp.fov ?? BASE_PERSP_FOV };
}

/**
 * Computes perspective-normalized LOD tier:
 *   0 = full detail (LOD0)
 *   1 = calculated mid-detail mesh (LOD1)
 *   2 = calculated coarse-detail mesh (LOD2)
 * Larger objects keep detail farther; smaller objects drop detail sooner.
 */
export function computeLodTier(
  distance: number,
  radius: number,
  lodDist: number,
  fovDeg = 42,
): 0 | 1 | 2 {
  if (!Number.isFinite(lodDist)) return 0;
  const scaleRadius = Math.min(3.5, Math.max(0.45, Math.pow(Math.max(radius, 0.1), 0.55)));
  const fovScale = Math.tan((42 * Math.PI) / 360) / Math.tan(((fovDeg || 42) * Math.PI) / 360);
  const effectiveDist = distance / Math.max(0.2, scaleRadius * fovScale);
  if (effectiveDist <= lodDist) return 0;
  if (effectiveDist <= lodDist * 2.15) return 1;
  return 2;
}

/**
 * Fast O(N) Spatial Voxel Vertex Clustering for large meshes (>900 tris).
 * Preserves silhouette without SimplifyModifier's O(N^2) slowdown.
 */
export function voxelClusterSimplify(
  source: THREE.BufferGeometry,
  gridResolution: number,
): THREE.BufferGeometry {
  const posAttr = source.getAttribute("position");
  if (!posAttr || posAttr.count < 12) return source.clone();

  source.computeBoundingBox();
  const bb = source.boundingBox;
  if (!bb) return source.clone();

  const sx = bb.max.x - bb.min.x;
  const sy = bb.max.y - bb.min.y;
  const sz = bb.max.z - bb.min.z;
  const maxDim = Math.max(sx, sy, sz, 1e-4);
  const res = Math.max(3, Math.floor(gridResolution));

  const runCluster = (cellSize: number): { verts: Float32Array; indices: number[] } => {
    const inv = 1 / cellSize;
    const cellMap = new Map<string, number>();
    const sums: number[] = []; // [xSum, ySum, zSum, count, uSum, vSum, uvCount]
    const hasUv = !!source.getAttribute("uv");
    const uvAttr = source.getAttribute("uv");

    const vCount = posAttr.count;
    const remap = new Int32Array(vCount);

    for (let i = 0; i < vCount; i++) {
      const x = posAttr.getX(i);
      const y = posAttr.getY(i);
      const z = posAttr.getZ(i);
      const gx = Math.floor((x - bb.min.x) * inv);
      const gy = Math.floor((y - bb.min.y) * inv);
      const gz = Math.floor((z - bb.min.z) * inv);
      const key = `${gx},${gy},${gz}`;
      let cid = cellMap.get(key);
      if (cid === undefined) {
        cid = cellMap.size;
        cellMap.set(key, cid);
        sums.push(0, 0, 0, 0, 0, 0, 0);
      }
      const base = cid * 7;
      sums[base] += x;
      sums[base + 1] += y;
      sums[base + 2] += z;
      sums[base + 3] += 1;
      if (hasUv && uvAttr) {
        sums[base + 4] += uvAttr.getX(i);
        sums[base + 5] += uvAttr.getY(i);
        sums[base + 6] += 1;
      }
      remap[i] = cid;
    }

    const numCells = cellMap.size;
    const verts = new Float32Array(numCells * 3);
    for (let cid = 0; cid < numCells; cid++) {
      const base = cid * 7;
      const cnt = sums[base + 3] || 1;
      verts[cid * 3] = sums[base] / cnt;
      verts[cid * 3 + 1] = sums[base + 1] / cnt;
      verts[cid * 3 + 2] = sums[base + 2] / cnt;
    }

    const srcIdx = source.index;
    const triTotal = srcIdx ? Math.floor(srcIdx.count / 3) : Math.floor(vCount / 3);
    const outIndices: number[] = [];
    for (let t = 0; t < triTotal; t++) {
      const a0 = srcIdx ? srcIdx.getX(t * 3) : t * 3;
      const b0 = srcIdx ? srcIdx.getX(t * 3 + 1) : t * 3 + 1;
      const c0 = srcIdx ? srcIdx.getX(t * 3 + 2) : t * 3 + 2;
      const a = remap[a0];
      const b = remap[b0];
      const c = remap[c0];
      if (a !== b && b !== c && a !== c) {
        outIndices.push(a, b, c);
      }
    }

    return { verts, indices: outIndices };
  };

  let cellSize = maxDim / res;
  let result = runCluster(cellSize);
  const srcTris = triangleCount(source);
  // Refine if clustering collapsed too aggressively
  if (result.indices.length / 3 < Math.max(8, srcTris * 0.08)) {
    cellSize *= 0.58;
    const refined = runCluster(cellSize);
    if (refined.indices.length > result.indices.length) {
      result = refined;
    }
  }

  if (result.indices.length < 3) {
    return source.clone();
  }

  const out = new THREE.BufferGeometry();
  out.setAttribute("position", new THREE.BufferAttribute(result.verts, 3));
  out.setIndex(result.indices);
  out.computeVertexNormals();
  out.computeBoundingBox();
  out.computeBoundingSphere();
  return out;
}

/**
 * Decimates a geometry using SimplifyModifier for small/medium meshes (<=900 tris)
 * and Spatial Voxel Vertex Clustering for larger meshes (>900 tris).
 */
export function simplifyPartGeometry(
  geom: THREE.BufferGeometry,
  targetRatio: number,
  voxelGridRes: number,
): THREE.BufferGeometry {
  const tris = triangleCount(geom);
  if (tris <= 24) return geom;

  if (tris <= 900) {
    try {
      const posCount = geom.getAttribute("position")?.count ?? 0;
      const removeCount = Math.max(0, Math.floor(posCount * (1 - targetRatio)));
      if (removeCount > 3) {
        const simplified = _simplify.modify(geom, removeCount) as unknown as THREE.BufferGeometry;
        if (simplified && triangleCount(simplified) >= 4) {
          simplified.computeVertexNormals();
          simplified.computeBoundingBox();
          simplified.computeBoundingSphere();
          return simplified;
        }
        simplified?.dispose();
      }
    } catch {
      // Fallback to voxel clustering if topology has non-manifold edges
    }
  }

  return voxelClusterSimplify(geom, voxelGridRes);
}

function materialHasTexture(mat: THREE.Material): boolean {
  const m = mat as THREE.MeshStandardMaterial;
  return Boolean(m.map || m.normalMap || m.roughnessMap || m.metalnessMap || m.emissiveMap);
}

function prepareBakedGeometry(
  source: THREE.BufferGeometry,
  matrix: THREE.Matrix4,
  keepUv: boolean,
): THREE.BufferGeometry | null {
  if (!source.getAttribute("position")) return null;
  let g = source.index ? source.toNonIndexed() : source.clone();

  // Strip unsupported/mismatched attributes before merging
  for (const attrName of Object.keys(g.attributes)) {
    if (attrName === "position" || attrName === "normal") continue;
    if (keepUv && attrName === "uv") continue;
    g.deleteAttribute(attrName);
  }

  g.applyMatrix4(matrix);
  if (!g.getAttribute("normal")) {
    g.computeVertexNormals();
  }
  if (keepUv && !g.getAttribute("uv")) {
    const count = g.getAttribute("position").count;
    g.setAttribute("uv", new THREE.BufferAttribute(new Float32Array(count * 2), 2));
  }
  return g;
}

function buildTier(
  parts: SourcePart[],
  radius: number,
  minDiagRatio: number,
  targetRatio: number,
  voxelGridRes: number,
  tierLabel: string,
): ComputedLod {
  if (parts.length === 0) return { parts: [], triangles: 0 };

  // Find largest part so small assets never drop to 0 parts
  let largestIdx = 0;
  for (let i = 1; i < parts.length; i++) {
    if (parts[i].diag > parts[largestIdx].diag) largestIdx = i;
  }

  const minDiag = Math.max(0, radius * minDiagRatio);
  const kept = parts.filter((p, idx) => idx === largestIdx || p.isFloor || p.diag >= minDiag);

  // Bucket kept parts by material + floor classification so floors stay isolated from walls
  const buckets = new Map<string, SourcePart[]>();
  for (const p of kept) {
    const key = `${p.material.uuid}:${p.isFloor ? "floor" : "solid"}`;
    const list = buckets.get(key);
    if (list) list.push(p);
    else buckets.set(key, [p]);
  }

  const outParts: LodPart[] = [];
  let totalTris = 0;

  for (const group of buckets.values()) {
    const mat = group[0].material;
    const isFloor = group[0].isFloor;
    const keepUv = materialHasTexture(mat) && group.every((p) => !!p.geometry.getAttribute("uv"));

    const baked: THREE.BufferGeometry[] = [];
    for (const p of group) {
      const bg = prepareBakedGeometry(p.geometry, p.matrix, keepUv);
      if (bg) baked.push(bg);
    }
    if (baked.length === 0) continue;

    let merged: THREE.BufferGeometry | null = null;
    if (baked.length === 1) {
      merged = baked[0];
    } else {
      merged = mergeGeometries(baked, false);
      for (const b of baked) b.dispose();
    }
    if (!merged) continue;

    const simplified = simplifyPartGeometry(merged, targetRatio, voxelGridRes);
    if (simplified !== merged) {
      merged.dispose();
    }
    simplified.computeBoundingBox();
    simplified.computeBoundingSphere();

    const tris = triangleCount(simplified);
    totalTris += tris;
    outParts.push({
      geometry: simplified,
      material: mat,
      matrix: IDENTITY.clone(),
      name: `${group[0].name}_${tierLabel}`,
      isFloor,
    });
  }

  return { parts: outParts, triangles: totalTris };
}

/**
 * Generates mathematically calculated LOD1 (mid detail) and LOD2 (coarse detail)
 * tiers from the actual loaded GLTF sub-meshes.
 */
export function buildCalculatedLodTiers(
  parts: SourcePart[],
  radius: number,
): { lod1: ComputedLod; lod2: ComputedLod } {
  const lod1 = buildTier(parts, radius, 0.045, 0.45, 14, "lod1");
  const lod2 = buildTier(parts, radius, 0.11, 0.18, 7, "lod2");
  return { lod1, lod2 };
}
