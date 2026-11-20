import React, { useEffect, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { clone as cloneSkinned } from "three/examples/jsm/utils/SkeletonUtils.js";
import type { JointDef } from "../../lib/workTypes";
import { applyJoint, buildRig, type JointRig } from "./rig";
import { parseScript, type Instr, type RobotProfileId } from "./script";

export interface DemoPlaybackState {
  state: "playing" | "paused" | "done" | "error";
  op: string;
  note: string;
}

interface Props {
  profile: RobotProfileId;
  assetUrl?: string;
  scriptText: string;
  playing: boolean;
  speedMultiplier: number;
  resetToken: number;
  onStatus?: (s: DemoPlaybackState) => void;
  onJointsDetected?: (joints: JointDef[]) => void;
}

const TAU = Math.PI * 2;
const wrapAngle = (a: number) => ((a + Math.PI) % TAU + TAU) % TAU - Math.PI;

// Pre-allocated math scratch objects for zero-GC animation ticks
const _vA = new THREE.Vector3();
const _box = new THREE.Box3();
const _size = new THREE.Vector3();
const _center = new THREE.Vector3();

function detectSoftwareWebGL(): boolean {
  try {
    const canvas = document.createElement("canvas");
    const gl = canvas.getContext("webgl2") || canvas.getContext("webgl");
    if (!gl) return true;
    const ext = gl.getExtension("WEBGL_debug_renderer_info");
    const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
    const gpu = String(gl.getParameter(param) ?? "");
    gl.getExtension("WEBGL_lose_context")?.loseContext();
    return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
  } catch {
    return true;
  }
}

function disposeObjectTree(root: THREE.Object3D) {
  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (mesh.geometry) mesh.geometry.dispose();
    if (mesh.material) {
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const m of mats) m.dispose();
    }
  });
}

function tagJoint(node: THREE.Object3D, def: JointDef & { axis: [number, number, number] }) {
  node.name = def.name;
  node.userData.s3d_joint = { ...def };
}

