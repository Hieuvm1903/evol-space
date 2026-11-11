import React, { Suspense, useEffect, useMemo, useRef } from "react";
import { useFrame, type ThreeEvent } from "@react-three/fiber";
import * as THREE from "three";
import { useAssetInfo } from "./assetInfo";
import type { SceneObjectData } from "../../lib/workTypes";

/** Static objects are never drawn as individual nodes. Per model there is one InstancedMesh per
 *  sub-mesh (so a rack = a handful of draw calls for ANY number of racks), plus one InstancedMesh of
 *  boxes used as a level-of-detail proxy. Every time the camera moves, each instance is tested on the
 *  CPU — distance cull, frustum cull, near/far LOD — and the survivors are packed into the buffers
 *  with `count` set to how many are visible. */
export interface BatchItem { id: string; m: THREE.Matrix4 }
export interface LiveDrag { ids: Set<string>; delta: THREE.Matrix4 } // gizmo drag in progress (moves instances live)
export interface BatchCfg { frustum: boolean; cullDist: number; lodDist: number } // Infinity = off
export type PerfCounters = Record<string, { near: number; far: number; culled: number; total: number }>;

const UNIT_BOX = new THREE.BoxGeometry(1, 1, 1);

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

function StaticBatch({ asset, url, items, hidden, cfg, live, dirty, perf, onSelect }: BatchProps) {
  const { info } = useAssetInfo(url);
  const cap = Math.max(1, items.length);

  const parts = useMemo(() => info.parts.map((p) => {
    const im = new THREE.InstancedMesh(p.geometry, p.material, cap);
    im.castShadow = true; im.receiveShadow = true;
    im.frustumCulled = false;   // we cull per instance ourselves
    im.count = 0;
    return im;
  }), [info, cap]);

  const proxy = useMemo(() => {
    const im = new THREE.InstancedMesh(UNIT_BOX, new THREE.MeshStandardMaterial({ color: info.color, roughness: 0.85 }), cap);
    im.castShadow = true; im.frustumCulled = false; im.count = 0;
    return im;
  }, [info, cap]);

  // Free the instance buffers (geometry/materials are shared with the loaded model, so not disposed here).
  useEffect(() => () => {
    parts.forEach((p) => p.dispose());
    proxy.dispose();
    (proxy.material as THREE.Material).dispose();
  }, [parts, proxy]);

  const nearIds = useRef<string[]>([]);
  const farIds = useRef<string[]>([]);
  const force = useRef(true);
  useEffect(() => { force.current = true; }, [items, hidden, cfg, parts, proxy]);

  const last = useRef({ view: new Float32Array(16), proj: new Float32Array(16), dirty: -1 });
  const t = useMemo(() => ({
    frustum: new THREE.Frustum(), pv: new THREE.Matrix4(), cam: new THREE.Vector3(), c: new THREE.Vector3(),
    sphere: new THREE.Sphere(), m: new THREE.Matrix4(), w: new THREE.Matrix4(),
  }), []);

  useFrame(({ camera }) => {
    const l = last.current;
    const changed = force.current || l.dirty !== dirty.current
      || !same(camera.matrixWorld.elements, l.view) || !same(camera.projectionMatrix.elements, l.proj);
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
    const near = nearIds.current, far = farIds.current;
    near.length = 0; far.length = 0;
    let culled = 0;

    for (const it of items) {
      if (hidden.has(it.id)) continue;
      const m = drag && drag.ids.has(it.id) ? t.w.multiplyMatrices(drag.delta, it.m) : it.m;
      t.c.copy(info.center).applyMatrix4(m);
      const r = info.radius * m.getMaxScaleOnAxis();
      const d = t.c.distanceTo(t.cam);
      if (d - r > cfg.cullDist) { culled++; continue; }
      if (cfg.frustum) {
        t.sphere.center.copy(t.c); t.sphere.radius = r;
        if (!t.frustum.intersectsSphere(t.sphere)) { culled++; continue; }
      }
      if (d < cfg.lodDist) {
        const k = near.length;
        for (let i = 0; i < parts.length; i++) parts[i].setMatrixAt(k, t.m.multiplyMatrices(m, info.parts[i].matrix));
        near.push(it.id);
      } else {
        proxy.setMatrixAt(far.length, t.m.multiplyMatrices(m, info.boxMatrix));
        far.push(it.id);
      }
    }

    for (const p of parts) { p.count = near.length; p.instanceMatrix.needsUpdate = true; p.boundingSphere = null; }
    proxy.count = far.length; proxy.instanceMatrix.needsUpdate = true; proxy.boundingSphere = null;
    perf.current[asset] = { near: near.length, far: far.length, culled, total: items.length };
  });

  useEffect(() => () => { delete perf.current[asset]; }, [asset, perf]);

  const pick = (ids: React.MutableRefObject<string[]>) => (e: ThreeEvent<MouseEvent>) => {
    if (e.delta > 4) return;                 // it was an orbit drag
    e.stopPropagation();
    const id = e.instanceId !== undefined ? ids.current[e.instanceId] : undefined;
    if (id) onSelect(id);
  };

  return (
    <>
      {parts.map((p, i) => <primitive key={i} object={p} onClick={pick(nearIds)} />)}
      <primitive object={proxy} onClick={pick(farIds)} />
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

export default function StaticBatches({ statics, worlds, assetUrls, hidden, cfg, live, dirty, perf, onSelect }: Props) {
  const groups = useMemo(() => {
    const g = new Map<string, BatchItem[]>();
    for (const o of statics) {
      if (o.kind !== "model" || !o.asset || !assetUrls[o.asset]) continue;
      const m = worlds.get(o.id);
      if (!m) continue;
      const list = g.get(o.asset);
      if (list) list.push({ id: o.id, m }); else g.set(o.asset, [{ id: o.id, m }]);
    }
    return g;
  }, [statics, worlds, assetUrls]);

  return (
    <>
      {Array.from(groups).map(([asset, items]) => (
        <Suspense key={`${asset}:${assetUrls[asset]}`} fallback={null}>
          <StaticBatch asset={asset} url={assetUrls[asset]} items={items} hidden={hidden} cfg={cfg}
            live={live} dirty={dirty} perf={perf} onSelect={onSelect} />
        </Suspense>
      ))}
    </>
  );
}
