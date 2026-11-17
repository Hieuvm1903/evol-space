import { newId } from "../../lib/sceneMath";
import type { SceneObjectData, ZoneDef } from "../../lib/workTypes";
import { SCRIPT_TEMPLATES } from "./script";

export function extractZones(layout: any): ZoneDef[] {
  if (!Array.isArray(layout?.zones)) return [];
  return layout.zones.filter(
    (z: any) => z && Array.isArray(z.x) && z.x.length === 2 && Array.isArray(z.z) && z.z.length === 2,
  );
}

/** Turns model-sand3d layout.json (v1 or v2) into a scene hierarchy:
 *    Facility > warehouse, track, chargers              (static instanced)
 *    Warehouse > Row-n > rack > totes                   (static instanced)
 *    Equipment > conveyor, station, ARM-1, XFER-1       (conveyor + workcells)
 *    Cargo > pallet, goods, bag                         (belt items dynamic, dock items static)
 *    Fleet > AMR-n, DR-n drones, HM-1 worker, TR-1      (dynamic scripted actors)
 */
export function layoutToObjects(layout: any, assets: string[]): SceneObjectData[] {
  const out: SceneObjectData[] = [];
  const mk = (p: Partial<SceneObjectData> & { label: string }): SceneObjectData => {
    const o: SceneObjectData = {
      id: newId(),
      kind: "group",
      asset: null,
      parentId: null,
      position: [0, 0, 0],
      rotation: [0, 0, 0],
      scale: 1,
      joints: {},
      static: true,
      ...p,
    };
    out.push(o);
    return o;
  };
  const inst = layout.instances ?? {};

  // --- Structural shell, tracks & charging bays
  if (["warehouse", "track", "charger"].some((a) => assets.includes(a) && (inst[a]?.length ?? 0) > 0)) {
    const facility = mk({ label: "Facility" });
    for (const asset of ["warehouse", "track", "charger"]) {
      if (!assets.includes(asset)) continue;
      for (const it of inst[asset] ?? []) {
        mk({
          kind: "model",
          asset,
          label: it.id,
          parentId: facility.id,
          position: it.position,
          rotation: [0, it.rotationY ?? 0, 0],
        });
      }
    }
  }

  // --- Storage racks & totes
  const warehouse = mk({ label: "Warehouse" });
  const rows = new Map<number, SceneObjectData>();
  const racks = new Map<string, SceneObjectData>();
  if (assets.includes("rack")) {
    for (const r of inst.rack ?? []) {
      const z: number = r.position[2];
      const row =
        rows.get(z) ??
        (() => {
          const g = mk({ label: `Row-${rows.size}`, parentId: warehouse.id, position: [0, 0, z] });
          rows.set(z, g);
          return g;
        })();
      racks.set(
        r.id,
        mk({
          kind: "model",
          asset: "rack",
          label: r.id,
          parentId: row.id,
          position: [r.position[0], 0, 0],
          rotation: [0, r.rotationY ?? 0, 0],
        }),
      );
    }
  }
  if (assets.includes("tote")) {
    for (const t of inst.tote ?? []) {
      const rack = racks.get(t.rack);
      if (!rack) continue;
      mk({
        kind: "model",
        asset: "tote",
        label: t.id,
        parentId: rack.id,
        position: [t.position[0] - rack.position[0], t.position[1], 0],
      });
    }
  }

  // --- Equipment & Robotic Workcells
  const equipment = mk({ label: "Equipment" });
  for (const asset of ["conveyor", "station"]) {
    if (!assets.includes(asset)) continue;
    for (const it of inst[asset] ?? []) {
      mk({
        kind: "model",
        asset,
        label: it.id,
        parentId: equipment.id,
        position: it.position,
        rotation: [0, it.rotationY ?? 0, 0],
        // Keep station dynamic so status tower lamps can be individually driven
        static: asset === "conveyor",
        script: asset === "conveyor" ? `belt ${it.beltSpeedMps ?? 0.4} 2 0.64 0.75\n` : undefined,
      });
    }
  }

  if (assets.includes("robot_arm")) {
    for (const it of inst.robot_arm ?? []) {
      mk({
        kind: "model",
        asset: "robot_arm",
        label: it.id,
        parentId: equipment.id,
        position: it.position,
        rotation: [0, it.rotationY ?? 0, 0],
        static: false,
        script: [
          "loop",
          "  joint base_yaw 0.0",
          "  joint shoulder_pitch -0.45",
          "  joint elbow_pitch -0.85",
          "  joint finger_l_slide 0.035",
          "  joint finger_r_slide 0.035",
          "  wait 0.4",
          "  joint finger_l_slide 0.005",
          "  joint finger_r_slide 0.005",
          "  joint shoulder_pitch 0.1",
          "  joint elbow_pitch -0.35",
          "  joint base_yaw 1.6",
          "  joint shoulder_pitch -0.35",
          "  wait 0.3",
          "  joint finger_l_slide 0.035",
          "  joint finger_r_slide 0.035",
          "end",
        ].join("\n"),
      });
    }
  }

  if (assets.includes("robot_transfer")) {
    for (const it of inst.robot_transfer ?? []) {
      mk({
        kind: "model",
        asset: "robot_transfer",
        label: it.id,
        parentId: equipment.id,
        position: it.position,
        rotation: [0, it.rotationY ?? 0, 0],
        static: false,
        script: [
          "loop",
          "  joint travel_slide 0.2",
          "  joint lift_slide 0.1",
          "  joint fork_slide 0.45",
          "  wait 0.4",
          "  joint fork_slide 0.0",
          "  joint travel_slide 2.4",
          "  joint lift_slide 1.2",
          "  joint fork_slide 0.5",
          "  wait 0.4",
          "  joint fork_slide 0.0",
          "  joint lift_slide 0.1",
          "end",
        ].join("\n"),
      });
    }
  }

  // --- Cargo (pallets, goods, bags)
  if (["pallet", "goods", "bag"].some((a) => assets.includes(a) && (inst[a]?.length ?? 0) > 0)) {
    const cargo = mk({ label: "Cargo" });
    for (const asset of ["pallet", "goods", "bag"]) {
      if (!assets.includes(asset)) continue;
      for (const it of inst[asset] ?? []) {
        mk({
          kind: "model",
          asset,
          label: it.id,
          parentId: cargo.id,
          position: it.position,
          rotation: [0, it.rotationY ?? 0, 0],
          static: !it.on,
        });
      }
    }
  }

  // --- Mobile Fleet (AMRs, Drones, Operators, Dock Vehicles)
  const fleet = mk({ label: "Robots & Fleet" });

  if (assets.includes("robot")) {
    (layout.robots ?? []).forEach((r: any, i: number) => {
      const loop: [number, number][] = r.loop ?? [];
      const script =
        r.customScript ??
        (i === 0
          ? SCRIPT_TEMPLATES[0].script
          : `speed ${r.speedMps ?? 1}\nloop\n${loop.map(([x, z]) => `  goto ${x} ${z}`).join("\n")}\nend\n`);
      mk({
        kind: "model",
        asset: "robot",
        label: r.id,
        parentId: fleet.id,
        position: r.start,
        static: false,
        script,
      });
    });
  }

  if (assets.includes("drone")) {
    for (const d of layout.drones ?? []) {
      const loop: [number, number][] = d.loop ?? [];
      const script = [
        `speed ${d.speedMps ?? 2.2}`,
        `alt ${d.altitude ?? 4.5}`,
        "loop",
        ...loop.map(([x, z]) => `  goto ${x} ${z}`),
        "end",
      ].join("\n");
      mk({
        kind: "model",
        asset: "drone",
        label: d.id,
        parentId: fleet.id,
        position: [d.pad?.[0] ?? 0, 0, d.pad?.[1] ?? 0],
        static: false,
        script,
      });
    }
  }

  if (assets.includes("humanoid")) {
    for (const w of layout.workers ?? []) {
      const loop: [number, number][] = w.loop ?? [];
      const start = loop[0] ?? [-10, 6];
      const script = [
        `speed ${w.speedMps ?? 0.95}`,
        "loop",
        ...loop.map(([x, z]) => `  goto ${x} ${z}\n  wait 0.4`),
        "end",
      ].join("\n");
      mk({
        kind: "model",
        asset: "humanoid",
        label: w.id,
        parentId: fleet.id,
        position: [start[0], 0, start[1]],
        static: false,
        script,
      });
    }
  }

  if (assets.includes("truck")) {
    for (const v of layout.vehicles ?? []) {
      const p0 = v.path?.[0] ?? [0, -14];
      const p1 = v.path?.[1] ?? [0, -8.8];
      const script = [
        `speed ${v.speedMps ?? 1.8}`,
        "loop",
        `  goto ${p1[0]} ${p1[1]}`,
        "  wait 6",
        `  goto ${p0[0]} ${p0[1]}`,
        "  wait 2",
        "end",
      ].join("\n");
      mk({
        kind: "model",
        asset: "truck",
        label: v.id,
        parentId: fleet.id,
        position: [p1[0], 0, p1[1]],
        rotation: [0, v.rotationY ?? 90, 0],
        static: false,
        script,
      });
    }
  }

  return out;
}
