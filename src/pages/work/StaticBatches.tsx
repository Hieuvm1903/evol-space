import React, { Suspense, useEffect, useMemo, useRef } from "react";
import { useFrame, type ThreeEvent } from "@react-three/fiber";
import * as THREE from "three";
import { useAssetInfo, type AssetInfo } from "./assetInfo";
import { cameraLodParams, computeLodTier, type LodPart } from "./lodCompute";
import {
  installOcclusionShader,
  stepOcclusionMaterial,
  type OcclusionShaderHandle,
} from "./occlusionShader";
import type { SceneObjectData } from "../../lib/workTypes";

/**
 * Static objects are rendered via GPU InstancedMesh batches across 3 calculated LOD tiers
 * (LOD0 full, LOD1 mid, LOD2 coarse) plus an optional shader-driven ghost InstancedMesh batch
 * for instances that are currently occluding the camera view.
 */
export interface BatchItem { id: string; m: THREE.Matrix4 }
export interface LiveDrag { ids: Set<string>; delta: THREE.Matrix4 }
export interface BatchCfg { frustum: boolean; cullDist: number; lodDist: number } // Infinity = off
export type PerfCounters = Record<string, { near: number; mid: number; far: number; culled: number; total: number }>;

function same(a: ArrayLike<number>, b: Float32Array) {
  for (let i = 0; i < 16; i++) if (a[i] !== b[i]) return false;
  return true;
}

interface BatchProps {
  asset: string;
  url: string;
  items: BatchItem[];
  byId: Map<string, SceneObjectData>;
  hidden: Set<string>;
  cfg: BatchCfg;
  live: React.MutableRefObject<LiveDrag | null>;
  dirty: React.MutableRefObject<number>;
  perf: React.MutableRefObject<PerfCounters>;
  occludedIds: React.MutableRefObject<Set<string>>;
  occludedParts: React.MutableRefObject<Set<string>>;
  occlusionSeq: React.MutableRefObject<number>;
  occlusionOpacity: number;
  onSelect: (id: string) => void;
}

function StaticBatch(props: BatchProps) {
  const { info } = useAssetInfo(props.url);
  return <StaticBatchRenderer {...props} info={info} />;
}

function createInstancedTier(
  parts: readonly { geometry: THREE.BufferGeometry; material: THREE.Material; matrix: THREE.Matrix4; name?: string; isFloor: boolean }[],
  cap: number,
  cloneMaterials: boolean,
  ghostOpacity: number | null,
  asset: string,
  idsRef: React.MutableRefObject<string[]>,
  castShadow: boolean,
  isLod0: boolean,
): THREE.InstancedMesh[] {
  return parts.map((p, i) => {
    let mat = p.material;
    if (cloneMaterials || ghostOpacity !== null) {
      mat = p.material.clone();
      installOcclusionShader(mat, ghostOpacity ?? 0.22, ghostOpacity !== null ? 1 : 0);
    }
    const im = new THREE.InstancedMesh(p.geometry, mat, cap);
    im.castShadow = ghostOpacity === null ? castShadow : false;
    im.receiveShadow = ghostOpacity === null;
    im.frustumCulled = false; // CPU per-instance culling runs instead
    im.count = 0;
    im.userData = {
      twinBatch: true,
      twinAsset: asset,
      partIndex: i,
      partName: p.name ?? "",
      isFloor: p.isFloor,
      isGhost: ghostOpacity !== null,
      isLod0,
      instanceIdsRef: idsRef,
    };
    return im;
  });
}

