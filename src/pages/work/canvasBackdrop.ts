import type { ThemeId } from "../../contexts/ThemeContext";
import type { CanvasBgMode } from "../../lib/workTypes";

export interface CanvasBackdrop {
  bg: string;
  isLight: boolean;
  fogColor: string;
  fogDensity: number;
  envIntensity: number;
  fineCenter: number;
  fineGrid: number;
  fineOpacity: number;
  coarseCenter: number;
  coarseGrid: number;
  coarseOpacity: number;
  ambientColor: string;
  ambientIntensity: number;
  hemiSky: string;
  hemiGround: string;
  hemiIntensity: number;
  cubeColor: string;
  cubeStroke: string;
  cubeText: string;
  cubeHover: string;
}

export const CANVAS_BG_OPTIONS: { value: CanvasBgMode; label: string; dot: string }[] = [
  { value: "auto", label: "Theme", dot: "linear-gradient(135deg, var(--evol-green), var(--evol-green-light))" },
  { value: "space", label: "Cosmic", dot: "#07060f" },
  { value: "studio", label: "Studio", dot: "#eef2f9" },
  { value: "warm", label: "Warm", dot: "#ede6d8" },
  { value: "blueprint", label: "Blueprint", dot: "#081630" },
];

const BACKDROPS: Record<Exclude<CanvasBgMode, "auto"> | "hc-dark" | "hc-light", CanvasBackdrop> = {
  space: {
    bg: "#07060f",
    isLight: false,
    fogColor: "#07060f",
    fogDensity: 0.011,
    envIntensity: 0.48,
    fineCenter: 0x2a2740,
    fineGrid: 0x1d1a30,
    fineOpacity: 0.7,
    coarseCenter: 0x8b6ff5,
    coarseGrid: 0x4a3fa0,
    coarseOpacity: 0.45,
    ambientColor: "#8f84e0",
    ambientIntensity: 0.45,
    hemiSky: "#22d3ee",
    hemiGround: "#14121f",
    hemiIntensity: 0.25,
    cubeColor: "#1a1830",
    cubeStroke: "#8b6ff5",
    cubeText: "#e8e6f5",
    cubeHover: "#22d3ee",
  },
  studio: {
    bg: "#eef2f9",
    isLight: true,
    fogColor: "#eef2f9",
    fogDensity: 0.0075,
    envIntensity: 0.62,
    fineCenter: 0xcbd5e1,
    fineGrid: 0xdbe2ef,
    fineOpacity: 0.85,
    coarseCenter: 0x5b3df5,
    coarseGrid: 0x94a3b8,
    coarseOpacity: 0.55,
    ambientColor: "#ffffff",
    ambientIntensity: 0.55,
    hemiSky: "#e0e7ff",
    hemiGround: "#94a3b8",
    hemiIntensity: 0.42,
    cubeColor: "#ffffff",
    cubeStroke: "#5b3df5",
    cubeText: "#111024",
    cubeHover: "#0284c7",
  },
  warm: {
    bg: "#ede6d8",
    isLight: true,
    fogColor: "#ede6d8",
    fogDensity: 0.0075,
    envIntensity: 0.6,
    fineCenter: 0xd1c7b3,
    fineGrid: 0xdfd7c7,
    fineOpacity: 0.85,
    coarseCenter: 0x4338ca,
    coarseGrid: 0xa89f8d,
    coarseOpacity: 0.55,
    ambientColor: "#fff8eb",
    ambientIntensity: 0.56,
    hemiSky: "#fef3c7",
    hemiGround: "#a89f8d",
    hemiIntensity: 0.4,
    cubeColor: "#fffdf8",
    cubeStroke: "#4338ca",
    cubeText: "#1c1917",
    cubeHover: "#0f766e",
  },
  blueprint: {
    bg: "#081630",
    isLight: false,
    fogColor: "#081630",
    fogDensity: 0.0095,
    envIntensity: 0.5,
    fineCenter: 0x163466,
    fineGrid: 0x10274f,
    fineOpacity: 0.8,
    coarseCenter: 0x38bdf8,
    coarseGrid: 0x1d4ed8,
    coarseOpacity: 0.52,
    ambientColor: "#93c5fd",
    ambientIntensity: 0.48,
    hemiSky: "#38bdf8",
    hemiGround: "#0a1936",
    hemiIntensity: 0.3,
    cubeColor: "#0c2044",
    cubeStroke: "#38bdf8",
    cubeText: "#e0f2fe",
    cubeHover: "#facc15",
  },
  "hc-dark": {
    bg: "#000000",
    isLight: false,
    fogColor: "#000000",
    fogDensity: 0.006,
    envIntensity: 0.52,
    fineCenter: 0x3f3f46,
    fineGrid: 0x27272a,
    fineOpacity: 0.85,
    coarseCenter: 0xfacc15,
    coarseGrid: 0x71717a,
    coarseOpacity: 0.65,
    ambientColor: "#ffffff",
    ambientIntensity: 0.55,
    hemiSky: "#38bdf8",
    hemiGround: "#18181b",
    hemiIntensity: 0.3,
    cubeColor: "#0a0a0d",
    cubeStroke: "#facc15",
    cubeText: "#ffffff",
    cubeHover: "#38bdf8",
  },
  "hc-light": {
    bg: "#ffffff",
    isLight: true,
    fogColor: "#ffffff",
    fogDensity: 0.005,
    envIntensity: 0.65,
    fineCenter: 0x94a3b8,
    fineGrid: 0xcbd5e1,
    fineOpacity: 0.9,
    coarseCenter: 0x003ecb,
    coarseGrid: 0x475569,
    coarseOpacity: 0.68,
    ambientColor: "#ffffff",
    ambientIntensity: 0.62,
    hemiSky: "#f8fafc",
    hemiGround: "#64748b",
    hemiIntensity: 0.44,
    cubeColor: "#ffffff",
    cubeStroke: "#003ecb",
    cubeText: "#000000",
    cubeHover: "#0f766e",
  },
};

export function resolveCanvasBackdrop(mode: CanvasBgMode | undefined, themeId: ThemeId): CanvasBackdrop {
  if (!mode || mode === "auto") {
    switch (themeId) {
      case "light":
        return BACKDROPS.studio;
      case "warm":
        return BACKDROPS.warm;
      case "hc-dark":
        return BACKDROPS["hc-dark"];
      case "hc-light":
        return BACKDROPS["hc-light"];
      case "evol":
      default:
        return BACKDROPS.space;
    }
  }
  return BACKDROPS[mode] ?? BACKDROPS.space;
}
