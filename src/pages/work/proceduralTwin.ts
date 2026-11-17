import * as THREE from "three";
import type { ModelSetRow } from "../../lib/workTypes";

export const PROCEDURAL_PREFIX = "procedural://sand3d-demo/";

export const DEMO_MODEL_SET: ModelSetRow = {
  id: -1,
  name: "model-sand3d-warehouse",
  version: "v2.0-twin",
  base_path: "procedural://sand3d-demo",
  files: {
    warehouse: "warehouse",
    rack: "rack",
    tote: "tote",
    robot: "robot",
    conveyor: "conveyor",
    station: "station",
    charger: "charger",
    pallet: "pallet",
    goods: "goods",
    bag: "bag",
    track: "track",
    robot_arm: "robot_arm",
    robot_transfer: "robot_transfer",
    humanoid: "humanoid",
    drone: "drone",
    truck: "truck",
    layout: "layout",
  },
  created_at: new Date("2026-02-01T08:00:00Z").toISOString(),
};

function makeLoop(cx: number, cz: number, rx: number, rz: number, n = 8): [number, number][] {
  return Array.from({ length: n }, (_, i) => [
    Number((cx + rx * Math.cos((2 * Math.PI * i) / n)).toFixed(3)),
    Number((cz + rz * Math.sin((2 * Math.PI * i) / n)).toFixed(3)),
  ]);
}

