import React, { useCallback, useEffect, useRef } from "react";
import "./GlowBorder.css";

// Reactbits-style "Border Glow". Two independent effects, both written
// straight to the DOM (never React state) so neither fights the drag
// code's own rAF loop:
//  1. A masked gradient ring (padding-box + mask-composite exclude) whose
//     colors slowly DRIFT via background-position — never rotated. A full
//     transform: rotate() on this kind of masked ring is what produced the
//     stray diagonal seam artifacts before; animating background-position
//     instead can never look like spinning, by construction.
//  2. A mouse-tracked radial bloom on hover, position written via
//     CSS custom properties in a throttled requestAnimationFrame.
interface GlowBorderProps {
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
  borderRadius?: number;
  colors?: string[];
  active?: boolean;
}

export default function GlowBorder({
  children,
  className = "",
  style,
  borderRadius = 16,
  colors = ["#8b6ff5", "#22d3ee", "#e879f9"],
  active = false,
}: GlowBorderProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number | null>(null);
  const pendingRef = useRef<{ x: number; y: number } | null>(null);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    const el = wrapRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    pendingRef.current = {
      x: ((e.clientX - rect.left) / rect.width) * 100,
      y: ((e.clientY - rect.top) / rect.height) * 100,
    };
    if (rafRef.current) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null;
      const p = pendingRef.current;
      const node = wrapRef.current;
      if (p && node) {
        node.style.setProperty("--glow-x", `${p.x}%`);
        node.style.setProperty("--glow-y", `${p.y}%`);
      }
    });
  }, []);

  useEffect(() => () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); }, []);

  return (
    <div
      ref={wrapRef}
      className={`glow-border-wrap${active ? " glow-border-active" : ""} ${className}`}
      onMouseMove={handleMouseMove}
      style={{
        borderRadius,
        ["--glow-c1" as any]: colors[0],
        ["--glow-c2" as any]: colors[1] ?? colors[0],
        ["--glow-c3" as any]: colors[2] ?? colors[0],
        ...style,
      }}
    >
      <div className="glow-border-ring" style={{ borderRadius }} />
      <div className="glow-border-content" style={{ borderRadius: Math.max(borderRadius - 1.5, 0) }}>
        {children}
      </div>
    </div>
  );
}