function StaticBatchRenderer({
  asset,
  items,
  byId,
  hidden,
  cfg,
  live,
  dirty,
  perf,
  occludedIds,
  occludedParts,
  occlusionSeq,
  occlusionOpacity,
  onSelect,
  info,
}: BatchProps & { info: AssetInfo }) {
  const cap = Math.max(1, items.length);
  const isSingleInstance = items.length === 1;

  const nearIds = useRef<string[]>([]);
  const midIds = useRef<string[]>([]);
  const farIds = useRef<string[]>([]);
  const ghostIds = useRef<string[]>([]);

  const lod1Source: LodPart[] = info.lod1.parts.length > 0 ? info.lod1.parts : info.parts;
  const lod2Source: LodPart[] = info.lod2.parts.length > 0 ? info.lod2.parts : lod1Source;

  const lod0Meshes = useMemo(
    () => createInstancedTier(info.parts, cap, isSingleInstance, null, asset, nearIds, true, true),
    [info, cap, isSingleInstance, asset],
  );
  const lod1Meshes = useMemo(
    () => createInstancedTier(lod1Source, cap, isSingleInstance, null, asset, midIds, true, false),
    [lod1Source, cap, isSingleInstance, asset],
  );
  const lod2Meshes = useMemo(
    () => createInstancedTier(lod2Source, cap, isSingleInstance, null, asset, farIds, false, false),
    [lod2Source, cap, isSingleInstance, asset],
  );
  const ghostMeshes = useMemo(
    () => createInstancedTier(lod1Source, cap, true, occlusionOpacity, asset, ghostIds, false, false),
    [lod1Source, cap, occlusionOpacity, asset],
  );

  // Dispose cloned materials & instance buffers (shared geometries stay in AssetInfo cache)
  useEffect(() => () => {
    for (const im of lod0Meshes) {
      if (isSingleInstance) (im.material as THREE.Material).dispose();
      im.dispose();
    }
    for (const im of lod1Meshes) {
      if (isSingleInstance) (im.material as THREE.Material).dispose();
      im.dispose();
    }
    for (const im of lod2Meshes) {
      if (isSingleInstance) (im.material as THREE.Material).dispose();
      im.dispose();
    }
    for (const im of ghostMeshes) {
      (im.material as THREE.Material).dispose();
      im.dispose();
    }
  }, [lod0Meshes, lod1Meshes, lod2Meshes, ghostMeshes, isSingleInstance]);

  useEffect(() => {
    for (const im of ghostMeshes) {
      const m = im.material as THREE.Material;
      const handle = m.userData.occHandle as OcclusionShaderHandle | undefined;
      if (handle) {
        handle.uOccOpacity.value = occlusionOpacity;
        handle.uOccActive.value = 1;
      }
    }
  }, [ghostMeshes, occlusionOpacity]);

  const force = useRef(true);
  useEffect(() => {
    force.current = true;
  }, [items, hidden, cfg, lod0Meshes, lod1Meshes, lod2Meshes, ghostMeshes]);

  const last = useRef({ view: new Float32Array(16), proj: new Float32Array(16), dirty: -1, occSeq: -1 });
  const t = useMemo(() => ({
    frustum: new THREE.Frustum(),
    pv: new THREE.Matrix4(),
    cam: new THREE.Vector3(),
    c: new THREE.Vector3(),
    sphere: new THREE.Sphere(),
    m: new THREE.Matrix4(),
    w: new THREE.Matrix4(),
  }), []);

  useFrame(({ camera }, dt) => {
    // 1) For single-instance large structures (e.g. warehouse.glb), drive the GLSL alpha-blending occlusion shader per part
    if (isSingleInstance) {
      const wholeBlocked = occludedIds.current.has(items[0].id);
      for (let i = 0; i < lod0Meshes.length; i++) {
        const im = lod0Meshes[i];
        const mat = im.material as THREE.Material;
        const handle = mat.userData.occHandle as OcclusionShaderHandle | undefined;
        if (!handle) continue;
        const blocked = !im.userData.isFloor && (occludedParts.current.has(`${asset}:${i}`) || wholeBlocked);
        stepOcclusionMaterial(mat, handle, blocked, occlusionOpacity, 1, dt);
      }
      for (const meshes of [lod1Meshes, lod2Meshes]) {
        for (let i = 0; i < meshes.length; i++) {
          const im = meshes[i];
          const mat = im.material as THREE.Material;
          const handle = mat.userData.occHandle as OcclusionShaderHandle | undefined;
          if (!handle) continue;
          const blocked = !im.userData.isFloor && wholeBlocked;
          stepOcclusionMaterial(mat, handle, blocked, occlusionOpacity, 1, dt);
        }
      }
    }

    // 2) Repack visible instance buffers when camera, scene dirty counter, or occlusion set changes
    const l = last.current;
    const changed =
      force.current ||
      l.dirty !== dirty.current ||
      l.occSeq !== occlusionSeq.current ||
      !same(camera.matrixWorld.elements, l.view) ||
      !same(camera.projectionMatrix.elements, l.proj);
    if (!changed) return;

    force.current = false;
    l.dirty = dirty.current;
    l.occSeq = occlusionSeq.current;
    l.view.set(camera.matrixWorld.elements);
    l.proj.set(camera.projectionMatrix.elements);

    camera.updateMatrixWorld();
    t.pv.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    t.frustum.setFromProjectionMatrix(t.pv);
    t.cam.setFromMatrixPosition(camera.matrixWorld);

    const drag = live.current;
    const near = nearIds.current;
    const mid = midIds.current;
    const far = farIds.current;
    const ghost = ghostIds.current;
    near.length = 0;
    mid.length = 0;
    far.length = 0;
    ghost.length = 0;
    let culled = 0;

    const occSet = occludedIds.current;

    const isAncestorOccluded = (id: string): boolean => {
      if (occSet.size === 0) return false;
      if (occSet.has(id)) return true;
      let cur = byId.get(id);
      for (let hop = 0; hop < 4 && cur?.parentId; hop++) {
        if (occSet.has(cur.parentId)) return true;
        cur = byId.get(cur.parentId);
      }
      return false;
    };

    for (const it of items) {
      if (hidden.has(it.id)) continue;
      const m = drag && drag.ids.has(it.id) ? t.w.multiplyMatrices(drag.delta, it.m) : it.m;
      t.c.copy(info.center).applyMatrix4(m);
      const r = info.radius * m.getMaxScaleOnAxis();
      const d = t.c.distanceTo(t.cam);
      const { effDistance, fovDeg: camFov } = cameraLodParams(camera, d);

      if (effDistance - r > cfg.cullDist) {
        culled++;
        continue;
      }
      if (cfg.frustum) {
        t.sphere.center.copy(t.c);
        t.sphere.radius = r;
        if (!t.frustum.intersectsSphere(t.sphere)) {
          culled++;
          continue;
        }
      }

      if (!isSingleInstance && isAncestorOccluded(it.id)) {
        const k = ghost.length;
        for (let i = 0; i < ghostMeshes.length; i++) {
          ghostMeshes[i].setMatrixAt(k, t.m.multiplyMatrices(m, lod1Source[i].matrix));
        }
        ghost.push(it.id);
        continue;
      }

      const tier = cfg.lodDist < Infinity ? computeLodTier(effDistance, r, cfg.lodDist, camFov) : 0;
      if (tier === 0) {
        const k = near.length;
        for (let i = 0; i < lod0Meshes.length; i++) {
          lod0Meshes[i].setMatrixAt(k, t.m.multiplyMatrices(m, info.parts[i].matrix));
        }
        near.push(it.id);
      } else if (tier === 1) {
        const k = mid.length;
        for (let i = 0; i < lod1Meshes.length; i++) {
          lod1Meshes[i].setMatrixAt(k, t.m.multiplyMatrices(m, lod1Source[i].matrix));
        }
        mid.push(it.id);
      } else {
        const k = far.length;
        for (let i = 0; i < lod2Meshes.length; i++) {
          lod2Meshes[i].setMatrixAt(k, t.m.multiplyMatrices(m, lod2Source[i].matrix));
        }
        far.push(it.id);
      }
    }

    for (const p of lod0Meshes) {
      p.count = near.length;
      p.instanceMatrix.needsUpdate = true;
      p.boundingSphere = null;
    }
    for (const p of lod1Meshes) {
      p.count = mid.length;
      p.instanceMatrix.needsUpdate = true;
      p.boundingSphere = null;
    }
    for (const p of lod2Meshes) {
      p.count = far.length;
      p.instanceMatrix.needsUpdate = true;
      p.boundingSphere = null;
    }
    for (const p of ghostMeshes) {
      p.count = ghost.length;
      p.instanceMatrix.needsUpdate = true;
      p.boundingSphere = null;
    }

    perf.current[asset] = {
      near: near.length,
      mid: mid.length,
      far: far.length,
      culled,
      total: items.length,
    };
  });

  useEffect(() => () => {
    delete perf.current[asset];
  }, [asset, perf]);

  const pick = (ids: React.MutableRefObject<string[]>, partIndex?: number) => (e: ThreeEvent<MouseEvent>) => {
    if (e.delta > 4) return;
    // Allow clicking straight through a currently-faded single-instance structural part (e.g. a wall)
    if (isSingleInstance && partIndex !== undefined && occludedParts.current.has(`${asset}:${partIndex}`)) {
      return;
    }
    e.stopPropagation();
    const id = e.instanceId !== undefined ? ids.current[e.instanceId] : undefined;
    if (id) onSelect(id);
  };

  return (
    <>
      {lod0Meshes.map((p, i) => <primitive key={`l0-${i}`} object={p} onClick={pick(nearIds, i)} />)}
      {lod1Meshes.map((p, i) => <primitive key={`l1-${i}`} object={p} onClick={pick(midIds)} />)}
      {lod2Meshes.map((p, i) => <primitive key={`l2-${i}`} object={p} onClick={pick(farIds)} />)}
      {ghostMeshes.map((p, i) => <primitive key={`gh-${i}`} object={p} />)}
    </>
  );
}

