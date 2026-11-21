import * as THREE from "three";
import type { WorldNodeId, WorldRouteNode } from "./worldTypes";

export interface RoutePathHandle {
  group: THREE.Group;
  pulseBeads: THREE.Mesh[];
  stripMat: THREE.MeshStandardMaterial;
  beadMat: THREE.MeshStandardMaterial;
  dirVec: THREE.Vector3;
  length: number;
}

export interface MonumentHandle {
  node: WorldRouteNode;
  root: THREE.Group;
  sculpture: THREE.Group;
  pedestalRimMat: THREE.MeshStandardMaterial;
  accentLightMat: THREE.MeshStandardMaterial;
  hitProxy: THREE.Mesh;
  labelAnchorLocal: THREE.Vector3;
  pathHandle: RoutePathHandle | null;
  update: (time: number, dt: number, hoverWeight: number) => void;
}

function addShadow(obj: THREE.Object3D, castShadow: boolean, receiveShadow = true) {
  obj.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (mesh.isMesh) {
      mesh.castShadow = castShadow;
      mesh.receiveShadow = receiveShadow;
    }
  });
}

function createPedestal(
  accentHex: string,
  radius: number,
  height: number,
  contactTex: THREE.CanvasTexture,
  castShadow: boolean,
): { group: THREE.Group; rimMat: THREE.MeshStandardMaterial } {
  const group = new THREE.Group();

  const stoneMat = new THREE.MeshStandardMaterial({
    color: "#1b1830",
    roughness: 0.78,
    metalness: 0.16,
  });
  const trimMat = new THREE.MeshStandardMaterial({
    color: "#475569",
    roughness: 0.28,
    metalness: 0.88,
  });
  const rimMat = new THREE.MeshStandardMaterial({
    color: accentHex,
    emissive: accentHex,
    emissiveIntensity: 0.85,
    roughness: 0.25,
    metalness: 0.5,
  });

  // Contact shadow disc grounded on plaza deck
  const contact = new THREE.Mesh(
    new THREE.PlaneGeometry(radius * 3.1, radius * 3.1),
    new THREE.MeshBasicMaterial({
      map: contactTex,
      transparent: true,
      opacity: 0.55,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    }),
  );
  contact.rotation.x = -Math.PI / 2;
  contact.position.y = 0.015;
  contact.renderOrder = 1;
  group.add(contact);

  // Lower stepped octagon base
  const base = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius * 1.14, height * 0.48, 8), stoneMat);
  base.position.y = height * 0.24;
  base.castShadow = castShadow;
  base.receiveShadow = true;
  group.add(base);

  // Upper machined cap
  const cap = new THREE.Mesh(
    new THREE.CylinderGeometry(radius * 0.82, radius * 0.92, height * 0.52, 16),
    trimMat,
  );
  cap.position.y = height * 0.74;
  cap.castShadow = castShadow;
  cap.receiveShadow = true;
  group.add(cap);

  // Glowing inlay ring
  const rim = new THREE.Mesh(new THREE.TorusGeometry(radius * 0.84, 0.045, 10, 48), rimMat);
  rim.rotation.x = Math.PI / 2;
  rim.position.y = height * 0.98;
  group.add(rim);

  return { group, rimMat };
}

function createRoutePath(
  targetPos: [number, number, number],
  accentHex: string,
  castShadow: boolean,
): RoutePathHandle {
  const group = new THREE.Group();
  const end = new THREE.Vector3(targetPos[0], 0, targetPos[2]);
  const fullLen = end.length();
  const startOffset = 2.65;
  const endOffset = 2.05;
  const pathLen = Math.max(2.0, fullLen - startOffset - endOffset);
  const dirVec = end.clone().normalize();
  const mid = dirVec.clone().multiplyScalar(startOffset + pathLen * 0.5);
  const yaw = Math.atan2(dirVec.x, dirVec.z);

  const deckMat = new THREE.MeshStandardMaterial({
    color: "#1a1732",
    roughness: 0.76,
    metalness: 0.22,
  });
  const railMat = new THREE.MeshStandardMaterial({
    color: "#64748b",
    roughness: 0.26,
    metalness: 0.88,
  });
  const stripMat = new THREE.MeshStandardMaterial({
    color: accentHex,
    emissive: accentHex,
    emissiveIntensity: 0.65,
    roughness: 0.3,
    metalness: 0.4,
  });
  const beadMat = new THREE.MeshStandardMaterial({
    color: "#ffffff",
    emissive: accentHex,
    emissiveIntensity: 1.5,
    roughness: 0.18,
    metalness: 0.2,
  });

  // Raised stone bridge slab
  const slab = new THREE.Mesh(new THREE.BoxGeometry(1.05, 0.08, pathLen), deckMat);
  slab.position.set(mid.x, 0.04, mid.z);
  slab.rotation.y = yaw;
  slab.receiveShadow = true;
  slab.castShadow = castShadow;
  group.add(slab);

  // Twin metallic edge curbs
  for (const side of [-1, 1]) {
    const curb = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.12, pathLen), railMat);
    curb.position.set(
      mid.x + Math.cos(yaw) * side * 0.5,
      0.06,
      mid.z - Math.sin(yaw) * side * 0.5,
    );
    curb.rotation.y = yaw;
    curb.receiveShadow = true;
    group.add(curb);
  }

  // Center luminous energy conduit
  const strip = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.025, pathLen * 0.96), stripMat);
  strip.position.set(mid.x, 0.09, mid.z);
  strip.rotation.y = yaw;
  group.add(strip);

  // Traveling energy pulse beads along the path
  const pulseBeads: THREE.Mesh[] = [];
  const beadGeom = new THREE.OctahedronGeometry(0.1, 0);
  for (let i = 0; i < 3; i++) {
    const bead = new THREE.Mesh(beadGeom, beadMat);
    bead.position.set(mid.x, 0.16, mid.z);
    bead.userData.phaseOffset = i / 3;
    bead.userData.startOffset = startOffset;
    bead.userData.pathLen = pathLen;
    group.add(bead);
    pulseBeads.push(bead);
  }

  return { group, pulseBeads, stripMat, beadMat, dirVec, length: pathLen };
}

