import * as THREE from "three";
import { mergeVertices } from "three/examples/jsm/utils/BufferGeometryUtils.js";

function ensureIndexedTangents(geom: THREE.BufferGeometry): THREE.BufferGeometry {
  const indexed = geom.index ? geom : mergeVertices(geom);
  if (indexed !== geom) geom.dispose();
  if (
    indexed.index &&
    indexed.attributes.position &&
    indexed.attributes.normal &&
    indexed.attributes.uv
  ) {
    indexed.computeTangents();
  }
  return indexed;
}

export interface InterceptorHandle {
  group: THREE.Group;
  thrusterCones: THREE.Mesh[];
  wingLights: THREE.Mesh[];
}

/**
 * Composite 10-part PBR Interceptor spacecraft (Extrude fuselage, Lathe nose cone,
 * swept wings, vertical stabilizer, tinted clearcoat canopy, twin engine bells & plasma cones).
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
    roughness: 0.58,
    metalness: 0.24,
  });
  const trimMat = new THREE.MeshStandardMaterial({
    color: "#8b6ff5",
    roughness: 0.22,
    metalness: 0.88,
  });
  const canopyMat = new THREE.MeshPhysicalMaterial({
    color: "#f59e0b",
    emissive: "#d97706",
    emissiveIntensity: 0.35,
    roughness: 0.1,
    metalness: 0.1,
    clearcoat: 1.0,
    clearcoatRoughness: 0.08,
  });
  const engineMat = new THREE.MeshStandardMaterial({
    color: "#1e293b",
    roughness: 0.65,
    metalness: 0.86,
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

  const rawHullGeom = new THREE.ExtrudeGeometry(hullShape, {
    depth: 1.65,
    bevelEnabled: true,
    bevelThickness: 0.08,
    bevelSize: 0.06,
    bevelSegments: 2,
  });
  rawHullGeom.center();
  const hullGeom = ensureIndexedTangents(rawHullGeom);
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
  const rawNoseGeom = new THREE.LatheGeometry(nosePts, 14);
  rawNoseGeom.rotateX(-Math.PI / 2);
  const noseGeom = ensureIndexedTangents(rawNoseGeom);
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

  const rawWingGeom = new THREE.ExtrudeGeometry(wingShape, {
    depth: 0.06,
    bevelEnabled: true,
    bevelThickness: 0.02,
    bevelSize: 0.02,
    bevelSegments: 1,
  });
  rawWingGeom.rotateX(Math.PI / 2);
  const wingGeom = ensureIndexedTangents(rawWingGeom);

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

  // 7–10) Twin thruster bells, glowing plasma cones & wingtip beacons
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
 * Shared geometries for composite 5-part trench portal gates (no single primitive arches).
 */
export interface TrenchPortalGeometries {
  outerRing: THREE.TorusGeometry;
  innerRing: THREE.TorusGeometry;
  stanchion: THREE.BoxGeometry;
  crown: THREE.BoxGeometry;
}

export function createTrenchPortalGeometries(): TrenchPortalGeometries {
  return {
    outerRing: new THREE.TorusGeometry(6.8, 0.26, 8, 8),
    innerRing: new THREE.TorusGeometry(6.3, 0.1, 6, 8),
    stanchion: new THREE.BoxGeometry(0.85, 2.4, 0.85),
    crown: new THREE.BoxGeometry(2.6, 0.45, 0.72),
  };
}

