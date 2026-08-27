import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import L from "leaflet";
import { iconForName } from "../../content/placeIcons";

// Glowing lucide-icon markers, cached per icon+color pair so we only pay
// the renderToStaticMarkup cost once per distinct combination, not once
// per place.
const markerIconCache = new Map<string, L.DivIcon>();

export function glowDivIcon(iconName: string, colorHex: string, opacity = 1): L.DivIcon {
  const key = `${iconName}|${colorHex}|${opacity}`;
  const cached = markerIconCache.get(key);
  if (cached) return cached;
  const Icon = iconForName(iconName);
  const svg = renderToStaticMarkup(<Icon size={16} color="#fff" strokeWidth={2.4} />);
  const html = `
       <div class="galaxy-marker cursor-target" style="--marker-color:${colorHex};opacity:${opacity}">

      <div class="galaxy-marker-glow"></div>
      <div class="galaxy-marker-pin">${svg}</div>
    </div>`;
  const icon = L.divIcon({ html, className: "galaxy-marker-wrap", iconSize: [36, 36], iconAnchor: [18, 34] });
  markerIconCache.set(key, icon);
  return icon;
}
