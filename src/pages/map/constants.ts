import {
  Sun, Moon, MapIcon, Compass as CompassMapIcon, Satellite, Layers, Mountain, Globe,
  Maximize2, Ruler, Compass, PenLine, type LucideIcon,
} from "lucide-react";
import type { MapMode, MapTool } from "./types";

export const DEFAULT_CENTER: [number, number] = [16.0, 106.0];
export const DEFAULT_ZOOM = 5;

export interface MapTileConfig {
  url: string;
  overlayUrl?: string;
  attribution: string;
  subdomains?: string;
  maxNativeZoom?: number;
  overlayMaxNativeZoom?: number;
  className?: string;
}

export const MAP_MODE_OPTIONS: { value: MapMode; label: string; icon: LucideIcon }[] = [
  { value: "dark", label: "Dark", icon: Moon },
  { value: "light", label: "Light", icon: Sun },
  { value: "street", label: "Street", icon: MapIcon },
  { value: "osm", label: "OpenStreetMap", icon: CompassMapIcon },
  { value: "satellite", label: "Satellite", icon: Satellite },
  { value: "hybrid", label: "Hybrid", icon: Layers },
  { value: "terrain", label: "Terrain", icon: Mountain },
  { value: "google", label: "Google Maps", icon: Globe },
];

export const MAP_TILE_CONFIG: Record<MapMode, MapTileConfig> = {
  dark: {
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}",
    overlayUrl: "https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}",
    attribution: "Tiles &copy; Esri — Esri, DeLorme, NAVTEQ",
    maxNativeZoom: 16,
    overlayMaxNativeZoom: 16,
    className: "map-tiles-deepdark",
  },
  light: {
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}",
    overlayUrl: "https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Reference/MapServer/tile/{z}/{y}/{x}",
    attribution: "Tiles &copy; Esri — Esri, DeLorme, NAVTEQ",
    maxNativeZoom: 16,
    overlayMaxNativeZoom: 16,
  },
  street: {
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}",
    attribution: "Tiles &copy; Esri — Source: Esri, DeLorme, NAVTEQ, USGS, Intermap, iPC, NRCAN, Esri Japan, METI, Esri China (Hong Kong), Esri (Thailand), TomTom",
    maxNativeZoom: 19,
  },
  osm: {
    url: "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    maxNativeZoom: 19,
  },
  satellite: {
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    attribution: "Tiles &copy; Esri — Source: Esri, Maxar, Earthstar Geographics",
    maxNativeZoom: 19,
  },
  hybrid: {
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    overlayUrl: "https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}",
    attribution: "Tiles &copy; Esri — Source: Esri, Maxar, Earthstar Geographics",
    maxNativeZoom: 19,
    overlayMaxNativeZoom: 17,
  },
  terrain: {
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}",
    attribution: "Tiles &copy; Esri — Esri, HERE, Garmin, Intermap, USGS, METI/NASA",
    maxNativeZoom: 19,
  },
  // Unused — "google" mode renders an <iframe> in MapCanvas instead of a
  // Leaflet TileLayer, so this entry exists only to satisfy the Record type.
  google: { url: "", attribution: "" },
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
    const raw = localStorage.getItem(MAP_MODE_KEY) as MapMode | null;
    return raw && raw in MAP_TILE_CONFIG ? raw : "dark";
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
