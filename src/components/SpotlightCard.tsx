import React, { useRef } from "react";
import "./SpotlightCard.css";

interface SpotlightCardProps extends React.HTMLAttributes<HTMLDivElement> {
  /** "r, g, b" string — defaults to galaxy violet */
  glowColor?: string;
  children: React.ReactNode;
}

// Small react-bits-style primitive: a card that tracks the cursor and
// renders a soft radial glow under it. No extra dependency needed — just
// a ref + a couple of CSS custom properties updated on mousemove.
export default function SpotlightCard({
  glowColor = "139, 111, 245",
  className = "",
  children,
  ...rest
}: SpotlightCardProps) {
  const ref = useRef<HTMLDivElement>(null);

  function handleMouseMove(e: React.MouseEvent<HTMLDivElement>) {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    el.style.setProperty("--spot-x", `${e.clientX - rect.left}px`);
    el.style.setProperty("--spot-y", `${e.clientY - rect.top}px`);
  }

  return (
    <div
      ref={ref}
      className={`spotlight-card ${className}`}
      style={{ ["--spot-color" as any]: glowColor }}
      onMouseMove={handleMouseMove}
      {...rest}
    >
      {children}
    </div>
  );
}