import React, { useId } from "react";
import "./LongPressRing.css";

interface Props {
  size?: number;
  strokeWidth?: number;
  durationMs?: number;
}

/**
 * Circular fill indicator shown while a row is being held, so the
 * 1.5s long-press-to-select gesture is visible instead of a silent
 * wait. Mount it conditionally via `longPress.isPressing(id)`:
 *
 *   {longPress.selectMode ? (
 *     <SelectCheckbox checked={longPress.isSelected(item.id)} />
 *   ) : longPress.isPressing(item.id) ? (
 *     <LongPressRing />
 *   ) : null}
 *
 * It mounts fresh on every press (React remounts it because the parent
 * conditional flips false->true), so the fill animation always restarts
 * cleanly from empty — no manual reset logic needed. Releasing early
 * just unmounts it before the animation completes.
 */
export default function LongPressRing({ size = 20, strokeWidth = 2.5, durationMs = 1500 }: Props) {
  const gradId = `lp-ring-grad-${useId()}`;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;

  return (
    <svg
      className="long-press-ring"
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      style={{
        ["--lp-duration" as any]: `${durationMs}ms`,
        ["--lp-circumference" as any]: circumference,
      }}
    >
      <defs>
        <linearGradient id={gradId} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#8b6ff5" />
          <stop offset="100%" stopColor="#22d3ee" />
        </linearGradient>
      </defs>
      <circle
        className="long-press-ring-track"
        cx={size / 2}
        cy={size / 2}
        r={radius}
        strokeWidth={strokeWidth}
        fill="none"
      />
      <circle
        className="long-press-ring-fill"
        cx={size / 2}
        cy={size / 2}
        r={radius}
        strokeWidth={strokeWidth}
        fill="none"
        stroke={`url(#${gradId})`}
        strokeDasharray={circumference}
        strokeDashoffset={circumference}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
    </svg>
  );
}