function buildDemoLayout() {
  const bays = 6;
  const pitch = 1.45;
  const rows = 4;
  const rowPitch = 2.4;
  const xs = Array.from({ length: bays }, (_, i) => (i - (bays - 1) / 2) * pitch);
  const levels = [0.24, 0.84, 1.44, 2.04];

  const racks: { id: string; position: [number, number, number]; rotationY: number }[] = [];
  const totes: { id: string; rack: string; level: number; position: [number, number, number] }[] = [];

  for (let r = 0; r < rows; r++) {
    const z = Number((r * rowPitch).toFixed(3));
    for (let i = 0; i < xs.length; i++) {
      const x = Number(xs[i].toFixed(3));
      const rid = `R${r}-${i}`;
      racks.push({ id: rid, position: [x, 0, z], rotationY: 0 });
      for (let lv = 0; lv < levels.length; lv++) {
        for (const [slot, dx] of [
          [0, -0.32],
          [1, 0.32],
        ] as const) {
          if ((r + i + lv + slot) % 3 !== 0) {
            totes.push({
              id: `T-${rid}-${lv}-${slot}`,
              rack: rid,
              level: lv,
              position: [Number((x + dx).toFixed(3)), Number((levels[lv] + 0.06).toFixed(3)), z],
            });
          }
        }
      }
    }
  }

  // Ensure R0-5 has a pickable tote on level 0 at y=0.30 for AMR-1 pick-and-place script
  const targetRack = racks.find((r) => r.id === "R0-5")!;
  if (!totes.some((t) => t.rack === "R0-5" && t.level === 0)) {
    totes.unshift({
      id: "T-01",
      rack: "R0-5",
      level: 0,
      position: [targetRack.position[0], 0.3, targetRack.position[2]],
    });
  } else {
    const first = totes.find((t) => t.rack === "R0-5" && t.level === 0)!;
    first.id = "T-01";
    first.position[0] = targetRack.position[0];
  }

  const x0 = xs[0] - 1.3;
  const x1 = xs[xs.length - 1] + 1.3;
  const cvX = Number((x1 + 1.65).toFixed(3));
  const stX = Number((x0 - 1.85).toFixed(3));
  const stZ = -1.4;

  const drones = [
    { id: "DR-1", altitude: 4.5, speedMps: 2.4, loop: makeLoop(0.0, 3.2, 8.8, 5.2), pad: [10.2, 9.4] as [number, number] },
    { id: "DR-2", altitude: 5.4, speedMps: 1.9, loop: makeLoop(0.0, 3.2, 5.8, 3.2), pad: [-10.2, 9.4] as [number, number] },
  ];

  return {
    schemaVersion: "2.0",
    meta: {
      units: "metres",
      axes: "glTF (Y up, Z toward viewer)",
      bounds: { x: [-12.0, 12.0], z: [-15.0, 11.0] },
      building: { size: [24.0, 16.0], height: 7.0, dock_wall: "-Z" },
    },
    instances: {
      warehouse: [{ id: "WH-1", position: [0, 0, 3.0], rotationY: 0 }],
      rack: racks,
      tote: totes,
      conveyor: [{ id: "CV-1", position: [cvX, 0, 3.75], rotationY: 90, beltSpeedMps: 0.45 }],
      station: [{ id: "ST-1", position: [stX, 0, stZ], rotationY: 90 }],
      charger: [
        { id: "CHG-1", position: [-10.3, 0, 4.2], rotationY: 0 },
        { id: "CHG-2", position: [-10.3, 0, 5.5], rotationY: 0 },
      ],
      pallet: [-7.0, -5.8, 5.8, 7.0].map((px, i) => ({
        id: `PAL-${i + 1}`,
        position: [px, 0, -3.5],
        rotationY: 0,
      })),
      goods: [3.05, 3.65, 4.25].map((z, i) => ({
        id: `G-${i + 1}`,
        on: "CV-1",
        position: [cvX, 0.71, z],
        rotationY: 90,
      })),
      bag: [
        { id: "B-1", on: "CV-1", position: [cvX, 0.71, 4.75], rotationY: 90 },
        { id: "B-2", position: [-9.2, 0, 9.2], rotationY: 20 },
      ],
      track: [0, 1, 2].map((i) => ({
        id: `TRK-${i + 1}`,
        position: [10.4, 0, Number((1.0 + i * 4.0).toFixed(3))],
        rotationY: 90,
      })),
      robot_arm: [{ id: "ARM-1", position: [Number((stX - 0.95).toFixed(3)), 0, stZ], rotationY: 0, pick: "ST-1" }],
      robot_transfer: [{ id: "XFER-1", position: [0.0, 0, 9.4], rotationY: 0, railLengthM: 4.0 }],
      humanoid: [{ id: "HM-1", position: [-9.8, 0, 6.4], rotationY: 0 }],
      drone: drones.map((d) => ({ id: d.id, position: [d.pad[0], 0, d.pad[1]], rotationY: 0 })),
      truck: [{ id: "TR-1", position: [0.0, 0, -8.8], rotationY: 90 }],
    },
    robots: [
      {
        id: "AMR-1",
        start: [targetRack.position[0], 0, 1.2],
        speedMps: 1.3,
        customScript: [
          "speed 1.3",
          "loop",
          "  goto R0-5 0 1.25",
          "  face R0-5",
          "  lift 0.14",
          "  pick tote",
          "  lift 0",
          `  goto ${cvX.toFixed(2)} 1.25`,
          `  goto ${cvX.toFixed(2)} 2.55`,
          "  place CV-1 0.75",
          "  wait 0.9",
          `  goto ${cvX.toFixed(2)} 1.25`,
          "end",
        ].join("\n"),
      },
      {
        id: "AMR-2",
        start: [round3(x0), 0, 3.6],
        speedMps: 1.15,
        loop: [
          [round3(x0), 3.6],
          [round3(x1), 3.6],
          [round3(x1), -1.2],
          [round3(x0), -1.2],
        ],
      },
      {
        id: "AMR-3",
        start: [round3(x0), 0, 6.0],
        speedMps: 1.1,
        loop: [
          [round3(x0), 6.0],
          [round3(x1), 6.0],
          [round3(x1), -1.7],
          [round3(x0), -1.7],
        ],
      },
    ],
    drones,
    workers: [{ id: "HM-1", speedMps: 0.95, loop: [[-9.8, 6.4], [-9.8, 9.6], [-6.8, 9.6], [-6.8, 6.4]] }],
    vehicles: [{ id: "TR-1", path: [[0.0, -14.0], [0.0, -8.8]], rotationY: 90, speedMps: 1.8, dock: "D-2" }],
    zones: [
      { id: "receiving", name: "Receiving Dock", kind: "dock", x: [-9.2, 9.2], z: [-4.9, -2.5], color: "#10b981" },
      { id: "storage", name: "Storage Aisles", kind: "racking", x: [-4.5, 4.5], z: [-0.8, 8.2], color: "#6366f1" },
      { id: "picking", name: "Robotic Pick Cell", kind: "robot_cell", x: [-10.4, -6.5], z: [-2.4, 0.8], color: "#ec4899" },
      { id: "shipping", name: "Shipping Corridor", kind: "conveyor", x: [5.5, 11.4], z: [-1.4, 10.2], color: "#22d3ee" },
      { id: "charging", name: "AMR Charging Bay", kind: "amr_parking", x: [-11.3, -8.2], z: [3.6, 6.3], color: "#f59e0b" },
    ],
  };
}

function round3(v: number) {
  return Number(v.toFixed(3));
}

export const DEMO_LAYOUT = buildDemoLayout();

function makeBox(w: number, h: number, d: number, mat: THREE.Material, x = 0, y = 0, z = 0, name?: string): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  if (name) m.name = name;
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

function makeCyl(rt: number, rb: number, h: number, segs: number, mat: THREE.Material, name?: string): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, segs), mat);
  if (name) m.name = name;
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