export function createTrenchPortal(
  accentColor: string,
  geoms: TrenchPortalGeometries,
  frameMat: THREE.Material,
): { group: THREE.Group; ring: THREE.Mesh } {
  const group = new THREE.Group();

  const glowMat = new THREE.MeshStandardMaterial({
    color: accentColor,
    emissive: accentColor,
    emissiveIntensity: 0.62,
    roughness: 0.26,
    metalness: 0.72,
  });

  // 1) Rotating octagonal outer portal ring
  const ring = new THREE.Mesh(geoms.outerRing, glowMat);
  ring.position.set(0, 3.0, 0);
  ring.rotation.z = Math.PI / 8;
  group.add(ring);

  // 2) Inner crisp accent bevel ring
  const inner = new THREE.Mesh(geoms.innerRing, frameMat);
  inner.position.set(0, 3.0, 0);
  inner.rotation.z = Math.PI / 8;
  group.add(inner);

  // 3 & 4) Grounded port & starboard anchor stanchions seated flush at y = 0
  for (const side of [-1, 1]) {
    const leg = new THREE.Mesh(geoms.stanchion, frameMat);
    leg.position.set(side * 6.5, 1.2, 0);
    group.add(leg);
  }

  // 5) Upper crown keystone bracket
  const crown = new THREE.Mesh(geoms.crown, frameMat);
  crown.position.set(0, 9.55, 0);
  group.add(crown);

  return { group, ring };
}

/**
 * Procedural basalt canyon monolith spire (LatheGeometry, bottom-center pivoted at y = 0)
 * for InstancedMesh perimeter canyon terrain.
 */
