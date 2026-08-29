import React, { useState } from "react";
import { formatTime } from "../utils/time";

interface Props {
  curTime: number;
  duration: number;
  onSeekFraction: (frac: number) => void;
}

export default function ProgressBar({ curTime, duration, onSeekFraction }: Props) {
  const [dragValue, setDragValue] = useState<number | null>(null);
  const livePercent = duration ? (curTime / duration) * 100 : 0;
  const percent = dragValue ?? livePercent;

  function commit(e: React.SyntheticEvent<HTMLInputElement>) {
    const v = parseFloat((e.target as HTMLInputElement).value);
    onSeekFraction(v / 100);
    // Give the player a moment to report the new curTime before handing
    // display back to the live value, avoiding a visible snap-back.
    setTimeout(() => setDragValue(null), 300);
  }

  return (
    <div id="progress-row">
      <span>{formatTime(curTime)}</span>
      <input
        type="range"
        className="np-range np-progress-range"
        min={0}
        max={100}
        step={0.1}
        value={percent}
        style={{ ["--fill" as any]: `${percent}%` }}
        onChange={(e) => setDragValue(parseFloat(e.target.value))}
        onMouseUp={commit}
        onTouchEnd={commit}
        aria-label="Seek"
      />
      <span>{formatTime(duration)}</span>
    </div>
  );
}
