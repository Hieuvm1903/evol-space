import React, { useCallback, useEffect, useRef, useState } from "react";
import { Segmented, Select, Slider, Tooltip } from "antd";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import * as THREE from "three";
import {
  ChevronDown,
  ChevronUp,
  Gamepad2,
  Pause,
  Play,
  RotateCcw,
  Sparkles,
  Volume2,
  VolumeX,
} from "lucide-react";
import { asciiAudio } from "./asciiAudio";
import {
  createAsteroidCluster,
  createEnergyOrb,
  createInterceptorShip,
  createShowcaseReactor,
  type InterceptorHandle,
  type ShowcaseHandle,
} from "./asciiModels";
import {
  ASCII_CHARSETS,
  AsciiRenderPipeline,
  type AsciiCharsetKey,
  type AsciiColorMode,
  type AsciiPipelineConfig,
  type AsciiViewMode,
} from "./asciiShader";
import "./AsciiPage.css";

type SceneMode = "game" | "sandbox";
type GamePhase = "ready" | "playing" | "paused" | "gameover";

interface HudSnapshot {
  score: number;
  best: number;
  combo: number;
  shields: number;
  speed: number;
  phase: GamePhase;
}

const BEST_SCORE_KEY = "evol_ascii3d_best_v1";

function readBestScore(): number {
  try {
    const raw = localStorage.getItem(BEST_SCORE_KEY);
    const n = raw ? Number(raw) : 0;
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
  } catch {
    return 0;
  }
}

function saveBestScore(score: number) {
  try {
    localStorage.setItem(BEST_SCORE_KEY, String(Math.floor(score)));
  } catch {
    /* ignore */
  }
}

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

// Reusable math temporaries (zero GC in frame loop)
const _tmpVecA = new THREE.Vector3();
const _tmpVecB = new THREE.Vector3();
const _tmpMat4 = new THREE.Matrix4();
const _tmpColor = new THREE.Color();

interface TrenchGate {
  mesh: THREE.Mesh;
  z: number;
}

interface HazardItem {
  group: THREE.Group;
  active: boolean;
  z: number;
  x: number;
  y: number;
  radius: number;
  rotSpeedX: number;
  rotSpeedY: number;
}

interface OrbItem {
  group: THREE.Group;
  active: boolean;
  z: number;
  x: number;
  y: number;
  radius: number;
}