/* --------------------------------------------------------------------------
 * Monument 1: Home ("/") — EVOL Observatory Gyro Ring & Faceted Crystal Core
 * -------------------------------------------------------------------------- */
function buildHomeSculpture(
  accentHex: string,
  isSoftwareGl: boolean,
  castShadow: boolean,
): {
  sculpture: THREE.Group;
  accentLightMat: THREE.MeshStandardMaterial;
  animate: (t: number, dt: number, hover: number) => void;
} {
  const sculpture = new THREE.Group();

  const platinumMat = new THREE.MeshStandardMaterial({
    color: "#cbd5e1",
    roughness: 0.22,
    metalness: 0.92,
  });
  const violetMat = new THREE.MeshStandardMaterial({
    color: "#7c3aed",
    roughness: 0.34,
    metalness: 0.78,
  });
  const accentLightMat = new THREE.MeshStandardMaterial({
    color: accentHex,
    emissive: accentHex,
    emissiveIntensity: 1.15,
    roughness: 0.2,
    metalness: 0.4,
  });
  const crystalMat = new THREE.MeshPhysicalMaterial({
    color: "#a5f3fc",
    emissive: "#22d3ee",
    emissiveIntensity: 0.35,
    roughness: 0.08,
    metalness: 0.05,
    clearcoat: 1.0,
    transmission: isSoftwareGl ? 0 : 0.82,
    transparent: true,
    opacity: isSoftwareGl ? 0.55 : 1,
    ior: 1.7,
    thickness: 1.2,
  });

  // Grounded tripod cradle legs
  for (let i = 0; i < 3; i++) {
    const a = (i * Math.PI * 2) / 3;
    const pillar = new THREE.Mesh(new THREE.BoxGeometry(0.18, 1.35, 0.24), platinumMat);
    pillar.position.set(Math.cos(a) * 1.15, 0.68, Math.sin(a) * 1.15);
    pillar.rotation.y = -a;
    pillar.rotation.z = 0.22;
    sculpture.add(pillar);
  }

  // Outer EVOL O-ring
  const ringOuter = new THREE.Mesh(new THREE.TorusGeometry(1.28, 0.1, 16, 64), platinumMat);
  ringOuter.position.y = 2.05;
  sculpture.add(ringOuter);

  const ringInner = new THREE.Mesh(new THREE.TorusGeometry(0.95, 0.07, 14, 48), violetMat);
  ringInner.position.y = 2.05;
  sculpture.add(ringInner);

  const ringGlow = new THREE.Mesh(new THREE.TorusGeometry(0.72, 0.035, 12, 48), accentLightMat);
  ringGlow.position.y = 2.05;
  sculpture.add(ringGlow);

  // Faceted central observatory crystal
  const core = new THREE.Mesh(new THREE.OctahedronGeometry(0.42, 0), crystalMat);
  core.position.y = 2.05;
  sculpture.add(core);

  addShadow(sculpture, castShadow);

  return {
    sculpture,
    accentLightMat,
    animate: (t, dt, hover) => {
      const boost = 1 + hover * 1.8;
      ringOuter.rotation.y += dt * 0.45 * boost;
      ringOuter.rotation.x = Math.sin(t * 0.6) * 0.22;
      ringInner.rotation.x += dt * 0.85 * boost;
      ringInner.rotation.z += dt * 0.35 * boost;
      ringGlow.rotation.y -= dt * 1.1 * boost;
      core.rotation.y += dt * 0.9 * boost;
      core.position.y = 2.05 + Math.sin(t * 2.1) * 0.08 + hover * 0.14;
    },
  };
}

