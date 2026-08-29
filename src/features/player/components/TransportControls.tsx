import React from "react";
import { SkipBack, SkipForward, Play, Pause } from "lucide-react";
import type { Track } from "../types";

interface Props {
  track: Track;
  playing: boolean;
  onPrev: () => void;
  onNext: () => void;
  onTogglePlayPause: () => void;
}

export default function TransportControls({ track, playing, onPrev, onNext, onTogglePlayPause }: Props) {
  return (
    <div id="controls-row">
      <button type="button" className="np-icon-btn" onClick={onPrev} aria-label="Previous track">
        <SkipBack size={16} />
      </button>
      <span className="spin-disk-wrap spin-disk-lg">
        <span
          className={`spin-disk${playing ? " spin-disk-playing" : ""}`}
          style={track.thumbnail_url ? { backgroundImage: `url(${track.thumbnail_url})` } : undefined}
        />
        <button
          type="button"
          className="np-icon-btn np-icon-btn-primary"
          style={{ position: "relative", zIndex: 1 }}
          onClick={onTogglePlayPause}
          aria-label={playing ? "Pause" : "Play"}
        >
          {playing ? <Pause size={18} /> : <Play size={18} />}
        </button>
      </span>
      <button type="button" className="np-icon-btn" onClick={onNext} aria-label="Next track">
        <SkipForward size={16} />
      </button>
    </div>
  );
}