/** Multi-part procedural fallback models with authentic s3d_joint hierarchies when no GLB URL is present. */
function buildProceduralDemoRobot(profile: RobotProfileId): THREE.Group {
  const root = new THREE.Group();
  const bodyMat = new THREE.MeshStandardMaterial({ color: 0x3b3859, roughness: 0.45, metalness: 0.55 });
  const accentMat = new THREE.MeshStandardMaterial({ color: 0x8b6ff5, roughness: 0.3, metalness: 0.4 });
  const cyanMat = new THREE.MeshStandardMaterial({
    color: 0x22d3ee,
    emissive: 0x22d3ee,
    emissiveIntensity: 0.7,
    roughness: 0.25,
    metalness: 0.2,
  });
  const darkMat = new THREE.MeshStandardMaterial({ color: 0x161423, roughness: 0.75, metalness: 0.2 });

  if (profile === "robot_arm") {
    const ped = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.34, 0.24, 24), darkMat);
    ped.position.y = 0.12;
    root.add(ped);

    const turret = new THREE.Group();
    turret.position.set(0, 0.24, 0);
    tagJoint(turret, { name: "base_yaw", type: "continuous", axis: [0, 1, 0], lower: -Math.PI, upper: Math.PI });
    root.add(turret);

    const turretMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.24, 0.2, 20), accentMat);
    turretMesh.position.y = 0.1;
    turret.add(turretMesh);

    const shoulder = new THREE.Group();
    shoulder.position.set(0, 0.2, 0);
    tagJoint(shoulder, { name: "shoulder_pitch", type: "revolute", axis: [0, 0, 1], lower: -1.57, upper: 1.57 });
    turret.add(shoulder);

    const upperArm = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.68, 0.14), bodyMat);
    upperArm.position.y = 0.34;
    shoulder.add(upperArm);

    const elbow = new THREE.Group();
    elbow.position.set(0, 0.68, 0);
    tagJoint(elbow, { name: "elbow_pitch", type: "revolute", axis: [0, 0, 1], lower: -2.09, upper: 2.09 });
    shoulder.add(elbow);

    const forearm = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.11, 0.11), accentMat);
    forearm.position.set(0.275, 0, 0);
    elbow.add(forearm);

    const wrist = new THREE.Group();
    wrist.position.set(0.56, 0, 0);
    tagJoint(wrist, { name: "wrist_roll", type: "continuous", axis: [1, 0, 0], lower: -Math.PI, upper: Math.PI });
    elbow.add(wrist);

    const palm = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.14, 0.18), cyanMat);
    wrist.add(palm);

    const fL = new THREE.Group();
    fL.position.set(0.08, 0, 0.05);
    tagJoint(fL, { name: "finger_l_slide", type: "prismatic", axis: [0, 0, 1], lower: 0, upper: 0.05 });
    fL.add(new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.03, 0.025), darkMat));
    wrist.add(fL);

    const fR = new THREE.Group();
    fR.position.set(0.08, 0, -0.05);
    tagJoint(fR, { name: "finger_r_slide", type: "prismatic", axis: [0, 0, -1], lower: 0, upper: 0.05 });
    fR.add(new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.03, 0.025), darkMat));
    wrist.add(fR);
    return root;
  }

  if (profile === "drone") {
    const hull = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.12, 0.28), bodyMat);
    hull.position.y = 0.12;
    root.add(hull);
    const visor = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 0.18), cyanMat);
    visor.position.set(0.21, 0.13, 0);
    root.add(visor);

    const arms: [string, number, number][] = [
      ["rotor_fl_spin", 0.28, -0.26],
      ["rotor_fr_spin", 0.28, 0.26],
      ["rotor_rl_spin", -0.28, -0.26],
      ["rotor_rr_spin", -0.28, 0.26],
    ];
    for (const [name, x, z] of arms) {
      const boom = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.38, 10), darkMat);
      boom.position.set(x * 0.55, 0.13, z * 0.55);
      boom.rotation.z = Math.PI / 2;
      boom.rotation.y = Math.atan2(-z, x);
      root.add(boom);

      const hub = new THREE.Group();
      hub.position.set(x, 0.18, z);
      tagJoint(hub, { name, type: "continuous", axis: [0, 1, 0], lower: -Math.PI, upper: Math.PI });
      const blade = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.012, 0.035), accentMat);
      hub.add(blade);
      root.add(hub);
    }
    return root;
  }

  if (profile === "robot_transfer") {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(2.8, 0.08, 0.34), darkMat);
    rail.position.set(1.1, 0.04, 0);
    root.add(rail);

    const carriage = new THREE.Group();
    carriage.position.set(0, 0.08, 0);
    tagJoint(carriage, { name: "travel_slide", type: "prismatic", axis: [1, 0, 0], lower: 0, upper: 2.5 });
    root.add(carriage);

    const mast = new THREE.Mesh(new THREE.BoxGeometry(0.22, 1.9, 0.24), bodyMat);
    mast.position.y = 0.95;
    carriage.add(mast);

    const lift = new THREE.Group();
    lift.position.set(0, 0.15, 0);
    tagJoint(lift, { name: "lift_slide", type: "prismatic", axis: [0, 1, 0], lower: 0, upper: 1.5 });
    carriage.add(lift);

    const plate = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.08, 0.38), accentMat);
    lift.add(plate);

    const fork = new THREE.Group();
    fork.position.set(0, 0.05, 0);
    tagJoint(fork, { name: "fork_slide", type: "prismatic", axis: [0, 0, 1], lower: 0, upper: 0.6 });
    const forkMesh = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.04, 0.42), cyanMat);
    fork.add(forkMesh);
    lift.add(fork);
    return root;
  }

  if (profile === "humanoid") {
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.52, 0.36), bodyMat);
    torso.position.y = 1.05;
    root.add(torso);

    const head = new THREE.Group();
    head.position.set(0, 1.38, 0);
    tagJoint(head, { name: "head_yaw", type: "revolute", axis: [0, 1, 0], lower: -1.2, upper: 1.2 });
    head.add(new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.22, 0.2), accentMat));
    const eye = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.06, 0.14), cyanMat);
    eye.position.set(0.09, 0.02, 0);
    head.add(eye);
    root.add(head);

    for (const [name, z] of [["elbow_l_pitch", -0.24], ["elbow_r_pitch", 0.24]] as const) {
      const arm = new THREE.Group();
      arm.position.set(0, 1.22, z);
      tagJoint(arm, { name, type: "revolute", axis: [0, 0, 1], lower: -1.9, upper: 0.5 });
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.46, 0.1), accentMat);
      mesh.position.y = -0.22;
      arm.add(mesh);
      root.add(arm);
    }

    for (const [name, z] of [["knee_l_pitch", -0.1], ["knee_r_pitch", 0.1]] as const) {
      const leg = new THREE.Group();
      leg.position.set(0, 0.78, z);
      tagJoint(leg, { name, type: "revolute", axis: [0, 0, 1], lower: -0.3, upper: 1.6 });
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.74, 0.12), darkMat);
      mesh.position.y = -0.38;
      leg.add(mesh);
      root.add(leg);
    }
    return root;
  }

  if (profile === "conveyor") {
    const frame = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.12, 0.68), bodyMat);
    frame.position.y = 0.69;
    root.add(frame);
    const belt = new THREE.Mesh(new THREE.BoxGeometry(1.94, 0.04, 0.58), darkMat);
    belt.position.y = 0.76;
    root.add(belt);
    for (const [x, z] of [[-0.88, -0.28], [0.88, -0.28], [-0.88, 0.28], [0.88, 0.28]]) {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.68, 8), darkMat);
      leg.position.set(x, 0.34, z);
      root.add(leg);
    }
    return root;
  }

  // Default AMR / Truck / Custom chassis with wheels + lift_slide
  const chassis = new THREE.Mesh(new THREE.BoxGeometry(0.76, 0.16, 0.52), bodyMat);
  chassis.position.y = 0.11;
  root.add(chassis);
  const bumper = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.44), cyanMat);
  bumper.position.set(0.39, 0.1, 0);
  root.add(bumper);

  const lift = new THREE.Group();
  lift.position.set(0, 0.19, 0);
  tagJoint(lift, { name: "lift_slide", type: "prismatic", axis: [0, 1, 0], lower: 0, upper: 0.3 });
  lift.add(new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.04, 0.42), accentMat));
  root.add(lift);

  for (const [name, z] of [["wheel_l_spin", -0.27], ["wheel_r_spin", 0.27]] as const) {
    const w = new THREE.Group();
    w.position.set(0, 0.06, z);
    tagJoint(w, { name, type: "continuous", axis: [0, 0, -1], lower: -Math.PI, upper: Math.PI });
    const cyl = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.04, 18), darkMat);
    cyl.rotation.x = Math.PI / 2;
    w.add(cyl);
    root.add(w);
  }
  return root;
}