function createPalette() {
  return {
    floorSlate: new THREE.MeshStandardMaterial({ color: "#181628", metalness: 0.28, roughness: 0.82 }),
    wallSlate: new THREE.MeshStandardMaterial({ color: "#242138", metalness: 0.25, roughness: 0.65 }),
    darkSteel: new THREE.MeshStandardMaterial({ color: "#1e2235", metalness: 0.82, roughness: 0.34 }),
    brushedSteel: new THREE.MeshStandardMaterial({ color: "#76809e", metalness: 0.88, roughness: 0.24 }),
    violetFrame: new THREE.MeshStandardMaterial({ color: "#4c3fa8", metalness: 0.45, roughness: 0.48 }),
    violetAccent: new THREE.MeshStandardMaterial({ color: "#8b6ff5", metalness: 0.32, roughness: 0.34 }),
    orangeBeam: new THREE.MeshStandardMaterial({ color: "#e86f2c", metalness: 0.25, roughness: 0.55 }),
    deckPlate: new THREE.MeshStandardMaterial({ color: "#2b3048", metalness: 0.55, roughness: 0.68 }),
    toteBody: new THREE.MeshStandardMaterial({ color: "#1d84b5", metalness: 0.08, roughness: 0.62 }),
    toteRim: new THREE.MeshStandardMaterial({ color: "#22d3ee", metalness: 0.14, roughness: 0.48 }),
    robotShell: new THREE.MeshStandardMaterial({ color: "#dcd9ef", metalness: 0.22, roughness: 0.42 }),
    rubber: new THREE.MeshStandardMaterial({ color: "#11121b", metalness: 0.05, roughness: 0.92 }),
    alloyRim: new THREE.MeshStandardMaterial({ color: "#94a3b8", metalness: 0.9, roughness: 0.2 }),
    cyanLed: new THREE.MeshStandardMaterial({ color: "#22d3ee", emissive: "#22d3ee", emissiveIntensity: 1.4, roughness: 0.2 }),
    greenLed: new THREE.MeshStandardMaterial({ color: "#22c55e", emissive: "#22c55e", emissiveIntensity: 1.4, roughness: 0.2 }),
    amberLed: new THREE.MeshStandardMaterial({ color: "#f59e0b", emissive: "#f59e0b", emissiveIntensity: 1.1, roughness: 0.2 }),
    redLed: new THREE.MeshStandardMaterial({ color: "#ef4444", emissive: "#ef4444", emissiveIntensity: 0.25, roughness: 0.2 }),
    pinkLed: new THREE.MeshStandardMaterial({ color: "#e879f9", emissive: "#e879f9", emissiveIntensity: 1.4, roughness: 0.2 }),
    beltSurface: new THREE.MeshStandardMaterial({ color: "#171923", metalness: 0.15, roughness: 0.85 }),
    timber: new THREE.MeshStandardMaterial({ color: "#6e5136", metalness: 0.04, roughness: 0.88 }),
    cardboard: new THREE.MeshStandardMaterial({ color: "#b8895a", metalness: 0.02, roughness: 0.88 }),
    tape: new THREE.MeshStandardMaterial({ color: "#d9c7a3", metalness: 0.02, roughness: 0.72 }),
    labelPaper: new THREE.MeshStandardMaterial({ color: "#f8fafc", metalness: 0.02, roughness: 0.8 }),
    cabAmber: new THREE.MeshStandardMaterial({ color: "#f59e0b", metalness: 0.35, roughness: 0.38 }),
    glassDark: new THREE.MeshStandardMaterial({ color: "#0b0d17", metalness: 0.2, roughness: 0.12 }),
    skin: new THREE.MeshStandardMaterial({ color: "#d6b49c", metalness: 0.02, roughness: 0.76 }),
  };
}

function buildWarehouse(p: ReturnType<typeof createPalette>): THREE.Group {
  const g = new THREE.Group();
  g.name = "warehouse";
  const L = 24.0, W = 16.0, H = 7.0, t = 0.25, bays = 6, doors = 3;

  const floor = makeBox(L, 0.12, W, p.floorSlate, 0, -0.06, 0);
  floor.castShadow = false;
  g.add(floor);

  for (const sz of [-1, 1]) {
    g.add(makeBox(L - 1.2, 0.01, 0.1, p.amberLed, 0, 0.006, sz * (W / 2 - 1.1)));
  }

  // Back dock wall on -Z and two side walls (low-ish side walls + open-bay top trusses for unobstructed twin view)
  g.add(makeBox(L, H, t, p.wallSlate, 0, H / 2, -W / 2 + t / 2));
  for (const sx of [-1, 1]) {
    g.add(makeBox(t, H * 0.55, W, p.wallSlate, sx * (L / 2 - t / 2), (H * 0.55) / 2, 0));
  }

  // Structural columns & roof portal trusses
  const pitch = (L - 2 * t) / bays;
  for (let i = 0; i <= bays; i++) {
    const x = -L / 2 + t + i * pitch;
    for (const sz of [-1, 1]) {
      if (sz === -1 && i !== 0 && i !== bays) continue;
      g.add(makeBox(0.36, H, 0.36, p.violetFrame, x, H / 2, sz * (W / 2 - 0.55)));
    }
    g.add(makeBox(0.24, 0.28, W, p.orangeBeam, x, H + 0.14, 0));
  }

  // Dock doors on -Z wall
  const dw = 3.0, dh = 3.6;
  for (let i = 0; i < doors; i++) {
    const x = (i - (doors - 1) / 2) * (L / (doors + 1));
    g.add(makeBox(dw, dh, 0.12, p.brushedSteel, x, dh / 2, -W / 2 + t + 0.04));
    g.add(makeBox(dw, 0.12, 0.08, p.greenLed, x, dh + 0.18, -W / 2 + t + 0.1));
  }
  return g;
}

