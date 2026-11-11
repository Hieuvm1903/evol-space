import { newId } from "../../lib/sceneMath";
import type { SceneObjectData } from "../../lib/workTypes";
import { SCRIPT_TEMPLATES } from "./script";

/** Turns the models repo's layout.json into a scene hierarchy:
 *    Warehouse > Row-n > rack > totes        (all static => drawn with GPU instancing)
 *    Equipment > conveyor (runs a `belt` script), station
 *    Robots > AMR-n  (dynamic, each with a behaviour script)
 *  Totes are children of their rack, so moving a rack (or a whole row) moves its totes. */
export function layoutToObjects(layout: any, assets: string[]): SceneObjectData[] {
  const out: SceneObjectData[] = [];
  const mk = (p: Partial<SceneObjectData> & { label: string }): SceneObjectData => {
    const o: SceneObjectData = {
      id: newId(), kind: "group", asset: null, parentId: null, position: [0, 0, 0], rotation: [0, 0, 0],
      scale: 1, joints: {}, static: true, ...p,
    };
    out.push(o);
    return o;
  };
  const inst = layout.instances ?? {};

  const warehouse = mk({ label: "Warehouse" });
  const rows = new Map<number, SceneObjectData>();
  const racks = new Map<string, SceneObjectData>();
  if (assets.includes("rack")) {
    for (const r of inst.rack ?? []) {
      const z: number = r.position[2];
      const row = rows.get(z) ?? (() => {
        const g = mk({ label: `Row-${rows.size}`, parentId: warehouse.id, position: [0, 0, z] });
        rows.set(z, g);
        return g;
      })();
      racks.set(r.id, mk({
        kind: "model", asset: "rack", label: r.id, parentId: row.id,
        position: [r.position[0], 0, 0], rotation: [0, r.rotationY ?? 0, 0],
      }));
    }
  }
  if (assets.includes("tote")) {
    for (const t of inst.tote ?? []) {
      const rack = racks.get(t.rack);
      if (!rack) continue;
      mk({
        kind: "model", asset: "tote", label: t.id, parentId: rack.id,
        position: [t.position[0] - rack.position[0], t.position[1], 0],
      });
    }
  }

  const equipment = mk({ label: "Equipment" });
  for (const asset of ["conveyor", "station"]) {
    if (!assets.includes(asset)) continue;
    for (const it of inst[asset] ?? []) {
      mk({
        kind: "model", asset, label: it.id, parentId: equipment.id, position: it.position, rotation: [0, it.rotationY ?? 0, 0],
        script: asset === "conveyor" ? `belt ${it.beltSpeedMps ?? 0.4} 2 0.64 0.75\n` : undefined,
      });
    }
  }

  if (assets.includes("robot")) {
    const robots = mk({ label: "Robots" });
    (layout.robots ?? []).forEach((r: any, i: number) => {
      const loop: [number, number][] = r.loop ?? [];
      const script = i === 0
        ? SCRIPT_TEMPLATES[0].script          // the pick-and-place demo
        : `speed ${r.speedMps ?? 1}\nloop\n${loop.map(([x, z]) => `  goto ${x} ${z}`).join("\n")}\nend\n`;
      mk({
        kind: "model", asset: "robot", label: r.id, parentId: robots.id, position: r.start, static: false, script,
      });
    });
  }
  return out;
}
