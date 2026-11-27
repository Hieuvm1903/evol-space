import React, { Suspense, useEffect, useMemo, useRef } from "react";
import { useFrame, type ThreeEvent } from "@react-three/fiber";
import * as THREE from "three";
import { useAssetInfo, type AssetInfo } from "./assetInfo";
import { cameraLodParams, computeLodTier, type LodPart } from "./lodCompute";
import type { SceneObjectData } from "../../lib/workTypes";

/**
 * Static objects are rendered via GPU InstancedMesh batches across 3 calculated LOD tiers
 * (LOD0 full, LOD1 mid, LOD2 coarse).
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
  hidden: Set<string>;
  cfg: BatchCfg;
  live: React.MutableRefObject<LiveDrag | null>;
  dirty: React.MutableRefObject<number>;
  perf: React.MutableRefObject<PerfCounters>;
  onSelect: (id: string) => void;
}

function StaticBatch(props: BatchProps) {
  const { info } = useAssetInfo(props.url);
  return <StaticBatchRenderer {...props} info={info} />;
}

function createInstancedTier(
  parts: readonly { geometry: THREE.BufferGeometry; material: THREE.Material; matrix: THREE.Matrix4 }[],
  cap: number,
  castShadow: boolean,
): THREE.InstancedMesh[] {
  return parts.map((p) => {
    const im = new THREE.InstancedMesh(p.geometry, p.material, cap);
    im.castShadow = castShadow;
    im.receiveShadow = true;
    im.frustumCulled = false; // CPU per-instance culling runs instead
    im.count = 0;
    return im;
  });
}

function StaticBatchRenderer({
  asset,
  items,
  hidden,
  cfg,
  live,
  dirty,
  perf,
  onSelect,
  info,
}: BatchProps & { info: AssetInfo }) {
  const cap = Math.max(1, items.length);

  const nearIds = useRef<string[]>([]);
  const midIds = useRef<string[]>([]);
  const farIds = useRef<string[]>([]);

  const lod1Source: LodPart[] = info.lod1.parts.length > 0 ? info.lod1.parts : info.parts;
  const lod2Source: LodPart[] = info.lod2.parts.length > 0 ? info.lod2.parts : lod1Source;

  const lod0Meshes = useMemo(() => createInstancedTier(info.parts, cap, true), [info, cap]);
  const lod1Meshes = useMemo(() => createInstancedTier(lod1Source, cap, true), [lod1Source, cap]);
  const lod2Meshes = useMemo(() => createInstancedTier(lod2Source, cap, false), [lod2Source, cap]);

  // Dispose instance buffers (shared geometries/materials stay in AssetInfo cache)
  useEffect(() => () => {
    for (const im of lod0Meshes) im.dispose();
    for (const im of lod1Meshes) im.dispose();
    for (const im of lod2Meshes) im.dispose();
  }, [lod0Meshes, lod1Meshes, lod2Meshes]);

  const force = useRef(true);
  useEffect(() => {
    force.current = true;
  }, [items, hidden, cfg, lod0Meshes, lod1Meshes, lod2Meshes]);

  const last = useRef({ view: new Float32Array(16), proj: new Float32Array(16), dirty: -1 });
  const t = useMemo(() => ({
    frustum: new THREE.Frustum(),
    pv: new THREE.Matrix4(),
    cam: new THREE.Vector3(),
    c: new THREE.Vector3(),
    sphere: new THREE.Sphere(),
    m: new THREE.Matrix4(),
    w: new THREE.Matrix4(),
  }), []);

  useFrame(({ camera }) => {
    const l = last.current;
    const changed =
      force.current ||
      l.dirty !== dirty.current ||
      !same(camera.matrixWorld.elements, l.view) ||
      !same(camera.projectionMatrix.elements, l.proj);
    if (!changed) return;

    force.current = false;
    l.dirty = dirty.current;
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
    near.length = 0;
    mid.length = 0;
    far.length = 0;
    let culled = 0;

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

  const pick = (ids: React.MutableRefObject<string[]>) => (e: ThreeEvent<MouseEvent>) => {
    if (e.delta > 4) return;
    e.stopPropagation();
    const id = e.instanceId !== undefined ? ids.current[e.instanceId] : undefined;
    if (id) onSelect(id);
  };

  return (
    <>
      {lod0Meshes.map((p, i) => <primitive key={`l0-${i}`} object={p} onClick={pick(nearIds)} />)}
      {lod1Meshes.map((p, i) => <primitive key={`l1-${i}`} object={p} onClick={pick(midIds)} />)}
      {lod2Meshes.map((p, i) => <primitive key={`l2-${i}`} object={p} onClick={pick(farIds)} />)}
    </>
  );
}

interface Props {
  statics: SceneObjectData[];
  worlds: Map<string, THREE.Matrix4>;
  assetUrls: Record<string, string>;
  hidden: Set<string>;
  cfg: BatchCfg;
  live: React.MutableRefObject<LiveDrag | null>;
  dirty: React.MutableRefObject<number>;
  perf: React.MutableRefObject<PerfCounters>;
  onSelect: (id: string) => void;
}

export default function StaticBatches({
  statics,
  worlds,
  assetUrls,
  hidden,
  cfg,
  live,
  dirty,
  perf,
  onSelect,
}: Props) {
  const groups = useMemo(() => {
    const g = new Map<string, BatchItem[]>();
    for (const o of statics) {
      const asset = o.components.renderer?.asset;
      if (!asset || !assetUrls[asset]) continue;
      const m = worlds.get(o.id);
      if (!m) continue;
      const list = g.get(asset);
      if (list) list.push({ id: o.id, m });
      else g.set(asset, [{ id: o.id, m }]);
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
            hidden={hidden}
            cfg={cfg}
            live={live}
            dirty={dirty}
            perf={perf}
            onSelect={onSelect}
          />
        </Suspense>
      ))}
    </>
  );
}
