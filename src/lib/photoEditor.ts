// Non-destructive photo editing model + canvas renderer.
// All positions/sizes are NORMALIZED (0..1 of output width/height) so the same edit
// renders identically for a 900px preview and the full-res export.

export const FILTER_PRESETS = [
  "None", "Grayscale", "Sepia", "Invert", "Blur", "Vintage", "Warm", "Cool", "Fade", "Noir",
] as const;
export type FilterPreset = (typeof FILTER_PRESETS)[number];

export type FrameId =
  | "none"
  | "simple"
  | "double"
  | "rounded"
  | "polaroid"
  | "film"
  | "galaxy"
  | "neon"
  | "checker"
  | "postage"
  | "editorial"
  | "kawaii";

export const FRAME_OPTIONS: { id: FrameId; label: string }[] = [
  { id: "none", label: "None" },
  { id: "simple", label: "Border" },
  { id: "double", label: "Double line" },
  { id: "rounded", label: "Rounded" },
  { id: "polaroid", label: "Polaroid" },
  { id: "film", label: "Film strip" },
  { id: "galaxy", label: "Galaxy glow" },
  { id: "neon", label: "Neon cyber" },
  { id: "checker", label: "Checker" },
  { id: "postage", label: "Postage" },
  { id: "editorial", label: "Museum mat" },
  { id: "kawaii", label: "Soft ribbon" },
];

export type OverlayLayout = "corners" | "border-tile" | "top-bottom" | "badge";

export interface FrameOverlay {
  id: string;
  name: string;
  svg: string;
  layout: OverlayLayout;
  tint: string; // hex color or "" to preserve SVG colors
  scale: number; // 0.6 .. 1.8
  opacity: number; // 0.2 .. 1.0
}

export type AspectRatioId = "original" | "1:1" | "4:3" | "3:4" | "16:9";
export const ASPECT_OPTIONS: { id: AspectRatioId; label: string; ratio: number | null }[] = [
  { id: "original", label: "Original", ratio: null },
  { id: "1:1", label: "1:1", ratio: 1 },
  { id: "4:3", label: "4:3", ratio: 4 / 3 },
  { id: "3:4", label: "3:4", ratio: 3 / 4 },
  { id: "16:9", label: "16:9", ratio: 16 / 9 },
];

export interface Adjustments {
  brightness: number; // % (100 = unchanged)
  contrast: number; // %
  saturation: number; // %
  hue: number; // deg
  blur: number; // px @ 900px width
  vignette: number; // 0..100
}
export const DEFAULT_ADJ: Adjustments = {
  brightness: 100, contrast: 100, saturation: 100, hue: 0, blur: 0, vignette: 0,
};

export interface TransformState {
  rotate: 0 | 90 | 180 | 270;
  flipH: boolean;
  aspect: AspectRatioId;
  zoom: number; // 1.0 .. 3.0
  panX: number; // -1 .. 1
  panY: number; // -1 .. 1
}

export const DEFAULT_TRANSFORM: TransformState = {
  rotate: 0,
  flipH: false,
  aspect: "original",
  zoom: 1,
  panX: 0,
  panY: 0,
};

export interface Stroke { id: string; color: string; width: number; points: [number, number][] }
export interface Sticker {
  id: string;
  kind: "emoji" | "text";
  content: string;
  x: number; y: number; // center, normalized
  size: number; // font size as fraction of image width
  rotation: number; // degrees
  color: string; // text stickers only
}

export interface EditState {
  v: 1;
  filter: FilterPreset;
  adj: Adjustments;
  transform: TransformState;
  frame: { id: FrameId; color: string };
  overlay?: FrameOverlay | null;
  strokes: Stroke[];
  stickers: Sticker[];
}

export function defaultEdit(): EditState {
  return {
    v: 1,
    filter: "None",
    adj: { ...DEFAULT_ADJ },
    transform: { ...DEFAULT_TRANSFORM },
    frame: { id: "none", color: "#ffffff" },
    overlay: null,
    strokes: [],
    stickers: [],
  };
}