/* --------------------------------------------------------------------------
 * Monument 2: Music ("/music") — Turntable Plinth, Vinyl Disc & Equalizer Bars
 * -------------------------------------------------------------------------- */
function buildMusicSculpture(
  accentHex: string,
  vinylTex: THREE.CanvasTexture,
  castShadow: boolean,
): {
  sculpture: THREE.Group;
  accentLightMat: THREE.MeshStandardMaterial;
  animate: (t: number, dt: number, hover: number) => void;
} {
  const sculpture = new THREE.Group();

  const deckMat = new THREE.MeshStandardMaterial({
    color: "#1e1b33",
    roughness: 0.72,
    metalness: 0.25,
  });
  const metalMat = new THREE.MeshStandardMaterial({
    color: "#cbd5e1",
    roughness: 0.2,
    metalness: 0.92,
  });
  const vinylMat = new THREE.MeshStandardMaterial({
    map: vinylTex,
    roughness: 0.28,
    metalness: 0.35,
  });
  const accentLightMat = new THREE.MeshStandardMaterial({
    color: accentHex,
    emissive: accentHex,
    emissiveIntensity: 1.0,
    roughness: 0.25,
    metalness: 0.4,
  });

  // Angled turntable console deck
  const consoleGroup = new THREE.Group();
  consoleGroup.position.set(0, 0.55, 0);
  consoleGroup.rotation.x = 0.24;
  sculpture.add(consoleGroup);

  const chassis = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.22, 1.55), deckMat);
  consoleGroup.add(chassis);

  const platter = new THREE.Mesh(new THREE.CylinderGeometry(0.64, 0.66, 0.06, 36), metalMat);
  platter.position.set(-0.18, 0.14, 0.02);
  consoleGroup.add(platter);

  const vinyl = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.6, 0.02, 36), vinylMat);
  vinyl.position.set(-0.18, 0.18, 0.02);
  consoleGroup.add(vinyl);

  const spindle = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.1, 12), metalMat);
  spindle.position.set(-0.18, 0.22, 0.02);
  consoleGroup.add(spindle);

  // Tonearm gimbal + arm tube
  const toneBase = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.13, 0.14, 16), metalMat);
  toneBase.position.set(0.66, 0.17, -0.45);
  consoleGroup.add(toneBase);

  const toneArm = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.82, 8), metalMat);
  toneArm.rotation.x = Math.PI / 2;
  toneArm.rotation.z = 0.32;
  toneArm.position.set(0.52, 0.24, -0.08);
  consoleGroup.add(toneArm);

  // Floating holographic equalizer bars behind turntable
  const eqBars: THREE.Mesh[] = [];
  for (let i = 0; i < 5; i++) {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.85, 0.14), accentLightMat);
    bar.position.set((i - 2) * 0.26, 1.48, -0.35);
    sculpture.add(bar);
    eqBars.push(bar);
  }

  addShadow(sculpture, castShadow);

  return {
    sculpture,
    accentLightMat,
    animate: (t, dt, hover) => {
      vinyl.rotation.y += dt * (1.8 + hover * 2.4);
      eqBars.forEach((b, i) => {
        const wave = 0.45 + 0.55 * Math.abs(Math.sin(t * (3.2 + hover * 2.5) + i * 0.9));
        b.scale.y = wave + hover * 0.35;
        b.position.y = 1.15 + b.scale.y * 0.42 + hover * 0.12;
      });
    },
  };
}

/* --------------------------------------------------------------------------
 * Monument 3: Map ("/map") — Cartographic Globe & Brass Gimbal Astrolabe
 * -------------------------------------------------------------------------- */
