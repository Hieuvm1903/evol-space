// Non-destructive photo editing model + canvas renderer.
// All positions/sizes are NORMALIZED (0..1 of width/height) so the same edit
// renders identically for a 900px preview and the full-res export.

export const FILTER_PRESETS = [
  "None", "Grayscale", "Sepia", "Invert", "Blur", "Vintage", "Warm", "Cool", "Fade", "Noir",
] as const;
export type FilterPreset = (typeof FILTER_PRESETS)[number];

export type FrameId = "none" | "simple" | "double" | "rounded" | "polaroid" | "film" | "galaxy";
export const FRAME_OPTIONS: { id: FrameId; label: string }[] = [
  { id: "none", label: "None" },
  { id: "simple", label: "Border" },
  { id: "double", label: "Double line" },
  { id: "rounded", label: "Rounded" },
  { id: "polaroid", label: "Polaroid" },
  { id: "film", label: "Film strip" },
  { id: "galaxy", label: "Galaxy glow" },
];

export interface Adjustments {
  brightness: number; // % (100 = unchanged)
  contrast: number;   // %
  saturation: number; // %
  hue: number;        // deg
  blur: number;       // px @ 900px width
  vignette: number;   // 0..100
}
export const DEFAULT_ADJ: Adjustments = {
  brightness: 100, contrast: 100, saturation: 100, hue: 0, blur: 0, vignette: 0,
};

export interface Stroke { id: string; color: string; width: number; points: [number, number][] }
export interface Sticker {
  id: string;
  kind: "emoji" | "text";
  content: string;
  x: number; y: number;      // center, normalized
  size: number;              // font size as fraction of image width
  rotation: number;          // degrees
  color: string;             // text stickers only
}

export interface EditState {
  v: 1;
  filter: FilterPreset;
  adj: Adjustments;
  frame: { id: FrameId; color: string };
  strokes: Stroke[];
  stickers: Sticker[];
}

export function defaultEdit(): EditState {
  return {
    v: 1, filter: "None", adj: { ...DEFAULT_ADJ },
    frame: { id: "none", color: "#ffffff" }, strokes: [], stickers: [],
  };
}

/** Safely revive an edit loaded from the DB (missing/older fields get defaults). */
export function normalizeEdit(raw: any): EditState {
  const d = defaultEdit();
  if (!raw || typeof raw !== "object") return d;
  return {
    v: 1,
    filter: FILTER_PRESETS.includes(raw.filter) ? raw.filter : d.filter,
    adj: { ...d.adj, ...(raw.adj ?? {}) },
    frame: { ...d.frame, ...(raw.frame ?? {}) },
    strokes: Array.isArray(raw.strokes) ? raw.strokes : [],
    stickers: Array.isArray(raw.stickers) ? raw.stickers : [],
  };
}

function presetCss(name: FilterPreset, k: number): string {
  switch (name) {
    case "Grayscale": return "grayscale(1)";
    case "Sepia": return "sepia(1)";
    case "Invert": return "invert(1)";
    case "Blur": return `blur(${4 * k}px)`;
    case "Vintage": return "sepia(0.6) contrast(0.9) saturate(0.85)";
    case "Warm": return "sepia(0.25) saturate(1.3) hue-rotate(-10deg)";
    case "Cool": return "saturate(1.1) hue-rotate(15deg) brightness(1.03)";
    case "Fade": return "contrast(0.85) brightness(1.1) saturate(0.8)";
    case "Noir": return "grayscale(1) contrast(1.4) brightness(0.9)";
    default: return "";
  }
}

const EMOJI_FONT = `"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif`;
const TEXT_FONT = `"Be Vietnam Pro", system-ui, sans-serif`;

function fontFor(st: Sticker, w: number): string {
  const px = st.size * w;
  return st.kind === "emoji" ? `${px}px ${EMOJI_FONT}` : `700 ${px}px ${TEXT_FONT}`;
}

let measureCtx: CanvasRenderingContext2D | null = null;
/** Half width/height (px) of a sticker's un-rotated box at image width `w`. */
export function stickerHalfSize(st: Sticker, w: number): { hw: number; hh: number } {
  if (!measureCtx) measureCtx = document.createElement("canvas").getContext("2d")!;
  measureCtx.font = fontFor(st, w);
  const px = st.size * w;
  return { hw: measureCtx.measureText(st.content).width / 2 + px * 0.1, hh: px * 0.65 };
}

/** Topmost sticker under a normalized point, or null. */
export function hitSticker(state: EditState, nx: number, ny: number, w: number, h: number): Sticker | null {
  for (let i = state.stickers.length - 1; i >= 0; i--) {
    const st = state.stickers[i];
    const dx = nx * w - st.x * w;
    const dy = ny * h - st.y * h;
    const r = (st.rotation * Math.PI) / 180;
    const lx = dx * Math.cos(r) + dy * Math.sin(r);
    const ly = -dx * Math.sin(r) + dy * Math.cos(r);
    const { hw, hh } = stickerHalfSize(st, w);
    if (Math.abs(lx) <= hw && Math.abs(ly) <= hh) return st;
  }
  return null;
}

