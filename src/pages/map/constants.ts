import {
  Sun, Moon, MapIcon, Satellite, Mountain, Maximize2, Ruler, Compass, PenLine, type LucideIcon,
} from "lucide-react";
import type { MapMode, MapTool } from "./types";

export const DEFAULT_CENTER: [number, number] = [16.0, 106.0];
export const DEFAULT_ZOOM = 5;

export const MAP_MODE_OPTIONS: { value: MapMode; label: string; icon: LucideIcon }[] = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
  { value: "street", label: "Street", icon: MapIcon },
  { value: "satellite", label: "Satellite", icon: Satellite },
  { value: "terrain", label: "Terrain", icon: Mountain },
];

export const MAP_TILE_CONFIG: Record<MapMode, { url: string; attribution: string }> = {
  light: {
    url: "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png",
    attribution: '&copy; <a href="https://carto.com/">CARTO</a>',
  },
  dark: {
    url: "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
    attribution: '&copy; <a href="https://carto.com/">CARTO</a>',
  },
  street: {
    url: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  },
  satellite: {
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    attribution: "Tiles &copy; Esri — Source: Esri, Maxar, Earthstar Geographics",
  },
  terrain: {
    url: "https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png",
    attribution: '&copy; <a href="https://opentopomap.org">OpenTopoMap</a> (CC-BY-SA)',
  },
};

export const MAP_TOOL_OPTIONS: { value: MapTool; label: string; icon: LucideIcon }[] = [
  { value: "fullscreen", label: "Full screen", icon: Maximize2 },
  { value: "measure", label: "Measure distance", icon: Ruler },
  { value: "coordinates", label: "Cursor coordinates", icon: Compass },
  { value: "draw", label: "Draw / sketch", icon: PenLine },
];

export const MAP_MODE_KEY = "evol_map_mode";
export const MAP_TOOLS_KEY = "evol_map_tools";

export function readMapMode(): MapMode {
  try {
    const raw = localStorage.getItem(MAP_MODE_KEY);
    return (raw as MapMode) || "dark";
  } catch {
    return "dark";
  }
}

export function readMapTools(): MapTool[] {
  try {
    const raw = localStorage.getItem(MAP_TOOLS_KEY);
    return raw ? (JSON.parse(raw) as MapTool[]) : [];
  } catch {
    return [];
  }
}
