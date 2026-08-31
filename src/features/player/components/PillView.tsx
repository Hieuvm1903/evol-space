import React from "react";
import { Play, Pause } from "lucide-react";
import type { Track } from "../types";
import GlassSurface from "../../../components/GlassSurface";
import FoldText from "../../../components/FoldText";

interface Props {
  track: Track;
  playing: boolean;
  visible: boolean;
  onPointerDownDrag: (e: React.PointerEvent) => void;
  onTap: () => void;
  onTogglePlayPause: () => void;
}

export default function PillView({ track, playing, visible, onPointerDownDrag, onTap, onTogglePlayPause }: Props) {
  return (
    <div id="pill-wrap" style={{ display: visible ? "block" : "none" }}>
      <div id="pill" title="Drag to move · tap to expand" onPointerDown={onPointerDownDrag} onClick={onTap}>
        <GlassSurface
          width="100%"
          height="100%"
          borderRadius={999}
          brightness={60}
          opacity={0.9}
          forceFallback
        >
          <span className={`pill-eq${playing ? " pill-eq-playing" : ""}`} aria-hidden="true">
            <span className="pill-eq-bar" /><span className="pill-eq-bar" /><span className="pill-eq-bar" /><span className="pill-eq-bar" />
          </span>
          <span id="pill-title"><FoldText
            text={track.title}
            splitBy="char"
            hinge="top"
            trigger="hover"
            duration={0.65}
            stagger={0.045}
            ease="power3.out"
            perspective={100}
            creaseShading={0.55}
            fontSize={10}
            fontWeight={800}
            color="#f7f2e8"
          /></span>
          <span className="spin-disk-wrap spin-disk-sm">
            <span
              className={`spin-disk${playing ? " spin-disk-playing" : ""}`}
              style={track.thumbnail_url ? { backgroundImage: `url(${track.thumbnail_url})` } : undefined}
            />
            <button
              className="np-icon-btn np-icon-btn-ghost"
              style={{ position: "relative", zIndex: 1 }}
              onClick={(e) => { e.stopPropagation(); onTogglePlayPause(); }}
              aria-label={playing ? "Pause" : "Play"}
            >
              {playing ? <Pause size={14} /> : <Play size={14} />}
            </button>
          </span>
        </GlassSurface>
      </div>
    </div>
  );
}