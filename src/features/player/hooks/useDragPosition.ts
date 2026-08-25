import { useEffect, useRef, useState } from "react";
import { POS_KEY, SNAP_MODE_KEY, DRAG_THRESHOLD, PANEL_WIDTH, EDGE_MARGIN } from "../constants";
import { getContainer, pointFromEvent, clampToViewport } from "../utils/dom";
import { DEFAULT_SNAP, nearestSnapId, snapPixelPosition, SnapId } from "../utils/snapPoints";

type DragMeta = {
  el: HTMLElement; origLeft: number; origTop: number; w: number; h: number; vw: number; vh: number;
  startX: number; startY: number;
  raf: number | null; dx: number; dy: number; moved: boolean;
  cleanup: () => void;
};

// NOTE on this whole file: the original version talked to `window.parent`
// everywhere because it ran inside a Streamlit component iframe — "this
// document" (the iframe) and "the real page" (window.parent) were two
// different documents, and drag events needed listeners on BOTH so a fast
// drag that left the iframe's small bounds didn't get dropped. Now that
// this renders directly in the page, `window`/`document` ARE the real
// page, so every `window.parent.X` below just becomes `X` — including
// deleting the old "also attach to window.parent.document" duplicate
// listeners, since there's only one document to listen on.

function readSnapModePref(): boolean {
  try {
    const raw = localStorage.getItem(SNAP_MODE_KEY);
    return raw === null ? true : raw === "1"; // default: snap on
  } catch {
    return true;
  }
}

