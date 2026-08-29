import React from "react";
import { X, Video, FileText } from "lucide-react";
import type { View } from "../types";

interface Props {
  view: View;
  onViewChange: (v: View) => void;
  onPointerDownDrag: (e: React.PointerEvent) => void;
  onTap: () => void;
  onResetPos: () => void;
  onClose: () => void;
  snapEnabled: boolean;
  onToggleSnap: (enabled: boolean) => void;
}

export default function PanelHeader({
  view, onViewChange, onPointerDownDrag, onTap, onResetPos, onClose,
  snapEnabled, onToggleSnap,
}: Props) {
  return (
    <div
      className="panel-header"
      title="Drag to move · tap to collapse"
      onPointerDown={onPointerDownDrag}
      onClick={onTap}
    >
      <span className="drag-grip" onDoubleClick={(e) => { e.stopPropagation(); onResetPos(); }}>⠿</span>
      <span className="panel-title">Now Playing</span>

      <button
        type="button"
        className={`np-snap-toggle${snapEnabled ? " active" : ""}`}
        title={snapEnabled ? "Snap to edges: on" : "Snap to edges: off"}
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => { e.stopPropagation(); onToggleSnap(!snapEnabled); }}
      >
        <span className="np-snap-toggle-dot" />
      </button>

      <div
        className="header-view-toggle np-segmented"
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          className={`np-segmented-btn${view === "video" ? " active" : ""}`}
          title="Video"
          onClick={() => onViewChange("video")}
        >
          <Video size={13} />
        </button>
        <button
          type="button"
          className={`np-segmented-btn${view === "lyrics" ? " active" : ""}`}
          title="Lyrics"
          onClick={() => onViewChange("lyrics")}
        >
          <FileText size={13} />
        </button>
      </div>

      <button
        type="button"
        className="np-icon-btn np-close-btn"
        onClick={(e) => { e.stopPropagation(); onClose(); }}
        title="Close"
      >
        <X size={14} />
      </button>
    </div>
  );
}