function buildRack(p: ReturnType<typeof createPalette>): THREE.Group {
  const g = new THREE.Group();
  g.name = "rack";
  const W = 1.2, D = 0.9, H = 3.0;
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      g.add(makeBox(0.06, H, 0.06, p.violetFrame, sx * (W / 2 - 0.03), H / 2, sz * (D / 2 - 0.03)));
    }
  }
  for (const y of [0.24, 0.84, 1.44, 2.04, 2.64]) {
    for (const sz of [-1, 1]) {
      g.add(makeBox(W - 0.06, 0.08, 0.04, p.orangeBeam, 0, y, sz * (D / 2 - 0.03)));
    }
    g.add(makeBox(W - 0.08, 0.02, D - 0.1, p.deckPlate, 0, y + 0.04, 0));
  }
  return g;
}

function buildTote(p: ReturnType<typeof createPalette>): THREE.Group {
  const g = new THREE.Group();
  g.name = "tote";
  g.add(makeBox(0.56, 0.24, 0.38, p.toteBody, 0, 0.12, 0));
  g.add(makeBox(0.60, 0.03, 0.42, p.toteRim, 0, 0.245, 0));
  g.add(makeBox(0.50, 0.02, 0.32, p.darkSteel, 0, 0.255, 0));
  g.add(makeBox(0.16, 0.08, 0.01, p.labelPaper, 0, 0.14, 0.195));
  return g;
}

function buildPallet(p: ReturnType<typeof createPalette>): THREE.Group {
  const g = new THREE.Group();
  g.name = "pallet";
  const W = 1.2, D = 0.8, H = 0.144;
  for (const sz of [-1, 0, 1]) {
    g.add(makeBox(W, 0.022, 0.1, p.timber, 0, 0.011, sz * (D / 2 - 0.05)));
    for (const sx of [-1, 0, 1]) {
      g.add(makeBox(0.14, 0.1, 0.1, p.darkSteel, sx * (W / 2 - 0.07), 0.072, sz * (D / 2 - 0.05)));
    }
  }
  for (let k = 0; k < 5; k++) {
    const z = -D / 2 + 0.06 + k * ((D - 0.12) / 4);
    g.add(makeBox(W, 0.022, 0.11, p.timber, 0, H - 0.011, z));
  }
  return g;
}

function buildGoods(p: ReturnType<typeof createPalette>): THREE.Group {
  const g = new THREE.Group();
  g.name = "goods";
  g.add(makeBox(0.4, 0.25, 0.3, p.cardboard, 0, 0.125, 0));
  g.add(makeBox(0.06, 0.008, 0.304, p.tape, 0, 0.252, 0));
  g.add(makeBox(0.14, 0.08, 0.01, p.labelPaper, -0.08, 0.13, 0.153));
  g.add(makeBox(0.09, 0.025, 0.01, p.rubber, -0.08, 0.14, 0.156));
  return g;
}

function buildBag(p: ReturnType<typeof createPalette>): THREE.Group {
  const g = new THREE.Group();
  g.name = "bag";
  g.add(makeBox(0.44, 0.56, 0.28, p.violetAccent, 0, 0.28, 0));
  g.add(makeBox(0.24, 0.08, 0.14, p.violetFrame, 0, 0.58, 0));
  g.add(makeBox(0.26, 0.02, 0.16, p.cabAmber, 0, 0.56, 0));
  g.add(makeBox(0.16, 0.12, 0.01, p.labelPaper, 0, 0.32, 0.144));
  return g;
}

function buildTrack(p: ReturnType<typeof createPalette>): THREE.Group {
  const g = new THREE.Group();
  g.name = "track";
  const L = 4.0, gauge = 0.76;
  for (const sz of [-1, 1]) {
    g.add(makeBox(L, 0.05, 0.06, p.brushedSteel, 0, 0.055, (sz * gauge) / 2));
    g.add(makeBox(L, 0.03, 0.024, p.darkSteel, 0, 0.025, (sz * gauge) / 2));
  }
  for (let k = 0; k < 8; k++) {
    const x = -L / 2 + 0.25 + k * ((L - 0.5) / 7);
    g.add(makeBox(0.09, 0.03, gauge + 0.22, p.timber, x, 0.015, 0));
  }
  g.add(makeBox(L - 0.2, 0.008, 0.018, p.cyanLed, 0, 0.05, 0));
  return g;
}

