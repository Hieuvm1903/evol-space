import React, { useRef, useState } from "react";
import { motion, animate, useMotionValue, useMotionValueEvent, useTransform } from "framer-motion";
import "./ElasticSlider.css";

// Adapted from react-bits' ElasticSlider — ported to framer-motion (already
// a dependency here; the upstream version imports "motion/react" +
// @chakra-ui/react + react-icons, none of which this project has) and
// made CONTROLLED (value/onChange/onChangeComplete) instead of the
// upstream's internal-state-only version, since NowPlaying.tsx and
// VolumeRow.tsx both need to drive this from live playback state.
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
  const [region, setRegion] = useState<"left" | "middle" | "right">("middle");
  const [dragging, setDragging] = useState(false);

  const clientX = useMotionValue(0);
  const overflow = useMotionValue(0);
  const scale = useMotionValue(1);

  useMotionValueEvent(clientX, "change", (latest: number) => {
    const el = sliderRef.current;
    if (!el) return;
    const { left, right } = el.getBoundingClientRect();
    let newOverflow: number;
    if (latest < left) { setRegion("left"); newOverflow = left - latest; }
    else if (latest > right) { setRegion("right"); newOverflow = latest - right; }
    else { setRegion("middle"); newOverflow = 0; }
    overflow.jump(decay(newOverflow, MAX_OVERFLOW));
  });

  function valueFromClientX(x: number): number {
    const el = sliderRef.current;
    if (!el) return value;
    const { left, width } = el.getBoundingClientRect();
    const raw = min + ((x - left) / width) * (max - min);
    return Math.min(Math.max(raw, min), max);
  }

  function handlePointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (e.buttons <= 0 || !sliderRef.current) return;
    clientX.jump(e.clientX);
    onChange(Math.round(valueFromClientX(e.clientX)));
  }

  function handlePointerDown(e: React.PointerEvent<HTMLDivElement>) {
    setDragging(true);
    clientX.jump(e.clientX);
    onChange(Math.round(valueFromClientX(e.clientX)));
    e.currentTarget.setPointerCapture(e.pointerId);
  }

  function handlePointerUp() {
    if (!dragging) return;
    setDragging(false);
    animate(overflow, 0, { type: "spring", bounce: 0.5 });
    onChangeComplete?.(value);
  }

  const percent = ((value - min) / (max - min)) * 100;

  return (
    <motion.div
      onHoverStart={() => animate(scale, 1)}
      onHoverEnd={() => animate(scale, 1)}
      onTouchStart={() => animate(scale, 1)}
      onTouchEnd={() => animate(scale, 1)}
      style={{ scale}}
      className={`elastic-slider ${className}`}
    >
      {leftIcon && (
        <motion.span
          className="elastic-slider-icon"
          animate={{ scale: region === "left" ? [1, 1.3, 1] : 1 }}
          transition={{ duration: 0.25 }}
          style={{ x: useTransform(() => (region === "left" ? -overflow.get() / scale.get() : 0)) }}
        >
          {leftIcon}
        </motion.span>
      )}

      <div
        ref={sliderRef}
        className="elastic-slider-track-wrap"
        onPointerMove={handlePointerMove}
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onLostPointerCapture={handlePointerUp}
      >
        <motion.div
          className="elastic-slider-track-scale"
          style={{
            scaleX: useTransform(() => {
              const el = sliderRef.current;
              if (!el) return 1;
              return 1 + overflow.get() / el.getBoundingClientRect().width;
            }),
            scaleY: useTransform(overflow, [0, MAX_OVERFLOW], [1, 0.8]),
            transformOrigin: useTransform(() => {
              const el = sliderRef.current;
              if (!el) return "center";
              const { left, width } = el.getBoundingClientRect();
              return clientX.get() < left + width / 2 ? "right" : "left";
            }),
          }}
        >
          <div className="elastic-slider-track" style={{ height: trackHeight }}>
            <div className="elastic-slider-fill" style={{ width: `${percent}%` }} />
            <div
              className={`elastic-slider-thumb${dragging ? " dragging" : ""}`}
              style={{ left: `${percent}%` }}
            />
          </div>
        </motion.div>
      </div>

      {rightIcon && (
        <motion.span
          className="elastic-slider-icon"
          animate={{ scale: region === "right" ? [1, 1.3, 1] : 1 }}
          transition={{ duration: 0.25 }}
          style={{ x: useTransform(() => (region === "right" ? overflow.get() / scale.get() : 0)) }}
        >
          {rightIcon}
        </motion.span>
      )}
    </motion.div>
  );
}