function drawFrame(ctx: CanvasRenderingContext2D, w: number, h: number, id: FrameId, color: string) {
  const m = Math.min(w, h);
  ctx.save();
  switch (id) {
    case "simple": {
      const t = m * 0.04;
      ctx.fillStyle = color;
      ctx.fillRect(0, 0, w, t); ctx.fillRect(0, h - t, w, t);
      ctx.fillRect(0, t, t, h - 2 * t); ctx.fillRect(w - t, t, t, h - 2 * t);
      break;
    }
    case "double": {
      const t = m * 0.03;
      ctx.strokeStyle = color; ctx.lineWidth = m * 0.008;
      ctx.strokeRect(t, t, w - 2 * t, h - 2 * t);
      ctx.strokeRect(t * 1.9, t * 1.9, w - 3.8 * t, h - 3.8 * t);
      break;
    }
    case "rounded": {
      const t = m * 0.05;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.rect(0, 0, w, h);
      ctx.roundRect(t, t, w - 2 * t, h - 2 * t, m * 0.08);
      ctx.fill("evenodd");
      break;
    }
    case "polaroid": {
      const side = m * 0.05, bottom = m * 0.17;
      ctx.fillStyle = color;
      ctx.fillRect(0, 0, w, side); ctx.fillRect(0, h - bottom, w, bottom);
      ctx.fillRect(0, side, side, h - side - bottom); ctx.fillRect(w - side, side, side, h - side - bottom);
      break;
    }
    case "film": {
      const bar = h * 0.09;
      ctx.fillStyle = "#111";
      ctx.fillRect(0, 0, w, bar); ctx.fillRect(0, h - bar, w, bar);
      ctx.fillStyle = "#f2f2f2";
      const hole = bar * 0.42, gap = bar * 0.95;
      for (let x = gap / 2; x < w; x += gap) {
        ctx.fillRect(x, (bar - hole) / 2, hole, hole);
        ctx.fillRect(x, h - bar + (bar - hole) / 2, hole, hole);
      }
      break;
    }
    case "galaxy": {
      const lw = m * 0.035;
      const g = ctx.createLinearGradient(0, 0, w, h);
      g.addColorStop(0, "#8b6ff5"); g.addColorStop(0.5, "#e879f9"); g.addColorStop(1, "#22d3ee");
      ctx.strokeStyle = g; ctx.lineWidth = lw;
      ctx.shadowColor = "#8b6ff5"; ctx.shadowBlur = m * 0.04;
      ctx.strokeRect(lw / 2, lw / 2, w - lw, h - lw);
      break;
    }
  }
  ctx.restore();
}

/** Draws the full edit onto a canvas (new one, or `target` to reuse). */
export function renderEdit(
  base: HTMLCanvasElement, state: EditState, outW: number = base.width, target?: HTMLCanvasElement,
): HTMLCanvasElement {
  const w = Math.round(outW);
  const h = Math.round((outW * base.height) / base.width);
  const canvas = target ?? document.createElement("canvas");
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  const k = w / 900;
  const { adj } = state;

  // 1. photo + filter + adjustments (CSS filter functions on the 2D context)
  const parts = [
    presetCss(state.filter, k),
    `brightness(${adj.brightness}%)`, `contrast(${adj.contrast}%)`,
    `saturate(${adj.saturation}%)`, `hue-rotate(${adj.hue}deg)`,
    adj.blur > 0 ? `blur(${adj.blur * k}px)` : "",
  ];
  ctx.filter = parts.filter(Boolean).join(" ");
  ctx.drawImage(base, 0, 0, w, h);
  ctx.filter = "none";

  // 2. vignette
  const vig = Math.max((adj.vignette / 100) * 0.8, state.filter === "Vintage" ? 0.55 : 0);
  if (vig > 0) {
    const g = ctx.createRadialGradient(w / 2, h / 2, w * 0.2, w / 2, h / 2, w * 0.75);
    g.addColorStop(0, "rgba(0,0,0,0)");
    g.addColorStop(1, `rgba(0,0,0,${vig})`);
    ctx.globalCompositeOperation = "multiply";
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    ctx.globalCompositeOperation = "source-over";
  }

  // 3. drawing
  ctx.lineCap = "round"; ctx.lineJoin = "round";
  for (const s of state.strokes) {
    ctx.strokeStyle = s.color; ctx.fillStyle = s.color;
    ctx.lineWidth = s.width * w;
    if (s.points.length === 1) {
      ctx.beginPath();
      ctx.arc(s.points[0][0] * w, s.points[0][1] * h, (s.width * w) / 2, 0, Math.PI * 2);
      ctx.fill();
      continue;
    }
    ctx.beginPath();
    s.points.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x * w, y * h) : ctx.lineTo(x * w, y * h)));
    ctx.stroke();
  }

  // 4. stickers
  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  for (const st of state.stickers) {
    ctx.save();
    ctx.translate(st.x * w, st.y * h);
    ctx.rotate((st.rotation * Math.PI) / 180);
    ctx.font = fontFor(st, w);
    if (st.kind === "text") {
      ctx.lineWidth = st.size * w * 0.08; ctx.strokeStyle = "rgba(0,0,0,0.75)"; ctx.lineJoin = "round";
      ctx.strokeText(st.content, 0, 0);
      ctx.fillStyle = st.color;
    }
    ctx.fillText(st.content, 0, 0);
    ctx.restore();
  }

  // 5. frame (on top of everything)
  if (state.frame.id !== "none") drawFrame(ctx, w, h, state.frame.id, state.frame.color);
  return canvas;
}

/** Preview-only dashed outline around the selected sticker. */
export function drawSelection(canvas: HTMLCanvasElement, st: Sticker) {
  const ctx = canvas.getContext("2d")!;
  const { hw, hh } = stickerHalfSize(st, canvas.width);
  ctx.save();
  ctx.translate(st.x * canvas.width, st.y * canvas.height);
  ctx.rotate((st.rotation * Math.PI) / 180);
  ctx.setLineDash([6, 4]); ctx.lineWidth = 1.5; ctx.strokeStyle = "#22d3ee";
  ctx.strokeRect(-hw, -hh, hw * 2, hh * 2);
  ctx.restore();
}