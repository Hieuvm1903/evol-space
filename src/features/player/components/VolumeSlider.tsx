import React from "react";
import { Volume, Volume1, Volume2, VolumeX } from "lucide-react";

interface Props {
  volume: number;
  onChange: (v: number) => void;
}

export default function VolumeSlider({ volume, onChange }: Props) {
  const Icon = volume === 0 ? VolumeX : volume < 33 ? Volume : volume < 66 ? Volume1 : Volume2;
  return (
    <div id="volume-row">
      <Icon size={14} color="#9c97b8" />
      <input
        type="range"
        className="np-range"
        min={0}
        max={100}
        value={volume}
        onChange={(e) => onChange(parseInt(e.target.value, 10))}
        aria-label="Volume"
      />
    </div>
  );
}
