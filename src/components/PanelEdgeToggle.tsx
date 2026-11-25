import React, { useRef, useState } from "react";
import { ChevronsLeft, ChevronsRight } from "lucide-react";

interface PanelEdgeToggleProps {
  collapsed: boolean;
  onToggle: () => void;
  side?: "left" | "right";
  label?: string;
  className?: string;
}

export function PanelEdgeToggle({
  collapsed,
  onToggle,
  side = "left",
  label,
  className = "",
}: PanelEdgeToggleProps) {
  const btnRef = useRef<HTMLButtonElement>(null);
  const [badgeY, setBadgeY] = useState<number | null>(null);

  const showRightChevron = side === "left" ? collapsed : !collapsed;
  const title = label ?? (collapsed ? "Expand panel" : "Collapse panel");

  return (
    <button
      ref={btnRef}
      type="button"
      className={`panel-edge-toggle${collapsed ? " is-collapsed" : ""}${className ? ` ${className}` : ""}`}
      onClick={onToggle}
      onPointerMove={(e) => {
        if (e.pointerType !== "mouse" || !btnRef.current) return;
        const rect = btnRef.current.getBoundingClientRect();
        if (rect.height <= 48) return;
        const clamped = Math.max(24, Math.min(rect.height - 24, e.clientY - rect.top));
        setBadgeY(clamped);
      }}
      title={title}
      aria-label={title}
      aria-expanded={!collapsed}
    >
      <span className="panel-edge-line" aria-hidden="true" />
      <span
        className="panel-edge-badge"
        style={badgeY !== null ? { top: `${badgeY}px` } : undefined}
        aria-hidden="true"
      >
        {showRightChevron ? (
          <ChevronsRight size={16} strokeWidth={2.25} />
        ) : (
          <ChevronsLeft size={16} strokeWidth={2.25} />
        )}
      </span>
    </button>
  );
}