function buildCharger(p: ReturnType<typeof createPalette>): THREE.Group {
  const g = new THREE.Group();
  g.name = "charger";
  g.add(makeBox(0.8, 0.024, 0.68, p.darkSteel, 0, 0.012, 0));
  const coil = makeCyl(0.18, 0.18, 0.01, 20, p.violetAccent);
  coil.position.set(0.08, 0.028, 0);
  g.add(coil);
  g.add(makeBox(0.22, 0.96, 0.38, p.wallSlate, -0.28, 0.5, 0));
  g.add(makeBox(0.02, 0.32, 0.26, p.brushedSteel, -0.165, 0.54, 0));
  g.add(makeBox(0.024, 0.045, 0.22, p.greenLed, -0.16, 0.9, 0, "chg_status_led"));
  g.add(makeBox(0.34, 0.014, 0.024, p.cyanLed, 0.1, 0.03, -0.26));
  g.add(makeBox(0.34, 0.014, 0.024, p.cyanLed, 0.1, 0.03, 0.26));
  return g;
}

function buildRobot(p: ReturnType<typeof createPalette>): THREE.Group {
  const g = new THREE.Group();
  g.name = "robot";
  g.add(makeBox(0.7, 0.1, 0.5, p.robotShell, 0, 0.09, 0));
  g.add(makeBox(0.74, 0.016, 0.54, p.rubber, 0, 0.016, 0));
  g.add(makeBox(0.64, 0.04, 0.44, p.violetAccent, 0, 0.14, 0));
  g.add(makeBox(0.02, 0.025, 0.32, p.greenLed, 0.352, 0.08, 0));
  const lidar = makeCyl(0.05, 0.055, 0.045, 16, p.glassDark);
  lidar.position.set(0.26, 0.18, 0);
  g.add(lidar);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.052, 0.008, 8, 20), p.cyanLed);
  ring.rotation.x = Math.PI / 2;
  ring.position.set(0.26, 0.19, 0);
  g.add(ring);

  const wheelCoords: [string, number, number][] = [
    ["wheel_fl", 0.2, 0.25],
    ["wheel_fr", 0.2, -0.25],
    ["wheel_rl", -0.2, 0.25],
    ["wheel_rr", -0.2, -0.25],
  ];
  for (const [name, wx, wz] of wheelCoords) {
    const joint = new THREE.Group();
    joint.name = name;
    joint.position.set(wx, 0.05, wz);
    joint.userData.s3d_joint = { name, type: "continuous", axis: [0, 0, -1], lower: 0, upper: 0 };
    const tire = makeCyl(0.05, 0.05, 0.045, 16, p.rubber);
    tire.rotation.x = Math.PI / 2;
    const hub = makeCyl(0.028, 0.028, 0.05, 10, p.alloyRim);
    hub.rotation.x = Math.PI / 2;
    joint.add(tire, hub);
    g.add(joint);
  }

  const lift = new THREE.Group();
  lift.name = "lift_slide";
  lift.position.set(0, 0.145, 0);
  lift.userData.s3d_joint = { name: "lift_slide", type: "prismatic", axis: [0, 1, 0], lower: 0, upper: 0.35 };
  lift.add(makeBox(0.54, 0.02, 0.4, p.brushedSteel, 0, 0, 0));
  lift.add(makeBox(0.08, 0.01, 0.08, p.pinkLed, 0, 0.012, 0));
  g.add(lift);
  return g;
}

function buildConveyor(p: ReturnType<typeof createPalette>): THREE.Group {
  const g = new THREE.Group();
  g.name = "conveyor";
  const L = 2.0, W = 0.64, H = 0.75;
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      g.add(makeBox(0.05, H - 0.06, 0.05, p.darkSteel, sx * (L / 2 - 0.08), (H - 0.06) / 2, sz * (W / 2 - 0.02)));
    }
  }
  for (const sz of [-1, 1]) {
    g.add(makeBox(L, 0.11, 0.04, p.orangeBeam, 0, H - 0.055, sz * (W / 2 + 0.02)));
  }
  g.add(makeBox(L - 0.08, 0.02, W - 0.05, p.beltSurface, 0, H - 0.01, 0));
  g.add(makeBox(L - 0.2, 0.01, 0.01, p.cyanLed, 0, H - 0.04, -W / 2 - 0.045));
  for (const sx of [-1, 1]) {
    const r = makeCyl(0.04, 0.04, W - 0.05, 14, p.alloyRim);
    r.rotation.x = Math.PI / 2;
    r.position.set(sx * (L / 2 - 0.04), H - 0.025, 0);
    g.add(r);
  }
  return g;
}