// Handles the floating widget's position. Two modes, toggled by the user
// (see the header switch): "snap" docks to one of 8 fixed points on
// drop (utils/snapPoints.ts); "free" is drop-it-anywhere, clamped to the
// viewport. Both persist under the same POS_KEY, distinguished by shape
// ({snap: id} vs {leftFrac, topFrac}).
export function useDragPosition() {
  const dragMeta = useRef<DragMeta | null>(null);
  const lastDragMoved = useRef(false);

  const [snapEnabled, setSnapEnabled] = useState<boolean>(readSnapModePref);
  const snapEnabledRef = useRef(snapEnabled);
  useEffect(() => { snapEnabledRef.current = snapEnabled; }, [snapEnabled]);

  function applyPos(left: number, top: number) {
    const el = getContainer();
    if (!el) return;
    el.style.right = "auto";
    el.style.transform = "";
    el.style.left = `${left}px`;
    el.style.top = `${top}px`;
  }

  function applyPosAnimated(left: number, top: number) {
    const el = getContainer();
    if (!el) return;
    el.classList.add("evol-snapping");
    applyPos(left, top);
    window.setTimeout(() => el.classList.remove("evol-snapping"), 220);
  }

  function saveSnap(id: SnapId) {
    try { localStorage.setItem(POS_KEY, JSON.stringify({ snap: id })); } catch { }
  }

  function saveFree(left: number, top: number, vw: number, vh: number) {
    try { localStorage.setItem(POS_KEY, JSON.stringify({ leftFrac: left / vw, topFrac: top / vh })); } catch { }
  }

  function resetPos() {
    const el = getContainer();
    if (el) { el.style.transform = ""; el.style.left = ""; el.style.top = ""; el.style.right = ""; }
    try { localStorage.removeItem(POS_KEY); } catch { }
  }

  function applySavedPosition() {
    try {
      const raw = localStorage.getItem(POS_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      const el = getContainer();
      if (!el) return;
      const w = el.offsetWidth || PANEL_WIDTH, h = el.offsetHeight || 60;
      const vw = window.innerWidth, vh = window.innerHeight;

      if (parsed && typeof parsed.snap === "string") {
        const { left, top } = snapPixelPosition(parsed.snap as SnapId, w, h, vw, vh, EDGE_MARGIN);
        applyPos(left, top);
      } else if (parsed && typeof parsed.leftFrac === "number") {
        const { left, top } = clampToViewport(parsed.leftFrac * vw, parsed.topFrac * vh, w, h, vw, vh);
        applyPos(left, top);
      }
    } catch { }
  }

  useEffect(() => { applySavedPosition(); }, []);

  useEffect(() => {
    const onResize = () => applySavedPosition();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  function setSnapMode(enabled: boolean) {
    setSnapEnabled(enabled);
    try { localStorage.setItem(SNAP_MODE_KEY, enabled ? "1" : "0"); } catch { }

    const el = getContainer();
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const vw = window.innerWidth, vh = window.innerHeight;

    if (enabled) {
      const id = nearestSnapId(rect.left, rect.top, rect.width, rect.height, vw, vh, EDGE_MARGIN);
      const { left, top } = snapPixelPosition(id, rect.width, rect.height, vw, vh, EDGE_MARGIN);
      applyPosAnimated(left, top);
      saveSnap(id);
    } else {
      saveFree(rect.left, rect.top, vw, vh);
    }
  }

  function startDrag(e: React.MouseEvent | React.TouchEvent, onTap: () => void) {
    if ((e.target as HTMLElement).closest("button, .header-view-toggle, .header-snap-toggle")) return;
    const el = getContainer();
    if (!el) return;

    const start = pointFromEvent(e.nativeEvent as MouseEvent | TouchEvent);
    if (!start) return;

    const rect = el.getBoundingClientRect();
    const vw = window.innerWidth, vh = window.innerHeight;

    const onMove = (ev: MouseEvent | TouchEvent) => {
      const m = dragMeta.current;
      if (!m) return;
      const p = pointFromEvent(ev);
      if (!p) return;
      if ("touches" in ev) ev.preventDefault();
      const rawLeft = m.origLeft + (p.x - m.startX);
      const rawTop = m.origTop + (p.y - m.startY);
      const { left, top } = clampToViewport(rawLeft, rawTop, m.w, m.h, m.vw, m.vh);
      m.dx = left - m.origLeft;
      m.dy = top - m.origTop;
      if (Math.abs(m.dx) > DRAG_THRESHOLD || Math.abs(m.dy) > DRAG_THRESHOLD) m.moved = true;
      if (!m.raf) {
        m.raf = requestAnimationFrame(() => {
          if (!dragMeta.current) return;
          dragMeta.current.raf = null;
          dragMeta.current.el.style.transform =
            `translate3d(${dragMeta.current.dx}px, ${dragMeta.current.dy}px, 0)`;
        });
      }
    };

    const finishDrag = () => {
      const m = dragMeta.current;
      if (!m) return;
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("touchmove", onMove);
      document.removeEventListener("mouseup", finishDrag);
      document.removeEventListener("touchend", finishDrag);
      if (m.raf) cancelAnimationFrame(m.raf);
      try { m.el.classList.remove("evol-dragging"); } catch { }
      try { document.body.style.userSelect = ""; } catch { }
      if (m.moved) {
        m.el.style.transform = "";
        const rawLeft = m.origLeft + m.dx, rawTop = m.origTop + m.dy;
        if (snapEnabledRef.current) {
          const snapId = nearestSnapId(rawLeft, rawTop, m.w, m.h, m.vw, m.vh, EDGE_MARGIN);
          const { left, top } = snapPixelPosition(snapId, m.w, m.h, m.vw, m.vh, EDGE_MARGIN);
          applyPosAnimated(left, top);
          saveSnap(snapId);
        } else {
          applyPos(rawLeft, rawTop);
          saveFree(rawLeft, rawTop, m.vw, m.vh);
        }
      }
      lastDragMoved.current = m.moved;
      dragMeta.current = null;
      if (!m.moved) onTap();
    };

    dragMeta.current = {
      el, origLeft: rect.left, origTop: rect.top, w: rect.width, h: rect.height, vw, vh,
      startX: start.x, startY: start.y,
      raf: null, dx: 0, dy: 0, moved: false,
      cleanup: finishDrag,
    };
    el.classList.add("evol-dragging");
    try { document.body.style.userSelect = "none"; } catch { }

    document.addEventListener("mousemove", onMove);
    document.addEventListener("touchmove", onMove, { passive: false });
    document.addEventListener("mouseup", finishDrag);
    document.addEventListener("touchend", finishDrag);
  }

  useEffect(() => {
    return () => { dragMeta.current?.cleanup(); };
  }, []);

  return { startDrag, resetPos, applySavedPosition, snapEnabled, setSnapMode };
}
