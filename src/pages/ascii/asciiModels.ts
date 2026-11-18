import * as THREE from "three";

export interface InterceptorHandle {
  group: THREE.Group;
  thrusterCones: THREE.Mesh[];
  wingLights: THREE.Mesh[];
}

/**
 * Composite 8-part PBR Interceptor spacecraft (Extrude fuselage, Lathe nose cone,
 * swept wings, vertical stabilizer, tinted canopy, twin engine bells & plasma cones).
 */
export function createInterceptorShip(): InterceptorHandle {
  const group = new THREE.Group();

  const hullMat = new THREE.MeshStandardMaterial({
    color: "#cbd5e1",
    roughness: 0.34,
    metalness: 0.72,
  });
  const wingMat = new THREE.MeshStandardMaterial({
    color: "#38bdf8",
    roughness: 0.48,
    metalness: 0.32,
  });
  const trimMat = new THREE.MeshStandardMaterial({
    color: "#8b6ff5",
    roughness: 0.25,
    metalness: 0.85,
  });
  const canopyMat = new THREE.MeshPhysicalMaterial({
    color: "#f59e0b",
    emissive: "#d97706",
    emissiveIntensity: 0.35,
    roughness: 0.12,
    metalness: 0.15,
    clearcoat: 1.0,
  });
  const engineMat = new THREE.MeshStandardMaterial({
    color: "#1e293b",
    roughness: 0.62,
    metalness: 0.88,
  });
  const plasmaMat = new THREE.MeshBasicMaterial({
    color: "#22d3ee",
  });
  const navMat = new THREE.MeshBasicMaterial({
    color: "#f43f5e",
  });

  // 1) Main fuselage via beveled ExtrudeGeometry
  const hullShape = new THREE.Shape();
  hullShape.moveTo(0, 0.34);
  hullShape.lineTo(0.42, 0.06);
  hullShape.lineTo(0.32, -0.26);
  hullShape.lineTo(-0.32, -0.26);
  hullShape.lineTo(-0.42, 0.06);
  hullShape.closePath();

  const hullGeom = new THREE.ExtrudeGeometry(hullShape, {
    depth: 1.65,
    bevelEnabled: true,
    bevelThickness: 0.08,
    bevelSize: 0.06,
    bevelSegments: 2,
  });
  hullGeom.center();
  const hullMesh = new THREE.Mesh(hullGeom, hullMat);
  hullMesh.position.set(0, 0.28, 0.08);
  hullMesh.castShadow = true;
  group.add(hullMesh);

  // 2) Nose cone via LatheGeometry
  const nosePts = [
    new THREE.Vector2(0.001, 0.95),
    new THREE.Vector2(0.14, 0.55),
    new THREE.Vector2(0.28, 0.18),
    new THREE.Vector2(0.35, 0),
  ];
  const noseGeom = new THREE.LatheGeometry(nosePts, 12);
  noseGeom.rotateX(-Math.PI / 2);
  const noseMesh = new THREE.Mesh(noseGeom, trimMat);
  noseMesh.position.set(0, 0.28, -0.76);
  noseMesh.castShadow = true;
  group.add(noseMesh);

  // 3) Cockpit canopy
  const canopyGeom = new THREE.CapsuleGeometry(0.18, 0.56, 4, 10);
  canopyGeom.rotateX(Math.PI / 2);
  const canopyMesh = new THREE.Mesh(canopyGeom, canopyMat);
  canopyMesh.scale.set(1.0, 0.72, 1.0);
  canopyMesh.position.set(0, 0.52, -0.14);
  group.add(canopyMesh);

  // 4 & 5) Swept port & starboard wings (ExtrudeGeometry)
  const wingShape = new THREE.Shape();
  wingShape.moveTo(0, 0);
  wingShape.lineTo(1.18, 0.52);
  wingShape.lineTo(1.18, 0.92);
  wingShape.lineTo(0, 0.65);
  wingShape.closePath();

  const wingGeom = new THREE.ExtrudeGeometry(wingShape, {
    depth: 0.06,
    bevelEnabled: true,
    bevelThickness: 0.02,
    bevelSize: 0.02,
    bevelSegments: 1,
  });
  wingGeom.rotateX(Math.PI / 2);

  const rightWing = new THREE.Mesh(wingGeom, wingMat);
  rightWing.position.set(0.32, 0.24, -0.2);
  rightWing.castShadow = true;
  group.add(rightWing);

  const leftWing = new THREE.Mesh(wingGeom, wingMat);
  leftWing.scale.x = -1;
  leftWing.position.set(-0.32, 0.24, -0.2);
  leftWing.castShadow = true;
  group.add(leftWing);

  // 6) Dorsal stabilizer fin
  const finShape = new THREE.Shape();
  finShape.moveTo(0, 0);
  finShape.lineTo(0.55, 0);
  finShape.lineTo(0.65, 0.44);
  finShape.lineTo(0.32, 0.44);
  finShape.closePath();
  const finGeom = new THREE.ExtrudeGeometry(finShape, {
    depth: 0.04,
    bevelEnabled: true,
    bevelSize: 0.01,
    bevelThickness: 0.01,
  });
  finGeom.rotateY(Math.PI / 2);
  const finMesh = new THREE.Mesh(finGeom, trimMat);
  finMesh.position.set(-0.02, 0.5, 0.25);
  group.add(finMesh);

  // 7 & 8) Twin thruster bells + glowing plasma cones + wingtip beacons
  const bellGeom = new THREE.CylinderGeometry(0.14, 0.19, 0.28, 12);
  bellGeom.rotateX(Math.PI / 2);
  const coneGeom = new THREE.ConeGeometry(0.13, 0.62, 10);
  coneGeom.rotateX(Math.PI / 2);
  const beaconGeom = new THREE.BoxGeometry(0.08, 0.08, 0.34);

  const thrusterCones: THREE.Mesh[] = [];
  const wingLights: THREE.Mesh[] = [];

  for (const side of [-1, 1]) {
    const bell = new THREE.Mesh(bellGeom, engineMat);
    bell.position.set(side * 0.22, 0.24, 0.92);
    group.add(bell);

    const plasma = new THREE.Mesh(coneGeom, plasmaMat);
    plasma.position.set(side * 0.22, 0.24, 1.32);
    group.add(plasma);
    thrusterCones.push(plasma);

    const beacon = new THREE.Mesh(beaconGeom, navMat);
    beacon.position.set(side * 1.46, 0.22, 0.48);
    group.add(beacon);
    wingLights.push(beacon);
  }

  return { group, thrusterCones, wingLights };
}

