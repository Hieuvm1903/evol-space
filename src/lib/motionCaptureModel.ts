export type MotionTriggerMode = "wave" | "pose-hold" | "impulse";

export type MotionPhase =
  | "calibrating"
  | "watching"
  | "detecting"
  | "holding"
  | "triggered";

export interface MotionModelConfig {
  mode: MotionTriggerMode;
  /** Sensitivity from 10 (least sensitive) to 95 (most sensitive). */
  sensitivity: number;
}

export interface MotionAnalysis {
  phase: MotionPhase;
  /** Normalized instantaneous motion energy in [0, 1]. */
  energy: number;
  /** Progress toward trigger lock in [0, 1]. */
  progress: number;
  /** Normalized [0..1, 0..1] centroid of motion in raw video coordinates, or null if idle. */
  centroid: { x: number; y: number } | null;
  /** 6x4 spatial grid motion intensities in [0, 1]. */
  zones: Float32Array;
  /** Short user-facing status label. */
  label: string;
  /** True on the exact frame the trigger condition is satisfied. */
  triggered: boolean;
}

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

/**
 * Lightweight client-side spatio-temporal motion recognition model.
 * Operates on a downsampled 96x72 luminance tensor with illumination-normalized
 * temporal differencing, EMA background modeling, and a 6x4 spatial receptive grid.
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

  constructor() {
    this.canvas = document.createElement("canvas");
    this.canvas.width = SAMPLE_W;
    this.canvas.height = SAMPLE_H;
    const ctx = this.canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) {
      throw new Error("Could not initialize offscreen 2D context for motion model.");
    }
    this.ctx = ctx;

    // Precompute pixel count per grid cell
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
    this.zones.fill(0);
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

    // Initialize reference buffers on frame 0
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

    // Sensitivity mapping: higher sensitivity => lower threshold
    const sens = Math.min(95, Math.max(10, config.sensitivity)) / 100; // 0.10 .. 0.95
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
          // Slowly adapt background model only on quiet pixels
          this.bgLuma[idx] = this.bgLuma[idx] * 0.93 + luma[idx] * 0.07;
        }
      }
    }

    // Update adaptive sensor noise floor during quiet intervals
    if (quietCount > PIXEL_COUNT * 0.65) {
      const avgQuiet = quietDiffSum / quietCount;
      this.noiseFloor = Math.max(9, Math.min(26, this.noiseFloor * 0.92 + (avgQuiet * 2.2 + 7) * 0.08));
    }

    // Normalize zone energies
    for (let z = 0; z < ZONE_COUNT; z++) {
      const count = this.zoneCounts[z] || 1;
      this.zones[z] = Math.min(1, (this.zones[z] / count) * 4.5);
    }

    this.prevLuma.set(luma);
    this.prevNorm.set(this.currNorm);

    // Combine active area ratio + intensity into normalized energy [0..1]
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

    // Warmup calibration phase
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

    if (now < this.cooldownUntil) {
      return {
        phase: "watching",
        energy: this.smoothEnergy,
        progress: 0,
        centroid,
        zones: this.zones,
        label: "Ready",
        triggered: false,
      };
    }

    const activeThreshold = Math.max(0.035, 0.24 - sens * 0.19); // ~0.059 at sens 0.95, ~0.126 at sens 0.60, ~0.22 at sens 0.10

    // Maintain sliding temporal window (1400ms)
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

    // 2. Pattern recognition per selected trigger mode
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
    // Detect rhythmic lateral oscillations (sign reversals in vx) OR sustained deliberate hand-wave energy
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

    // Progress combines lateral reversals (2 reversals = classic wave) + sustained active motion frames
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

    // Require user movement / entry before starting stillness lock
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
