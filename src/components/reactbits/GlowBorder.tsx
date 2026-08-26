import React, { useCallback, useEffect, useRef } from "react";
import "./GlowBorder.css";

// Reactbits-style "Border Glow": a conic-gradient ring, masked down to just
// the border, that only rotates while `active` (e.g. a track is playing).
// The mouse-tracked bloom on hover is written directly to the DOM via a
// throttled rAF instead of React state — this component wraps the
// draggable pill/panel, and updating state on every raw mousemove was
// forcing a re-render on every pixel of pointer movement, which starved
// useDragPosition's own rAF loop and made dragging look like a teleport
// (no visible movement until drop). Writing a CSS custom property
// directly sidesteps React entirely for this purely cosmetic effect.
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
  colors = ["#8b6ff5", "#22d3ee", "#e879f9", "#8b6ff5"],
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
        ["--glow-gradient" as any]: `conic-gradient(from 0deg, ${colors.join(", ")})`,
        ...style,
      }}
    >
      <div className="glow-border-ring" style={{ borderRadius }} />
      <div className="glow-border-content" style={{ borderRadius: Math.max(borderRadius - 1, 0) }}>
        {children}
      </div>
    </div>
  );
}