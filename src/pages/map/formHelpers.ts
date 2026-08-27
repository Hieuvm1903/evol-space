import type { Place } from "../../lib/placesService";
import { splitIcon, DEFAULT_ICON_NAME, DEFAULT_COLOR } from "../../content/placeIcons";
import type { FormState } from "./types";

export function emptyForm(prefill?: { lat: number; lon: number }): FormState {
  return {
    editId: null,
    name: "",
    lat: prefill ? prefill.lat.toFixed(6) : "20.834955",
    lon: prefill ? prefill.lon.toFixed(6) : "106.718237",
    description: "",
    iconName: DEFAULT_ICON_NAME,
    color: DEFAULT_COLOR,
    tags: "",
  };
}

export function formFromPlace(p: Place): FormState {
  const { name, color } = splitIcon(p.icon);
  return {
    editId: p.id, name: p.name, lat: String(p.lat), lon: String(p.lon),
    description: p.description, iconName: name, color, tags: p.tags,
  };
}

export function tagSuggestions(value: string, allTags: string[]): string[] {
  const parts = value.split(",").map((t) => t.trim());
  const current = (parts[parts.length - 1] ?? "").toLowerCase();
  const already = new Set(parts.slice(0, -1).map((t) => t.toLowerCase()).filter(Boolean));
  return allTags
    .filter((t) => !already.has(t.toLowerCase()) && t.toLowerCase().includes(current))
    .slice(0, 8);
}

export function applyTagSuggestion(value: string, picked: string): string {
  const parts = value.split(",").map((t) => t.trim());
  parts[parts.length - 1] = picked;
  return parts.filter(Boolean).join(", ") + ", ";
}

export function splitLatLonPair(value: string): { lat: string; lon: string } | null {
  if (!value.includes(",")) return null;
  const parts = value.split(",").map((s) => s.trim());
  if (parts.length !== 2) return null;
  const [a, b] = parts;
  if (!a || !b || Number.isNaN(parseFloat(a)) || Number.isNaN(parseFloat(b))) return null;
  return { lat: a, lon: b };
}