/**
 * Composite 5-part crystal asteroid cluster for obstacle dodging.
 */
export function createAsteroidCluster(): THREE.Group {
  const group = new THREE.Group();

  const rockMat = new THREE.MeshStandardMaterial({
    color: "#ef4444",
    emissive: "#7f1d1d",
    emissiveIntensity: 0.25,
    roughness: 0.82,
    metalness: 0.12,
    flatShading: true,
  });
  const veinMat = new THREE.MeshStandardMaterial({
    color: "#fb923c",
    emissive: "#ea580c",
    emissiveIntensity: 0.5,
    roughness: 0.28,
    metalness: 0.68,
  });

  const core = new THREE.Mesh(new THREE.DodecahedronGeometry(0.88, 0), rockMat);
  core.castShadow = true;
  group.add(core);

  const shardGeom = new THREE.OctahedronGeometry(0.44, 0);
  const offsets: [number, number, number, number][] = [
    [0.64, 0.35, 0.15, 0.85],
    [-0.58, -0.25, 0.4, 0.72],
    [0.12, -0.62, -0.45, 0.65],
    [-0.3, 0.58, -0.32, 0.6],
  ];
  for (let i = 0; i < offsets.length; i++) {
    const [x, y, z, sc] = offsets[i];
    const m = new THREE.Mesh(shardGeom, i % 2 === 0 ? veinMat : rockMat);
    m.position.set(x, y, z);
    m.scale.setScalar(sc);
    m.rotation.set(i * 0.9, i * 1.3, 0.4);
    group.add(m);
  }

  return group;
}

/**
 * Composite 4-part collectible energy core with tilted gyroscopic rings.
 */
