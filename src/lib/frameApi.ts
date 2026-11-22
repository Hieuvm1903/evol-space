// External Frame & Motif API client (Iconify public CORS API: https://api.iconify.design)
// Fetches crisp vector ornaments, borders, stamps, and stickers that serialize safely
// into EditState and draw onto <canvas> via data:image/svg+xml without CORS tainting.

export interface ApiFrameMotif {
  id: string;
  name: string;
  prefix: string;
  svg?: string;
}

export interface FrameCategoryPreset {
  label: string;
  query: string;
}

export const FRAME_API_CATEGORIES: FrameCategoryPreset[] = [
  { label: "Sparkles", query: "sparkle" },
  { label: "Hearts", query: "heart" },
  { label: "Floral", query: "flower" },
  { label: "Stars", query: "star" },
  { label: "Frames", query: "frame" },
  { label: "Camera", query: "camera" },
  { label: "Crown", query: "crown" },
  { label: "Cute", query: "cat" },
];

// Built-in fallback motifs in case the browser is offline or rate-limited.
export const FALLBACK_FRAME_MOTIFS: Required<ApiFrameMotif>[] = [
  {
    id: "builtin:sparkle",
    name: "sparkle",
    prefix: "builtin",
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l2.4 7.6L22 12l-7.6 2.4L12 22l-2.4-7.6L2 12l7.6-2.4z"/></svg>`,
  },
  {
    id: "builtin:heart",
    name: "heart",
    prefix: "builtin",
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>`,
  },
  {
    id: "builtin:corner-bracket",
    name: "corner-flourish",
    prefix: "builtin",
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 14V6a2 2 0 0 1 2-2h8"/><circle cx="6" cy="6" r="1.5" fill="currentColor"/></svg>`,
  },
  {
    id: "builtin:star",
    name: "star",
    prefix: "builtin",
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>`,
  },
  {
    id: "builtin:flower",
    name: "flower",
    prefix: "builtin",
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="6" r="3.2"/><circle cx="17.5" cy="10" r="3.2"/><circle cx="15.5" cy="16.5" r="3.2"/><circle cx="8.5" cy="16.5" r="3.2"/><circle cx="6.5" cy="10" r="3.2"/><circle cx="12" cy="12" r="2.6" fill="#fde047"/></svg>`,
  },
  {
    id: "builtin:crown",
    name: "crown",
    prefix: "builtin",
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M3 18h18v2H3v-2zm0-2l2-9 4.5 4L12 5l2.5 6L19 7l2 9H3z"/></svg>`,
  },
];

const searchCache = new Map<string, ApiFrameMotif[]>();
const svgCache = new Map<string, string>();

for (const item of FALLBACK_FRAME_MOTIFS) {
  svgCache.set(item.id, item.svg);
}

export function sanitizeSvg(raw: string): string {
  return raw
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/\son[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    .trim();
}

export function getIconifyPreviewUrl(iconId: string): string {
  const builtin = svgCache.get(iconId);
  if (builtin && iconId.startsWith("builtin:")) {
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(builtin.replace(/currentColor/g, "#e8e6f5"))}`;
  }
  const [prefix, name] = iconId.split(":");
  if (!prefix || !name) return "";
  return `https://api.iconify.design/${encodeURIComponent(prefix)}/${encodeURIComponent(name)}.svg?color=%23e8e6f5&height=64`;
}

export async function searchFrameMotifs(query: string, limit = 24): Promise<{
  motifs: ApiFrameMotif[];
  fromFallback: boolean;
}> {
  const q = query.trim() || "sparkle";
  const cacheKey = `${q.toLowerCase()}:${limit}`;
  const cached = searchCache.get(cacheKey);
  if (cached) return { motifs: cached, fromFallback: false };

  try {
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), 5500);
    const url = `https://api.iconify.design/search?query=${encodeURIComponent(q)}&limit=${limit}`;
    const res = await fetch(url, { signal: controller.signal });
    window.clearTimeout(timer);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const data = (await res.json()) as { icons?: string[] };
    const icons = Array.isArray(data.icons) ? data.icons : [];
    const motifs: ApiFrameMotif[] = icons
      .filter((id) => typeof id === "string" && id.includes(":"))
      .map((id) => {
        const [prefix, name] = id.split(":");
        return { id, prefix, name };
      });

    if (motifs.length > 0) {
      searchCache.set(cacheKey, motifs);
      return { motifs, fromFallback: false };
    }
  } catch {
    // Fall through to offline motifs
  }

  return { motifs: FALLBACK_FRAME_MOTIFS, fromFallback: true };
}

export async function fetchMotifSvg(iconId: string): Promise<string> {
  const cached = svgCache.get(iconId);
  if (cached) return cached;

  const [prefix, name] = iconId.split(":");
  if (!prefix || !name) {
    throw new Error("Invalid icon identifier");
  }

  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), 6000);
  const url = `https://api.iconify.design/${encodeURIComponent(prefix)}/${encodeURIComponent(name)}.svg?height=128`;
  const res = await fetch(url, { signal: controller.signal });
  window.clearTimeout(timer);
  if (!res.ok) {
    throw new Error(`Could not fetch motif (${res.status})`);
  }

  const raw = await res.text();
  const clean = sanitizeSvg(raw);
  if (!clean.includes("<svg")) {
    throw new Error("Invalid SVG returned by API");
  }
  svgCache.set(iconId, clean);
  return clean;
}