export default function ScriptDemoScene({
  profile,
  assetUrl,
  scriptText,
  playing,
  speedMultiplier,
  resetToken,
  onStatus,
  onJointsDetected,
}: Props) {
  const mountRef = useRef<HTMLDivElement>(null);

  const stateRef = useRef({
    playing,
    speedMultiplier,
    program: [] as Instr[],
    hasErrors: false,
    errorMsg: "",
    onStatus,
    onJointsDetected,
  });

  stateRef.current.playing = playing;
  stateRef.current.speedMultiplier = speedMultiplier;
  stateRef.current.onStatus = onStatus;
  stateRef.current.onJointsDetected = onJointsDetected;

  const resetTriggerRef = useRef<(() => void) | null>(null);

  // Parse script whenever edited and restart demo interpreter
  useEffect(() => {
    const parsed = parseScript(scriptText);
    stateRef.current.program = parsed.program;
    stateRef.current.hasErrors = parsed.errors.length > 0;
    stateRef.current.errorMsg = parsed.errors[0]
      ? `Line ${parsed.errors[0].line}: ${parsed.errors[0].message}`
      : "";
    resetTriggerRef.current?.();
  }, [scriptText, resetToken]);

  useEffect(() => {
    const host = mountRef.current;
    if (!host) return;

    let disposed = false;
    const isSoftwareGl = detectSoftwareWebGL();
    const renderer = new THREE.WebGLRenderer({
      antialias: !isSoftwareGl,
      powerPreference: "high-performance",
    });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.12;
    renderer.setPixelRatio(isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = !isSoftwareGl;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.setSize(host.clientWidth || 420, host.clientHeight || 320);
    host.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0b0a17);
    scene.fog = new THREE.FogExp2(0x0b0a17, 0.032);

    const pmrem = new THREE.PMREMGenerator(renderer);
    const roomEnv = new RoomEnvironment();
    const envTarget = pmrem.fromScene(roomEnv, 0.04);
    scene.environment = envTarget.texture;
    roomEnv.dispose();
    pmrem.dispose();

    const camera = new THREE.PerspectiveCamera(
      44,
      (host.clientWidth || 420) / Math.max(1, host.clientHeight || 320),
      0.1,
      80,
    );
    camera.position.set(4.3, 3.3, 4.6);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = !isSoftwareGl;
    controls.dampingFactor = 0.08;
    controls.target.set(0, 0.55, 0);
    controls.minDistance = 1.6;
    controls.maxDistance = 16;
    controls.maxPolarAngle = Math.PI * 0.48;
    controls.update();

    // Studio lighting rig
    const hemi = new THREE.HemisphereLight(0xa5b4fc, 0x1e1b2e, 0.65);
    scene.add(hemi);

    const keyLight = new THREE.DirectionalLight(0xfff1dc, 2.2);
    keyLight.position.set(5, 8, 5);
    if (!isSoftwareGl) {
      keyLight.castShadow = true;
      keyLight.shadow.mapSize.set(1024, 1024);
      keyLight.shadow.camera.left = -5;
      keyLight.shadow.camera.right = 5;
      keyLight.shadow.camera.top = 5;
      keyLight.shadow.camera.bottom = -5;
      keyLight.shadow.bias = -0.0005;
    }
    scene.add(keyLight);

    const rimLight = new THREE.DirectionalLight(0x22d3ee, 0.85);
    rimLight.position.set(-5, 4, -5);
    scene.add(rimLight);

    // Demo arena floor & grid
    const floorGeo = new THREE.PlaneGeometry(16, 16);
    const floorMat = new THREE.MeshStandardMaterial({ color: 0x121022, roughness: 0.85, metalness: 0.1 });
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    scene.add(floor);

    const grid = new THREE.GridHelper(10, 20, 0x8b6ff5, 0x26223e);
    grid.position.y = 0.003;
    (grid.material as THREE.LineBasicMaterial).transparent = true;
    (grid.material as THREE.LineBasicMaterial).opacity = 0.5;
    scene.add(grid);

    // Demo targets: R0-3 (Rack station) & CV-1 (Conveyor station) + interactive Tote
    const landmarks = new Map<string, THREE.Vector3>();
    const rackPos = new THREE.Vector3(-2.2, 0, -1.6);
    const convPos = new THREE.Vector3(2.4, 0, 1.4);
    landmarks.set("r0-3", rackPos);
    landmarks.set("cv-1", convPos);

    const propsGroup = new THREE.Group();
    scene.add(propsGroup);

    // Rack R0-3 marker prop
    const rackMat = new THREE.MeshStandardMaterial({ color: 0x3f3a5c, roughness: 0.5, metalness: 0.4 });
    const rackPost = new THREE.Mesh(new THREE.BoxGeometry(0.9, 1.2, 0.45), rackMat);
    rackPost.position.set(rackPos.x, 0.6, rackPos.z);
    rackPost.castShadow = !isSoftwareGl;
    propsGroup.add(rackPost);

    // Conveyor CV-1 marker prop
    const convMat = new THREE.MeshStandardMaterial({ color: 0x27243d, roughness: 0.45, metalness: 0.5 });
    const convBase = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.75, 0.62), convMat);
    convBase.position.set(convPos.x, 0.375, convPos.z);
    convBase.castShadow = !isSoftwareGl;
    propsGroup.add(convBase);

    // Interactive tote prop
    const toteMat = new THREE.MeshStandardMaterial({ color: 0x22d3ee, roughness: 0.35, metalness: 0.2 });
    const toteMesh = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.24, 0.34), toteMat);
    const toteHome = new THREE.Vector3(rackPos.x, 0.28, rackPos.z + 0.55);
    toteMesh.position.copy(toteHome);
    toteMesh.castShadow = !isSoftwareGl;
    propsGroup.add(toteMesh);

    // Waypoint target ring indicator
    const ringGeo = new THREE.RingGeometry(0.22, 0.28, 28);
    const ringMat = new THREE.MeshBasicMaterial({ color: 0x22d3ee, side: THREE.DoubleSide, transparent: true, opacity: 0.8 });
    const goalRing = new THREE.Mesh(ringGeo, ringMat);
    goalRing.rotation.x = -Math.PI / 2;
    goalRing.position.y = 0.01;
    goalRing.visible = false;
    scene.add(goalRing);

    // Actor holder
    const actorRoot = new THREE.Group();
    scene.add(actorRoot);
    let actorModel: THREE.Object3D | null = null;
    let rig: JointRig[] = [];

    // Simulation state
    const sim = {
      pos: new THREE.Vector3(0, 0, 0),
      yaw: 0,
      targetY: 0,
      speed: 1.2,
      turnRate: 2.8,
      goal: null as { x: number; z: number } | null,
      faceYaw: null as number | null,
      pc: 0,
      loops: [] as { start: number; remaining: number }[],
      active: false,
      timer: 0,
      done: false,
      carrying: false,
      beltSpeed: 0,
      beltActive: false,
      liftVal: 0,
      liftTarget: 0,
      jointTargets: new Map<string, number>(),
      gaitPhase: 0,
      lastOp: "idle",
      lastNote: "Ready",
    };

    const resetSim = () => {
      sim.pos.set(0, 0, 0);
      sim.yaw = 0;
      sim.targetY = 0;
      sim.speed = 1.2;
      sim.goal = null;
      sim.faceYaw = null;
      sim.pc = 0;
      sim.loops = [];
      sim.active = false;
      sim.timer = 0;
      sim.done = false;
      sim.carrying = false;
      sim.beltSpeed = 0;
      sim.beltActive = false;
      sim.liftVal = 0;
      sim.liftTarget = 0;
      sim.jointTargets.clear();
      sim.gaitPhase = 0;
      sim.lastOp = "idle";
      sim.lastNote = stateRef.current.hasErrors ? stateRef.current.errorMsg : "Ready";
      goalRing.visible = false;
      toteMesh.position.copy(profile === "conveyor" ? new THREE.Vector3(-0.7, 0.88, 0) : toteHome);
      actorRoot.position.copy(sim.pos);
      actorRoot.rotation.set(0, sim.yaw, 0);
      for (const r of rig) applyJoint(r, 0);
      stateRef.current.onStatus?.({
        state: stateRef.current.hasErrors ? "error" : stateRef.current.playing ? "playing" : "paused",
        op: sim.lastOp,
        note: sim.lastNote,
      });
    };

    resetTriggerRef.current = resetSim;

    const mountActor = (model: THREE.Object3D, normalizeScale: boolean) => {
      if (actorModel) {
        actorRoot.remove(actorModel);
        disposeObjectTree(actorModel);
      }
      if (normalizeScale) {
        _box.setFromObject(model);
        if (!_box.isEmpty()) {
          _box.getSize(_size);
          _box.getCenter(_center);
          const maxDim = Math.max(_size.x, _size.y, _size.z, 0.1);
          if (maxDim > 3.2) {
            const s = 2.0 / maxDim;
            model.scale.multiplyScalar(s);
            model.updateMatrixWorld(true);
            _box.setFromObject(model);
            _box.getCenter(_center);
          }
          model.position.x -= _center.x;
          model.position.z -= _center.z;
          model.position.y -= _box.min.y;
        }
      }
      model.traverse((obj) => {
        const m = obj as THREE.Mesh;
        if (m.isMesh) {
          m.castShadow = !isSoftwareGl;
          m.receiveShadow = true;
        }
      });
      actorRoot.add(model);
      actorModel = model;
      rig = buildRig(model);
      stateRef.current.onJointsDetected?.(rig.map((r) => r.def));
      resetSim();
    };

    if (assetUrl) {
      const loader = new GLTFLoader();
      loader.load(
        assetUrl,
        (gltf) => {
          if (disposed) {
            disposeObjectTree(gltf.scene);
            return;
          }
          const cloned = cloneSkinned(gltf.scene);
          mountActor(cloned, true);
        },
        undefined,
        () => {
          if (!disposed) mountActor(buildProceduralDemoRobot(profile), false);
        },
      );
    } else {
      mountActor(buildProceduralDemoRobot(profile), false);
    }

    const resolveTarget = (label: string): THREE.Vector3 | null => {
      const k = label.toLowerCase();
      if (landmarks.has(k)) return landmarks.get(k)!;
      if (k === "tote") return toteMesh.position;
      return null;
    };

    const stepInterpreter = (dt: number) => {
      const program = stateRef.current.program;
      if (!program.length || sim.done) return;

      for (let guard = 0; guard < 24; guard++) {
        const ins = program[sim.pc];
        if (!ins) {
          sim.done = true;
          sim.lastOp = "done";
          sim.lastNote = "Program finished";
          return;
        }
        switch (ins.op) {
          case "speed":
            sim.speed = ins.value;
            sim.lastOp = "speed";
            sim.lastNote = `speed ${ins.value} m/s`;
            sim.pc++;
            break;
          case "alt":
            sim.targetY = Math.min(4.2, ins.value);
            sim.lastOp = "alt";
            sim.lastNote = `altitude → ${ins.value.toFixed(1)} m`;
            sim.pc++;
            break;
          case "joint": {
            const r = rig.find((x) => x.def.name === ins.name);
            sim.lastOp = "joint";
            sim.lastNote = `${ins.name} → ${ins.value.toFixed(2)}`;
            if (!r) {
              sim.pc++;
              break;
            }
            const clamped =
              r.def.type === "continuous"
                ? ins.value
                : Math.min(r.def.upper, Math.max(r.def.lower, ins.value));
            if (!sim.active) {
              sim.jointTargets.set(ins.name, clamped);
              sim.active = true;
            }
            if (Math.abs(r.value - clamped) < 0.025) {
              sim.active = false;
              sim.pc++;
              break;
            }
            return;
          }
          case "loop":
            sim.loops.push({ start: sim.pc, remaining: ins.count });
            sim.pc++;
            break;
          case "end": {
            const top = sim.loops[sim.loops.length - 1];
            if (!top) {
              sim.pc++;
              break;
            }
            top.remaining--;
            if (top.remaining > 0) sim.pc = top.start + 1;
            else {
              sim.loops.pop();
              sim.pc++;
            }
            break;
          }
          case "halt":
            sim.done = true;
            sim.lastOp = "halt";
            sim.lastNote = "Halted";
            return;
          case "belt":
            sim.beltSpeed = ins.speed;
            sim.beltActive = true;
            sim.lastOp = "belt";
            sim.lastNote = `belt active (${ins.speed} m/s)`;
            sim.pc++;
            break;
          case "wait":
            sim.lastOp = "wait";
            sim.lastNote = `wait ${ins.seconds}s`;
            if (!sim.active) {
              sim.timer = ins.seconds;
              sim.active = true;
            }
            sim.timer -= dt;
            if (sim.timer <= 0) {
              sim.active = false;
              sim.pc++;
              break;
            }
            return;
          case "goto": {
            if (!sim.active) {
              let x = ins.x;
              let z = ins.z;
              if (ins.label) {
                const t = resolveTarget(ins.label);
                x = (t ? t.x : 0) + ins.dx;
                z = (t ? t.z : 0) + ins.dz;
              }
              // Clamp demo arena coordinates nicely into -4.2..4.2
              x = THREE.MathUtils.clamp(x, -4.2, 4.2);
              z = THREE.MathUtils.clamp(z, -4.2, 4.2);
              sim.goal = { x, z };
              goalRing.position.set(x, 0.015, z);
              goalRing.visible = true;
              sim.active = true;
              sim.lastOp = "goto";
              sim.lastNote = ins.label ? `goto ${ins.label}` : `goto (${x.toFixed(1)}, ${z.toFixed(1)})`;
            }
            if (sim.goal === null) {
              goalRing.visible = false;
              sim.active = false;
              sim.pc++;
              break;
            }
            return;
          }
          case "face": {
            if (!sim.active) {
              const t = resolveTarget(ins.label);
              const tx = t ? t.x : 0;
              const tz = t ? t.z : -1;
              sim.faceYaw = Math.atan2(-(tz - sim.pos.z), tx - sim.pos.x);
              sim.active = true;
              sim.lastOp = "face";
              sim.lastNote = `face ${ins.label}`;
            }
            if (sim.faceYaw === null) {
              sim.active = false;
              sim.pc++;
              break;
            }
            return;
          }
          case "turn":
            if (!sim.active) {
              sim.faceYaw = wrapAngle(sim.yaw + (ins.deg * Math.PI) / 180);
              sim.active = true;
              sim.lastOp = "turn";
              sim.lastNote = `turn ${ins.deg}°`;
            }
            if (sim.faceYaw === null) {
              sim.active = false;
              sim.pc++;
              break;
            }
            return;
          case "lift": {
            const liftRig = rig.find((r) => r.def.name === "lift_slide" || r.def.type === "prismatic");
            sim.lastOp = "lift";
            sim.lastNote = `lift ${ins.value.toFixed(2)} m`;
            if (!liftRig) {
              sim.pc++;
              break;
            }
            if (!sim.active) {
              sim.liftTarget = THREE.MathUtils.clamp(ins.value, liftRig.def.lower, liftRig.def.upper);
              sim.active = true;
            }
            if (Math.abs(sim.liftVal - sim.liftTarget) < 0.004) {
              sim.active = false;
              sim.pc++;
              break;
            }
            return;
          }
          case "pick":
            sim.carrying = true;
            sim.lastOp = "pick";
            sim.lastNote = `picked ${ins.query}`;
            sim.pc++;
            break;
          case "place": {
            sim.carrying = false;
            const t = resolveTarget(ins.label);
            if (t) {
              toteMesh.position.set(t.x + ins.dx, t.y + ins.dy + 0.12, t.z + ins.dz);
            }
            sim.lastOp = "place";
            sim.lastNote = `placed on ${ins.label}`;
            sim.pc++;
            break;
          }
        }
      }
    };

    const tickSimulation = (dt: number) => {
      const sDt = dt * Math.max(0.25, stateRef.current.speedMultiplier);
      stepInterpreter(sDt);

      // Altitude climb
      if (Math.abs(sim.pos.y - sim.targetY) > 0.005) {
        const stepY = 1.6 * sDt;
        const diff = sim.targetY - sim.pos.y;
        sim.pos.y += Math.abs(diff) <= stepY ? diff : Math.sign(diff) * stepY;
      }

      let dist = 0;
      let dyaw = 0;
      if (sim.faceYaw !== null) {
        const err = wrapAngle(sim.faceYaw - sim.yaw);
        const step = sim.turnRate * sDt;
        if (Math.abs(err) <= step) {
          sim.yaw = sim.faceYaw;
          dyaw = err;
          sim.faceYaw = null;
        } else {
          dyaw = Math.sign(err) * step;
          sim.yaw += dyaw;
        }
      } else if (sim.goal) {
        const dx = sim.goal.x - sim.pos.x;
        const dz = sim.goal.z - sim.pos.z;
        const d = Math.hypot(dx, dz);
        if (d < 0.05) {
          sim.goal = null;
        } else {
          const err = wrapAngle(Math.atan2(-dz, dx) - sim.yaw);
          dyaw = THREE.MathUtils.clamp(err, -sim.turnRate * sDt, sim.turnRate * sDt);
          sim.yaw += dyaw;
          if (Math.abs(wrapAngle(Math.atan2(-dz, dx) - sim.yaw)) < 0.45) {
            dist = Math.min(sim.speed * sDt, d);
            sim.pos.x += Math.cos(sim.yaw) * dist;
            sim.pos.z -= Math.sin(sim.yaw) * dist;
          }
        }
      }

      actorRoot.position.copy(sim.pos);
      actorRoot.rotation.set(0, sim.yaw, 0);

      // Joint kinematics
      if (rig.length > 0) {
        if (dist || dyaw) {
          const wr = profile === "truck" ? 0.35 : 0.06;
          for (const r of rig) {
            if (!r.def.name.startsWith("wheel")) continue;
            const v = dist + dyaw * 0.25 * r.side;
            applyJoint(r, r.value + (v / wr) * r.spinSign);
          }
        }
        if (profile === "drone" && (sim.pos.y > 0.1 || stateRef.current.playing)) {
          for (const r of rig) {
            if (r.def.name.startsWith("rotor_")) applyJoint(r, r.value + 24 * sDt);
          }
        }
        if (profile === "humanoid") {
          sim.gaitPhase += dist > 0 ? dist * 4.5 : 0;
          const swing = dist > 0 ? Math.sin(sim.gaitPhase) * 0.42 : 0;
          for (const r of rig) {
            if (r.def.name === "knee_l_pitch") applyJoint(r, swing);
            else if (r.def.name === "knee_r_pitch") applyJoint(r, -swing);
            else if (r.def.name === "elbow_l_pitch" && !sim.jointTargets.has(r.def.name)) applyJoint(r, -swing * 0.7 - 0.2);
            else if (r.def.name === "elbow_r_pitch" && !sim.jointTargets.has(r.def.name)) applyJoint(r, swing * 0.7 - 0.2);
          }
        }

        // Lift joint
        const liftRig = rig.find((r) => r.def.name === "lift_slide" || (profile === "robot" && r.def.type === "prismatic"));
        if (liftRig && Math.abs(sim.liftTarget - sim.liftVal) > 1e-4) {
          const lStep = 0.22 * sDt;
          const diff = sim.liftTarget - sim.liftVal;
          sim.liftVal += Math.abs(diff) <= lStep ? diff : Math.sign(diff) * lStep;
          applyJoint(liftRig, sim.liftVal);
        }

        // Named joint motors
        for (const [jName, target] of sim.jointTargets.entries()) {
          const r = rig.find((x) => x.def.name === jName);
          if (!r) continue;
          const rate = r.def.type === "prismatic" ? 0.9 * sDt : 1.9 * sDt;
          const diff = target - r.value;
          const next = Math.abs(diff) <= rate ? target : r.value + Math.sign(diff) * rate;
          applyJoint(r, next);
        }
      }

      if (sim.carrying) {
        toteMesh.position.set(sim.pos.x, sim.pos.y + 0.32 + sim.liftVal, sim.pos.z);
        toteMesh.rotation.y = sim.yaw;
      } else if (sim.beltActive && profile === "conveyor") {
        toteMesh.position.x += sim.beltSpeed * sDt;
        if (toteMesh.position.x > 0.78) toteMesh.position.x = -0.78;
      }
    };

    let frameId = 0;
    let lastTime = performance.now();
    let statusTimer = 0;

    function afterDraw(cb: () => void) {
      const gl = renderer.getContext() as WebGL2RenderingContext;
      const sync = typeof gl.fenceSync === "function" ? gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0) : null;
      gl.flush();
      const poll = () => {
        if (disposed) {
          if (sync) gl.deleteSync(sync);
          return;
        }
        const state = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
        if (state === gl.UNSIGNALED) {
          frameId = window.setTimeout(poll, 5);
        } else {
          if (sync) gl.deleteSync(sync);
          frameId = window.setTimeout(cb, 80);
        }
      };
      frameId = window.setTimeout(poll, 5);
    }

    function tick() {
      if (disposed) return;
      const now = performance.now();
      const dt = Math.min(0.05, Math.max(0.001, (now - lastTime) / 1000));
      lastTime = now;

      if (stateRef.current.playing && !stateRef.current.hasErrors) {
        tickSimulation(dt);
      }

      statusTimer += dt;
      if (statusTimer >= 0.18) {
        statusTimer = 0;
        const st: DemoPlaybackState["state"] = stateRef.current.hasErrors
          ? "error"
          : sim.done
            ? "done"
            : stateRef.current.playing
              ? "playing"
              : "paused";
        stateRef.current.onStatus?.({
          state: st,
          op: sim.lastOp,
          note: stateRef.current.hasErrors ? stateRef.current.errorMsg : sim.lastNote,
        });
      }

      controls.update();
      renderer.render(scene, camera);

      if (isSoftwareGl) afterDraw(tick);
      else frameId = requestAnimationFrame(tick);
    }

    const ro = new ResizeObserver(() => {
      if (disposed) return;
      const w = host.clientWidth;
      const h = host.clientHeight;
      if (w > 0 && h > 0) {
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
        renderer.setSize(w, h);
      }
    });
    ro.observe(host);

    tick();

    return () => {
      disposed = true;
      cancelAnimationFrame(frameId);
      clearTimeout(frameId);
      ro.disconnect();
      controls.dispose();
      if (actorModel) disposeObjectTree(actorModel);
      disposeObjectTree(propsGroup);
      floorGeo.dispose();
      floorMat.dispose();
      ringGeo.dispose();
      ringMat.dispose();
      envTarget.dispose();
      const gl = renderer.getContext();
      renderer.dispose();
      gl?.getExtension("WEBGL_lose_context")?.loseContext();
      if (renderer.domElement.parentNode === host) {
        host.removeChild(renderer.domElement);
      }
    };
  }, [profile, assetUrl]);

  return <div ref={mountRef} className="work-script-demo-canvas" />;
}