/** Safely revive an edit loaded from the DB (missing/older fields get defaults). */
export function normalizeEdit(raw: any): EditState {
  const d = defaultEdit();
  if (!raw || typeof raw !== "object") return d;
  const rawTransform = raw.transform ?? {};
  const rotate = ([0, 90, 180, 270].includes(rawTransform.rotate) ? rawTransform.rotate : 0) as 0 | 90 | 180 | 270;
  const aspect = (ASPECT_OPTIONS.some((a) => a.id === rawTransform.aspect) ? rawTransform.aspect : "original") as AspectRatioId;
  const zoomNum = typeof rawTransform.zoom === "number" && Number.isFinite(rawTransform.zoom)
    ? Math.min(3, Math.max(1, rawTransform.zoom))
    : 1;
  const panX = typeof rawTransform.panX === "number" && Number.isFinite(rawTransform.panX)
    ? Math.min(1, Math.max(-1, rawTransform.panX))
    : 0;
  const panY = typeof rawTransform.panY === "number" && Number.isFinite(rawTransform.panY)
    ? Math.min(1, Math.max(-1, rawTransform.panY))
    : 0;

  let overlay: FrameOverlay | null = null;
  if (raw.overlay && typeof raw.overlay === "object" && typeof raw.overlay.svg === "string") {
    const validLayouts: OverlayLayout[] = ["corners", "border-tile", "top-bottom", "badge"];
    overlay = {
      id: String(raw.overlay.id || "custom"),
      name: String(raw.overlay.name || "Ornament"),
      svg: String(raw.overlay.svg),
      layout: validLayouts.includes(raw.overlay.layout) ? raw.overlay.layout : "corners",
      tint: typeof raw.overlay.tint === "string" ? raw.overlay.tint : "",
      scale: typeof raw.overlay.scale === "number" ? Math.min(1.8, Math.max(0.5, raw.overlay.scale)) : 1,
      opacity: typeof raw.overlay.opacity === "number" ? Math.min(1, Math.max(0.15, raw.overlay.opacity)) : 0.9,
    };
  }

  return {
    v: 1,
    filter: FILTER_PRESETS.includes(raw.filter) ? raw.filter : d.filter,
    adj: { ...d.adj, ...(raw.adj ?? {}) },
    transform: {
      rotate,
      flipH: Boolean(rawTransform.flipH),
      aspect,
      zoom: zoomNum,
      panX,
      panY,
    },
    frame: { ...d.frame, ...(raw.frame ?? {}) },
    overlay,
    strokes: Array.isArray(raw.strokes) ? raw.strokes : [],
    stickers: Array.isArray(raw.stickers) ? raw.stickers : [],
  };
}