interface Props {
  statics: SceneObjectData[];
  byId: Map<string, SceneObjectData>;
  worlds: Map<string, THREE.Matrix4>;
  assetUrls: Record<string, string>;
  hidden: Set<string>;
  cfg: BatchCfg;
  live: React.MutableRefObject<LiveDrag | null>;
  dirty: React.MutableRefObject<number>;
  perf: React.MutableRefObject<PerfCounters>;
  occludedIds: React.MutableRefObject<Set<string>>;
  occludedParts: React.MutableRefObject<Set<string>>;
  occlusionSeq: React.MutableRefObject<number>;
  occlusionOpacity: number;
  onSelect: (id: string) => void;
}

export default function StaticBatches({
  statics,
  byId,
  worlds,
  assetUrls,
  hidden,
  cfg,
  live,
  dirty,
  perf,
  occludedIds,
  occludedParts,
  occlusionSeq,
  occlusionOpacity,
  onSelect,
}: Props) {
  const groups = useMemo(() => {
    const g = new Map<string, BatchItem[]>();
    for (const o of statics) {
      if (o.kind !== "model" || !o.asset || !assetUrls[o.asset]) continue;
      const m = worlds.get(o.id);
      if (!m) continue;
      const list = g.get(o.asset);
      if (list) list.push({ id: o.id, m });
      else g.set(o.asset, [{ id: o.id, m }]);
    }
    return g;
  }, [statics, worlds, assetUrls]);

  return (
    <>
      {Array.from(groups).map(([asset, items]) => (
        <Suspense key={`${asset}:${assetUrls[asset]}`} fallback={null}>
          <StaticBatch
            asset={asset}
            url={assetUrls[asset]}
            items={items}
            byId={byId}
            hidden={hidden}
            cfg={cfg}
            live={live}
            dirty={dirty}
            perf={perf}
            occludedIds={occludedIds}
            occludedParts={occludedParts}
            occlusionSeq={occlusionSeq}
            occlusionOpacity={occlusionOpacity}
            onSelect={onSelect}
          />
        </Suspense>
      ))}
    </>
  );
}