export function createCanyonMonolithGeometry(): THREE.LatheGeometry {
  const pts = [
    new THREE.Vector2(1.45, 0),
    new THREE.Vector2(1.25, 2.2),
    new THREE.Vector2(0.95, 5.4),
    new THREE.Vector2(0.68, 8.6),
    new THREE.Vector2(0.24, 11.2),
    new THREE.Vector2(0.01, 12.0),
  ];
  const geom = new THREE.LatheGeometry(pts, 7);
  geom.computeVertexNormals();
  return geom;
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
    roughness: 0.84,
    metalness: 0.12,
    flatShading: true,
  });
  const veinMat = new THREE.MeshStandardMaterial({
    color: "#fb923c",
    emissive: "#ea580c",
    emissiveIntensity: 0.5,
    roughness: 0.24,
    metalness: 0.72,
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
    roughness: 0.24,
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

export interface ExplodePart {
  object: THREE.Object3D;
  restPos: THREE.Vector3;
  offset: THREE.Vector3;
}

export interface ShowcaseHandle {
  group: THREE.Group;
  ringA: THREE.Mesh;
  ringB: THREE.Mesh;
  ringC: THREE.Mesh;
  core: THREE.Mesh;
  dome: THREE.Mesh;
  explodeParts: ExplodePart[];
}

/**
 * Composite 11-part Orbital Gyro Reactor for the 3D Studio Sandbox showcase
 * with anisotropic brushed metal, optical containment dome, and exploded-view layers.
 */
export function createShowcaseReactor(isSoftwareGl: boolean): ShowcaseHandle {
  const group = new THREE.Group();
  const explodeParts: ExplodePart[] = [];

  const addExplode = (object: THREE.Object3D, ox: number, oy: number, oz: number) => {
    explodeParts.push({
      object,
      restPos: object.position.clone(),
      offset: new THREE.Vector3(ox, oy, oz),
    });
  };

  const baseMat = new THREE.MeshStandardMaterial({
    color: "#334155",
    roughness: 0.62,
    metalness: 0.58,
  });
  const brushedBrassMat = new THREE.MeshPhysicalMaterial({
    color: "#f59e0b",
    roughness: 0.16,
    metalness: 0.94,
    anisotropy: 0.8,
    anisotropyRotation: 0.25,
    clearcoat: 0.45,
  });
  const ringMatA = new THREE.MeshPhysicalMaterial({
    color: "#22d3ee",
    roughness: 0.18,
    metalness: 0.9,
    anisotropy: 0.75,
    clearcoat: 0.6,
  });
  const ringMatB = new THREE.MeshStandardMaterial({
    color: "#f472b6",
    roughness: 0.34,
    metalness: 0.78,
  });
  const coreMat = new THREE.MeshStandardMaterial({
    color: "#a78bfa",
    emissive: "#6d28d9",
    emissiveIntensity: 0.72,
    roughness: 0.18,
    metalness: 0.4,
  });
  const domeMat = new THREE.MeshPhysicalMaterial({
    color: "#bae6fd",
    metalness: 0,
    roughness: 0.08,
    transmission: isSoftwareGl ? 0 : 0.9,
    transparent: true,
    opacity: isSoftwareGl ? 0.28 : 1.0,
    ior: 1.62,
    thickness: 1.1,
    attenuationColor: new THREE.Color("#22d3ee"),
    attenuationDistance: 2.2,
    clearcoat: 1.0,
    depthWrite: false,
  });

  // 1) Pedestal plinth grounded flush at y = 0
  const plinth = new THREE.Mesh(new THREE.CylinderGeometry(2.1, 2.55, 0.42, 28), baseMat);
  plinth.position.y = 0.21;
  plinth.receiveShadow = true;
  group.add(plinth);
  addExplode(plinth, 0, -0.35, 0);

  // 2) Anisotropic brushed brass collar
  const collarGeom = ensureIndexedTangents(new THREE.CylinderGeometry(1.38, 1.7, 0.36, 24));
  const collar = new THREE.Mesh(collarGeom, brushedBrassMat);
  collar.position.y = 0.6;
  group.add(collar);
  addExplode(collar, 0, -0.12, 0);

  // 3–6) Four radial stabilizer anchor fins grounded at y = 0
  const finGeom = new THREE.BoxGeometry(0.24, 0.56, 0.75);
  for (let i = 0; i < 4; i++) {
    const ang = (i * Math.PI) / 2 + Math.PI / 4;
    const fin = new THREE.Mesh(finGeom, brushedBrassMat);
    fin.position.set(Math.cos(ang) * 2.2, 0.28, Math.sin(ang) * 2.2);
    fin.rotation.y = -ang + Math.PI / 2;
    fin.castShadow = true;
    group.add(fin);
    addExplode(fin, Math.cos(ang) * 0.95, 0, Math.sin(ang) * 0.95);
  }

  // 7–8) Twin swept support pylons
  const pylonGeom = new THREE.BoxGeometry(0.28, 2.35, 0.42);
  for (const s of [-1, 1]) {
    const pylon = new THREE.Mesh(pylonGeom, baseMat);
    pylon.position.set(s * 2.15, 1.75, 0);
    pylon.rotation.z = s * 0.14;
    pylon.castShadow = true;
    group.add(pylon);
    addExplode(pylon, s * 1.15, 0.15, 0);
  }

  const pivotY = 2.45;

  // 9) Outer anisotropic cyan gimbal ring
  const ringAGeom = ensureIndexedTangents(new THREE.TorusGeometry(1.75, 0.14, 16, 48));
  const ringA = new THREE.Mesh(ringAGeom, ringMatA);
  ringA.position.y = pivotY;
  ringA.castShadow = true;
  group.add(ringA);
  addExplode(ringA, 0, 0.55, 1.15);

  // 10) Middle magenta gimbal ring
  const ringB = new THREE.Mesh(new THREE.TorusGeometry(1.32, 0.12, 16, 42), ringMatB);
  ringB.position.y = pivotY;
  ringB.rotation.x = Math.PI / 4;
  ringB.castShadow = true;
  group.add(ringB);
  addExplode(ringB, 0, 0.85, -1.05);

  // 11) Inner brushed gold gimbal ring
  const ringCGeom = ensureIndexedTangents(new THREE.TorusGeometry(0.92, 0.1, 14, 36));
  const ringC = new THREE.Mesh(ringCGeom, brushedBrassMat);
  ringC.position.y = pivotY;
  ringC.rotation.y = Math.PI / 3;
  group.add(ringC);
  addExplode(ringC, 0, 1.15, 0);

  // Optical glass containment dome around core (sorted after opaque rings)
  const dome = new THREE.Mesh(new THREE.SphereGeometry(0.76, 28, 20), domeMat);
  dome.position.y = pivotY;
  dome.renderOrder = 2;
  group.add(dome);
  addExplode(dome, 0, 1.55, 0);

  // Plasma torus-knot core
  const core = new THREE.Mesh(new THREE.TorusKnotGeometry(0.42, 0.13, 96, 16), coreMat);
  core.position.y = pivotY;
  core.castShadow = true;
  group.add(core);
  addExplode(core, 0, 2.05, 0);

  return { group, ringA, ringB, ringC, core, dome, explodeParts };
}
