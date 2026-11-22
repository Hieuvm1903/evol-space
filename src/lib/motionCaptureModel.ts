import {
  FaceLandmarker,
  FilesetResolver,
  GestureRecognizer,
  type Classifications,
} from "@mediapipe/tasks-vision";

export type MotionTriggerMode =
  | "wave"
  | "pose-hold"
  | "impulse"
  | "thumb-up"
  | "victory"
  | "smile"
  | "open-palm"
  | "wink"
  | "love";

export type MotionPhase =
  | "calibrating"
  | "watching"
  | "detecting"
  | "holding"
  | "triggered"
  | "error";

export interface MotionModelConfig {
  mode: MotionTriggerMode;
  /** Sensitivity from 10 (least sensitive) to 95 (most sensitive). */
  sensitivity: number;
}

export interface MotionAnalysis {
  phase: MotionPhase;
  /** Normalized instantaneous motion/confidence energy in [0, 1]. */
  energy: number;
  /** Progress toward trigger lock in [0, 1]. */
  progress: number;
  /** Normalized [0..1, 0..1] centroid of motion/hand/face in raw video coordinates, or null if idle. */
  centroid: { x: number; y: number } | null;
  /** 6x4 spatial grid motion intensities in [0, 1]. */
  zones: Float32Array;
  /** Short user-facing status label. */
  label: string;
  /** True on the exact frame the trigger condition is satisfied. */
  triggered: boolean;
}

export interface MotionTriggerMeta {
  id: MotionTriggerMode;
  label: string;
  shortLabel: string;
  hint: string;
  kind: "motion" | "hand" | "face";
}

export const MOTION_TRIGGER_OPTIONS: MotionTriggerMeta[] = [
  { id: "thumb-up", label: "Thumb Up", shortLabel: "Thumb", hint: "Show a thumbs-up 👍 to capture", kind: "hand" },
  { id: "victory", label: "V-Sign", shortLabel: "V-Sign", hint: "Show a peace / V sign ✌️ to capture", kind: "hand" },
  { id: "smile", label: "Smile", shortLabel: "Smile", hint: "Give a bright smile 😊 to capture", kind: "face" },
  { id: "open-palm", label: "Open Palm", shortLabel: "Palm", hint: "Raise an open palm 🖐️ to capture", kind: "hand" },
  { id: "wink", label: "Wink", shortLabel: "Wink", hint: "Wink one eye 😉 to capture", kind: "face" },
  { id: "love", label: "Love Sign", shortLabel: "Love", hint: "Show an I-Love-You hand 🤟 to capture", kind: "hand" },
  { id: "wave", label: "Wave", shortLabel: "Wave", hint: "Wave hand side-to-side 👋", kind: "motion" },
  { id: "pose-hold", label: "Pose & Hold", shortLabel: "Hold", hint: "Move into frame, then hold still", kind: "motion" },
  { id: "impulse", label: "Burst", shortLabel: "Burst", hint: "Make a quick motion burst ⚡", kind: "motion" },
];

export function isVisionGestureMode(mode: MotionTriggerMode): boolean {
  return mode !== "wave" && mode !== "pose-hold" && mode !== "impulse";
}

function isFaceMode(mode: MotionTriggerMode): boolean {
  return mode === "smile" || mode === "wink";
}

const MEDIAPIPE_WASM_ROOT = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.2.3/wasm";
const GESTURE_MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/gesture_recognizer/gesture_recognizer/float16/1/gesture_recognizer.task";
const FACE_MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task";

const SAMPLE_W = 96;
const SAMPLE_H = 72;
const PIXEL_COUNT = SAMPLE_W * SAMPLE_H;
const GRID_COLS = 6;
const GRID_ROWS = 4;
const ZONE_COUNT = GRID_COLS * GRID_ROWS;
const WARMUP_FRAMES = 7;

interface MotionSample {
  t: number;
  energy: number;
  cx: number;
  cy: number;
  vx: number;
}

type VisionLoaderState<T> = {
  instance: T | null;
  loading: Promise<T> | null;
  error: string | null;
};

