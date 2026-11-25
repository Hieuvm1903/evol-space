import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { RectAreaLightUniformsLib } from "three/examples/jsm/lights/RectAreaLightUniformsLib.js";
import {
  ArrowLeft,
  Camera,
  ChevronDown,
  ChevronUp,
  Compass,
  Hammer,
  KeyRound,
  LogIn,
  Map as MapIcon,
  Music2,
  Orbit,
  RotateCcw,
  Sparkles,
  Terminal,
  UserRound,
  type LucideIcon,
} from "lucide-react";
import { useAuth } from "../../contexts/AuthContext";
import HelpTip from "../../components/HelpTip";
import { createMonument, type MonumentHandle } from "./worldModels";
import {
  createAsciiScreenTexture,
  createGlobeTexture,
  createPlazaFloorTextures,
  createRadialContactShadowTexture,
  createVinylTexture,
} from "./worldTextures";
import { buildWorldNodes, type WorldNodeId, type WorldRouteNode } from "./worldTypes";
import "./World3DPage.css";

type CameraPreset = "overview" | "close" | "aerial";

const CAMERA_PRESETS: Record<
  CameraPreset,
  { pos: [number, number, number]; target: [number, number, number] }
> = {
  overview: { pos: [0, 12.5, 22.5], target: [0, 1.4, 0] },
  close: { pos: [5.4, 4.6, 8.8], target: [0, 1.6, 0] },
  aerial: { pos: [0.1, 25.5, 11.5], target: [0, 0.8, 0] },
};

const NODE_ICONS: Record<WorldNodeId, LucideIcon> = {
  home: Sparkles,
  music: Music2,
  map: MapIcon,
  photobooth: Camera,
  work: Hammer,
  ascii: Terminal,
  blank: KeyRound,
  profile: UserRound,
};