export function AsciiPage() {
  const mountRef = useRef<HTMLDivElement | null>(null);

  const [sceneMode, setSceneMode] = useState<SceneMode>("game");
  const [dockOpen, setDockOpen] = useState(true);
  const [muted, setMuted] = useState(false);
  const [contextError, setContextError] = useState<string | null>(null);

  const [asciiCfg, setAsciiCfg] = useState<AsciiPipelineConfig>({
    charset: "classic",
    colorMode: "full",
    viewMode: "ascii",
    cellWidth: 10,
    contrast: 1.25,
  });

  const [hud, setHud] = useState<HudSnapshot>(() => ({
    score: 0,
    best: readBestScore(),
    combo: 1,
    shields: 3,
    speed: 24,
    phase: "ready",
  }));

  // Refs read by Three.js loop without recreating the renderer
  const sceneModeRef = useRef<SceneMode>(sceneMode);
  const asciiCfgRef = useRef<AsciiPipelineConfig>(asciiCfg);
  const phaseRef = useRef<GamePhase>("ready");
  const actionsRef = useRef<{
    startGame: () => void;
    togglePause: () => void;
    resetSandboxCamera: () => void;
  } | null>(null);

  useEffect(() => {
    sceneModeRef.current = sceneMode;
  }, [sceneMode]);

  useEffect(() => {
    asciiCfgRef.current = asciiCfg;
  }, [asciiCfg]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.closest("input, textarea, select")) return;
      if (e.key.toLowerCase() === "h") {
        setDockOpen((o) => !o);
      } else if (e.key === " " && sceneModeRef.current === "game") {
        if (phaseRef.current === "ready" || phaseRef.current === "gameover") {
          e.preventDefault();
          actionsRef.current?.startGame();
        }
      } else if (e.key.toLowerCase() === "p" && sceneModeRef.current === "game") {
        actionsRef.current?.togglePause();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const toggleMute = useCallback(() => {
    setMuted((m) => {
      const next = !m;
      asciiAudio.muted = next;
      return next;
    });
  }, []);

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
    renderer.toneMappingExposure = 1.15;
    renderer.setPixelRatio(dpr);
    renderer.shadowMap.enabled = !isSoftwareGl;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.domElement.style.display = "block";
    mount.appendChild(renderer.domElement);

    const onContextLost = (e: Event) => {
      e.preventDefault();
      setContextError("WebGL rendering context lost — click Retry or reload.");
    };
    const onContextRestored = () => {
      setContextError(null);
    };
    renderer.domElement.addEventListener("webglcontextlost", onContextLost);
    renderer.domElement.addEventListener("webglcontextrestored", onContextRestored);

    const initW = Math.max(1, mount.clientWidth);
    const initH = Math.max(1, mount.clientHeight);
    renderer.setSize(initW, initH, false);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color("#05040b");
    scene.fog = new THREE.FogExp2("#05040b", 0.017);

    const camera = new THREE.PerspectiveCamera(56, initW / initH, 0.1, 180);
    camera.position.set(0, 3.2, 7.6);

    // Mandatory procedural studio environment map (guarded for constrained WebGL contexts)
    let envRT: THREE.WebGLRenderTarget | null = null;
    try {
      const pmrem = new THREE.PMREMGenerator(renderer);
      envRT = pmrem.fromScene(new RoomEnvironment(), 0.04);
      scene.environment = envRT.texture;
      pmrem.dispose();
    } catch {
      /* fallback to directional + hemisphere lighting rig */
    }

    // Three-point + warm/cool Hemisphere lighting rig (<= 1 shadow caster)
    const hemi = new THREE.HemisphereLight("#60a5fa", "#1e1b4b", 0.95);
    scene.add(hemi);

    const keyLight = new THREE.DirectionalLight("#fff7ed", 2.4);
    keyLight.position.set(10, 16, 12);
    keyLight.castShadow = !isSoftwareGl;
    keyLight.shadow.mapSize.set(1024, 1024);
    keyLight.shadow.camera.left = -12;
    keyLight.shadow.camera.right = 12;
    keyLight.shadow.camera.top = 12;
    keyLight.shadow.camera.bottom = -12;
    keyLight.shadow.bias = -0.0005;
    keyLight.shadow.normalBias = 0.02;
    scene.add(keyLight);

    const rimLight = new THREE.DirectionalLight("#22d3ee", 1.55);
    rimLight.position.set(-9, 6, -12);
    scene.add(rimLight);

    // Instanced starfield backdrop shared across both modes
    const starCount = 180;
    const starGeom = new THREE.OctahedronGeometry(0.18, 0);
    const starMat = new THREE.MeshBasicMaterial({ color: "#ffffff" });
    const stars = new THREE.InstancedMesh(starGeom, starMat, starCount);
    const starPositions: [number, number, number, number][] = [];
    for (let i = 0; i < starCount; i++) {
      const sx = (Math.random() - 0.5) * 68;
      const sy = 1 + Math.random() * 26;
      const sz = -Math.random() * 115 + 10;
      const scale = 0.7 + Math.random() * 1.5;
      starPositions.push([sx, sy, sz, scale]);
      _tmpMat4.makeScale(scale, scale, scale);
      _tmpMat4.setPosition(sx, sy, sz);
      stars.setMatrixAt(i, _tmpMat4);
      _tmpColor.setHSL(0.52 + (i % 7) * 0.06, 0.9, 0.78);
      stars.setColorAt(i, _tmpColor);
    }
    stars.instanceMatrix.needsUpdate = true;
    if (stars.instanceColor) stars.instanceColor.needsUpdate = true;
    stars.computeBoundingSphere();
    stars.frustumCulled = false;
    scene.add(stars);

    // ------------------------------------------------------------------
    // Mode 1: Orbital Trench Game Group
    // ------------------------------------------------------------------
    const gameGroup = new THREE.Group();
    scene.add(gameGroup);

    // Canyon floor grid + glowing rails
    const floorMat = new THREE.MeshStandardMaterial({
      color: "#151232",
      roughness: 0.72,
      metalness: 0.25,
    });
    const floorPlane = new THREE.Mesh(new THREE.PlaneGeometry(36, 150), floorMat);
    floorPlane.rotation.x = -Math.PI / 2;
    floorPlane.position.set(0, -0.02, -55);
    floorPlane.receiveShadow = true;
    gameGroup.add(floorPlane);

    const gridA = new THREE.GridHelper(140, 56, "#a78bfa", "#3b2f6e");
    gridA.position.set(0, 0.01, -52);
    const gridMatA = gridA.material as THREE.LineBasicMaterial;
    gridMatA.transparent = true;
    gridMatA.opacity = 0.85;
    gameGroup.add(gridA);

    // Scrolling octagonal trench portals
    const gates: TrenchGate[] = [];
    const gateGeom = new THREE.TorusGeometry(6.8, 0.26, 8, 8);
    const gatePalette = ["#22d3ee", "#8b6ff5", "#ec4899", "#f59e0b"];
    for (let i = 0; i < 12; i++) {
      const gMat = new THREE.MeshStandardMaterial({
        color: gatePalette[i % gatePalette.length],
        emissive: gatePalette[i % gatePalette.length],
        emissiveIntensity: 0.55,
        roughness: 0.28,
        metalness: 0.72,
      });
      const mesh = new THREE.Mesh(gateGeom, gMat);
      const gz = -i * 10;
      mesh.position.set(0, 3.0, gz);
      mesh.rotation.z = Math.PI / 8;
      gameGroup.add(mesh);
      gates.push({ mesh, z: gz });
    }

    // Player Interceptor Ship
    const ship: InterceptorHandle = createInterceptorShip();
    ship.group.scale.setScalar(1.22);
    ship.group.position.set(0, 2.2, 2.2);
    gameGroup.add(ship.group);

    // Recycled Hazards & Energy Orbs pools
    const hazards: HazardItem[] = [];
    for (let i = 0; i < 14; i++) {
      const g = createAsteroidCluster();
      g.visible = false;
      gameGroup.add(g);
      hazards.push({
        group: g,
        active: false,
        z: -90,
        x: 0,
        y: 2,
        radius: 1.05,
        rotSpeedX: 0.8 + (i % 3) * 0.5,
        rotSpeedY: 1.0 + (i % 4) * 0.4,
      });
    }

    const orbs: OrbItem[] = [];
    for (let i = 0; i < 10; i++) {
      const g = createEnergyOrb();
      g.visible = false;
      gameGroup.add(g);
      orbs.push({
        group: g,
        active: false,
        z: -90,
        x: 0,
        y: 2,
        radius: 0.85,
      });
    }

    // Pre-populate showcase orbs along the trench so motion is immediately visible on load
    for (let i = 0; i < 4; i++) {
      const o = orbs[i];
      o.active = true;
      o.z = -14 - i * 18;
      o.x = Math.sin(i * 1.4) * 2.6;
      o.y = 2.0 + Math.cos(i * 1.1) * 0.7;
      o.group.position.set(o.x, o.y, o.z);
      o.group.visible = true;
    }

    // ------------------------------------------------------------------
    // Mode 2: 3D Studio Sandbox Group
    // ------------------------------------------------------------------
    const sandboxGroup = new THREE.Group();
    sandboxGroup.visible = false;
    scene.add(sandboxGroup);

    const sandboxFloor = new THREE.Mesh(
      new THREE.CircleGeometry(9, 48),
      new THREE.MeshStandardMaterial({ color: "#15132e", roughness: 0.62, metalness: 0.35 }),
    );
    sandboxFloor.rotation.x = -Math.PI / 2;
    sandboxFloor.receiveShadow = true;
    sandboxGroup.add(sandboxFloor);

    const sandboxGrid = new THREE.GridHelper(18, 24, "#22d3ee", "#342d5e");
    sandboxGrid.position.y = 0.015;
    sandboxGroup.add(sandboxGrid);

    const reactor: ShowcaseHandle = createShowcaseReactor();
    sandboxGroup.add(reactor.group);

    // Orbiting miniature energy crystals around reactor
    const satOrbs: THREE.Group[] = [];
    for (let i = 0; i < 3; i++) {
      const o = createEnergyOrb();
      o.scale.setScalar(0.55);
      sandboxGroup.add(o);
      satOrbs.push(o);
    }

    // OrbitControls for sandbox mode
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = !isSoftwareGl;
    controls.dampingFactor = 0.08;
    controls.target.set(0, 2.1, 0);
    controls.minDistance = 3.2;
    controls.maxDistance = 18;
    controls.maxPolarAngle = Math.PI / 2 - 0.04;
    controls.enabled = false;

    // Offscreen -> GPU Colored ASCII Post-Processing Pipeline
    const drawBufSize = new THREE.Vector2();
    renderer.getDrawingBufferSize(drawBufSize);
    const pipeline = new AsciiRenderPipeline(drawBufSize.x, drawBufSize.y, asciiCfgRef.current);

    if (!isSoftwareGl) {
      try {
        renderer.compile(scene, camera);
      } catch (err) {
        setContextError(err instanceof Error ? err.message : "Failed to compile 3D ASCII shaders");
      }
    }

    // ------------------------------------------------------------------
    // Input & Game State
    // ------------------------------------------------------------------
    const keys = new Set<string>();
    const pointer = { dragging: false, normX: 0, normY: 0, active: false };

    const onKeyDownLoop = (e: KeyboardEvent) => {
      keys.add(e.key.toLowerCase());
    };
    const onKeyUpLoop = (e: KeyboardEvent) => {
      keys.delete(e.key.toLowerCase());
    };
    const onPointerDown = (e: PointerEvent) => {
      if (sceneModeRef.current !== "game") return;
      pointer.dragging = true;
      pointer.active = true;
      const r = renderer.domElement.getBoundingClientRect();
      pointer.normX = ((e.clientX - r.left) / Math.max(1, r.width)) * 2 - 1;
      pointer.normY = -(((e.clientY - r.top) / Math.max(1, r.height)) * 2 - 1);
    };
    const onPointerMove = (e: PointerEvent) => {
      if (!pointer.dragging || sceneModeRef.current !== "game") return;
      const r = renderer.domElement.getBoundingClientRect();
      pointer.normX = ((e.clientX - r.left) / Math.max(1, r.width)) * 2 - 1;
      pointer.normY = -(((e.clientY - r.top) / Math.max(1, r.height)) * 2 - 1);
    };
    const onPointerUp = () => {
      pointer.dragging = false;
    };

    window.addEventListener("keydown", onKeyDownLoop);
    window.addEventListener("keyup", onKeyUpLoop);
    renderer.domElement.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);

    const game = {
      shipX: 0,
      shipY: 2.2,
      targetX: 0,
      targetY: 2.2,
      roll: 0,
      pitch: 0,
      score: 0,
      best: readBestScore(),
      combo: 1,
      shields: 3,
      invulnTimer: 0,
      spawnHazardTimer: 0.6,
      spawnOrbTimer: 0.9,
      elapsed: 0,
      scrollZ: 0,
      hudPushTimer: 0,
    };

    const syncHud = (forcePhase?: GamePhase) => {
      if (forcePhase) phaseRef.current = forcePhase;
      setHud({
        score: Math.floor(game.score),
        best: Math.floor(game.best),
        combo: game.combo,
        shields: game.shields,
        speed: Math.round(
          (24 + Math.min(26, game.elapsed * 0.35)) * (keys.has("shift") ? 1.45 : 1),
        ),
        phase: phaseRef.current,
      });
    };

    const resetPools = () => {
      for (const h of hazards) {
        h.active = false;
        h.group.visible = false;
      }
      for (const o of orbs) {
        o.active = false;
        o.group.visible = false;
      }
    };

    const startGame = () => {
      resetPools();
      game.shipX = 0;
      game.shipY = 2.2;
      game.targetX = 0;
      game.targetY = 2.2;
      game.roll = 0;
      game.pitch = 0;
      game.score = 0;
      game.combo = 1;
      game.shields = 3;
      game.invulnTimer = 0.8;
      game.spawnHazardTimer = 0.55;
      game.spawnOrbTimer = 0.45;
      game.elapsed = 0;
      pointer.active = false;
      ship.group.visible = true;
      asciiAudio.playStart();
      syncHud("playing");
    };

    const togglePause = () => {
      if (phaseRef.current === "playing") {
        syncHud("paused");
      } else if (phaseRef.current === "paused") {
        syncHud("playing");
      }
    };

    const resetSandboxCamera = () => {
      camera.fov = 56;
      camera.updateProjectionMatrix();
      camera.position.set(4.8, 3.6, 5.8);
      controls.target.set(0, 2.1, 0);
      controls.update();
    };

    actionsRef.current = { startGame, togglePause, resetSandboxCamera };

    let lastMountW = initW;
    let lastMountH = initH;

    // ResizeObserver keeps WebGL + RenderTarget + Ascii cell dimensions crisp
    const handleResize = () => {
      const w = Math.max(1, mount.clientWidth);
      const h = Math.max(1, mount.clientHeight);
      lastMountW = w;
      lastMountH = h;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h, false);
      renderer.getDrawingBufferSize(drawBufSize);
      pipeline.resize(drawBufSize.x, drawBufSize.y);
    };
    const ro = new ResizeObserver(handleResize);
    ro.observe(mount);
    handleResize();

    let prevMode: SceneMode = sceneModeRef.current;
    let lastNow = performance.now();
    let frameId = 0;
    let disposed = false;

    const spawnHazard = () => {
      const slot = hazards.find((h) => !h.active);
      if (!slot) return;
      slot.active = true;
      slot.z = -96;
      slot.x = (Math.random() - 0.5) * 9.8;
      slot.y = 1.0 + Math.random() * 4.0;
      slot.group.position.set(slot.x, slot.y, slot.z);
      slot.group.visible = true;
    };

    const spawnOrb = () => {
      const slot = orbs.find((o) => !o.active);
      if (!slot) return;
      slot.active = true;
      slot.z = -94;
      slot.x = (Math.random() - 0.5) * 8.6;
      slot.y = 1.2 + Math.random() * 3.6;
      slot.group.position.set(slot.x, slot.y, slot.z);
      slot.group.visible = true;
    };

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

      if (mount.clientWidth !== lastMountW || mount.clientHeight !== lastMountH) {
        handleResize();
      }

      const now = performance.now();
      const rawDt = (now - lastNow) / 1000;
      lastNow = now;
      const dt = Math.min(Math.max(rawDt, 0.001), 0.05);
      const timeSec = now * 0.001;

      const activeMode = sceneModeRef.current;
      if (activeMode !== prevMode) {
        prevMode = activeMode;
        if (activeMode === "sandbox") {
          gameGroup.visible = false;
          sandboxGroup.visible = true;
          controls.enabled = true;
          resetSandboxCamera();
        } else {
          sandboxGroup.visible = false;
          gameGroup.visible = true;
          controls.enabled = false;
          camera.position.set(game.shipX * 0.45, game.shipY + 1.15, 7.6);
          camera.lookAt(game.shipX * 0.65, game.shipY + 0.15, -18);
        }
      }

      // Sync shader uniforms from React UI ref
      pipeline.updateConfig(asciiCfgRef.current, dpr);

      if (activeMode === "sandbox") {
        // Animate multi-part Gyro Reactor + orbiting crystals
        reactor.ringA.rotation.y += dt * 0.75;
        reactor.ringA.rotation.x = Math.sin(timeSec * 0.5) * 0.35;
        reactor.ringB.rotation.x += dt * 1.1;
        reactor.ringB.rotation.z += dt * 0.45;
        reactor.ringC.rotation.y -= dt * 1.45;
        reactor.core.rotation.x += dt * 0.9;
        reactor.core.rotation.y += dt * 1.25;

        for (let i = 0; i < satOrbs.length; i++) {
          const ang = timeSec * 1.1 + (i * Math.PI * 2) / 3;
          satOrbs[i].position.set(
            Math.cos(ang) * 3.1,
            1.6 + Math.sin(ang * 2.0) * 0.45,
            Math.sin(ang) * 3.1,
          );
          satOrbs[i].rotation.y += dt * 1.8;
        }
        controls.update();
      } else {
        const phase = phaseRef.current;
        const paused = phase === "paused";
        const playing = phase === "playing";
        const boost = playing && keys.has("shift");
        const forwardSpeed = paused
          ? 0
          : (playing ? 24 + Math.min(26, game.elapsed * 0.35) : 14) * (boost ? 1.45 : 1);

        if (!paused) {
          game.scrollZ = (game.scrollZ + forwardSpeed * dt) % 10;
          gridA.position.z = -52 + (game.scrollZ % 2.5);

          // Advance glowing portals
          for (let i = 0; i < gates.length; i++) {
            const g = gates[i];
            g.z += forwardSpeed * dt;
            if (g.z > 8) {
              g.z -= 120;
            }
            g.mesh.position.z = g.z;
            g.mesh.rotation.z += dt * (i % 2 === 0 ? 0.25 : -0.25);
          }

          // Stream background stars past camera
          for (let i = 0; i < starCount; i++) {
            const sp = starPositions[i];
            sp[2] += forwardSpeed * 0.55 * dt;
            if (sp[2] > 14) sp[2] -= 125;
            _tmpMat4.makeScale(sp[3], sp[3], sp[3]);
            _tmpMat4.setPosition(sp[0], sp[1], sp[2]);
            stars.setMatrixAt(i, _tmpMat4);
          }
          stars.instanceMatrix.needsUpdate = true;
        }

        // Steering: demo figure-eight when idle/gameover, direct controls while playing
        if (playing) {
          game.elapsed += dt;
          let mx = 0;
          let my = 0;
          if (keys.has("a") || keys.has("arrowleft")) mx -= 1;
          if (keys.has("d") || keys.has("arrowright")) mx += 1;
          if (keys.has("w") || keys.has("arrowup")) my += 1;
          if (keys.has("s") || keys.has("arrowdown")) my -= 1;

          if (mx !== 0 || my !== 0) {
            pointer.active = false;
            game.targetX = THREE.MathUtils.clamp(game.targetX + mx * 11.5 * dt, -5.2, 5.2);
            game.targetY = THREE.MathUtils.clamp(game.targetY + my * 7.8 * dt, 0.85, 5.0);
          } else if (pointer.active) {
            game.targetX = THREE.MathUtils.clamp(pointer.normX * 5.2, -5.2, 5.2);
            game.targetY = THREE.MathUtils.clamp(2.6 + pointer.normY * 2.3, 0.85, 5.0);
          }

          game.score += dt * (boost ? 28 : 16) * game.combo;
          if (game.score > game.best) {
            game.best = game.score;
          }
        } else if (phase === "ready") {
          game.targetX = Math.sin(timeSec * 0.9) * 2.8;
          game.targetY = 2.4 + Math.cos(timeSec * 1.3) * 0.7;
        }

        const prevX = game.shipX;
        const prevY = game.shipY;
        game.shipX = THREE.MathUtils.damp(game.shipX, game.targetX, 9.5, dt);
        game.shipY = THREE.MathUtils.damp(game.shipY, game.targetY, 9.5, dt);

        const vx = (game.shipX - prevX) / dt;
        const vy = (game.shipY - prevY) / dt;
        game.roll = THREE.MathUtils.damp(game.roll, THREE.MathUtils.clamp(-vx * 0.08, -0.58, 0.58), 8, dt);
        game.pitch = THREE.MathUtils.damp(game.pitch, THREE.MathUtils.clamp(vy * 0.05, -0.35, 0.35), 8, dt);

        ship.group.position.set(game.shipX, game.shipY, 2.2);
        ship.group.rotation.set(game.pitch, 0, game.roll);

        // Pulse thruster cones
        const thrustScale = boost ? 1.55 + Math.sin(timeSec * 36) * 0.18 : 1.0 + Math.sin(timeSec * 24) * 0.12;
        for (const cone of ship.thrusterCones) {
          cone.scale.set(1, thrustScale, 1);
        }

        // Invulnerability blink after collision
        if (game.invulnTimer > 0 && playing) {
          game.invulnTimer = Math.max(0, game.invulnTimer - dt);
          ship.group.visible = Math.floor(game.invulnTimer * 18) % 2 === 0;
        } else {
          ship.group.visible = phase !== "gameover";
        }

        // Spawn & advance hazards/orbs
        if (playing) {
          game.spawnHazardTimer -= dt;
          if (game.spawnHazardTimer <= 0) {
            spawnHazard();
            const pace = Math.max(0.24, 0.72 - game.elapsed * 0.008);
            game.spawnHazardTimer = pace * (0.75 + Math.random() * 0.5);
          }

          game.spawnOrbTimer -= dt;
          if (game.spawnOrbTimer <= 0) {
            spawnOrb();
            game.spawnOrbTimer = 0.85 + Math.random() * 0.65;
          }
        } else if (phase === "ready") {
          // Gentle attract-mode showcase orbs
          game.spawnOrbTimer -= dt;
          if (game.spawnOrbTimer <= 0) {
            spawnOrb();
            game.spawnOrbTimer = 1.1;
          }
        }

        if (!paused) {
          _tmpVecA.set(game.shipX, game.shipY + 0.25, 2.2);

          for (const h of hazards) {
            if (!h.active) continue;
            h.z += forwardSpeed * dt;
            h.group.position.z = h.z;
            h.group.rotation.x += h.rotSpeedX * dt;
            h.group.rotation.y += h.rotSpeedY * dt;

            if (playing && game.invulnTimer <= 0) {
              _tmpVecB.set(h.x, h.y, h.z);
              if (_tmpVecA.distanceTo(_tmpVecB) < h.radius + 0.72) {
                h.active = false;
                h.group.visible = false;
                game.shields -= 1;
                game.combo = 1;
                game.invulnTimer = 1.6;
                asciiAudio.playHit();

                if (game.shields <= 0) {
                  saveBestScore(game.best);
                  syncHud("gameover");
                } else {
                  syncHud();
                }
                continue;
              }
            }

            if (h.z > 10) {
              h.active = false;
              h.group.visible = false;
            }
          }

          for (const o of orbs) {
            if (!o.active) continue;
            o.z += forwardSpeed * dt;
            o.group.position.z = o.z;
            o.group.rotation.y += dt * 2.4;
            o.group.rotation.x += dt * 1.1;

            if (playing) {
              _tmpVecB.set(o.x, o.y, o.z);
              if (_tmpVecA.distanceTo(_tmpVecB) < o.radius + 0.95) {
                o.active = false;
                o.group.visible = false;
                game.combo = Math.min(8, game.combo + 1);
                game.score += 120 * game.combo;
                if (game.score > game.best) game.best = game.score;
                asciiAudio.playCollect(game.combo);
                syncHud();
                continue;
              }
            }

            if (o.z > 10) {
              o.active = false;
              o.group.visible = false;
            }
          }
        }

        // Smooth chase camera + dynamic FOV boost feel
        const targetFov = boost ? 64 : 56;
        if (Math.abs(camera.fov - targetFov) > 0.05) {
          camera.fov = THREE.MathUtils.damp(camera.fov, targetFov, 7, dt);
          camera.updateProjectionMatrix();
        }
        const camTargetX = game.shipX * 0.58;
        const camTargetY = game.shipY + 1.18;
        camera.position.x = THREE.MathUtils.damp(camera.position.x, camTargetX, 7, dt);
        camera.position.y = THREE.MathUtils.damp(camera.position.y, camTargetY, 7, dt);
        camera.position.z = 7.6;
        camera.lookAt(game.shipX * 0.72, game.shipY + 0.12, -16);

        if (playing) {
          game.hudPushTimer += dt;
          if (game.hudPushTimer >= 0.14) {
            game.hudPushTimer = 0;
            syncHud();
          }
        }
      }

      try {
        pipeline.render(renderer, scene, camera, timeSec);
      } catch (err) {
        setContextError(err instanceof Error ? err.message : "WebGL ASCII render failure");
        return;
      }

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
      window.removeEventListener("keydown", onKeyDownLoop);
      window.removeEventListener("keyup", onKeyUpLoop);
      renderer.domElement.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      renderer.domElement.removeEventListener("webglcontextlost", onContextLost);
      renderer.domElement.removeEventListener("webglcontextrestored", onContextRestored);

      controls.dispose();
      pipeline.dispose();
      envRT?.dispose();

      scene.traverse((obj) => {
        const mesh = obj as THREE.Mesh;
        if (mesh.geometry) mesh.geometry.dispose();
        if (mesh.material) {
          const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
          for (const m of mats) m.dispose();
        }
      });

      renderer.dispose();
      if (renderer.domElement.parentNode === mount) {
        mount.removeChild(renderer.domElement);
      }
    };
  }, []);

  const updateAscii = <K extends keyof AsciiPipelineConfig>(key: K, value: AsciiPipelineConfig[K]) => {
    setAsciiCfg((cur) => ({ ...cur, [key]: value }));
  };

  return (
    <div className="ascii-page">
      <div className="ascii-viewport">
        <div ref={mountRef} className="ascii-canvas-mount" />

        {contextError && (
          <div className="ascii-fallback-banner">
            <strong>3D ASCII Viewport Paused</strong>
            <span>{contextError}</span>
            <button type="button" className="ascii-primary-btn" onClick={() => window.location.reload()}>
              Reload Viewport
            </button>
          </div>
        )}

        {/* Minimal Top HUD Strip */}
        <div className="ascii-top-hud">
          {sceneMode === "game" ? (
            <div className="ascii-hud-strip">
              <span className="ascii-hud-title">Orbital Trench · Color ASCII 3D</span>
              <span className="ascii-hud-sep" />
              <span className="ascii-hud-stat">
                <span className="ascii-hud-label">Score</span>
                <span className="ascii-hud-val">{hud.score.toLocaleString()}</span>
              </span>
              <span className="ascii-hud-stat">
                <span className="ascii-hud-label">Combo</span>
                <span className={`ascii-hud-val${hud.combo >= 4 ? " is-warn" : ""}`}>{hud.combo}x</span>
              </span>
              <span className="ascii-hud-stat">
                <span className="ascii-hud-label">Shields</span>
                <span className={`ascii-hud-val${hud.shields === 1 ? " is-danger" : ""}`}>{hud.shields} / 3</span>
              </span>
              <span className="ascii-hud-stat">
                <span className="ascii-hud-label">Speed</span>
                <span className="ascii-hud-val">{hud.speed} m/s</span>
              </span>
              <span className="ascii-hud-stat">
                <span className="ascii-hud-label">Best</span>
                <span className="ascii-hud-val">{hud.best.toLocaleString()}</span>
              </span>
            </div>
          ) : (
            <div className="ascii-hud-strip">
              <span className="ascii-hud-title">Gyro Reactor · Color ASCII 3D</span>
              <span className="ascii-hud-sep" />
              <span className="ascii-hud-label">Drag to orbit · Scroll to zoom · Compare ASCII vs Raw 3D below</span>
            </div>
          )}

          <div className="ascii-hud-actions">
            {sceneMode === "game" && (hud.phase === "playing" || hud.phase === "paused") && (
              <button
                type="button"
                className="ascii-icon-btn"
                onClick={() => actionsRef.current?.togglePause()}
                title="Pause / Resume (P)"
              >
                {hud.phase === "paused" ? <Play size={14} /> : <Pause size={14} />}
                {hud.phase === "paused" ? "Resume" : "Pause"}
              </button>
            )}
            {sceneMode === "game" && hud.phase === "playing" && (
              <button
                type="button"
                className="ascii-icon-btn"
                onClick={() => actionsRef.current?.startGame()}
                title="Restart flight"
              >
                <RotateCcw size={14} />
                Restart
              </button>
            )}
            {sceneMode === "sandbox" && (
              <button
                type="button"
                className="ascii-icon-btn"
                onClick={() => actionsRef.current?.resetSandboxCamera()}
              >
                <RotateCcw size={14} />
                Reset View
              </button>
            )}
            <button
              type="button"
              className="ascii-icon-btn"
              onClick={toggleMute}
              title={muted ? "Unmute audio" : "Mute audio"}
              aria-label={muted ? "Unmute audio" : "Mute audio"}
            >
              {muted ? <VolumeX size={15} /> : <Volume2 size={15} />}
            </button>
          </div>
        </div>

        {/* Game Ready / Paused / Game Over Modal Card */}
        {sceneMode === "game" && hud.phase !== "playing" && (
          <div className="ascii-center-prompt">
            {hud.phase === "ready" && (
              <>
                <h3>Orbital Trench</h3>
                <p>
                  Real-time 3D WebGL scene rendered through a colored ASCII glyph shader.
                  Steer with WASD, Arrow keys, or pointer drag. Hold Shift to boost and collect energy cores.
                </p>
                <div className="ascii-prompt-actions">
                  <button type="button" className="ascii-primary-btn" onClick={() => actionsRef.current?.startGame()}>
                    <Play size={15} /> Start Flight
                  </button>
                </div>
              </>
            )}

            {hud.phase === "paused" && (
              <>
                <h3>Flight Paused</h3>
                <p>Adjust ASCII palettes, glyph sets, or cell size below, then resume.</p>
                <div className="ascii-prompt-actions">
                  <button type="button" className="ascii-primary-btn" onClick={() => actionsRef.current?.togglePause()}>
                    <Play size={15} /> Resume
                  </button>
                  <button type="button" className="ascii-icon-btn" onClick={() => actionsRef.current?.startGame()}>
                    <RotateCcw size={14} /> Restart
                  </button>
                </div>
              </>
            )}

            {hud.phase === "gameover" && (
              <>
                <h3>Shields Depleted</h3>
                <div className="ascii-prompt-stats">
                  <span>
                    Score: <strong style={{ color: "#22d3ee" }}>{hud.score.toLocaleString()}</strong>
                  </span>
                  <span>
                    Best: <strong style={{ color: "#f59e0b" }}>{hud.best.toLocaleString()}</strong>
                  </span>
                </div>
                <div className="ascii-prompt-actions">
                  <button type="button" className="ascii-primary-btn" onClick={() => actionsRef.current?.startGame()}>
                    <RotateCcw size={15} /> Play Again
                  </button>
                </div>
              </>
            )}
          </div>
        )}

        {/* Collapsible Bottom Control Dock */}
        <div className={`ascii-dock-wrap${dockOpen ? "" : " collapsed"}`}>
          <button
            type="button"
            className="ascii-dock-toggle"
            onClick={() => setDockOpen((o) => !o)}
            title="Toggle controls (H)"
          >
            {dockOpen ? <ChevronDown size={13} /> : <ChevronUp size={13} />}
            {dockOpen ? "Hide Controls" : "Controls"}
          </button>

          <div className="ascii-dock">
            <div className="ascii-ctrl-group">
              <Segmented
                size="small"
                value={sceneMode}
                onChange={(v) => setSceneMode(v as SceneMode)}
                options={[
                  {
                    value: "game",
                    label: (
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 5, whiteSpace: "nowrap" }}>
                        <Gamepad2 size={13} /> Trench Game
                      </span>
                    ),
                  },
                  {
                    value: "sandbox",
                    label: (
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 5, whiteSpace: "nowrap" }}>
                        <Sparkles size={13} /> 3D Sandbox
                      </span>
                    ),
                  },
                ]}
              />
            </div>

            <div className="ascii-ctrl-group">
              <span className="ascii-ctrl-label">View</span>
              <Segmented
                size="small"
                value={asciiCfg.viewMode}
                onChange={(v) => updateAscii("viewMode", v as AsciiViewMode)}
                options={[
                  { value: "ascii", label: "ASCII" },
                  { value: "split", label: "Split" },
                  { value: "raw", label: "Raw 3D" },
                ]}
              />
            </div>

            <div className="ascii-ctrl-group">
              <span className="ascii-ctrl-label">Palette</span>
              <Select
                size="small"
                value={asciiCfg.colorMode}
                onChange={(v) => updateAscii("colorMode", v as AsciiColorMode)}
                style={{ width: 112 }}
                options={[
                  { value: "full", label: "Full Color" },
                  { value: "phosphor", label: "Phosphor" },
                  { value: "amber", label: "Amber CRT" },
                  { value: "duotone", label: "Cyan/Violet" },
                ]}
              />
            </div>

            <div className="ascii-ctrl-group">
              <span className="ascii-ctrl-label">Glyphs</span>
              <Select
                size="small"
                value={asciiCfg.charset}
                onChange={(v) => updateAscii("charset", v as AsciiCharsetKey)}
                style={{ width: 92 }}
                options={(Object.keys(ASCII_CHARSETS) as AsciiCharsetKey[]).map((k) => ({
                  value: k,
                  label: ASCII_CHARSETS[k].label,
                }))}
              />
            </div>

            <Tooltip title="Character cell width in pixels">
              <div className="ascii-ctrl-group">
                <span className="ascii-ctrl-label">Cell</span>
                <div className="ascii-slider-wrap">
                  <Slider
                    min={6}
                    max={18}
                    step={1}
                    value={asciiCfg.cellWidth}
                    onChange={(v) => updateAscii("cellWidth", v)}
                    style={{ width: 72, margin: "4px 2px" }}
                  />
                  <span className="ascii-slider-num">{asciiCfg.cellWidth}px</span>
                </div>
              </div>
            </Tooltip>

            <Tooltip title="Luminance contrast curve">
              <div className="ascii-ctrl-group">
                <span className="ascii-ctrl-label">Contrast</span>
                <div className="ascii-slider-wrap">
                  <Slider
                    min={0.7}
                    max={2.2}
                    step={0.05}
                    value={asciiCfg.contrast}
                    onChange={(v) => updateAscii("contrast", v)}
                    style={{ width: 68, margin: "4px 2px" }}
                  />
                  <span className="ascii-slider-num">{asciiCfg.contrast.toFixed(1)}</span>
                </div>
              </div>
            </Tooltip>
          </div>
        </div>
      </div>
    </div>
  );
}
