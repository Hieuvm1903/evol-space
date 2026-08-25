import React, { useMemo, useState } from "react";

/**
 * GalaxyRing
 * Imperfect ring, flush-edge gap, draws in black, glows with a galaxy
 * gradient while drawing, flashes on finish, glow fades out, then the
 * line itself turns white. No background of any kind — just the ring,
 * drop it into whatever backdrop you already have.
 */
const GalaxyRing = ({
  size = 400,
  strokeWidth = 18,
  duration = 2.8,
  minRadius = 152,
  className = "",
}) => {
  const [animKey, setAnimKey] = useState(0);

  const maxRadius = minRadius + strokeWidth;
  const cx = size / 2;
  const cy = size / 2;

  const { pathD, pathLength } = useMemo(() => {
    const points = [];
    const steps = 360;

    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const angle = Math.PI / 2 + t * 2 * Math.PI;
      const r = minRadius + (maxRadius - minRadius) * t;

      const x = cx + r * Math.cos(angle);
      const y = cy + r * Math.sin(angle);

      points.push(`${i === 0 ? "M" : "L"} ${x.toFixed(3)} ${y.toFixed(3)}`);
    }

    const approxLength = ((minRadius + maxRadius) / 2) * 2 * Math.PI;
    return { pathD: points.join(" "), pathLength: approxLength };
  }, [cx, cy, minRadius, maxRadius]);

  const flashPoint = useMemo(() => {
    const angle = Math.PI / 2 + 2 * Math.PI;
    const r = maxRadius;
    return { x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle) };
  }, [cx, cy, maxRadius]);

  const restart = () => setAnimKey((k) => k + 1);

  const fadeTail = 0.9;
  const totalGlow = duration + fadeTail;
  const drawFraction = ((duration / totalGlow) * 100).toFixed(2);

  const gradientId = "galaxy-ring-grad";
  const glowFilterId = "galaxy-ring-glow-blur";

  return (
    <div className={className} style={{ position: "relative", width: size, display: "inline-block" }}>
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        style={{ display: "block" }}
        onClick={restart}
      >
        <defs>
          <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#1e1b4b" />
            <stop offset="30%" stopColor="#6d28d9" />
            <stop offset="60%" stopColor="#c026d3" />
            <stop offset="85%" stopColor="#db2777" />
            <stop offset="100%" stopColor="#22d3ee" />
          </linearGradient>
          <filter id={glowFilterId} x="-100%" y="-100%" width="300%" height="300%">
            <feGaussianBlur stdDeviation="8" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="blur" />
            </feMerge>
          </filter>
        </defs>

        {/* glow trail — galaxy gradient, follows the drawing, then fades out */}
        <path
          key={`glow-${animKey}`}
          d={pathD}
          fill="none"
          stroke={`url(#${gradientId})`}
          strokeWidth={strokeWidth * 2}
          strokeLinecap="round"
          filter={`url(#${glowFilterId})`}
          style={{
            strokeDasharray: pathLength,
            strokeDashoffset: pathLength,
            opacity: 0,
            animation: `gr-draw ${duration}s ease-in-out forwards,
                        gr-glow-fade ${totalGlow}s ease-in-out forwards`,
          }}
        />

        {/* finish flash */}
        <circle
          key={`flash-${animKey}`}
          cx={flashPoint.x}
          cy={flashPoint.y}
          r={strokeWidth * 0.9}
          fill="#e0aaff"
          filter={`url(#${glowFilterId})`}
          style={{
            opacity: 0,
            animation: `gr-flash 0.6s ease-out forwards`,
            animationDelay: `${duration - 0.05}s`,
          }}
        />

        {/* crisp line — black while drawing, turns white once finished */}
        <path
          key={`line-${animKey}`}
          d={pathD}
          fill="none"
          stroke="#111"
          strokeWidth={strokeWidth}
          strokeLinecap="butt"
          strokeLinejoin="miter"
          style={{
            strokeDasharray: pathLength,
            strokeDashoffset: pathLength,
            animation: `gr-draw ${duration}s ease-in-out forwards,
                        gr-line-color 0.4s ease-in-out forwards`,
            animationDelay: `0s, ${duration}s`,
          }}
        />

        <style>{`
          @keyframes gr-draw {
            to { stroke-dashoffset: 0; }
          }
          @keyframes gr-glow-fade {
            0% { opacity: 0; }
            10% { opacity: 0.85; }
            ${drawFraction}% { opacity: 0.85; }
            100% { opacity: 0; }
          }
          @keyframes gr-flash {
            0% { opacity: 0; transform: scale(0.6); }
            35% { opacity: 1; transform: scale(1.6); }
            100% { opacity: 0; transform: scale(2.4); }
          }
          @keyframes gr-line-color {
            from { stroke: #111; }
            to { stroke: #fff; }
          }
        `}</style>
      </svg>
    </div>
  );
};

export default GalaxyRing;