import { useEffect, useRef } from "react";
import { useMapEvents, useMap } from "react-leaflet";

export function MapEvents({ onRightClick, onLeftClick, onViewChange }: {
  onRightClick: (lat: number, lon: number) => void;
  onLeftClick: () => void;
  onViewChange?: (center: [number, number], zoom: number) => void;
}) {
  const map = useMapEvents({
    contextmenu(e) { onRightClick(e.latlng.lat, e.latlng.lng); },
    click() { onLeftClick(); },
    moveend() {
      const c = map.getCenter();
      onViewChange?.([c.lat, c.lng], map.getZoom());
    },
    zoomend() {
      const c = map.getCenter();
      onViewChange?.([c.lat, c.lng], map.getZoom());
    },
  });
  return null;
}

export function MapDragLock({ locked }: { locked: boolean }) {
  const map = useMap();
  useEffect(() => {
    if (locked) map.dragging.disable();
    else map.dragging.enable();
  }, [locked, map]);
  return null;
}

export function CursorCoordinatesTool({ onMove }: { onMove: (lat: number, lng: number) => void }) {
  useMapEvents({
    mousemove(e) { onMove(e.latlng.lat, e.latlng.lng); },
  });
  return null;
}

export function MeasureTool({ onAddPoint, onClear }: {
  onAddPoint: (lat: number, lng: number) => void;
  onClear: () => void;
}) {
  useMapEvents({
    click(e) { onAddPoint(e.latlng.lat, e.latlng.lng); },
    dblclick() { onClear(); },
  });
  return null;
}

export function SketchTool({ onStart, onExtend, onEnd }: {
  onStart: (lat: number, lng: number) => void;
  onExtend: (lat: number, lng: number) => void;
  onEnd: () => void;
}) {
  const drawingRef = useRef(false);
  useMapEvents({
    mousedown(e) { drawingRef.current = true; onStart(e.latlng.lat, e.latlng.lng); },
    mousemove(e) { if (drawingRef.current) onExtend(e.latlng.lat, e.latlng.lng); },
    mouseup() { drawingRef.current = false; onEnd(); },
  });
  return null;
}