function buildMapSculpture(
  accentHex: string,
  globeTex: THREE.CanvasTexture,
  castShadow: boolean,
): {
  sculpture: THREE.Group;
  accentLightMat: THREE.MeshStandardMaterial;
  animate: (t: number, dt: number, hover: number) => void;
} {
  const sculpture = new THREE.Group();

  const brassMat = new THREE.MeshStandardMaterial({
    color: "#e2b857",
    roughness: 0.24,
    metalness: 0.9,
  });
  const slateMat = new THREE.MeshStandardMaterial({
    color: "#1e293b",
    roughness: 0.72,
    metalness: 0.25,
  });
  const globeMat = new THREE.MeshStandardMaterial({
    map: globeTex,
    roughness: 0.42,
    metalness: 0.18,
  });
  const accentLightMat = new THREE.MeshStandardMaterial({
    color: accentHex,
    emissive: accentHex,
    emissiveIntensity: 1.05,
    roughness: 0.25,
    metalness: 0.3,
  });

  // Yoke cradle stem
  const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.22, 0.65, 16), slateMat);
  stem.position.y = 0.32;
  sculpture.add(stem);

  // Outer brass meridian ring
  const outerRing = new THREE.Mesh(new THREE.TorusGeometry(0.98, 0.055, 14, 56), brassMat);
  outerRing.position.y = 1.48;
  sculpture.add(outerRing);

  const innerRing = new THREE.Mesh(new THREE.TorusGeometry(0.84, 0.035, 12, 48), brassMat);
  innerRing.position.y = 1.48;
  innerRing.rotation.y = Math.PI / 2;
  sculpture.add(innerRing);

  // Rotating procedural globe + waypoint beacon pins
  const globeGroup = new THREE.Group();
  globeGroup.position.y = 1.48;
  sculpture.add(globeGroup);

  const globe = new THREE.Mesh(new THREE.SphereGeometry(0.64, 32, 24), globeMat);
  globeGroup.add(globe);

  const pinAngles: Array<[number, number]> = [
    [0.4, 0.7],
    [-0.5, 2.2],
    [0.2, 4.1],
  ];
  for (const [lat, lon] of pinAngles) {
    const pin = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.22, 10), accentLightMat);
    const r = 0.72;
    const x = r * Math.cos(lat) * Math.cos(lon);
    const y = r * Math.sin(lat);
    const z = r * Math.cos(lat) * Math.sin(lon);
    pin.position.set(x, y, z);
    pin.lookAt(x * 2, y * 2, z * 2);
    pin.rotateX(Math.PI / 2);
    globeGroup.add(pin);
  }

  addShadow(sculpture, castShadow);

  return {
    sculpture,
    accentLightMat,
    animate: (t, dt, hover) => {
      const mult = 1 + hover * 1.9;
      globeGroup.rotation.y += dt * 0.55 * mult;
      innerRing.rotation.z += dt * 0.35 * mult;
      outerRing.rotation.y = Math.sin(t * 0.5) * 0.35;
      globeGroup.position.y = 1.48 + hover * 0.14;
      outerRing.position.y = 1.48 + hover * 0.14;
      innerRing.position.y = 1.48 + hover * 0.14;
    },
  };
}

/* --------------------------------------------------------------------------
 * Monument 4: Photobooth ("/photobooth") — Vintage-Future Camera & Optical Lens
 * -------------------------------------------------------------------------- */
function buildPhotoboothSculpture(
  accentHex: string,
  isSoftwareGl: boolean,
  castShadow: boolean,
): {
  sculpture: THREE.Group;
  accentLightMat: THREE.MeshStandardMaterial;
  animate: (t: number, dt: number, hover: number) => void;
} {
  const sculpture = new THREE.Group();

  const bodyMat = new THREE.MeshStandardMaterial({
    color: "#191628",
    roughness: 0.74,
    metalness: 0.2,
  });
  const chromeMat = new THREE.MeshStandardMaterial({
    color: "#e2e8f0",
    roughness: 0.18,
    metalness: 0.94,
  });
  const lensGlassMat = new THREE.MeshPhysicalMaterial({
    color: "#f0abfc",
    roughness: 0.05,
    metalness: 0.05,
    clearcoat: 1.0,
    transmission: isSoftwareGl ? 0 : 0.85,
    transparent: true,
    opacity: isSoftwareGl ? 0.55 : 1,
    ior: 1.62,
  });
  const accentLightMat = new THREE.MeshStandardMaterial({
    color: accentHex,
    emissive: accentHex,
    emissiveIntensity: 1.1,
    roughness: 0.25,
    metalness: 0.3,
  });

  // Tripod stand collar
  const stand = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.24, 0.72, 16), chromeMat);
  stand.position.y = 0.36;
  sculpture.add(stand);

  // Floating camera head
  const camHead = new THREE.Group();
  camHead.position.y = 1.35;
  sculpture.add(camHead);

  // Extruded chamfered camera chassis
  const shape = new THREE.Shape();
  const w = 0.85;
  const h = 0.52;
  const r = 0.12;
  shape.moveTo(-w + r, -h);
  shape.lineTo(w - r, -h);
  shape.quadraticCurveTo(w, -h, w, -h + r);
  shape.lineTo(w, h - r);
  shape.quadraticCurveTo(w, h, w - r, h);
  shape.lineTo(-w + r, h);
  shape.quadraticCurveTo(-w, h, -w, h - r);
  shape.lineTo(-w, -h + r);
  shape.quadraticCurveTo(-w, -h, -w + r, -h);

  const bodyGeom = new THREE.ExtrudeGeometry(shape, {
    depth: 0.55,
    bevelEnabled: true,
    bevelThickness: 0.05,
    bevelSize: 0.05,
    bevelSegments: 3,
  });
  bodyGeom.center();
  const bodyMesh = new THREE.Mesh(bodyGeom, bodyMat);
  camHead.add(bodyMesh);

  // Top chrome plate & shutter dial
  const topPlate = new THREE.Mesh(new THREE.BoxGeometry(1.64, 0.14, 0.58), chromeMat);
  topPlate.position.y = 0.54;
  camHead.add(topPlate);

  const dial = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.12, 20), chromeMat);
  dial.position.set(0.5, 0.66, 0);
  camHead.add(dial);

  // Glowing magenta viewfinder prism
  const flash = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.16, 0.12), accentLightMat);
  flash.position.set(-0.46, 0.66, 0.22);
  camHead.add(flash);

  // Multi-stage optical lens barrel
  const barrelOuter = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.42, 0.42, 28), chromeMat);
  barrelOuter.rotation.x = Math.PI / 2;
  barrelOuter.position.set(0, -0.04, 0.42);
  camHead.add(barrelOuter);

  const lensRing = new THREE.Mesh(new THREE.TorusGeometry(0.36, 0.03, 12, 36), accentLightMat);
  lensRing.position.set(0, -0.04, 0.64);
  camHead.add(lensRing);

  const frontElement = new THREE.Mesh(new THREE.SphereGeometry(0.3, 24, 16), lensGlassMat);
  frontElement.scale.set(1, 1, 0.35);
  frontElement.position.set(0, -0.04, 0.6);
  camHead.add(frontElement);

  addShadow(sculpture, castShadow);

  return {
    sculpture,
    accentLightMat,
    animate: (t, dt, hover) => {
      camHead.position.y = 1.35 + Math.sin(t * 1.8) * 0.06 + hover * 0.16;
      camHead.rotation.y = Math.sin(t * 0.7) * 0.28;
      dial.rotation.y += dt * (0.4 + hover * 2.0);
    },
  };
}

