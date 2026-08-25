import { EDGE_MARGIN } from "../constants";

// Was: window.parent.document.querySelector(".st-key-now_playing_drawer")
// That selector matched a class Streamlit's iframe machinery applied to
// the HOST page's container (this component used to render inside an
// iframe, with "parent" meaning the real page). There's no iframe now —
// this component renders directly in the page — so it's just a normal
// element lookup. PlayerProvider.tsx renders the widget inside
// <div id="now-playing-widget">, which is what this looks for.
export function getContainer(): HTMLElement | null {
  return document.getElementById("now-playing-widget");
}

export function pointFromEvent(e: MouseEvent | TouchEvent): { x: number; y: number } | null {
  if ("touches" in e) {
    const t = e.touches[0] ?? e.changedTouches[0];
    if (!t) return null;
    return { x: t.screenX, y: t.screenY };
  }
  return { x: e.screenX, y: e.screenY };
}

export function clampToViewport(left: number, top: number, w: number, h: number, vw: number, vh: number) {
  return {
    left: Math.min(Math.max(left, EDGE_MARGIN), Math.max(EDGE_MARGIN, vw - w - EDGE_MARGIN)),
    top: Math.min(Math.max(top, EDGE_MARGIN), Math.max(EDGE_MARGIN, vh - h - EDGE_MARGIN)),
  };
}