function buildStation(p: ReturnType<typeof createPalette>): THREE.Group {
  const g = new THREE.Group();
  g.name = "station";
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      g.add(makeBox(0.06, 0.88, 0.06, p.darkSteel, sx * 0.44, 0.44, sz * 0.28));
    }
  }
  g.add(makeBox(1.0, 0.04, 0.7, p.deckPlate, 0, 0.88, 0));
  g.add(makeBox(0.42, 0.26, 0.02, p.violetAccent, 0, 1.07, -0.2));
  const pole = makeCyl(0.02, 0.02, 0.34, 10, p.brushedSteel);
  pole.position.set(-0.43, 1.07, 0.26);
  g.add(pole);

  // Named status tower meshes driven by telemetry
  const lamps: [string, THREE.Material, number][] = [
    ["tower_green", p.greenLed.clone(), 1.28],
    ["tower_amber", p.amberLed.clone(), 1.36],
    ["tower_red", p.redLed.clone(), 1.44],
  ];
  for (const [name, mat, y] of lamps) {
    const lamp = makeCyl(0.042, 0.042, 0.068, 14, mat, name);
    lamp.position.set(-0.43, y, 0.26);
    g.add(lamp);
  }
  return g;
}

function buildRobotArm(p: ReturnType<typeof createPalette>): THREE.Group {
  const g = new THREE.Group();
  g.name = "robot_arm";
  const base = makeCyl(0.24, 0.28, 0.12, 18, p.darkSteel);
  base.position.y = 0.06;
  const ped = makeCyl(0.16, 0.18, 0.16, 16, p.robotShell);
  ped.position.y = 0.2;
  g.add(base, ped);

  const turret = new THREE.Group();
  turret.name = "base_yaw";
  turret.position.set(0, 0.28, 0);
  turret.userData.s3d_joint = { name: "base_yaw", type: "continuous", axis: [0, 1, 0], lower: 0, upper: 0 };
  const tCyl = makeCyl(0.14, 0.14, 0.14, 16, p.violetAccent);
  tCyl.position.y = 0.07;
  turret.add(tCyl, makeBox(0.2, 0.2, 0.24, p.violetAccent, 0, 0.2, 0));

  const shoulder = new THREE.Group();
  shoulder.name = "shoulder_pitch";
  shoulder.position.set(0, 0.26, 0);
  shoulder.userData.s3d_joint = { name: "shoulder_pitch", type: "revolute", axis: [0, 0, 1], lower: -1.5, upper: 1.5 };
  shoulder.add(makeBox(0.12, 0.52, 0.16, p.robotShell, 0, 0.26, 0));

  const elbow = new THREE.Group();
  elbow.name = "elbow_pitch";
  elbow.position.set(0, 0.52, 0);
  elbow.userData.s3d_joint = { name: "elbow_pitch", type: "revolute", axis: [0, 0, 1], lower: -2.0, upper: 2.0 };
  elbow.add(makeBox(0.1, 0.44, 0.12, p.robotShell, 0, 0.22, 0));

  const wrist = new THREE.Group();
  wrist.name = "wrist_roll";
  wrist.position.set(0, 0.46, 0);
  wrist.userData.s3d_joint = { name: "wrist_roll", type: "continuous", axis: [0, 1, 0], lower: 0, upper: 0 };
  wrist.add(makeBox(0.12, 0.05, 0.16, p.brushedSteel, 0, 0.025, 0));
  wrist.add(makeBox(0.02, 0.01, 0.02, p.pinkLed, 0, 0.14, 0));

  const fL = new THREE.Group();
  fL.name = "finger_l_slide";
  fL.position.set(0, 0.05, -0.05);
  fL.userData.s3d_joint = { name: "finger_l_slide", type: "prismatic", axis: [0, 0, -1], lower: 0, upper: 0.04 };
  fL.add(makeBox(0.03, 0.1, 0.02, p.darkSteel, 0, 0.05, 0));

  const fR = new THREE.Group();
  fR.name = "finger_r_slide";
  fR.position.set(0, 0.05, 0.05);
  fR.userData.s3d_joint = { name: "finger_r_slide", type: "prismatic", axis: [0, 0, 1], lower: 0, upper: 0.04 };
  fR.add(makeBox(0.03, 0.1, 0.02, p.darkSteel, 0, 0.05, 0));

  wrist.add(fL, fR);
  elbow.add(wrist);
  shoulder.add(elbow);
  turret.add(shoulder);
  g.add(turret);
  return g;
}