/* --------------------------------------------------------------------------
 * Monument 5: Work ("/work") — Articulated 6-Axis Industrial Robot Arm
 * -------------------------------------------------------------------------- */
function buildWorkSculpture(
  accentHex: string,
  castShadow: boolean,
): {
  sculpture: THREE.Group;
  accentLightMat: THREE.MeshStandardMaterial;
  animate: (t: number, dt: number, hover: number) => void;
} {
  const sculpture = new THREE.Group();

  const housingMat = new THREE.MeshStandardMaterial({
    color: "#38bdf8",
    roughness: 0.38,
    metalness: 0.45,
  });
  const darkMetalMat = new THREE.MeshStandardMaterial({
    color: "#1e293b",
    roughness: 0.68,
    metalness: 0.72,
  });
  const chromeMat = new THREE.MeshStandardMaterial({
    color: "#e2e8f0",
    roughness: 0.2,
    metalness: 0.92,
  });
  const accentLightMat = new THREE.MeshStandardMaterial({
    color: accentHex,
    emissive: accentHex,
    emissiveIntensity: 1.1,
    roughness: 0.22,
    metalness: 0.4,
  });

  // Base turret
  const baseRing = new THREE.Mesh(new THREE.CylinderGeometry(0.52, 0.62, 0.28, 24), darkMetalMat);
  baseRing.position.y = 0.14;
  sculpture.add(baseRing);

  const turret = new THREE.Group();
  turret.position.y = 0.28;
  sculpture.add(turret);

  const shoulderBlock = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.44, 0.56), housingMat);
  shoulderBlock.position.y = 0.22;
  turret.add(shoulderBlock);

  // Lower arm pivot
  const lowerArmPivot = new THREE.Group();
  lowerArmPivot.position.y = 0.36;
  turret.add(lowerArmPivot);

  const shoulderJoint = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.66, 20), chromeMat);
  shoulderJoint.rotation.z = Math.PI / 2;
  lowerArmPivot.add(shoulderJoint);

  const lowerBeam = new THREE.Mesh(new THREE.BoxGeometry(0.24, 1.05, 0.28), housingMat);
  lowerBeam.position.y = 0.52;
  lowerArmPivot.add(lowerBeam);

  // Elbow pivot
  const elbowPivot = new THREE.Group();
  elbowPivot.position.y = 1.04;
  lowerArmPivot.add(elbowPivot);

  const elbowJoint = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.48, 18), chromeMat);
  elbowJoint.rotation.z = Math.PI / 2;
  elbowPivot.add(elbowJoint);

  const foreArm = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.14, 0.88, 16), darkMetalMat);
  foreArm.position.y = 0.44;
  elbowPivot.add(foreArm);

  // Wrist gripper + cyan laser tip
  const wrist = new THREE.Mesh(new THREE.SphereGeometry(0.14, 16, 12), chromeMat);
  wrist.position.y = 0.9;
  elbowPivot.add(wrist);

  const jawL = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.24, 0.1), accentLightMat);
  jawL.position.set(-0.11, 1.06, 0);
  elbowPivot.add(jawL);

  const jawR = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.24, 0.1), accentLightMat);
  jawR.position.set(0.11, 1.06, 0);
  elbowPivot.add(jawR);

  addShadow(sculpture, castShadow);

  return {
    sculpture,
    accentLightMat,
    animate: (t, _dt, hover) => {
      const speed = 1 + hover * 1.4;
      turret.rotation.y = Math.sin(t * 0.7 * speed) * 0.9;
      lowerArmPivot.rotation.x = -0.35 + Math.sin(t * 0.95 * speed) * 0.25;
      elbowPivot.rotation.x = 0.95 + Math.cos(t * 1.15 * speed) * 0.35;
      const pinch = 0.09 + Math.abs(Math.sin(t * 2.2)) * 0.06;
      jawL.position.x = -pinch;
      jawR.position.x = pinch;
    },
  };
}