function detectSoftwareWebGL(): boolean {
  try {
    const canvas = document.createElement("canvas");
    const gl = canvas.getContext("webgl2");
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

// Zero-GC pre-allocated temporaries
const _projVec = new THREE.Vector3();
const _moveForward = new THREE.Vector3();
const _moveRight = new THREE.Vector3();
const _upAxis = new THREE.Vector3(0, 1, 0);
const _tmpMat4 = new THREE.Matrix4();
const _tmpQuat = new THREE.Quaternion();
const _tmpEuler = new THREE.Euler();
const _tmpPos = new THREE.Vector3();
const _tmpScale = new THREE.Vector3();
const _tmpColor = new THREE.Color();

export function World3DPage() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const mountRef = useRef<HTMLDivElement | null>(null);
  const labelRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  const [dockOpen, setDockOpen] = useState(true);
  const [preset, setPreset] = useState<CameraPreset>("overview");
  const [autoOrbit, setAutoOrbit] = useState(false);
  const [hoveredId, setHoveredId] = useState<WorldNodeId | null>(null);
  const [contextError, setContextError] = useState<string | null>(null);

  const nodes = useMemo(
    () => buildWorldNodes(Boolean(user), user?.username),
    [user],
  );

  // Refs for WebGL loop synchronization without tearing down the renderer
  const hoveredIdRef = useRef<WorldNodeId | null>(null);
  const autoOrbitRef = useRef<boolean>(autoOrbit);
  const navigateRef = useRef(navigate);
  const nodesRef = useRef<WorldRouteNode[]>(nodes);
  const warpRef = useRef<{
    active: boolean;
    path: string;
    timer: number;
    targetPos: THREE.Vector3;
    targetLook: THREE.Vector3;
  }>({
    active: false,
    path: "/",
    timer: 0,
    targetPos: new THREE.Vector3(),
    targetLook: new THREE.Vector3(),
  });
  const camPresetRef = useRef<{
    active: boolean;
    pos: THREE.Vector3;
    target: THREE.Vector3;
  }>({
    active: false,
    pos: new THREE.Vector3(...CAMERA_PRESETS.overview.pos),
    target: new THREE.Vector3(...CAMERA_PRESETS.overview.target),
  });

  useEffect(() => {
    autoOrbitRef.current = autoOrbit;
  }, [autoOrbit]);

  useEffect(() => {
    navigateRef.current = navigate;
  }, [navigate]);

  useEffect(() => {
    nodesRef.current = nodes;
  }, [nodes]);

  const triggerTravel = useCallback((node: WorldRouteNode) => {
    if (warpRef.current.active) return;
    const [nx, , nz] = node.position;
    const len = Math.hypot(nx, nz);
    const dirX = len > 0.1 ? nx / len : 0;
    const dirZ = len > 0.1 ? nz / len : 1;

    warpRef.current.active = true;
    warpRef.current.path = node.path;
    warpRef.current.timer = 0;
    warpRef.current.targetLook.set(nx, 1.5, nz);
    warpRef.current.targetPos.set(nx + dirX * 3.6, 3.0, nz + dirZ * 3.6);
  }, []);

  const applyPreset = useCallback((next: CameraPreset) => {
    setPreset(next);
    const cfg = CAMERA_PRESETS[next];
    camPresetRef.current.pos.set(cfg.pos[0], cfg.pos[1], cfg.pos[2]);
    camPresetRef.current.target.set(cfg.target[0], cfg.target[1], cfg.target[2]);
    camPresetRef.current.active = true;
  }, []);

  const focusNodeInView = useCallback((node: WorldRouteNode | null) => {
    hoveredIdRef.current = node ? node.id : null;
    setHoveredId(node ? node.id : null);
  }, []);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.closest("input, textarea, select")) return;
      if (e.key.toLowerCase() === "h") {
        setDockOpen((v) => !v);
      } else if (e.key === "Enter" && hoveredIdRef.current) {
        const target = nodesRef.current.find((n) => n.id === hoveredIdRef.current);
        if (target) triggerTravel(target);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [triggerTravel]);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const isSoftwareGl = detectSoftwareWebGL();
    const dpr = isSoftwareGl ? 1 : Math.min(window.devicePixelRatio || 1, 2);

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: !isSoftwareGl,
        powerPreference: "high-performance",
      });
    } catch (err) {
      setContextError(err instanceof Error ? err.message : "WebGL2 context unavailable");
      return;
    }

    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.12;
    renderer.setPixelRatio(dpr);
    renderer.shadowMap.enabled = !isSoftwareGl;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.domElement.style.display = "block";
    mount.appendChild(renderer.domElement);

    const onContextLost = (e: Event) => {
      e.preventDefault();
      setContextError("WebGL context lost — reload viewport to restore 3D scene.");
    };
    const onContextRestored = () => {
      setContextError(null);
    };
    renderer.domElement.addEventListener("webglcontextlost", onContextLost);
    renderer.domElement.addEventListener("webglcontextrestored", onContextRestored);

    const initW = Math.max(1, mount.clientWidth);
    const initH = Math.max(1, mount.clientHeight);
    renderer.setSize(initW, initH, false);

    const maxAnisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());

    const scene = new THREE.Scene();
    scene.background = new THREE.Color("#05040d");
    scene.fog = new THREE.FogExp2("#05040d", 0.0155);

    const camera = new THREE.PerspectiveCamera(48, initW / initH, 0.1, 180);
    camera.position.set(...CAMERA_PRESETS.overview.pos);

    // Mandatory procedural studio environment map on every device
    let envRT: THREE.WebGLRenderTarget | null = null;
    try {
      const pmrem = new THREE.PMREMGenerator(renderer);
      envRT = pmrem.fromScene(new RoomEnvironment(), 0.04);
      scene.environment = envRT.texture;
      pmrem.dispose();
    } catch {
      /* fallback to hemisphere + key lighting */
    }

    // Warm/Cool 3-Point Studio & Horizon Lighting Rig (<= 3 shadow casters)
    const hemi = new THREE.HemisphereLight("#7dd3fc", "#1e1b4b", 0.95);
    scene.add(hemi);

    const keyLight = new THREE.DirectionalLight("#fff3dc", 2.15);
    keyLight.position.set(14, 22, 16);
    keyLight.castShadow = !isSoftwareGl;
    keyLight.shadow.mapSize.set(1024, 1024);
    keyLight.shadow.camera.left = -20;
    keyLight.shadow.camera.right = 20;
    keyLight.shadow.camera.top = 20;
    keyLight.shadow.camera.bottom = -20;
    keyLight.shadow.camera.near = 1;
    keyLight.shadow.camera.far = 55;
    keyLight.shadow.bias = -0.0005;
    keyLight.shadow.normalBias = 0.02;
    scene.add(keyLight);

    const rimLight = new THREE.DirectionalLight("#22d3ee", 1.35);
    rimLight.position.set(-14, 9, -16);
    scene.add(rimLight);

    if (!isSoftwareGl) {
      RectAreaLightUniformsLib.init();
      const softbox = new THREE.RectAreaLight("#a5f3fc", 3.6, 5.5, 3.0);
      softbox.position.set(0, 7.5, 4.0);
      softbox.lookAt(0, 1.5, 0);
      scene.add(softbox);
    }

    // Procedural zero-404 textures
    const floorTex = createPlazaFloorTextures(maxAnisotropy);
    const vinylTex = createVinylTexture(maxAnisotropy);
    const globeTex = createGlobeTexture(maxAnisotropy);
    const screenTex = createAsciiScreenTexture(maxAnisotropy);
    const contactTex = createRadialContactShadowTexture();

    // Extended cosmic terrain floor (no boxed walls; fades smoothly into horizon fog)
    const plazaFloor = new THREE.Mesh(
      new THREE.CircleGeometry(64, 72),
      new THREE.MeshStandardMaterial({
        map: floorTex.map,
        bumpMap: floorTex.bumpMap,
        bumpScale: 0.05,
        roughness: 0.68,
        metalness: 0.28,
      }),
    );
    plazaFloor.rotation.x = -Math.PI / 2;
    plazaFloor.receiveShadow = true;
    scene.add(plazaFloor);

    // Subtle concentric ring inlay on the plaza deck (>= 0.02 Y offset + polygonOffset)
    const outerWayRing = new THREE.Mesh(
      new THREE.RingGeometry(11.05, 11.35, 96),
      new THREE.MeshStandardMaterial({
        color: "#6366f1",
        emissive: "#4f46e5",
        emissiveIntensity: 0.45,
        roughness: 0.4,
        metalness: 0.5,
        polygonOffset: true,
        polygonOffsetFactor: -1,
        polygonOffsetUnits: -1,
      }),
    );
    outerWayRing.rotation.x = -Math.PI / 2;
    outerWayRing.position.y = 0.02;
    scene.add(outerWayRing);

    // Instanced cosmic perimeter monolith spires (natural boundary instead of rectangular walls)
    const spireCount = 48;
    const spireGeom = new THREE.ConeGeometry(0.85, 4.4, 5);
    spireGeom.translate(0, 2.2, 0);
    const spireMat = new THREE.MeshStandardMaterial({
      color: "#cbd5e1",
      roughness: 0.86,
      metalness: 0.16,
      flatShading: true,
    });
    const spires = new THREE.InstancedMesh(spireGeom, spireMat, spireCount);
    spires.castShadow = !isSoftwareGl;
    spires.receiveShadow = true;
    for (let i = 0; i < spireCount; i++) {
      const ang = (i / spireCount) * Math.PI * 2 + (i % 3) * 0.04;
      const dist = 21 + (i % 5) * 3.4;
      const jitter = 0.85 + ((i * 37) % 30) / 100; // ±15% natural scale variation
      _tmpPos.set(Math.cos(ang) * dist, 0, Math.sin(ang) * dist);
      _tmpEuler.set(0, ang * 1.7, 0);
      _tmpQuat.setFromEuler(_tmpEuler);
      _tmpScale.set(jitter, jitter * (0.7 + (i % 4) * 0.35), jitter);
      _tmpMat4.compose(_tmpPos, _tmpQuat, _tmpScale);
      spires.setMatrixAt(i, _tmpMat4);
      _tmpColor.setHSL(0.68 + (i % 6) * 0.025, 0.35, 0.16 + (i % 4) * 0.035);
      spires.setColorAt(i, _tmpColor);
    }
    spires.instanceMatrix.needsUpdate = true;
    if (spires.instanceColor) spires.instanceColor.needsUpdate = true;
    spires.computeBoundingSphere();
    scene.add(spires);

    // Instanced distant cosmic starfield
    const starCount = 220;
    const starGeom = new THREE.OctahedronGeometry(0.16, 0);
    const starMat = new THREE.MeshBasicMaterial({ color: "#ffffff" });
    const stars = new THREE.InstancedMesh(starGeom, starMat, starCount);
    for (let i = 0; i < starCount; i++) {
      const theta = ((i * 137.508) % 360) * (Math.PI / 180);
      const r = 28 + (i % 17) * 2.2;
      const y = 4 + ((i * 29) % 28);
      const s = 0.65 + (i % 5) * 0.32;
      _tmpMat4.makeScale(s, s, s);
      _tmpMat4.setPosition(Math.cos(theta) * r, y, Math.sin(theta) * r);
      stars.setMatrixAt(i, _tmpMat4);
      _tmpColor.setHSL(0.54 + (i % 7) * 0.05, 0.85, 0.78);
      stars.setColorAt(i, _tmpColor);
    }
    stars.instanceMatrix.needsUpdate = true;
    if (stars.instanceColor) stars.instanceColor.needsUpdate = true;
    stars.computeBoundingSphere();
    scene.add(stars);

    // Build all 8 destination monuments & their illuminated radial paths
    const monuments: MonumentHandle[] = [];
    const hitProxies: THREE.Mesh[] = [];
    const hoverWeights = new Map<WorldNodeId, number>();

    for (const node of nodesRef.current) {
      const m = createMonument(
        node,
        { vinylTex, globeTex, screenTex, contactTex },
        isSoftwareGl,
      );
      scene.add(m.root);
      if (m.pathHandle) {
        scene.add(m.pathHandle.group);
      }
      monuments.push(m);
      hitProxies.push(m.hitProxy);
      hoverWeights.set(node.id, 0);
    }

    // OrbitControls
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = !isSoftwareGl;
    controls.dampingFactor = 0.07;
    controls.enablePan = true;
    controls.minDistance = 6.5;
    controls.maxDistance = 36;
    controls.maxPolarAngle = Math.PI / 2 - 0.06;
    controls.target.set(...CAMERA_PRESETS.overview.target);
    controls.autoRotate = false;
    controls.autoRotateSpeed = 0.55;
    controls.update();

    const onControlsStart = () => {
      camPresetRef.current.active = false;
    };
    controls.addEventListener("start", onControlsStart);

    if (!isSoftwareGl) {
      try {
        renderer.compile(scene, camera);
      } catch (err) {
        setContextError(err instanceof Error ? err.message : "Failed to compile 3D scene");
      }
    }

    // Raycasting (restricted to layer 1 simplified proxy hitboxes)
    const raycaster = new THREE.Raycaster();
    raycaster.layers.set(1);
    const pointerNDC = new THREE.Vector2();
    let lastRaycastMs = 0;
    let pointerDownPos: { x: number; y: number } | null = null;
    const pressedKeys = new Set<string>();

    const updateNDC = (clientX: number, clientY: number) => {
      const rect = renderer.domElement.getBoundingClientRect();
      pointerNDC.x = ((clientX - rect.left) / Math.max(1, rect.width)) * 2 - 1;
      pointerNDC.y = -(((clientY - rect.top) / Math.max(1, rect.height)) * 2 - 1);
    };

    const pickMonument = (): WorldNodeId | null => {
      raycaster.setFromCamera(pointerNDC, camera);
      const hits = raycaster.intersectObjects(hitProxies, false);
      if (hits.length > 0) {
        return (hits[0].object.userData.nodeId as WorldNodeId) ?? null;
      }
      return null;
    };

    const onPointerMove = (e: PointerEvent) => {
      const now = performance.now();
      if (now - lastRaycastMs < 28) return;
      lastRaycastMs = now;

      updateNDC(e.clientX, e.clientY);
      const picked = pickMonument();
      renderer.domElement.style.cursor = picked ? "pointer" : "grab";
      if (picked !== hoveredIdRef.current) {
        hoveredIdRef.current = picked;
        setHoveredId(picked);
      }
    };

    const onPointerDown = (e: PointerEvent) => {
      pointerDownPos = { x: e.clientX, y: e.clientY };
      if (!hoveredIdRef.current) {
        renderer.domElement.style.cursor = "grabbing";
      }
    };

    const onPointerUp = (e: PointerEvent) => {
      if (!pointerDownPos) return;
      const dist = Math.hypot(e.clientX - pointerDownPos.x, e.clientY - pointerDownPos.y);
      pointerDownPos = null;
      if (dist < 7) {
        updateNDC(e.clientX, e.clientY);
        const picked = pickMonument();
        if (picked) {
          const target = nodesRef.current.find((n) => n.id === picked);
          if (target) triggerTravel(target);
        }
      }
      renderer.domElement.style.cursor = hoveredIdRef.current ? "pointer" : "grab";
    };

    const onKeyDownLoop = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.closest("input, textarea, select")) return;
      pressedKeys.add(e.key.toLowerCase());
    };
    const onKeyUpLoop = (e: KeyboardEvent) => {
      pressedKeys.delete(e.key.toLowerCase());
    };

    renderer.domElement.addEventListener("pointermove", onPointerMove);
    renderer.domElement.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("keydown", onKeyDownLoop);
    window.addEventListener("keyup", onKeyUpLoop);

    let viewW = initW;
    let viewH = initH;
    const handleResize = () => {
      const w = Math.max(1, mount.clientWidth);
      const h = Math.max(1, mount.clientHeight);
      viewW = w;
      viewH = h;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h, false);
    };
    const ro = new ResizeObserver(handleResize);
    ro.observe(mount);
    handleResize();

    const clock = new THREE.Clock();
    let frameId = 0;
    let disposed = false;

    function afterDraw(cb: () => void) {
      const gl = renderer.getContext() as WebGL2RenderingContext;
      if (typeof gl.fenceSync !== "function") {
        frameId = window.setTimeout(cb, 80);
        return;
      }
      const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
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

    const tick = () => {
      if (disposed) return;

      const rawDt = clock.getDelta();
      const dt = Math.min(Math.max(rawDt, 0.001), 0.05);
      const timeSec = clock.elapsedTime;

      // Warp glide transition when a destination monument is clicked
      if (warpRef.current.active) {
        warpRef.current.timer += dt;
        camera.position.x = THREE.MathUtils.damp(
          camera.position.x,
          warpRef.current.targetPos.x,
          9.5,
          dt,
        );
        camera.position.y = THREE.MathUtils.damp(
          camera.position.y,
          warpRef.current.targetPos.y,
          9.5,
          dt,
        );
        camera.position.z = THREE.MathUtils.damp(
          camera.position.z,
          warpRef.current.targetPos.z,
          9.5,
          dt,
        );
        controls.target.x = THREE.MathUtils.damp(
          controls.target.x,
          warpRef.current.targetLook.x,
          9.5,
          dt,
        );
        controls.target.y = THREE.MathUtils.damp(
          controls.target.y,
          warpRef.current.targetLook.y,
          9.5,
          dt,
        );
        controls.target.z = THREE.MathUtils.damp(
          controls.target.z,
          warpRef.current.targetLook.z,
          9.5,
          dt,
        );

        if (warpRef.current.timer >= 0.28) {
          const dest = warpRef.current.path;
          warpRef.current.active = false;
          navigateRef.current(dest);
          return;
        }
      } else {
        // Optional WASD / Arrow roaming across the plaza ground plane
        let moveZ = 0;
        let moveX = 0;
        if (pressedKeys.has("w") || pressedKeys.has("arrowup")) moveZ += 1;
        if (pressedKeys.has("s") || pressedKeys.has("arrowdown")) moveZ -= 1;
        if (pressedKeys.has("a") || pressedKeys.has("arrowleft")) moveX -= 1;
        if (pressedKeys.has("d") || pressedKeys.has("arrowright")) moveX += 1;

        if (moveX !== 0 || moveZ !== 0) {
          camPresetRef.current.active = false;
          camera.getWorldDirection(_moveForward);
          _moveForward.y = 0;
          if (_moveForward.lengthSq() > 0.0001) _moveForward.normalize();
          _moveRight.crossVectors(_moveForward, _upAxis).normalize();

          const walkSpeed = 10.5 * dt;
          const dx = (_moveForward.x * moveZ + _moveRight.x * moveX) * walkSpeed;
          const dz = (_moveForward.z * moveZ + _moveRight.z * moveX) * walkSpeed;

          const nextTx = THREE.MathUtils.clamp(controls.target.x + dx, -15, 15);
          const nextTz = THREE.MathUtils.clamp(controls.target.z + dz, -15, 15);
          const actualDx = nextTx - controls.target.x;
          const actualDz = nextTz - controls.target.z;

          controls.target.x += actualDx;
          controls.target.z += actualDz;
          camera.position.x += actualDx;
          camera.position.z += actualDz;
        }

        // Smooth camera preset transition
        if (camPresetRef.current.active) {
          camera.position.x = THREE.MathUtils.damp(
            camera.position.x,
            camPresetRef.current.pos.x,
            6.5,
            dt,
          );
          camera.position.y = THREE.MathUtils.damp(
            camera.position.y,
            camPresetRef.current.pos.y,
            6.5,
            dt,
          );
          camera.position.z = THREE.MathUtils.damp(
            camera.position.z,
            camPresetRef.current.pos.z,
            6.5,
            dt,
          );
          controls.target.x = THREE.MathUtils.damp(
            controls.target.x,
            camPresetRef.current.target.x,
            6.5,
            dt,
          );
          controls.target.y = THREE.MathUtils.damp(
            controls.target.y,
            camPresetRef.current.target.y,
            6.5,
            dt,
          );
          controls.target.z = THREE.MathUtils.damp(
            controls.target.z,
            camPresetRef.current.target.z,
            6.5,
            dt,
          );

          if (
            camera.position.distanceTo(camPresetRef.current.pos) < 0.05 &&
            controls.target.distanceTo(camPresetRef.current.target) < 0.05
          ) {
            camPresetRef.current.active = false;
          }
        }
      }

      controls.autoRotate = !isSoftwareGl && autoOrbitRef.current && !hoveredIdRef.current;
      controls.update();

      // Update monuments & project floating DOM labels directly via transform (zero React re-render)
      const activeHover = hoveredIdRef.current;
      for (let i = 0; i < monuments.length; i++) {
        const m = monuments[i];
        const targetWeight = activeHover === m.node.id ? 1 : 0;
        const curWeight = hoverWeights.get(m.node.id) ?? 0;
        const nextWeight = THREE.MathUtils.damp(curWeight, targetWeight, 8.5, dt);
        hoverWeights.set(m.node.id, nextWeight);
        m.update(timeSec, dt, nextWeight);

        const el = labelRefs.current[m.node.id];
        if (el) {
          _projVec.copy(m.labelAnchorLocal).applyMatrix4(m.root.matrixWorld);
          _projVec.project(camera);
          if (_projVec.z > 1 || _projVec.z < -1) {
            el.style.opacity = "0";
            el.style.pointerEvents = "none";
          } else {
            const sx = ((_projVec.x + 1) * 0.5) * viewW;
            const sy = ((-_projVec.y + 1) * 0.5) * viewH;
            el.style.opacity = "1";
            el.style.pointerEvents = "auto";
            el.style.transform = `translate3d(${sx.toFixed(1)}px, ${sy.toFixed(1)}px, 0) translate(-50%, -100%)`;
          }
        }
      }

      renderer.render(scene, camera);

      if (isSoftwareGl) {
        afterDraw(tick);
      } else {
        frameId = requestAnimationFrame(tick);
      }
    };

    tick();

    return () => {
      disposed = true;
      cancelAnimationFrame(frameId);
      clearTimeout(frameId);
      ro.disconnect();
      controls.removeEventListener("start", onControlsStart);
      renderer.domElement.removeEventListener("pointermove", onPointerMove);
      renderer.domElement.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("keydown", onKeyDownLoop);
      window.removeEventListener("keyup", onKeyUpLoop);
      renderer.domElement.removeEventListener("webglcontextlost", onContextLost);
      renderer.domElement.removeEventListener("webglcontextrestored", onContextRestored);

      controls.dispose();
      floorTex.map.dispose();
      floorTex.bumpMap.dispose();
      vinylTex.dispose();
      globeTex.dispose();
      screenTex.dispose();
      contactTex.dispose();
      envRT?.dispose();

      scene.traverse((obj) => {
        const mesh = obj as THREE.Mesh;
        if (mesh.geometry) mesh.geometry.dispose();
        if (mesh.material) {
          const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
          for (const mat of mats) mat.dispose();
        }
      });

      renderer.dispose();
      if (renderer.domElement.parentNode === mount) {
        mount.removeChild(renderer.domElement);
      }
    };
  }, [triggerTravel]);

  const hoveredNode = useMemo(
    () => nodes.find((n) => n.id === hoveredId) ?? null,
    [nodes, hoveredId],
  );

  return (
    <div className="world3d-page">
      <div ref={mountRef} className="world3d-canvas-mount" />

      {/* Projected semantic DOM labels anchored above each 3D destination monument */}
      <div className="world3d-labels-layer">
        {nodes.map((node) => {
          const Icon =
            node.id === "profile" && !user ? LogIn : NODE_ICONS[node.id];
          const isHovered = hoveredId === node.id;
          return (
            <button
              key={node.id}
              ref={(el) => {
                labelRefs.current[node.id] = el;
              }}
              type="button"
              className={`world3d-node-label${isHovered ? " is-hovered" : ""}`}
              style={{ "--node-accent": node.accentHex } as React.CSSProperties}
              onMouseEnter={() => focusNodeInView(node)}
              onMouseLeave={() => focusNodeInView(null)}
              onClick={() => triggerTravel(node)}
              title={`${node.label} (${node.path}) — ${node.subtitle}`}
            >
              <span className="world3d-node-title-row">
                <Icon size={13} style={{ color: node.accentHex }} />
                <span>{node.label}</span>
              </span>
              <span className="world3d-node-route">{node.path}</span>
            </button>
          );
        })}
      </div>

      {contextError && (
        <div className="world3d-fallback-banner">
          <strong>3D Navigation Paused</strong>
          <span>{contextError}</span>
          <div style={{ display: "flex", gap: 10 }}>
            <button
              type="button"
              className="world3d-action-btn"
              onClick={() => window.location.reload()}
            >
              <RotateCcw size={14} />
              Reload Viewport
            </button>
            <button
              type="button"
              className="world3d-action-btn"
              onClick={() => navigate("/")}
            >
              <ArrowLeft size={14} />
              Open Home
            </button>
          </div>
        </div>
      )}

      {/* Top HUD (replaces traditional NavBar on /3d) */}
      <div className="world3d-top-hud">
        <div className="world3d-title-strip">
          <span className="world3d-brand-title">EVOL Space · 3D Hub</span>
          <HelpTip content="Click any 3D monument or path marker to open page · Drag to orbit · WASD to roam" />
        </div>

        <div className="world3d-top-actions">
          <button
            type="button"
            className="world3d-action-btn"
            onClick={() => navigate("/")}
            title="Return to standard 2D Home & NavBar"
          >
            <ArrowLeft size={14} />
            Exit 3D
          </button>
        </div>
      </div>

      {/* Collapsible Bottom Control & Quick-Route Dock */}
      <div className={`world3d-dock-wrap${dockOpen ? "" : " collapsed"}`}>
        <button
          type="button"
          className="world3d-dock-toggle"
          onClick={() => setDockOpen((v) => !v)}
          title="Toggle HUD (H)"
        >
          {dockOpen ? <ChevronDown size={13} /> : <ChevronUp size={13} />}
          {dockOpen ? "Hide Controls" : "Show Controls"}
        </button>

        <div className="world3d-dock">
          <div className="world3d-dock-row">
            <button
              type="button"
              className={`world3d-dock-btn${preset === "overview" ? " is-active" : ""}`}
              onClick={() => applyPreset("overview")}
            >
              <Compass size={13} />
              Overview
            </button>
            <button
              type="button"
              className={`world3d-dock-btn${preset === "close" ? " is-active" : ""}`}
              onClick={() => applyPreset("close")}
            >
              Center Dais
            </button>
            <button
              type="button"
              className={`world3d-dock-btn${preset === "aerial" ? " is-active" : ""}`}
              onClick={() => applyPreset("aerial")}
            >
              Aerial Map
            </button>

            <span className="world3d-hud-sep" />

            <button
              type="button"
              className={`world3d-dock-btn${autoOrbit ? " is-active" : ""}`}
              onClick={() => setAutoOrbit((v) => !v)}
            >
              <Orbit size={13} />
              Auto Orbit
            </button>

            <span className="world3d-target-readout">
              {hoveredNode ? (
                <>
                  Target: <strong>{hoveredNode.label}</strong> ({hoveredNode.path}) ·{" "}
                  {hoveredNode.subtitle}
                </>
              ) : (
                <HelpTip placement="top" content="Hover or click a monument to travel" />
              )}
            </span>
          </div>

          <div className="world3d-dock-row world3d-routes-row">
            {nodes.map((node) => {
              const Icon =
                node.id === "profile" && !user ? LogIn : NODE_ICONS[node.id];
              return (
                <button
                  key={node.id}
                  type="button"
                  className={`world3d-dock-btn${hoveredId === node.id ? " is-active" : ""}`}
                  style={{ "--btn-accent": node.accentHex } as React.CSSProperties}
                  onMouseEnter={() => focusNodeInView(node)}
                  onMouseLeave={() => focusNodeInView(null)}
                  onClick={() => triggerTravel(node)}
                >
                  <Icon size={13} style={{ color: node.accentHex }} />
                  {node.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
