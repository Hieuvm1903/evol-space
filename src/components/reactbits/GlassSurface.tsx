import React, { useEffect, useId, useState } from "react";
import "./GlassSurface.css";

// Reactbits-style "Glass Surface": layers a backdrop-filter blur/saturate
// with an SVG feDisplacementMap filter referenced via `backdrop-filter:
// url(#id) blur(...)` for a subtle liquid-glass refraction. Support for
// referencing an SVG filter from backdrop-filter is inconsistent across
// browsers (best in Chromium/Firefox, unsupported in some), so this
// feature-detects via CSS.supports and falls back to a clean blur+saturate
// glass look everywhere else — same graceful-degradation approach the
// original reactbits component takes.
interface GlassSurfaceProps {
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
  borderRadius?: number;
  blur?: number;
  distortionScale?: number;
  brightness?: number;
  saturation?: number;
  backgroundOpacity?: number;
}

function supportsSvgBackdropFilter(): boolean {
  if (typeof CSS === "undefined" || !CSS.supports) return false;
  return CSS.supports("backdrop-filter", "url(#x)") || CSS.supports("-webkit-backdrop-filter", "url(#x)");
}

export default function GlassSurface({
  children,
  className = "",
  style,
  borderRadius = 16,
  blur = 14,
  distortionScale = 22,
  brightness = 1.05,
  saturation = 1.5,
  backgroundOpacity = 0.28,
}: GlassSurfaceProps) {
  const rawId = useId().replace(/:/g, "");
  const filterId = `glass-surface-filter-${rawId}`;
  const [useSvgFilter, setUseSvgFilter] = useState(false);

  useEffect(() => { setUseSvgFilter(supportsSvgBackdropFilter()); }, []);

  const backdropFilter = useSvgFilter
    ? `url(#${filterId}) blur(${blur}px) brightness(${brightness}) saturate(${saturation})`
    : `blur(${blur}px) brightness(${brightness}) saturate(${saturation})`;

  return (
    <div
      className={`glass-surface ${className}`}
      style={{
        borderRadius,
        backdropFilter,
        WebkitBackdropFilter: backdropFilter,
        background: `rgba(20, 18, 33, ${backgroundOpacity})`,
        ...style,
      }}
    >
      {useSvgFilter && (
        <svg className="glass-surface-defs" aria-hidden="true">
          <filter id={filterId} colorInterpolationFilters="sRGB" x="-20%" y="-20%" width="140%" height="140%">
            <feTurbulence type="fractalNoise" baseFrequency="0.008 0.012" numOctaves={2} seed={7} result="noise" />
            <feGaussianBlur in="noise" stdDeviation={3} result="blurredNoise" />
            <feDisplacementMap
              in="SourceGraphic" in2="blurredNoise" scale={distortionScale}
              xChannelSelector="R" yChannelSelector="G"
            />
          </filter>
        </svg>
      )}
      <div className="glass-surface-sheen" />
      <div className="glass-surface-content" style={{ borderRadius }}>
        {children}
      </div>
    </div>
  );
}