/* --------------------------------------------------------------------------
 * Monument 6: ASCII 3D ("/ascii") — Phosphor Terminal & Hovering Interceptor
 * -------------------------------------------------------------------------- */
function buildAsciiSculpture(
  accentHex: string,
  screenTex: THREE.CanvasTexture,
  castShadow: boolean,
): {
  sculpture: THREE.Group;
  accentLightMat: THREE.MeshStandardMaterial;
  animate: (t: number, dt: number, hover: number) => void;
} {
  const sculpture = new THREE.Group();

  const casingMat = new THREE.MeshStandardMaterial({
    color: "#1e293b",
    roughness: 0.72,
    metalness: 0.35,
  });
  const screenMat = new THREE.MeshStandardMaterial({
    map: screenTex,
    emissive: "#10b981",
    emissiveMap: screenTex,
    emissiveIntensity: 0.95,
    roughness: 0.22,
    metalness: 0.15,
  });
  const shipHullMat = new THREE.MeshStandardMaterial({
    color: "#cbd5e1",
    roughness: 0.28,
    metalness: 0.85,
  });
  const accentLightMat = new THREE.MeshStandardMaterial({
    color: accentHex,
    emissive: accentHex,
    emissiveIntensity: 1.2,
    roughness: 0.25,
    metalness: 0.3,
  });

  // Terminal CRT terminal monolith
  const stand = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.35, 0.65), casingMat);
  stand.position.set(0, 0.18, -0.15);
  sculpture.add(stand);

  const monitor = new THREE.Mesh(new THREE.BoxGeometry(1.38, 1.02, 0.62), casingMat);
  monitor.position.set(0, 0.88, -0.2);
  monitor.rotation.x = -0.14;
  sculpture.add(monitor);

  const screen = new THREE.Mesh(new THREE.PlaneGeometry(1.16, 0.8), screenMat);
  screen.position.set(0, 0.88, 0.12);
  screen.rotation.x = -0.14;
  sculpture.add(screen);

  // Miniature hovering orbital interceptor ship in front of CRT
  const ship = new THREE.Group();
  ship.position.set(0, 1.85, 0.32);
  sculpture.add(ship);

  const fuselage = new THREE.Mesh(new THREE.ConeGeometry(0.18, 0.78, 6), shipHullMat);
  fuselage.rotation.x = Math.PI / 2;
  ship.add(fuselage);

  const wing = new THREE.Mesh(new THREE.BoxGeometry(0.92, 0.04, 0.32), shipHullMat);
  wing.position.z = -0.06;
  ship.add(wing);

  const thruster = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.24, 8), accentLightMat);
  thruster.rotation.x = -Math.PI / 2;
  thruster.position.z = -0.44;
  ship.add(thruster);

  addShadow(sculpture, castShadow);

  return {
    sculpture,
    accentLightMat,
    animate: (t, _dt, hover) => {
      ship.position.y = 1.85 + Math.sin(t * 2.4) * 0.1 + hover * 0.18;
      ship.rotation.z = Math.sin(t * 1.4) * 0.24;
      ship.rotation.y = Math.sin(t * 0.8) * 0.22;
    },
  };
}

/* --------------------------------------------------------------------------
 * Monument 7: Blank ("/blank") — Obsidian Archway & Levitating Cipher Key
 * -------------------------------------------------------------------------- */