export function createEnergyOrb(): THREE.Group {
  const group = new THREE.Group();

  const coreMat = new THREE.MeshStandardMaterial({
    color: "#22d3ee",
    emissive: "#06b6d4",
    emissiveIntensity: 0.85,
    roughness: 0.16,
    metalness: 0.35,
  });
  const ringMat = new THREE.MeshStandardMaterial({
    color: "#facc15",
    emissive: "#eab308",
    emissiveIntensity: 0.45,
    roughness: 0.22,
    metalness: 0.88,
  });

  const core = new THREE.Mesh(new THREE.OctahedronGeometry(0.42, 0), coreMat);
  group.add(core);

  const ring1 = new THREE.Mesh(new THREE.TorusGeometry(0.64, 0.075, 8, 22), ringMat);
  ring1.rotation.x = Math.PI / 3;
  group.add(ring1);

  const ring2 = new THREE.Mesh(new THREE.TorusGeometry(0.56, 0.06, 8, 22), ringMat);
  ring2.rotation.y = Math.PI / 3;
  group.add(ring2);

  const cap = new THREE.Mesh(new THREE.BoxGeometry(0.16, 1.08, 0.16), coreMat);
  group.add(cap);

  return group;
}

/**
 * Composite 7-part Orbital Gyro Reactor for the 3D Studio Sandbox showcase.
 */
export interface ShowcaseHandle {
  group: THREE.Group;
  ringA: THREE.Mesh;
  ringB: THREE.Mesh;
  ringC: THREE.Mesh;
  core: THREE.Mesh;
}

export function createShowcaseReactor(): ShowcaseHandle {
  const group = new THREE.Group();

  const baseMat = new THREE.MeshStandardMaterial({
    color: "#334155",
    roughness: 0.58,
    metalness: 0.72,
  });
  const ringMatA = new THREE.MeshStandardMaterial({
    color: "#22d3ee",
    roughness: 0.22,
    metalness: 0.88,
  });
  const ringMatB = new THREE.MeshStandardMaterial({
    color: "#f472b6",
    roughness: 0.28,
    metalness: 0.78,
  });
  const ringMatC = new THREE.MeshStandardMaterial({
    color: "#f59e0b",
    roughness: 0.2,
    metalness: 0.9,
  });
  const coreMat = new THREE.MeshStandardMaterial({
    color: "#a78bfa",
    emissive: "#6d28d9",
    emissiveIntensity: 0.65,
    roughness: 0.18,
    metalness: 0.4,
  });

  // Pedestal base grounded at y = 0
  const plinth = new THREE.Mesh(new THREE.CylinderGeometry(2.1, 2.5, 0.42, 24), baseMat);
  plinth.position.y = 0.21;
  plinth.receiveShadow = true;
  group.add(plinth);

  const collar = new THREE.Mesh(new THREE.CylinderGeometry(1.35, 1.65, 0.36, 20), ringMatC);
  collar.position.y = 0.6;
  group.add(collar);

  // Twin support pylons
  const pylonGeom = new THREE.BoxGeometry(0.28, 2.35, 0.42);
  for (const s of [-1, 1]) {
    const pylon = new THREE.Mesh(pylonGeom, baseMat);
    pylon.position.set(s * 2.15, 1.75, 0);
    pylon.rotation.z = s * 0.14;
    pylon.castShadow = true;
    group.add(pylon);
  }

  const pivotY = 2.45;

  const ringA = new THREE.Mesh(new THREE.TorusGeometry(1.75, 0.14, 16, 48), ringMatA);
  ringA.position.y = pivotY;
  ringA.castShadow = true;
  group.add(ringA);

  const ringB = new THREE.Mesh(new THREE.TorusGeometry(1.32, 0.12, 16, 42), ringMatB);
  ringB.position.y = pivotY;
  ringB.rotation.x = Math.PI / 4;
  ringB.castShadow = true;
  group.add(ringB);

  const ringC = new THREE.Mesh(new THREE.TorusGeometry(0.92, 0.1, 14, 36), ringMatC);
  ringC.position.y = pivotY;
  ringC.rotation.y = Math.PI / 3;
  group.add(ringC);

  const core = new THREE.Mesh(new THREE.TorusKnotGeometry(0.45, 0.14, 96, 16), coreMat);
  core.position.y = pivotY;
  core.castShadow = true;
  group.add(core);

  return { group, ringA, ringB, ringC, core };
}
