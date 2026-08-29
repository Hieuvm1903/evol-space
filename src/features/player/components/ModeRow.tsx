import React from "react";
import { List, Repeat1, Repeat, Shuffle } from "lucide-react";
import type { Mode } from "../types";

interface Props {
  mode: Mode;
  onModeChange: (m: Mode) => void;
  onReshuffle: () => void;
}

const OPTIONS: { value: Mode; label: string; icon: typeof List }[] = [
  { value: "normal", label: "Normal", icon: List },
  { value: "repeatTrack", label: "Repeat one", icon: Repeat1 },
  { value: "repeatAll", label: "Repeat all", icon: Repeat },
];

export default function ModeRow({ mode, onModeChange, onReshuffle }: Props) {
  return (
    <div id="mode-row">
      <div className="np-segmented">
        {OPTIONS.map((opt) => {
          const Icon = opt.icon;
          return (
            <button
              key={opt.value}
              type="button"
              className={`np-segmented-btn${mode === opt.value ? " active" : ""}`}
              title={opt.label}
              onClick={() => onModeChange(opt.value)}
            >
              <Icon size={14} />
            </button>
          );
        })}
      </div>
      <button type="button" className="np-icon-btn np-shuffle-btn" title="Shuffle queue" onClick={onReshuffle}>
        <Shuffle size={14} />
      </button>
    </div>
  );
}