function buildBlankSculpture(
  accentHex: string,
  castShadow: boolean,
): {
  sculpture: THREE.Group;
  accentLightMat: THREE.MeshStandardMaterial;
  animate: (t: number, dt: number, hover: number) => void;
} {
  const sculpture = new THREE.Group();

  const obsidianMat = new THREE.MeshStandardMaterial({
    color: "#151324",
    roughness: 0.76,
    metalness: 0.22,
  });
  const goldMat = new THREE.MeshStandardMaterial({
    color: "#fbbf24",
    roughness: 0.2,
    metalness: 0.94,
  });
  const accentLightMat = new THREE.MeshStandardMaterial({
    color: accentHex,
    emissive: accentHex,
    emissiveIntensity: 1.0,
    roughness: 0.25,
    metalness: 0.4,
  });

  // Twin monolith arch pillars + lintel
  const pillarL = new THREE.Mesh(new THREE.BoxGeometry(0.28, 1.85, 0.34), obsidianMat);
  pillarL.position.set(-0.62, 0.92, 0);
  sculpture.add(pillarL);

  const pillarR = new THREE.Mesh(new THREE.BoxGeometry(0.28, 1.85, 0.34), obsidianMat);
  pillarR.position.set(0.62, 0.92, 0);
  sculpture.add(pillarR);

  const lintel = new THREE.Mesh(new THREE.BoxGeometry(1.66, 0.26, 0.4), obsidianMat);
  lintel.position.set(0, 1.92, 0);
  sculpture.add(lintel);

  // Floating golden cipher key inside the arch
  const keyGroup = new THREE.Group();
  keyGroup.position.set(0, 1.1, 0);
  sculpture.add(keyGroup);

  const bow = new THREE.Mesh(new THREE.TorusGeometry(0.26, 0.055, 12, 32), goldMat);
  bow.position.y = 0.3;
  keyGroup.add(bow);

  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.68, 12), goldMat);
  shaft.position.y = -0.18;
  keyGroup.add(shaft);

  const bitA = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.06, 0.06), accentLightMat);
  bitA.position.set(0.1, -0.34, 0);
  keyGroup.add(bitA);

  const bitB = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.06, 0.06), accentLightMat);
  bitB.position.set(0.08, -0.46, 0);
  keyGroup.add(bitB);

  addShadow(sculpture, castShadow);

  return {
    sculpture,
    accentLightMat,
    animate: (t, dt, hover) => {
      keyGroup.rotation.y += dt * (1.0 + hover * 2.2);
      keyGroup.position.y = 1.1 + Math.sin(t * 2.0) * 0.08 + hover * 0.14;
    },
  };
}

/* --------------------------------------------------------------------------
 * Monument 8: Profile / Login ("/profile" | "/login") — Identity Prism Beacon
 * -------------------------------------------------------------------------- */
function buildProfileSculpture(
  accentHex: string,
  isSoftwareGl: boolean,
  castShadow: boolean,
): {
  sculpture: THREE.Group;
  accentLightMat: THREE.MeshStandardMaterial;
  animate: (t: number, dt: number, hover: number) => void;
} {
  const sculpture = new THREE.Group();

  const basaltMat = new THREE.MeshStandardMaterial({
    color: "#1f1c36",
    roughness: 0.72,
    metalness: 0.25,
  });
  const silverMat = new THREE.MeshStandardMaterial({
    color: "#cbd5e1",
    roughness: 0.22,
    metalness: 0.9,
  });
  const accentLightMat = new THREE.MeshStandardMaterial({
    color: accentHex,
    emissive: accentHex,
    emissiveIntensity: 1.05,
    roughness: 0.25,
    metalness: 0.4,
  });
  const prismMat = new THREE.MeshPhysicalMaterial({
    color: "#c4b5fd",
    emissive: "#8b5cf6",
    emissiveIntensity: 0.35,
    roughness: 0.08,
    metalness: 0.05,
    clearcoat: 1.0,
    transmission: isSoftwareGl ? 0 : 0.8,
    transparent: true,
    opacity: isSoftwareGl ? 0.55 : 1,
    ior: 1.58,
  });

  // Curved twin heraldic fins
  for (const side of [-1, 1]) {
    const fin = new THREE.Mesh(new THREE.BoxGeometry(0.18, 1.55, 0.36), basaltMat);
    fin.position.set(side * 0.58, 0.78, 0);
    fin.rotation.z = side * -0.14;
    sculpture.add(fin);

    const trim = new THREE.Mesh(new THREE.BoxGeometry(0.05, 1.48, 0.08), silverMat);
    trim.position.set(side * 0.48, 0.78, 0.16);
    trim.rotation.z = side * -0.14;
    sculpture.add(trim);
  }

  // Orbiting identity halo
  const halo = new THREE.Mesh(new THREE.TorusGeometry(0.55, 0.032, 12, 42), accentLightMat);
  halo.position.y = 1.28;
  halo.rotation.x = Math.PI / 2 - 0.25;
  sculpture.add(halo);

  // Floating icosahedron core
  const prism = new THREE.Mesh(new THREE.IcosahedronGeometry(0.36, 0), prismMat);
  prism.position.y = 1.28;
  sculpture.add(prism);

  addShadow(sculpture, castShadow);

  return {
    sculpture,
    accentLightMat,
    animate: (t, dt, hover) => {
      const boost = 1 + hover * 2.0;
      prism.rotation.y += dt * 0.9 * boost;
      prism.position.y = 1.28 + Math.sin(t * 2.2) * 0.08 + hover * 0.16;
      halo.rotation.z += dt * 0.8 * boost;
      halo.position.y = prism.position.y;
    },
  };
}

