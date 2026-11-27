import { newId } from "../../lib/sceneMath";
import type { SceneObjectData, Vec3, ZoneDef } from "../../lib/workTypes";
import { SCRIPT_TEMPLATES } from "./script";

export function extractZones(layout: any): ZoneDef[] {
  if (!Array.isArray(layout?.zones)) return [];
  return layout.zones.filter(
    (z: any) => z && Array.isArray(z.x) && z.x.length === 2 && Array.isArray(z.z) && z.z.length === 2,
  );
}

/** Turns model-sand3d layout.json (v1 or v2) into a Unity-style Entity hierarchy:
 *    Facility > warehouse, track, chargers        (obstacles: Transform + MeshRenderer)
 *    Warehouse > Row-n > rack > totes             (obstacles: Transform + MeshRenderer)
 *    Equipment > conveyor, station                (obstacles: Transform + MeshRenderer)
 *    Equipment > ARM-1, XFER-1                    (robots: Transform + MeshRenderer + RobotScript)
 *    Cargo > pallet, goods, bag                   (obstacles: Transform + MeshRenderer)
 *    Robots & Fleet > AMR-n, DR-n, HM-1           (robots: Transform + MeshRenderer + RobotScript)
 */
export function layoutToObjects(layout: any, assets: string[]): SceneObjectData[] {
  const out: SceneObjectData[] = [];

  const mkGroup = (label: string, parentId: string | null = null, position: Vec3 = [0, 0, 0]): SceneObjectData => {
    const o: SceneObjectData = {
      id: newId(),
      kind: "group",
      label,
      parentId,
      transform: { position, rotation: [0, 0, 0], scale: 1 },
      components: {},
    };
    out.push(o);
    return o;
  };

  const mkObstacle = (p: {
    asset: string;
    label: string;
    parentId: string | null;
    position: Vec3;
    rotation?: Vec3;
    static?: boolean;
  }): SceneObjectData => {
    const o: SceneObjectData = {
      id: newId(),
      kind: "obstacle",
      label: p.label,
      parentId: p.parentId,
      transform: {
        position: p.position,
        rotation: p.rotation ?? [0, 0, 0],
        scale: 1,
      },
      components: {
        renderer: {
          asset: p.asset,
          static: p.static ?? true,
          joints: {},
        },
      },
    };
    out.push(o);
    return o;
  };

  const mkRobot = (p: {
    asset: string;
    label: string;
    parentId: string | null;
    position: Vec3;
    rotation?: Vec3;
    script: string;
  }): SceneObjectData => {
    const o: SceneObjectData = {
      id: newId(),
      kind: "robot",
      label: p.label,
      parentId: p.parentId,
      transform: {
        position: p.position,
        rotation: p.rotation ?? [0, 0, 0],
        scale: 1,
      },
      components: {
        renderer: {
          asset: p.asset,
          static: false,
          joints: {},
        },
        robot: {
          script: p.script,
        },
      },
    };
    out.push(o);
    return o;
  };

  const inst = layout.instances ?? {};

  // --- Structural shell, tracks & charging bays (obstacles)
  if (["warehouse", "track", "charger"].some((a) => assets.includes(a) && (inst[a]?.length ?? 0) > 0)) {
    const facility = mkGroup("Facility");
    for (const asset of ["warehouse", "track", "charger"]) {
      if (!assets.includes(asset)) continue;
      for (const it of inst[asset] ?? []) {
        mkObstacle({
          asset,
          label: it.id,
          parentId: facility.id,
          position: it.position,
          rotation: [0, it.rotationY ?? 0, 0],
          static: true,
        });
      }
    }
  }

  // --- Storage racks & totes (obstacles)
  const warehouse = mkGroup("Warehouse");
  const rows = new Map<number, SceneObjectData>();
  const racks = new Map<string, SceneObjectData>();
  if (assets.includes("rack")) {
    for (const r of inst.rack ?? []) {
      const z: number = r.position[2];
      const row =
        rows.get(z) ??
        (() => {
          const g = mkGroup(`Row-${rows.size}`, warehouse.id, [0, 0, z]);
          rows.set(z, g);
          return g;
        })();
      racks.set(
        r.id,
        mkObstacle({
          asset: "rack",
          label: r.id,
          parentId: row.id,
          position: [r.position[0], 0, 0],
          rotation: [0, r.rotationY ?? 0, 0],
          static: true,
        }),
      );
    }
  }
  if (assets.includes("tote")) {
    for (const t of inst.tote ?? []) {
      const rack = racks.get(t.rack);
      if (!rack) continue;
      mkObstacle({
        asset: "tote",
        label: t.id,
        parentId: rack.id,
        position: [t.position[0] - rack.transform.position[0], t.position[1], 0],
        static: true,
      });
    }
  }

  // --- Equipment (obstacles) & Robotic Workcells (robots)
  const equipment = mkGroup("Equipment");
  for (const asset of ["conveyor", "station"]) {
    if (!assets.includes(asset)) continue;
    for (const it of inst[asset] ?? []) {
      mkObstacle({
        asset,
        label: it.id,
        parentId: equipment.id,
        position: it.position,
        rotation: [0, it.rotationY ?? 0, 0],
        static: true,
      });
    }
  }

  if (assets.includes("robot_arm")) {
    for (const it of inst.robot_arm ?? []) {
      mkRobot({
        asset: "robot_arm",
        label: it.id,
        parentId: equipment.id,
        position: it.position,
        rotation: [0, it.rotationY ?? 0, 0],
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
      mkRobot({
        asset: "robot_transfer",
        label: it.id,
        parentId: equipment.id,
        position: it.position,
        rotation: [0, it.rotationY ?? 0, 0],
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

  // --- Cargo (pallets, goods, bags, dock trucks — obstacles)
  const hasCargo = ["pallet", "goods", "bag"].some((a) => assets.includes(a) && (inst[a]?.length ?? 0) > 0);
  const hasTrucks = assets.includes("truck") && (layout.vehicles?.length ?? 0) > 0;
  if (hasCargo || hasTrucks) {
    const cargo = mkGroup("Cargo & Obstacles");
    for (const asset of ["pallet", "goods", "bag"]) {
      if (!assets.includes(asset)) continue;
      for (const it of inst[asset] ?? []) {
        mkObstacle({
          asset,
          label: it.id,
          parentId: cargo.id,
          position: it.position,
          rotation: [0, it.rotationY ?? 0, 0],
          static: !it.on,
        });
      }
    }
    if (assets.includes("truck")) {
      for (const v of layout.vehicles ?? []) {
        const p1 = v.path?.[1] ?? [0, -8.8];
        mkObstacle({
          asset: "truck",
          label: v.id,
          parentId: cargo.id,
          position: [p1[0], 0, p1[1]],
          rotation: [0, v.rotationY ?? 90, 0],
          static: true,
        });
      }
    }
  }

  // --- Robots & Fleet (AMRs, Drones, Humanoid Operators)
  const fleet = mkGroup("Robots");

  if (assets.includes("robot")) {
    (layout.robots ?? []).forEach((r: any, i: number) => {
      const loop: [number, number][] = r.loop ?? [];
      const script =
        r.customScript ??
        (i === 0
          ? SCRIPT_TEMPLATES[0].script
          : `speed ${r.speedMps ?? 1}\nloop\n${loop.map(([x, z]) => `  goto ${x} ${z}`).join("\n")}\nend\n`);
      mkRobot({
        asset: "robot",
        label: r.id,
        parentId: fleet.id,
        position: r.start,
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
      mkRobot({
        asset: "drone",
        label: d.id,
        parentId: fleet.id,
        position: [d.pad?.[0] ?? 0, 0, d.pad?.[1] ?? 0],
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
      mkRobot({
        asset: "humanoid",
        label: w.id,
        parentId: fleet.id,
        position: [start[0], 0, start[1]],
        script,
      });
    }
  }

  return out;
}