function buildRobotTransfer(p: ReturnType<typeof createPalette>): THREE.Group {
  const g = new THREE.Group();
  g.name = "robot_transfer";
  const railLen = 4.0, mastH = 2.6;
  for (const sz of [-0.38, 0.38]) {
    g.add(makeBox(railLen, 0.05, 0.07, p.brushedSteel, 0, 0.025, sz));
  }
  for (const sx of [-1, 1]) {
    g.add(makeBox(0.06, 0.16, 0.9, p.redLed, sx * (railLen / 2 - 0.03), 0.08, 0));
  }

  const carriage = new THREE.Group();
  carriage.name = "travel_slide";
  carriage.position.set(-1.4, 0, 0);
  carriage.userData.s3d_joint = { name: "travel_slide", type: "prismatic", axis: [1, 0, 0], lower: 0, upper: 2.8 };
  carriage.add(makeBox(0.9, 0.16, 0.76, p.violetFrame, 0, 0.13, 0));
  carriage.add(makeBox(0.3, 0.5, 0.5, p.robotShell, -0.28, 0.45, 0));
  const beacon = makeCyl(0.045, 0.045, 0.09, 12, p.amberLed);
  beacon.position.set(-0.28, 0.75, 0);
  carriage.add(beacon);
  carriage.add(makeBox(0.12, mastH, 0.12, p.brushedSteel, 0.2, 0.21 + mastH / 2, 0));

  const lift = new THREE.Group();
  lift.name = "lift_slide";
  lift.position.set(0.28, 0.45, 0);
  lift.userData.s3d_joint = { name: "lift_slide", type: "prismatic", axis: [0, 1, 0], lower: 0, upper: 1.7 };
  lift.add(makeBox(0.2, 0.26, 0.36, p.cabAmber, 0, 0, 0));

  const fork = new THREE.Group();
  fork.name = "fork_slide";
  fork.position.set(0, 0.14, 0);
  fork.userData.s3d_joint = { name: "fork_slide", type: "prismatic", axis: [0, 0, 1], lower: 0, upper: 0.6 };
  fork.add(makeBox(0.16, 0.03, 0.85, p.brushedSteel, 0, 0, 0));
  fork.add(makeBox(0.06, 0.01, 0.06, p.pinkLed, 0, 0.02, 0.38));

  lift.add(fork);
  carriage.add(lift);
  g.add(carriage);
  return g;
}

function buildHumanoid(p: ReturnType<typeof createPalette>): THREE.Group {
  const g = new THREE.Group();
  g.name = "humanoid";
  g.add(makeBox(0.22, 0.14, 0.3, p.darkSteel, 0, 0.94, 0));
  g.add(makeBox(0.24, 0.42, 0.34, p.cabAmber, 0, 1.22, 0));
  g.add(makeBox(0.248, 0.055, 0.348, p.cyanLed, 0, 1.24, 0));

  const head = new THREE.Group();
  head.name = "head_yaw";
  head.position.set(0, 1.46, 0);
  head.userData.s3d_joint = { name: "head_yaw", type: "revolute", axis: [0, 1, 0], lower: -1.2, upper: 1.2 };
  const skull = new THREE.Mesh(new THREE.SphereGeometry(0.11, 14, 12), p.skin);
  skull.position.y = 0.11;
  skull.castShadow = true;
  head.add(skull);
  head.add(makeBox(0.23, 0.09, 0.22, p.robotShell, 0, 0.19, 0));
  head.add(makeBox(0.02, 0.03, 0.06, p.cyanLed, 0.12, 0.2, 0));
  g.add(head);

  const arms: [string, number][] = [["elbow_l_pitch", -0.22], ["elbow_r_pitch", 0.22]];
  for (const [name, z] of arms) {
    g.add(makeBox(0.09, 0.26, 0.08, p.wallSlate, 0, 1.28, z));
    const arm = new THREE.Group();
    arm.name = name;
    arm.position.set(0, 1.15, z);
    arm.userData.s3d_joint = { name, type: "revolute", axis: [0, 0, 1], lower: -1.6, upper: 0.7 };
    arm.add(makeBox(0.08, 0.26, 0.07, p.skin, 0, -0.13, 0));
    g.add(arm);
  }

  const legs: [string, number][] = [["knee_l_pitch", -0.095], ["knee_r_pitch", 0.095]];
  for (const [name, z] of legs) {
    g.add(makeBox(0.12, 0.42, 0.11, p.darkSteel, 0, 0.67, z));
    const leg = new THREE.Group();
    leg.name = name;
    leg.position.set(0, 0.46, z);
    leg.userData.s3d_joint = { name, type: "revolute", axis: [0, 0, 1], lower: -0.6, upper: 1.2 };
    leg.add(makeBox(0.1, 0.38, 0.095, p.darkSteel, 0, -0.19, 0));
    leg.add(makeBox(0.21, 0.08, 0.105, p.rubber, 0.04, -0.42, 0));
    g.add(leg);
  }
  return g;
}

