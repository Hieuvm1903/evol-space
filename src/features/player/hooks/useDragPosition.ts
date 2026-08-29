import { useEffect, useRef, useState } from "react";
import { useMotionValue, useDragControls, animate, type DragControls } from "framer-motion";
import {
  POS_KEY,
  SNAP_MODE_KEY,
  PANEL_WIDTH,
  EDGE_MARGIN,
  TOP_EDGE_MARGIN,
} from "../constants";
import { clampToViewport } from "../utils/dom";
import {
  DEFAULT_SNAP,
  nearestSnapId,
  snapPixelPosition,
  SnapId,
} from "../utils/snapPoints";

// The widget itself is a <motion.div> (see PlayerProvider.tsx) driven by
// the `x`/`y` motion values returned here. Dragging is only ever
// *started* from a handle (the pill or the panel header) via `startDrag`,
// using useDragControls + dragListener={false} on the motion.div — so the
// whole body of the panel isn't draggable, only the handle is.
//
// Snap-on-drop / free positioning / localStorage persistence all work as
// before: drop the widget and it eases into the nearest of 8 dock points
// (or, with snap off, wherever you released it, clamped to the viewport).

function readSnapModePref(): boolean {
  try {
    const raw = localStorage.getItem(SNAP_MODE_KEY);
    return raw === null ? true : raw === "1"; // default: snap on
  } catch {
    return true;
  }
}

function readSavedPosition(
  w: number, h: number, vw: number, vh: number,
): { left: number; top: number } {
  try {
    const raw = localStorage.getItem(POS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed.snap === "string") {
        return snapPixelPosition(parsed.snap as SnapId, w, h, vw, vh, EDGE_MARGIN, TOP_EDGE_MARGIN);
      }
      if (parsed && typeof parsed.leftFrac === "number") {
        return clampToViewport(parsed.leftFrac * vw, parsed.topFrac * vh, w, h, vw, vh, TOP_EDGE_MARGIN);
      }
    }
  } catch {}
  return snapPixelPosition(DEFAULT_SNAP, w, h, vw, vh, EDGE_MARGIN, TOP_EDGE_MARGIN);
}

export function useDragPosition(containerRef: React.RefObject<HTMLElement>) {
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const dragControls = useDragControls();

  const [snapEnabled, setSnapEnabled] = useState<boolean>(readSnapModePref);
  const snapEnabledRef = useRef(snapEnabled);
  useEffect(() => { snapEnabledRef.current = snapEnabled; }, [snapEnabled]);

  // Set (not cleared until next tick) whenever a real drag happened, so
  // handle components can suppress the click/tap that follows pointerup
  // after an actual drag — but not after a plain tap (framer never fires
  // onDragStart for a tap, since it hasn't crossed the drag threshold).
  const justDraggedRef = useRef(false);

  function currentSize() {
    const el = containerRef.current;
    return { w: el?.offsetWidth || PANEL_WIDTH, h: el?.offsetHeight || 60 };
  }

  function applySavedPosition(animated = false) {
    const { w, h } = currentSize();
    // If the container hasn't actually been laid out yet (0×0 — e.g. this
    // fires the instant the panel swaps in from display:none, before the
    // browser has committed a layout pass), bail and retry next frame
    // instead of computing a position from bogus dimensions.
    if (w === 0 || h === 0) {
      requestAnimationFrame(() => applySavedPosition(animated));
      return;
    }
    const vw = window.innerWidth, vh = window.innerHeight;
    const { left, top } = readSavedPosition(w, h, vw, vh);
    if (animated) {
      animate(x, left, { type: "spring", bounce: 0.25, duration: 0.35 });
      animate(y, top, { type: "spring", bounce: 0.25, duration: 0.35 });
    } else {
      x.set(left);
      y.set(top);
    }
  }

  useEffect(() => { applySavedPosition(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const onResize = () => applySavedPosition();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function saveSnap(id: SnapId) {
    try { localStorage.setItem(POS_KEY, JSON.stringify({ snap: id })); } catch {}
  }
  function saveFree(left: number, top: number, vw: number, vh: number) {
    try { localStorage.setItem(POS_KEY, JSON.stringify({ leftFrac: left / vw, topFrac: top / vh })); } catch {}
  }

  function resetPos() {
    try { localStorage.removeItem(POS_KEY); } catch {}
    applySavedPosition(true);
  }

  function setSnapMode(enabled: boolean) {
    setSnapEnabled(enabled);
    try { localStorage.setItem(SNAP_MODE_KEY, enabled ? "1" : "0"); } catch {}

    const el = containerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const vw = window.innerWidth, vh = window.innerHeight;

    if (enabled) {
      const id = nearestSnapId(rect.left, rect.top, rect.width, rect.height, vw, vh, EDGE_MARGIN, TOP_EDGE_MARGIN);
      const { left, top } = snapPixelPosition(id, rect.width, rect.height, vw, vh, EDGE_MARGIN, TOP_EDGE_MARGIN);
      animate(x, left, { type: "spring", bounce: 0.25, duration: 0.3 });
      animate(y, top, { type: "spring", bounce: 0.25, duration: 0.3 });
      saveSnap(id);
    } else {
      saveFree(rect.left, rect.top, vw, vh);
    }
  }

  function handleDragStart() {
    justDraggedRef.current = true;
  }

  function handleDragEnd() {
    const el = containerRef.current;
    if (el) {
      const rect = el.getBoundingClientRect();
      const vw = window.innerWidth, vh = window.innerHeight;

      if (snapEnabledRef.current) {
        const id = nearestSnapId(rect.left, rect.top, rect.width, rect.height, vw, vh, EDGE_MARGIN, TOP_EDGE_MARGIN);
        const { left, top } = snapPixelPosition(id, rect.width, rect.height, vw, vh, EDGE_MARGIN, TOP_EDGE_MARGIN);
        animate(x, left, { type: "spring", bounce: 0.25, duration: 0.3 });
        animate(y, top, { type: "spring", bounce: 0.25, duration: 0.3 });
        saveSnap(id);
      } else {
        const { left, top } = clampToViewport(rect.left, rect.top, rect.width, rect.height, vw, vh, TOP_EDGE_MARGIN);
        x.set(left);
        y.set(top);
        saveFree(left, top, vw, vh);
      }
    }
    // Clear on next tick, after any click/tap the pointerup generated has
    // had a chance to check the flag.
    setTimeout(() => { justDraggedRef.current = false; }, 0);
  }

  // Handle components call this from onPointerDown. It starts a
  // framer-motion drag on the widget even though dragListener={false} is
  // set on the widget itself — the standard "custom drag handle" pattern.
  function startDrag(e: React.PointerEvent, dragControlsRef: DragControls = dragControls) {
    const target = e.target as HTMLElement;
    if (target.closest("button, .header-view-toggle, .header-snap-toggle")) return;
    dragControlsRef.start(e);
  }

  function wasJustDragged() {
    return justDraggedRef.current;
  }

  return {
    x, y, dragControls,
    startDrag, handleDragStart, handleDragEnd, wasJustDragged,
    resetPos, applySavedPosition, snapEnabled, setSnapMode,
  };
}