export function filterCssPreview(name: FilterPreset, k = 1): string {
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

/* ---------------- API Overlay SVG Image Cache ---------------- */

interface CachedSvgEntry {
  img: HTMLImageElement;
  ready: boolean;
  promise: Promise<void>;
}

const svgImageCache = new Map<string, CachedSvgEntry>();

function buildTintedSvgDataUrl(svg: string, tint: string): string {
  let processed = svg.trim();
  if (tint) {
    processed = processed.replace(/currentColor/gi, tint);
    // If the SVG lacks explicit fill/stroke colors or uses black monochrome paths, apply tint cleanly on <svg>
    if (!/fill="(?!none)[^"]+"/i.test(processed)) {
      processed = processed.replace(/<svg\b/i, `<svg fill="${tint}"`);
    }
    processed = processed.replace(/stroke="currentColor"/gi, `stroke="${tint}"`);
  } else {
    processed = processed.replace(/currentColor/gi, "#ffffff");
  }
  if (!/xmlns=/.test(processed)) {
    processed = processed.replace(/<svg\b/i, `<svg xmlns="http://www.w3.org/2000/svg"`);
  }
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(processed)}`;
}

function getOrLoadOverlayImage(overlay: FrameOverlay, onLoad?: () => void): HTMLImageElement | null {
  const key = `${overlay.id}|${overlay.tint}|${overlay.svg.length}`;
  const existing = svgImageCache.get(key);
  if (existing) {
    if (!existing.ready && onLoad) {
      void existing.promise.then(onLoad);
    }
    return existing.ready ? existing.img : null;
  }

  const img = new Image();
  const dataUrl = buildTintedSvgDataUrl(overlay.svg, overlay.tint);
  const entry: CachedSvgEntry = {
    img,
    ready: false,
    promise: Promise.resolve(),
  };

  entry.promise = new Promise<void>((resolve) => {
    img.onload = () => {
      entry.ready = true;
      resolve();
      onLoad?.();
    };
    img.onerror = () => {
      resolve();
    };
    img.src = dataUrl;
  });

  svgImageCache.set(key, entry);
  return null;
}

export function preloadFrameOverlay(overlay: FrameOverlay | null | undefined, onReady: () => void) {
  if (!overlay?.svg) return;
  getOrLoadOverlayImage(overlay, onReady);
}

export async function ensureEditAssetsLoaded(state: EditState): Promise<void> {
  if (!state.overlay?.svg) return;
  const key = `${state.overlay.id}|${state.overlay.tint}|${state.overlay.svg.length}`;
  getOrLoadOverlayImage(state.overlay);
  const entry = svgImageCache.get(key);
  if (entry && !entry.ready) {
    await entry.promise;
  }
}

function drawFrameOverlay(ctx: CanvasRenderingContext2D, w: number, h: number, overlay: FrameOverlay) {
  const img = getOrLoadOverlayImage(overlay);
  if (!img || !img.naturalWidth) return;

  const m = Math.min(w, h);
  ctx.save();
  ctx.globalAlpha = overlay.opacity;

  if (overlay.layout === "corners") {
    const size = m * 0.13 * overlay.scale;
    const inset = m * 0.038;
    const corners: [number, number, number, number][] = [
      [inset + size / 2, inset + size / 2, 1, 1],
      [w - inset - size / 2, inset + size / 2, -1, 1],
      [inset + size / 2, h - inset - size / 2, 1, -1],
      [w - inset - size / 2, h - inset - size / 2, -1, -1],
    ];
    for (const [cx, cy, sx, sy] of corners) {
      ctx.save();
      ctx.translate(cx, cy);
      ctx.scale(sx, sy);
      ctx.drawImage(img, -size / 2, -size / 2, size, size);
      ctx.restore();
    }
  } else if (overlay.layout === "border-tile") {
    const size = m * 0.065 * overlay.scale;
    const pad = m * 0.028;
    const step = size * 1.45;
    for (let x = pad + size / 2; x <= w - pad - size / 2 + 1; x += step) {
      ctx.drawImage(img, x - size / 2, pad, size, size);
      ctx.drawImage(img, x - size / 2, h - pad - size, size, size);
    }
    for (let y = pad + size * 1.45; y <= h - pad - size * 1.45; y += step) {
      ctx.drawImage(img, pad, y - size / 2, size, size);
      ctx.drawImage(img, w - pad - size, y - size / 2, size, size);
    }
  } else if (overlay.layout === "top-bottom") {
    const size = m * 0.12 * overlay.scale;
    const pad = m * 0.032;
    ctx.drawImage(img, w / 2 - size / 2, pad, size, size);
    ctx.drawImage(img, w / 2 - size / 2, h - pad - size, size, size);
  } else if (overlay.layout === "badge") {
    const size = m * 0.16 * overlay.scale;
    const pad = m * 0.045;
    ctx.drawImage(img, w - pad - size, h - pad - size, size, size);
  }

  ctx.restore();
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
    case "neon": {
      const lw = m * 0.022;
      ctx.strokeStyle = "#22d3ee";
      ctx.lineWidth = lw;
      ctx.shadowColor = "#22d3ee";
      ctx.shadowBlur = m * 0.045;
      ctx.strokeRect(lw * 0.9, lw * 0.9, w - lw * 1.8, h - lw * 1.8);
      ctx.strokeStyle = "#a855f7";
      ctx.lineWidth = lw * 0.45;
      ctx.shadowColor = "#a855f7";
      ctx.strokeRect(lw * 2.1, lw * 2.1, w - lw * 4.2, h - lw * 4.2);
      break;
    }
    case "checker": {
      const sq = Math.max(8, Math.round(m * 0.038));
      const border = sq * 2;
      ctx.fillStyle = "#11101b";
      ctx.fillRect(0, 0, w, border);
      ctx.fillRect(0, h - border, w, border);
      ctx.fillRect(0, border, border, h - 2 * border);
      ctx.fillRect(w - border, border, border, h - 2 * border);
      ctx.fillStyle = color;
      for (let y = 0; y < h; y += sq) {
        for (let x = 0; x < w; x += sq) {
          const inBorder = x < border || x >= w - border || y < border || y >= h - border;
          if (!inBorder) continue;
          if (((Math.floor(x / sq) + Math.floor(y / sq)) & 1) === 0) {
            ctx.fillRect(x, y, Math.min(sq, w - x), Math.min(sq, h - y));
          }
        }
      }
      break;
    }
    case "postage": {
      const pad = m * 0.055;
      ctx.fillStyle = color;
      ctx.fillRect(0, 0, w, pad);
      ctx.fillRect(0, h - pad, w, pad);
      ctx.fillRect(0, pad, pad, h - 2 * pad);
      ctx.fillRect(w - pad, pad, pad, h - 2 * pad);
      // Perforated stamp notches around outer edge
      ctx.globalCompositeOperation = "destination-out";
      const r = pad * 0.36;
      const step = r * 2.9;
      for (let x = step / 2; x < w; x += step) {
        ctx.beginPath(); ctx.arc(x, 0, r, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(x, h, r, 0, Math.PI * 2); ctx.fill();
      }
      for (let y = step / 2; y < h; y += step) {
        ctx.beginPath(); ctx.arc(0, y, r, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(w, y, r, 0, Math.PI * 2); ctx.fill();
      }
      ctx.globalCompositeOperation = "source-over";
      ctx.strokeStyle = "rgba(17,16,27,0.18)";
      ctx.lineWidth = Math.max(1, m * 0.004);
      ctx.strokeRect(pad, pad, w - 2 * pad, h - 2 * pad);
      break;
    }
    case "editorial": {
      const t = m * 0.07;
      ctx.fillStyle = color;
      ctx.fillRect(0, 0, w, t); ctx.fillRect(0, h - t, w, t);
      ctx.fillRect(0, t, t, h - 2 * t); ctx.fillRect(w - t, t, t, h - 2 * t);
      ctx.strokeStyle = "rgba(17, 16, 27, 0.28)";
      ctx.lineWidth = Math.max(1, m * 0.004);
      ctx.strokeRect(t * 0.72, t * 0.72, w - t * 1.44, h - t * 1.44);
      break;
    }
    case "kawaii": {
      const t = m * 0.055;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.rect(0, 0, w, h);
      ctx.roundRect(t, t, w - 2 * t, h - 2 * t, m * 0.11);
      ctx.fill("evenodd");
      ctx.strokeStyle = "rgba(244, 114, 182, 0.75)";
      ctx.lineWidth = Math.max(1.5, m * 0.007);
      ctx.setLineDash([m * 0.018, m * 0.014]);
      ctx.beginPath();
      ctx.roundRect(t * 0.55, t * 0.55, w - t * 1.1, h - t * 1.1, m * 0.12);
      ctx.stroke();
      break;
    }
  }
  ctx.restore();
}

let workCanvas: HTMLCanvasElement | null = null;

/** Computes rotated, cropped, zoomed, and panned dimensions for an input canvas + transform state. */
function buildTransformedBase(base: HTMLCanvasElement, transform: TransformState): HTMLCanvasElement {
  const { rotate, flipH, aspect } = transform;
  const zoom = Math.min(3, Math.max(1, transform.zoom ?? 1));
  const panX = Math.min(1, Math.max(-1, transform.panX ?? 0));
  const panY = Math.min(1, Math.max(-1, transform.panY ?? 0));

  if (rotate === 0 && !flipH && aspect === "original" && zoom === 1 && panX === 0 && panY === 0) {
    return base;
  }

  const swapped = rotate === 90 || rotate === 270;
  const rotW = swapped ? base.height : base.width;
  const rotH = swapped ? base.width : base.height;

  const targetRatio = ASPECT_OPTIONS.find((a) => a.id === aspect)?.ratio ?? null;
  let outW = rotW;
  let outH = rotH;
  if (targetRatio) {
    const curRatio = rotW / rotH;
    if (curRatio > targetRatio) {
      outW = Math.round(rotH * targetRatio);
    } else {
      outH = Math.round(rotW / targetRatio);
    }
  }

  if (!workCanvas) workCanvas = document.createElement("canvas");
  workCanvas.width = outW;
  workCanvas.height = outH;
  const ctx = workCanvas.getContext("2d")!;
  ctx.save();
  ctx.translate(outW / 2, outH / 2);

  const maxShiftX = Math.max(0, (rotW * zoom - outW) / 2);
  const maxShiftY = Math.max(0, (rotH * zoom - outH) / 2);
  ctx.translate(-panX * maxShiftX, -panY * maxShiftY);

  ctx.scale(zoom * (flipH ? -1 : 1), zoom);
  if (rotate !== 0) ctx.rotate((rotate * Math.PI) / 180);
  ctx.drawImage(base, -base.width / 2, -base.height / 2);
  ctx.restore();
  return workCanvas;
}

/** Draws the full edit onto a canvas (new one, or `target` to reuse). */
export function renderEdit(
  base: HTMLCanvasElement, state: EditState, outW?: number, target?: HTMLCanvasElement,
): HTMLCanvasElement {
  const transformed = buildTransformedBase(base, state.transform ?? DEFAULT_TRANSFORM);
  const resolvedOutW = outW ?? transformed.width;
  const w = Math.max(1, Math.round(resolvedOutW));
  const h = Math.max(1, Math.round((w * transformed.height) / transformed.width));
  const canvas = target ?? document.createElement("canvas");
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  const k = w / 900;
  const { adj } = state;

  // 1. photo + filter + adjustments (CSS filter functions on the 2D context)
  const parts = [
    filterCssPreview(state.filter, k),
    `brightness(${adj.brightness}%)`, `contrast(${adj.contrast}%)`,
    `saturate(${adj.saturation}%)`, `hue-rotate(${adj.hue}deg)`,
    adj.blur > 0 ? `blur(${adj.blur * k}px)` : "",
  ];
  ctx.filter = parts.filter(Boolean).join(" ");
  ctx.drawImage(transformed, 0, 0, w, h);
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

  // 5. frame (on top of photo, before overlay)
  if (state.frame.id !== "none") drawFrame(ctx, w, h, state.frame.id, state.frame.color);

  // 6. external API decorative frame overlay
  if (state.overlay?.svg) drawFrameOverlay(ctx, w, h, state.overlay);

  return canvas;
}

/* ---------------- 4-Cut Strip Composer & Themes ---------------- */

export type StripThemeId =
  | "midnight"
  | "cream"
  | "blush"
  | "sky"
  | "film"
  | "checker"
  | "galaxy"
  | "custom";

export interface StripThemeMeta {
  id: StripThemeId;
  label: string;
  bgColor: string;
  borderColor: string;
  textColor: string;
}

export const STRIP_THEMES: StripThemeMeta[] = [
  { id: "midnight", label: "Midnight", bgColor: "#11101b", borderColor: "#2a2740", textColor: "#e8e6f5" },
  { id: "cream", label: "Paper", bgColor: "#f6f3ec", borderColor: "#dfd8c8", textColor: "#1f1d2b" },
  { id: "blush", label: "Blush", bgColor: "#fce7f3", borderColor: "#f9a8d4", textColor: "#831843" },
  { id: "sky", label: "Sky", bgColor: "#e0f2fe", borderColor: "#7dd3fc", textColor: "#0c4a6e" },
  { id: "film", label: "35mm Film", bgColor: "#0c0c10", borderColor: "#e5e7eb", textColor: "#f3f4f6" },
  { id: "checker", label: "Checker", bgColor: "#141320", borderColor: "#ffffff", textColor: "#ffffff" },
  { id: "galaxy", label: "Galaxy", bgColor: "#120d26", borderColor: "#8b6ff5", textColor: "#f5f3ff" },
  { id: "custom", label: "Custom", bgColor: "#1a1829", borderColor: "#22d3ee", textColor: "#e8e6f5" },
];

export interface StripConfig {
  layout: "strip" | "grid";
  theme: StripThemeId;
  bgColor: string;
  borderColor: string;
  footerText: string;
  showDate: boolean;
  rounded: boolean;
}

export function defaultStripConfig(layout: "strip" | "grid" = "strip"): StripConfig {
  return {
    layout,
    theme: "midnight",
    bgColor: "#11101b",
    borderColor: "#2a2740",
    footerText: "EVOL PHOTOBOOTH",
    showDate: true,
    rounded: true,
  };
}

function isLightColor(hex: string): boolean {
  const clean = hex.replace("#", "");
  if (clean.length !== 6) return false;
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  return 0.299 * r + 0.587 * g + 0.114 * b > 150;
}

/** Stitches 4 captured (or individually edited) frames into a crisp 2x2 or 1x4 photobooth strip canvas. */
export function buildPhotoStripCanvas(
  frames: HTMLCanvasElement[],
  configOrLayout: "strip" | "grid" | StripConfig = "strip",
): HTMLCanvasElement {
  const cfg: StripConfig = typeof configOrLayout === "string"
    ? defaultStripConfig(configOrLayout)
    : configOrLayout;

  const first = frames[0];
  const cellW = 720;
  const baseCellH = Math.round((cellW * first.height) / first.width);
  const pad = cfg.theme === "film" ? 56 : cfg.theme === "checker" ? 36 : 28;
  const gap = 18;
  const footer = 56;

  const cols = cfg.layout === "grid" ? 2 : 1;
  const rows = Math.ceil(frames.length / cols);

  // In 1x4 vertical strip, each cell adapts cleanly to its frame aspect ratio so nothing clips;
  // in 2x2 grid, all cells share baseCellH and contain-fit cleanly.
  const cellHeights = cfg.layout === "strip"
    ? frames.map((f) => Math.max(240, Math.round((cellW * f.height) / f.width)))
    : frames.map(() => baseCellH);

  let totalGridH = 0;
  for (let r = 0; r < rows; r++) {
    let rowH = 0;
    for (let c = 0; c < cols; c++) {
      const idx = r * cols + c;
      if (idx < cellHeights.length) rowH = Math.max(rowH, cellHeights[idx]);
    }
    totalGridH += rowH + (r > 0 ? gap : 0);
  }

  const canvas = document.createElement("canvas");
  canvas.width = pad * 2 + cols * cellW + (cols - 1) * gap;
  canvas.height = pad * 2 + totalGridH + footer;
  const ctx = canvas.getContext("2d")!;

  const themeMeta = STRIP_THEMES.find((t) => t.id === cfg.theme) ?? STRIP_THEMES[0];
  const bg = cfg.theme === "custom" ? cfg.bgColor : themeMeta.bgColor;
  const accent = cfg.theme === "custom" ? cfg.borderColor : themeMeta.borderColor;
  const ink = cfg.theme === "custom"
    ? (isLightColor(bg) ? "#161422" : "#eceaf7")
    : themeMeta.textColor;

  if (cfg.theme === "galaxy") {
    const g = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
    g.addColorStop(0, "#120d26");
    g.addColorStop(0.5, "#1b1138");
    g.addColorStop(1, "#0b1a2d");
    ctx.fillStyle = g;
  } else {
    ctx.fillStyle = bg;
  }
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  if (cfg.theme === "checker") {
    const sq = 18;
    ctx.fillStyle = accent;
    for (let y = 0; y < canvas.height; y += sq) {
      for (let x = 0; x < canvas.width; x += sq) {
        const inMargin =
          x < pad - 6 || x >= canvas.width - pad + 6 || y < pad - 6 || y >= canvas.height - pad - footer + 6;
        if (!inMargin) continue;
        if (((Math.floor(x / sq) + Math.floor(y / sq)) & 1) === 0) {
          ctx.fillRect(x, y, Math.min(sq, canvas.width - x), Math.min(sq, canvas.height - y));
        }
      }
    }
    // Clean backdrop under footer label
    ctx.fillStyle = bg;
    ctx.fillRect(pad - 6, canvas.height - footer - 8, canvas.width - (pad - 6) * 2, footer);
  } else if (cfg.theme === "film") {
    // 35mm sprocket holes along left and right rails
    ctx.fillStyle = "#e5e7eb";
    const holeW = 20;
    const holeH = 26;
    const step = 48;
    for (let y = 20; y < canvas.height - 20; y += step) {
      ctx.beginPath();
      ctx.roundRect(16, y, holeW, holeH, 4);
      ctx.roundRect(canvas.width - 16 - holeW, y, holeW, holeH, 4);
      ctx.fill();
    }
  } else {
    ctx.strokeStyle = accent;
    ctx.lineWidth = 4;
    ctx.strokeRect(10, 10, canvas.width - 20, canvas.height - 20);
  }

  let curY = pad;
  for (let r = 0; r < rows; r++) {
    let rowH = 0;
    for (let c = 0; c < cols; c++) {
      const idx = r * cols + c;
      if (idx < cellHeights.length) rowH = Math.max(rowH, cellHeights[idx]);
    }

    for (let c = 0; c < cols; c++) {
      const idx = r * cols + c;
      if (idx >= frames.length) continue;
      const frame = frames[idx];
      const x = pad + c * (cellW + gap);
      const y = curY;

      ctx.save();
      if (cfg.rounded) {
        ctx.beginPath();
        ctx.roundRect(x, y, cellW, rowH, 12);
        ctx.clip();
      }
      // Fit frame inside cell without clipping per-shot frames/stickers
      const scale = Math.min(cellW / frame.width, rowH / frame.height);
      const dw = frame.width * scale;
      const dh = frame.height * scale;
      const dx = x + (cellW - dw) / 2;
      const dy = y + (rowH - dh) / 2;
      ctx.fillStyle = "rgba(0,0,0,0.22)";
      ctx.fillRect(x, y, cellW, rowH);
      ctx.drawImage(frame, dx, dy, dw, dh);
      ctx.restore();
    }

    curY += rowH + gap;
  }

  ctx.fillStyle = ink;
  ctx.globalAlpha = 0.85;
  ctx.font = `600 18px ${TEXT_FONT}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const labelText = cfg.footerText.trim() || "EVOL PHOTOBOOTH";
  const stamp = new Date().toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  const footerLine = cfg.showDate ? `${labelText} · ${stamp}` : labelText;
  ctx.fillText(footerLine, canvas.width / 2, canvas.height - footer / 2 - 2);
  ctx.globalAlpha = 1;
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