let sharedWasmFilesetPromise: Promise<Awaited<ReturnType<typeof FilesetResolver.forVisionTasks>>> | null = null;
const gestureState: VisionLoaderState<GestureRecognizer> = { instance: null, loading: null, error: null };
const faceState: VisionLoaderState<FaceLandmarker> = { instance: null, loading: null, error: null };

function getWasmFileset() {
  if (!sharedWasmFilesetPromise) {
    sharedWasmFilesetPromise = FilesetResolver.forVisionTasks(MEDIAPIPE_WASM_ROOT).catch((err) => {
      sharedWasmFilesetPromise = null;
      throw err;
    });
  }
  return sharedWasmFilesetPromise;
}

async function ensureGestureRecognizer(): Promise<GestureRecognizer> {
  if (gestureState.instance) return gestureState.instance;
  if (gestureState.loading) return gestureState.loading;
  gestureState.error = null;
  gestureState.loading = (async () => {
    const vision = await getWasmFileset();
    try {
      const recognizer = await GestureRecognizer.createFromOptions(vision, {
        baseOptions: { modelAssetPath: GESTURE_MODEL_URL, delegate: "GPU" },
        runningMode: "VIDEO",
        numHands: 2,
      });
      gestureState.instance = recognizer;
      return recognizer;
    } catch {
      const recognizer = await GestureRecognizer.createFromOptions(vision, {
        baseOptions: { modelAssetPath: GESTURE_MODEL_URL, delegate: "CPU" },
        runningMode: "VIDEO",
        numHands: 2,
      });
      gestureState.instance = recognizer;
      return recognizer;
    }
  })()
    .catch((err) => {
      gestureState.error = err instanceof Error ? err.message : "Failed to load hand gesture AI";
      throw err;
    })
    .finally(() => {
      gestureState.loading = null;
    });
  return gestureState.loading;
}

async function ensureFaceLandmarker(): Promise<FaceLandmarker> {
  if (faceState.instance) return faceState.instance;
  if (faceState.loading) return faceState.loading;
  faceState.error = null;
  faceState.loading = (async () => {
    const vision = await getWasmFileset();
    try {
      const landmarker = await FaceLandmarker.createFromOptions(vision, {
        baseOptions: { modelAssetPath: FACE_MODEL_URL, delegate: "GPU" },
        runningMode: "VIDEO",
        outputFaceBlendshapes: true,
        numFaces: 1,
      });
      faceState.instance = landmarker;
      return landmarker;
    } catch {
      const landmarker = await FaceLandmarker.createFromOptions(vision, {
        baseOptions: { modelAssetPath: FACE_MODEL_URL, delegate: "CPU" },
        runningMode: "VIDEO",
        outputFaceBlendshapes: true,
        numFaces: 1,
      });
      faceState.instance = landmarker;
      return landmarker;
    }
  })()
    .catch((err) => {
      faceState.error = err instanceof Error ? err.message : "Failed to load face expression AI";
      throw err;
    })
    .finally(() => {
      faceState.loading = null;
    });
  return faceState.loading;
}

function getBlendshapeScore(classifications: Classifications | undefined, name: string): number {
  if (!classifications?.categories) return 0;
  const found = classifications.categories.find((c) => c.categoryName === name);
  return found ? found.score : 0;
}

/**
 * Hybrid client-side motion & vision recognition engine.
 * - Spatio-temporal luminance differencing for Wave / Pose & Hold / Burst.
 * - MediaPipe Tasks Vision (GestureRecognizer & FaceLandmarker) for Thumb Up, V-Sign,
 *   Open Palm, Love Sign, Smile, and Wink.
 */
export class MotionCaptureModel {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private prevLuma = new Float32Array(PIXEL_COUNT);
  private bgLuma = new Float32Array(PIXEL_COUNT);
  private currNorm = new Float32Array(PIXEL_COUNT);
  private prevNorm = new Float32Array(PIXEL_COUNT);
  private zones = new Float32Array(ZONE_COUNT);
  private zoneCounts = new Uint16Array(ZONE_COUNT);

  private frameCount = 0;
  private noiseFloor = 14;
  private smoothEnergy = 0;
  private prevCentroid: { x: number; y: number } | null = null;
  private smoothVx = 0;
  private history: MotionSample[] = [];