export interface MonumentFactoryAssets {
  vinylTex: THREE.CanvasTexture;
  globeTex: THREE.CanvasTexture;
  screenTex: THREE.CanvasTexture;
  contactTex: THREE.CanvasTexture;
}

export function createMonument(
  node: WorldRouteNode,
  assets: MonumentFactoryAssets,
  isSoftwareGl: boolean,
): MonumentHandle {
  const castShadow = !isSoftwareGl;
  const root = new THREE.Group();
  root.position.set(node.position[0], node.position[1], node.position[2]);

  // Face outer monuments slightly inward toward the central plaza
  if (node.angle !== null) {
    root.lookAt(0, 0, 0);
  }

  const isCenter = node.id === "home";
  const pedRadius = isCenter ? 2.25 : 1.38;
  const pedHeight = isCenter ? 0.56 : 0.42;

  const { group: pedestal, rimMat: pedestalRimMat } = createPedestal(
    node.accentHex,
    pedRadius,
    pedHeight,
    assets.contactTex,
    castShadow,
  );
  root.add(pedestal);

  let built: {
    sculpture: THREE.Group;
    accentLightMat: THREE.MeshStandardMaterial;
    animate: (t: number, dt: number, hover: number) => void;
  };

  const builders: Record<WorldNodeId, () => typeof built> = {
    home: () => buildHomeSculpture(node.accentHex, isSoftwareGl, castShadow),
    music: () => buildMusicSculpture(node.accentHex, assets.vinylTex, castShadow),
    map: () => buildMapSculpture(node.accentHex, assets.globeTex, castShadow),
    photobooth: () => buildPhotoboothSculpture(node.accentHex, isSoftwareGl, castShadow),
    work: () => buildWorkSculpture(node.accentHex, castShadow),
    ascii: () => buildAsciiSculpture(node.accentHex, assets.screenTex, castShadow),
    blank: () => buildBlankSculpture(node.accentHex, castShadow),
    profile: () => buildProfileSculpture(node.accentHex, isSoftwareGl, castShadow),
  };

  built = builders[node.id]();
  built.sculpture.position.y = pedHeight;
  root.add(built.sculpture);

  // Invisible simplified proxy cylinder on raycaster layer 1 for effortless zero-lag picking
  const proxyRadius = isCenter ? 2.1 : 1.55;
  const proxyHeight = isCenter ? 3.5 : 2.95;
  const hitProxy = new THREE.Mesh(
    new THREE.CylinderGeometry(proxyRadius, proxyRadius, proxyHeight, 12),
    new THREE.MeshBasicMaterial({ visible: false }),
  );
  hitProxy.position.y = proxyHeight * 0.5;
  hitProxy.layers.set(1);
  hitProxy.userData.nodeId = node.id;
  root.add(hitProxy);

  const pathHandle =
    node.angle !== null ? createRoutePath(node.position, node.accentHex, castShadow) : null;

  const labelAnchorLocal = new THREE.Vector3(0, isCenter ? 3.65 : 2.95, 0);

  return {
    node,
    root,
    sculpture: built.sculpture,
    pedestalRimMat,
    accentLightMat: built.accentLightMat,
    hitProxy,
    labelAnchorLocal,
    pathHandle,
    update: (time, dt, hoverWeight) => {
      built.animate(time, dt, hoverWeight);
      pedestalRimMat.emissiveIntensity = 0.85 + hoverWeight * 1.45;
      built.accentLightMat.emissiveIntensity = 1.0 + hoverWeight * 1.1;

      if (pathHandle) {
        pathHandle.stripMat.emissiveIntensity = 0.55 + hoverWeight * 1.6;
        pathHandle.beadMat.emissiveIntensity = 1.3 + hoverWeight * 1.8;
        const speed = 0.24 + hoverWeight * 0.45;
        for (let i = 0; i < pathHandle.pulseBeads.length; i++) {
          const bead = pathHandle.pulseBeads[i];
          const phase = ((time * speed + (bead.userData.phaseOffset as number)) % 1 + 1) % 1;
          const dist =
            (bead.userData.startOffset as number) + phase * (bead.userData.pathLen as number);
          bead.position.set(
            pathHandle.dirVec.x * dist,
            0.16 + Math.sin(phase * Math.PI) * 0.06,
            pathHandle.dirVec.z * dist,
          );
          const s = 0.85 + hoverWeight * 0.45;
          bead.scale.setScalar(s);
        }
      }
    },
  };
}
