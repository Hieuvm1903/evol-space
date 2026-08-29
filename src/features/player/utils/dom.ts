import { EDGE_MARGIN } from "../constants";

export function getContainer(): HTMLElement | null {
  return document.getElementById("now-playing-widget");
}

export function pointFromEvent(e: MouseEvent | TouchEvent): { x: number; y: number } | null {
  if ("touches" in e) {
    const t = e.touches[0] ?? e.changedTouches[0];
    if (!t) return null;
    return { x: t.clientX, y: t.clientY };
  }
  return { x: e.clientX, y: e.clientY };
}

export function clampToViewport(
  left: number, top: number, w: number, h: number, vw: number, vh: number, topMargin: number = EDGE_MARGIN
) {
  return {
    left: Math.min(Math.max(left, EDGE_MARGIN), Math.max(EDGE_MARGIN, vw - w - EDGE_MARGIN)),
    top: Math.min(Math.max(top, topMargin), Math.max(topMargin, vh - h - EDGE_MARGIN)),
  };
}