function buildDrone(p: ReturnType<typeof createPalette>): THREE.Group {
  const g = new THREE.Group();
  g.name = "drone";
  g.add(makeBox(0.22, 0.09, 0.22, p.robotShell, 0, 0.19, 0));
  g.add(makeBox(0.16, 0.03, 0.16, p.violetAccent, 0, 0.25, 0));
  g.add(makeBox(0.14, 0.05, 0.09, p.darkSteel, 0, 0.12, 0));

  const spec: [string, number, number, THREE.Material][] = [
    ["front", 0.42, 0, p.greenLed],
    ["back", -0.42, 0, p.redLed],
    ["left", 0, -0.42, p.cyanLed],
    ["right", 0, 0.42, p.cyanLed],
  ];
  for (const [name, x, z, ledMat] of spec) {
    g.add(makeBox(x ? 0.42 : 0.04, 0.03, z ? 0.42 : 0.04, p.violetFrame, x / 2, 0.19, z / 2));
    const motor = makeCyl(0.036, 0.036, 0.055, 12, p.brushedSteel);
    motor.position.set(x, 0.2, z);
    g.add(motor);
    const led = new THREE.Mesh(new THREE.SphereGeometry(0.018, 10, 8), ledMat);
    led.position.set(x, 0.17, z);
    g.add(led);

    const rotor = new THREE.Group();
    rotor.name = `rotor_${name}_spin`;
    rotor.position.set(x, 0.235, z);
    rotor.userData.s3d_joint = { name: rotor.name, type: "continuous", axis: [0, 1, 0], lower: 0, upper: 0 };
    rotor.add(makeBox(0.28, 0.008, 0.028, p.glassDark));
    rotor.add(makeBox(0.028, 0.008, 0.28, p.glassDark));
    g.add(rotor);
  }

  for (const sz of [-0.12, 0.12]) {
    g.add(makeBox(0.38, 0.02, 0.02, p.darkSteel, 0, 0.01, sz));
    for (const sx of [-0.13, 0.13]) {
      g.add(makeBox(0.018, 0.14, 0.018, p.darkSteel, sx, 0.08, sz));
    }
  }
  return g;
}

function buildTruck(p: ReturnType<typeof createPalette>): THREE.Group {
  const g = new THREE.Group();
  g.name = "truck";
  const width = 2.4;
  g.add(makeBox(7.2, 0.24, width - 0.3, p.darkSteel, 0, 0.42, 0));
  g.add(makeBox(5.2, 2.4, width, p.robotShell, -0.9, 1.74, 0));
  g.add(makeBox(5.22, 0.2, width + 0.02, p.violetAccent, -0.9, 1.8, 0));
  g.add(makeBox(1.7, 1.9, width - 0.1, p.cabAmber, 2.65, 1.62, 0));
  g.add(makeBox(0.03, 0.8, width - 0.4, p.glassDark, 3.51, 1.9, 0));
  for (const sz of [-0.8, 0.8]) {
    g.add(makeBox(0.03, 0.14, 0.26, p.labelPaper, 3.515, 0.8, sz));
    g.add(makeBox(0.03, 0.12, 0.2, p.redLed, -3.515, 0.72, sz));
  }

  for (const [tag, x] of [
    ["front", 2.5],
    ["mid", -0.3],
    ["rear", -1.7],
  ] as const) {
    for (const [side, sz] of [
      ["l", -1],
      ["r", 1],
    ] as const) {
      const name = `wheel_${tag}_${side}_spin`;
      const joint = new THREE.Group();
      joint.name = name;
      joint.position.set(x, 0.5, sz * (width / 2 - 0.15));
      joint.userData.s3d_joint = { name, type: "continuous", axis: [0, 0, -1], lower: 0, upper: 0 };
      const tire = makeCyl(0.5, 0.5, 0.3, 18, p.rubber);
      tire.rotation.x = Math.PI / 2;
      const hub = makeCyl(0.28, 0.28, 0.32, 12, p.alloyRim);
      hub.rotation.x = Math.PI / 2;
      joint.add(tire, hub);
      g.add(joint);
    }
  }
  return g;
}

const assetCache = new Map<string, THREE.Object3D>();

export function isProceduralUrl(url?: string): boolean {
  return !!url && url.startsWith(PROCEDURAL_PREFIX);
}

export function getProceduralAsset(url: string): THREE.Object3D {
  const hit = assetCache.get(url);
  if (hit) return hit;

  const key = url.slice(PROCEDURAL_PREFIX.length);
  const p = createPalette();
  let group: THREE.Group;
  switch (key) {
    case "warehouse":
      group = buildWarehouse(p);
      break;
    case "rack":
      group = buildRack(p);
      break;
    case "tote":
      group = buildTote(p);
      break;
    case "pallet":
      group = buildPallet(p);
      break;
    case "goods":
      group = buildGoods(p);
      break;
    case "bag":
      group = buildBag(p);
      break;
    case "track":
      group = buildTrack(p);
      break;
    case "charger":
      group = buildCharger(p);
      break;
    case "robot":
      group = buildRobot(p);
      break;
    case "conveyor":
      group = buildConveyor(p);
      break;
    case "station":
      group = buildStation(p);
      break;
    case "robot_arm":
      group = buildRobotArm(p);
      break;
    case "robot_transfer":
      group = buildRobotTransfer(p);
      break;
    case "humanoid":
      group = buildHumanoid(p);
      break;
    case "drone":
      group = buildDrone(p);
      break;
    case "truck":
      group = buildTruck(p);
      break;
    default: {
      group = new THREE.Group();
      group.add(makeBox(0.6, 0.6, 0.6, p.violetAccent, 0, 0.3, 0));
      break;
    }
  }
  assetCache.set(url, group);
  return group;
}
