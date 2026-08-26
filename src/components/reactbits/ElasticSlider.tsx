import React, { useCallback, useRef, useState } from "react";
import { motion, useMotionValue, useTransform, animate } from "framer-motion";
import "./ElasticSlider.css";

// Reactbits-style "Elastic Slider": dragging past either end doesn't hard-
// stop — the track stretches (scaleX/scaleY) and the thumb lags behind via
// a decayed overflow value, then springs back to shape on release. The
// decay curve (a sigmoid) gives the classic rubber-band resistance instead
// of linear overshoot.
const MAX_OVERFLOW = 40;

function decay(value: number, max: number): number {
  if (max === 0) return 0;
  const entry = value / max;
  const sigmoid = 2 * (1 / (1 + Math.exp(-entry)) - 0.5);
  return sigmoid * max;
}

interface ElasticSliderProps {
  value: number;
  min?: number;
  max?: number;
  onChange: (v: number) => void;
  onChangeComplete?: (v: number) => void;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  className?: string;
  trackHeight?: number;
}

export default function ElasticSlider({
  value,
  min = 0,
  max = 100,
  onChange,
  onChangeComplete,
  leftIcon,
  rightIcon,
  className = "",
  trackHeight = 6,
}: ElasticSliderProps) {
  const sliderRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);

  const overflow = useMotionValue(0);
  const scaleY = useTransform(overflow, (v:any) => 1 + Math.min(Math.abs(v) / 60, 0.35));
  const scaleX = useTransform(overflow, (v:any) => 1 + Math.min(Math.abs(v) / 300, 0.15));
  const thumbShift = useTransform(overflow, (v:any) => v * 0.4);

  const percent = ((value - min) / (max - min)) * 100;

  const setFromClientX = useCallback(
    (clientX: number) => {
      const el = sliderRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      let raw = ((clientX - rect.left) / rect.width) * 100;

      let rawOverflow = 0;
      if (raw < 0) { rawOverflow = raw; raw = 0; }
      else if (raw > 100) { rawOverflow = raw - 100; raw = 100; }

      overflow.set(decay(rawOverflow, MAX_OVERFLOW));
      const next = Math.round(min + (raw / 100) * (max - min));
      onChange(next);
    },
    [min, max, onChange, overflow]
  );

  function handlePointerDown(e: React.PointerEvent) {
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    setDragging(true);
    setFromClientX(e.clientX);
  }
  function handlePointerMove(e: React.PointerEvent) {
    if (!dragging) return;
    setFromClientX(e.clientX);
  }
  function handlePointerUp() {
    if (!dragging) return;
    setDragging(false);
    animate(overflow, 0, { type: "spring", stiffness: 500, damping: 30 });
    onChangeComplete?.(value);
  }

  return (
    <div className={`elastic-slider ${className}`}>
      {leftIcon && <span className="elastic-slider-icon">{leftIcon}</span>}
      <motion.div
        ref={sliderRef}
        className="elastic-slider-track-wrap"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        style={{ scaleX, scaleY, touchAction: "none" }}
      >
        <div className="elastic-slider-track" style={{ height: trackHeight }}>
          <div className="elastic-slider-fill" style={{ width: `${percent}%` }} />
          <motion.div
            className={`elastic-slider-thumb${dragging ? " dragging" : ""}`}
            style={{ left: `${percent}%`, x: thumbShift }}
          />
        </div>
      </motion.div>
      {rightIcon && <span className="elastic-slider-icon">{rightIcon}</span>}
    </div>
  );
}