  // State machine for temporal patterns
  private impulseStreak = 0;
  private poseSeenMotionAt: number | null = null;
  private poseHoldStartAt: number | null = null;
  private cooldownUntil = 0;

  // Vision AI state
  private lastVisionTs = 0;
  private visionMatchStartAt: number | null = null;
  private visionGraceUntil = 0;

  constructor() {
    this.canvas = document.createElement("canvas");
    this.canvas.width = SAMPLE_W;
    this.canvas.height = SAMPLE_H;
    const ctx = this.canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) {
      throw new Error("Could not initialize offscreen 2D context for motion model.");
    }
    this.ctx = ctx;

    for (let y = 0; y < SAMPLE_H; y++) {
      const gy = Math.min(GRID_ROWS - 1, Math.floor((y / SAMPLE_H) * GRID_ROWS));
      for (let x = 0; x < SAMPLE_W; x++) {
        const gx = Math.min(GRID_COLS - 1, Math.floor((x / SAMPLE_W) * GRID_COLS));
        this.zoneCounts[gy * GRID_COLS + gx]++;
      }
    }
  }

  reset() {
    this.frameCount = 0;
    this.noiseFloor = 14;
    this.smoothEnergy = 0;
    this.prevCentroid = null;
    this.smoothVx = 0;
    this.history = [];
    this.impulseStreak = 0;
    this.poseSeenMotionAt = null;
    this.poseHoldStartAt = null;
    this.cooldownUntil = 0;
    this.visionMatchStartAt = null;
    this.visionGraceUntil = 0;
    this.zones.fill(0);
  }

  /** Pre-warm MediaPipe vision models when a hand/face trigger mode is selected. */
  preloadForMode(mode: MotionTriggerMode) {
    if (!isVisionGestureMode(mode)) return;
    if (isFaceMode(mode)) {
      void ensureFaceLandmarker().catch(() => {});
    } else {
      void ensureGestureRecognizer().catch(() => {});
    }
  }

  processFrame(video: HTMLVideoElement, config: MotionModelConfig, now = performance.now()): MotionAnalysis {
    if (video.readyState < 2 || video.videoWidth === 0 || video.videoHeight === 0) {
      return {
        phase: "calibrating",
        energy: 0,
        progress: 0,
        centroid: null,
        zones: this.zones,
        label: "Waiting for video…",
        triggered: false,
      };
    }

    if (now < this.cooldownUntil) {
      return {
        phase: "watching",
        energy: 0,
        progress: 0,
        centroid: null,
        zones: this.zones,
        label: "Ready",
        triggered: false,
      };
    }

    if (isVisionGestureMode(config.mode)) {
      return this.processVisionFrame(video, config, now);
    }

    return this.processMotionFrame(video, config, now);
  }

  private processVisionFrame(video: HTMLVideoElement, config: MotionModelConfig, now: number): MotionAnalysis {
    const sens = Math.min(95, Math.max(10, config.sensitivity)) / 100; // 0.10 .. 0.95
    const holdDurationMs = Math.round(780 - sens * 340); // ~457ms at 95% sens, ~746ms at 10% sens
    const ts = Math.max(this.lastVisionTs + 1, Math.round(now));
    this.lastVisionTs = ts;

    if (isFaceMode(config.mode)) {
      if (!faceState.instance) {
        if (faceState.error) {
          return {
            phase: "error",
            energy: 0,
            progress: 0,
            centroid: null,
            zones: this.zones,
            label: "Face AI unavailable — try Wave / Hold / Burst",
            triggered: false,
          };
        }
        void ensureFaceLandmarker().catch(() => {});
        return {
          phase: "calibrating",
          energy: 0,
          progress: 0.4,
          centroid: null,
          zones: this.zones,
          label: "Loading face expression AI…",
          triggered: false,
        };
      }

      try {
        const res = faceState.instance.detectForVideo(video, ts);
        const face = res.faceLandmarks?.[0];
        const blend = res.faceBlendshapes?.[0];
        const nose = face?.[1];
        const centroid = nose ? { x: Math.min(1, Math.max(0, nose.x)), y: Math.min(1, Math.max(0, nose.y)) } : null;

        let score = 0;
        let activeLabel = "";
        let idleLabel = "";
        let threshold = 0.5;

        if (config.mode === "smile") {
          const left = getBlendshapeScore(blend, "mouthSmileLeft");
          const right = getBlendshapeScore(blend, "mouthSmileRight");
          score = (left + right) / 2;
          threshold = 0.58 - sens * 0.28; // ~0.31 at 95%, ~0.41 at 60%, ~0.55 at 10%
          activeLabel = "Nice smile — hold it…";
          idleLabel = face ? "Smile to auto-capture 😊" : "Look at the camera & smile 😊";
        } else {
          // Wink: one eye closed while other stays open
          const blinkL = getBlendshapeScore(blend, "eyeBlinkLeft");
          const blinkR = getBlendshapeScore(blend, "eyeBlinkRight");
          const winkL = Math.max(0, blinkL - blinkR * 0.65);
          const winkR = Math.max(0, blinkR - blinkL * 0.65);
          score = Math.max(winkL, winkR);
          threshold = 0.52 - sens * 0.24; // ~0.29 at 95%, ~0.38 at 60%
          activeLabel = "Wink detected — hold…";
          idleLabel = face ? "Wink one eye to capture 😉" : "Face camera & wink 😉";
        }

        const normalizedEnergy = Math.min(1, score / Math.max(0.15, threshold));
        return this.evaluateVisionLock(now, score >= threshold, holdDurationMs, normalizedEnergy, centroid, activeLabel, idleLabel, config.mode);
      } catch {
        return {
          phase: "watching",
          energy: 0,
          progress: 0,
          centroid: null,
          zones: this.zones,
          label: "Analyzing face…",
          triggered: false,
        };
      }
    }

    // Hand Gesture Modes: thumb-up, victory, open-palm, love
    if (!gestureState.instance) {
      if (gestureState.error) {
        return {
          phase: "error",
          energy: 0,
          progress: 0,
          centroid: null,
          zones: this.zones,
          label: "Hand gesture AI unavailable — try Wave / Hold / Burst",
          triggered: false,
        };
      }
      void ensureGestureRecognizer().catch(() => {});
      return {
        phase: "calibrating",
        energy: 0,
        progress: 0.4,
        centroid: null,
        zones: this.zones,
        label: "Loading hand gesture AI…",
        triggered: false,
      };
    }

    const targetCategoryMap: Record<string, { category: string; prompt: string; locked: string }> = {
      "thumb-up": { category: "Thumb_Up", prompt: "Show 👍 Thumbs Up to capture", locked: "Thumbs up — hold steady…" },
      victory: { category: "Victory", prompt: "Show ✌️ V-Sign to capture", locked: "V-Sign detected — hold…" },
      "open-palm": { category: "Open_Palm", prompt: "Show 🖐️ Open Palm to capture", locked: "Open palm — hold…" },
      love: { category: "ILoveYou", prompt: "Show 🤟 Love Sign to capture", locked: "Love sign — hold…" },
    };
    const spec = targetCategoryMap[config.mode] ?? targetCategoryMap["thumb-up"];

    try {
      const res = gestureState.instance.recognizeForVideo(video, ts);
      const minConf = 0.72 - sens * 0.34; // ~0.40 at 95%, ~0.52 at 60%, ~0.69 at 10%
      let bestScore = 0;
      let bestCentroid: { x: number; y: number } | null = null;
      let anyHandCentroid: { x: number; y: number } | null = null;

      const hands = res.landmarks ?? [];
      const gestures = res.gestures ?? [];
      for (let i = 0; i < hands.length; i++) {
        const palm = hands[i]?.[9] ?? hands[i]?.[0];
        const pt = palm ? { x: Math.min(1, Math.max(0, palm.x)), y: Math.min(1, Math.max(0, palm.y)) } : null;
        if (pt && !anyHandCentroid) anyHandCentroid = pt;

        const top = gestures[i]?.[0];
        if (top && top.categoryName === spec.category && top.score > bestScore) {
          bestScore = top.score;
          bestCentroid = pt;
        }
      }

      const centroid = bestCentroid ?? anyHandCentroid;
      const energy = Math.min(1, bestScore / Math.max(0.2, minConf));
      return this.evaluateVisionLock(
        now,
        bestScore >= minConf,
        holdDurationMs,
        energy,
        centroid,
        spec.locked,
        spec.prompt,
        config.mode,
      );
    } catch {
      return {
        phase: "watching",
        energy: 0,
        progress: 0,
        centroid: null,
        zones: this.zones,
        label: "Watching hand gestures…",
        triggered: false,
      };
    }
  }

  private evaluateVisionLock(
    now: number,
    matched: boolean,
    holdDurationMs: number,
    energy: number,
    centroid: { x: number; y: number } | null,
    activeLabel: string,
    idleLabel: string,
    mode: MotionTriggerMode,
  ): MotionAnalysis {
    if (matched) {
      if (this.visionMatchStartAt === null) {
        this.visionMatchStartAt = now;
      }
      this.visionGraceUntil = now + 180; // brief grace window against 1-frame flicker
      const elapsed = now - this.visionMatchStartAt;
      const progress = Math.min(1, elapsed / holdDurationMs);
      if (progress >= 1) {
        this.cooldownUntil = now + 1500;
        this.visionMatchStartAt = null;
        this.visionGraceUntil = 0;
        const meta = MOTION_TRIGGER_OPTIONS.find((m) => m.id === mode);
        return {
          phase: "triggered",
          energy: 1,
          progress: 1,
          centroid,
          zones: this.zones,
          label: `${meta?.label ?? "Gesture"} captured!`,
          triggered: true,
        };
      }
      return {
        phase: "holding",
        energy,
        progress,
        centroid,
        zones: this.zones,
        label: activeLabel,
        triggered: false,
      };
    }

    if (this.visionMatchStartAt !== null && now < this.visionGraceUntil) {
      const progress = Math.min(1, (now - this.visionMatchStartAt) / holdDurationMs);
      return {
        phase: "detecting",
        energy,
        progress,
        centroid,
        zones: this.zones,
        label: activeLabel,
        triggered: false,
      };
    }

    this.visionMatchStartAt = null;
    return {
      phase: "watching",
      energy,
      progress: 0,
      centroid,
      zones: this.zones,
      label: idleLabel,
      triggered: false,
    };
  }

  private processMotionFrame(video: HTMLVideoElement, config: MotionModelConfig, now: number): MotionAnalysis {
    this.ctx.drawImage(video, 0, 0, SAMPLE_W, SAMPLE_H);
    const { data } = this.ctx.getImageData(0, 0, SAMPLE_W, SAMPLE_H);

    // 1. Extract luma & frame mean (for global exposure compensation)
    let sumY = 0;
    const luma = new Float32Array(PIXEL_COUNT);
    for (let i = 0, p = 0; i < PIXEL_COUNT; i++, p += 4) {
      const y = 0.299 * data[p] + 0.587 * data[p + 1] + 0.114 * data[p + 2];
      luma[i] = y;
      sumY += y;
    }
    const meanY = sumY / PIXEL_COUNT;
    for (let i = 0; i < PIXEL_COUNT; i++) {
      this.currNorm[i] = luma[i] - meanY;
    }

    if (this.frameCount === 0) {
      this.prevLuma.set(luma);
      this.bgLuma.set(luma);
      this.prevNorm.set(this.currNorm);
      this.frameCount = 1;
      return {
        phase: "calibrating",
        energy: 0,
        progress: 0,
        centroid: null,
        zones: this.zones,
        label: "Calibrating background…",
        triggered: false,
      };
    }

    this.frameCount++;

    const sens = Math.min(95, Math.max(10, config.sensitivity)) / 100;
    const pixelDiffGate = this.noiseFloor + (1 - sens) * 22;

    this.zones.fill(0);
    let activePixels = 0;
    let weightedDiffSum = 0;
    let fgDiffSum = 0;
    let cxSum = 0;
    let cySum = 0;
    let weightSum = 0;
    let quietDiffSum = 0;
    let quietCount = 0;

    for (let y = 0; y < SAMPLE_H; y++) {
      const gy = Math.min(GRID_ROWS - 1, Math.floor((y / SAMPLE_H) * GRID_ROWS));
      const rowOffset = y * SAMPLE_W;
      for (let x = 0; x < SAMPLE_W; x++) {
        const idx = rowOffset + x;
        const rawDiff = Math.abs(luma[idx] - this.prevLuma[idx]);
        const normDiff = Math.abs(this.currNorm[idx] - this.prevNorm[idx]);
        const diff = 0.7 * normDiff + 0.3 * rawDiff;

        const bgDiff = Math.abs(luma[idx] - this.bgLuma[idx]);
        if (bgDiff > pixelDiffGate * 1.15) {
          fgDiffSum += Math.min(1, (bgDiff - pixelDiffGate) / 60);
        }

        if (diff > pixelDiffGate) {
          const strength = Math.min(1, (diff - pixelDiffGate) / 52);
          activePixels++;
          weightedDiffSum += strength;
          this.zones[gy * GRID_COLS + Math.min(GRID_COLS - 1, Math.floor((x / SAMPLE_W) * GRID_COLS))] += strength;
          cxSum += x * strength;
          cySum += y * strength;
          weightSum += strength;
        } else {
          quietDiffSum += diff;
          quietCount++;
          this.bgLuma[idx] = this.bgLuma[idx] * 0.93 + luma[idx] * 0.07;
        }
      }
    }

    if (quietCount > PIXEL_COUNT * 0.65) {
      const avgQuiet = quietDiffSum / quietCount;
      this.noiseFloor = Math.max(9, Math.min(26, this.noiseFloor * 0.92 + (avgQuiet * 2.2 + 7) * 0.08));
    }

    for (let z = 0; z < ZONE_COUNT; z++) {
      const count = this.zoneCounts[z] || 1;
      this.zones[z] = Math.min(1, (this.zones[z] / count) * 4.5);
    }

    this.prevLuma.set(luma);
    this.prevNorm.set(this.currNorm);

    const areaRatio = activePixels / PIXEL_COUNT;
    const meanStrength = weightedDiffSum / PIXEL_COUNT;
    const rawEnergy = Math.min(1, areaRatio * 3.4 + meanStrength * 5.2);
    this.smoothEnergy = this.smoothEnergy * 0.45 + rawEnergy * 0.55;

    const centroid =
      weightSum > 4
        ? {
            x: cxSum / weightSum / SAMPLE_W,
            y: cySum / weightSum / SAMPLE_H,
          }
        : null;

    if (centroid && this.prevCentroid) {
      const dx = centroid.x - this.prevCentroid.x;
      this.smoothVx = this.smoothVx * 0.4 + dx * 0.6;
    } else {
      this.smoothVx *= 0.6;
    }
    if (centroid) {
      this.prevCentroid = centroid;
    }

    if (this.frameCount <= WARMUP_FRAMES) {
      return {
        phase: "calibrating",
        energy: this.smoothEnergy,
        progress: this.frameCount / WARMUP_FRAMES,
        centroid: null,
        zones: this.zones,
        label: "Calibrating camera…",
        triggered: false,
      };
    }

    const activeThreshold = Math.max(0.035, 0.24 - sens * 0.19);

    if (centroid && this.smoothEnergy >= activeThreshold * 0.65) {
      this.history.push({
        t: now,
        energy: this.smoothEnergy,
        cx: centroid.x,
        cy: centroid.y,
        vx: this.smoothVx,
      });
    }
    const cutoff = now - 1400;
    while (this.history.length > 0 && this.history[0].t < cutoff) {
      this.history.shift();
    }

    if (config.mode === "wave") {
      return this.evaluateWaveGesture(now, activeThreshold, centroid);
    }
    if (config.mode === "pose-hold") {
      const fgPresence = fgDiffSum / PIXEL_COUNT;
      return this.evaluatePoseAndHold(now, activeThreshold, fgPresence, centroid);
    }
    return this.evaluateImpulse(now, activeThreshold, centroid);
  }

  private evaluateWaveGesture(
    now: number,
    activeThreshold: number,
    centroid: { x: number; y: number } | null,
  ): MotionAnalysis {
    let reversals = 0;
    let lastSign = 0;
    let activeSamples = 0;
    let peakEnergy = 0;

    for (const sample of this.history) {
      if (sample.energy >= activeThreshold * 0.75) {
        activeSamples++;
        if (sample.energy > peakEnergy) peakEnergy = sample.energy;
      }
      if (Math.abs(sample.vx) > 0.012) {
        const sign = sample.vx > 0 ? 1 : -1;
        if (lastSign !== 0 && sign !== lastSign) {
          reversals++;
        }
        lastSign = sign;
      }
    }

    const reversalScore = reversals / 2.2;
    const durationScore = activeSamples / 9;
    const progress = Math.min(1, Math.max(reversalScore * 0.75 + durationScore * 0.4, durationScore * 0.85));

    if (reversals >= 2 || (activeSamples >= 7 && peakEnergy >= activeThreshold * 1.15)) {
      this.cooldownUntil = now + 1500;
      this.history = [];
      return {
        phase: "triggered",
        energy: this.smoothEnergy,
        progress: 1,
        centroid,
        zones: this.zones,
        label: "Wave recognized!",
        triggered: true,
      };
    }

    return {
      phase: progress > 0.22 ? "detecting" : "watching",
      energy: this.smoothEnergy,
      progress,
      centroid,
      zones: this.zones,
      label: progress > 0.22 ? "Wave detected — keep waving…" : "Wave hand to auto-capture",
      triggered: false,
    };
  }

  private evaluatePoseAndHold(
    now: number,
    activeThreshold: number,
    fgPresence: number,
    centroid: { x: number; y: number } | null,
  ): MotionAnalysis {
    const enterThreshold = activeThreshold * 0.85;
    const stillThreshold = activeThreshold * 0.42;
    const holdDurationMs = 950;

    if (this.smoothEnergy >= enterThreshold || fgPresence > 0.06) {
      this.poseSeenMotionAt = now;
      this.poseHoldStartAt = null;
      return {
        phase: "detecting",
        energy: this.smoothEnergy,
        progress: 0.12,
        centroid,
        zones: this.zones,
        label: "Moving into pose…",
        triggered: false,
      };
    }

    if (this.poseSeenMotionAt !== null && now - this.poseSeenMotionAt < 10000) {
      if (this.smoothEnergy <= stillThreshold) {
        if (this.poseHoldStartAt === null) {
          this.poseHoldStartAt = now;
        }
        const elapsed = now - this.poseHoldStartAt;
        const progress = Math.min(1, elapsed / holdDurationMs);
        if (progress >= 1) {
          this.cooldownUntil = now + 1500;
          this.poseSeenMotionAt = null;
          this.poseHoldStartAt = null;
          return {
            phase: "triggered",
            energy: this.smoothEnergy,
            progress: 1,
            centroid: null,
            zones: this.zones,
            label: "Pose locked — capturing!",
            triggered: true,
          };
        }
        return {
          phase: "holding",
          energy: this.smoothEnergy,
          progress,
          centroid,
          zones: this.zones,
          label: "Hold still…",
          triggered: false,
        };
      }
    }

    return {
      phase: "watching",
      energy: this.smoothEnergy,
      progress: 0,
      centroid,
      zones: this.zones,
      label: "Move into frame, then hold still",
      triggered: false,
    };
  }

  private evaluateImpulse(
    now: number,
    activeThreshold: number,
    centroid: { x: number; y: number } | null,
  ): MotionAnalysis {
    const burstThreshold = activeThreshold * 1.25;
    if (this.smoothEnergy >= burstThreshold) {
      this.impulseStreak++;
    } else {
      this.impulseStreak = Math.max(0, this.impulseStreak - 1);
    }

    const progress = Math.min(1, this.impulseStreak / 3);
    if (this.impulseStreak >= 3) {
      this.cooldownUntil = now + 1500;
      this.impulseStreak = 0;
      return {
        phase: "triggered",
        energy: this.smoothEnergy,
        progress: 1,
        centroid,
        zones: this.zones,
        label: "Motion captured!",
        triggered: true,
      };
    }

    return {
      phase: this.impulseStreak > 0 ? "detecting" : "watching",
      energy: this.smoothEnergy,
      progress,
      centroid,
      zones: this.zones,
      label: this.impulseStreak > 0 ? "Motion detected…" : "Make a quick move to capture",
      triggered: false,
    };
  }
}
