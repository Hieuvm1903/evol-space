import React, { useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronUp, Gauge, X } from "lucide-react";
import type { PerfStats } from "../../lib/workTypes";

interface TelemetryHudProps {
  stats: PerfStats | null;
  backend: string;
  expanded: boolean;
  onToggleExpanded: () => void;
  onClose: () => void;
}

const MAX_SAMPLES = 28;

function formatCompact(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 10_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}

export default function TelemetryHud({
  stats,
  backend,
  expanded,
  onToggleExpanded,
  onClose,
}: TelemetryHudProps) {
  const [fpsHistory, setFpsHistory] = useState<number[]>([]);

  useEffect(() => {
    if (!stats || stats.fps <= 0) return;
    setFpsHistory((prev) => {
      const next = [...prev, stats.fps];
      return next.length > MAX_SAMPLES ? next.slice(next.length - MAX_SAMPLES) : next;
    });
  }, [stats]);

  const fps = stats?.fps ?? 0;
  const fpsTier = fps <= 0 ? "idle" : fps < 30 ? "low" : fps < 50 ? "warn" : "good";

  const sparkline = useMemo(() => {
    if (fpsHistory.length < 2) return "";
    const maxVal = Math.max(60, ...fpsHistory);
    const w = 100;
    const h = 24;
    return fpsHistory
      .map((v, i) => {
        const x = (i / (MAX_SAMPLES - 1)) * w;
        const y = h - Math.max(2, Math.min(h - 2, (v / maxVal) * (h - 4) + 2));
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(" ");
  }, [fpsHistory]);

  return (
    <div className={`work-telemetry-hud evol-glass-card${expanded ? "" : " compact"}`}>
      <div className="work-telemetry-head">
        <button
          type="button"
          className="work-telemetry-summary"
          onClick={onToggleExpanded}
          title={expanded ? "Collapse telemetry HUD" : "Expand telemetry HUD"}
        >
          <Gauge size={13} className={`work-telemetry-ico is-${fpsTier}`} />
          <span className={`work-telemetry-fps is-${fpsTier}`}>{fps > 0 ? fps : "—"}</span>
          <span className="work-telemetry-unit">FPS</span>
          <span className="work-telemetry-ms">{stats ? `${stats.frameMs.toFixed(1)} ms` : "— ms"}</span>
          {!expanded && stats && (
            <span className="work-telemetry-pill">
              {stats.calls} draws · {formatCompact(stats.triangles)} tris
            </span>
          )}
          <span className="work-telemetry-chev">
            {expanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
          </span>
        </button>
        <button
          type="button"
          className="work-telemetry-close"
          onClick={onClose}
          title="Hide telemetry HUD"
          aria-label="Hide telemetry HUD"
        >
          <X size={12} />
        </button>
      </div>

      {expanded && (
        <div className="work-telemetry-body">
          {sparkline && (
            <div className="work-telemetry-chart">
              <svg viewBox="0 0 100 24" preserveAspectRatio="none" aria-hidden="true">
                <line x1="0" y1="12" x2="100" y2="12" className="work-telemetry-guide" />
                <polyline points={sparkline} className={`work-telemetry-line is-${fpsTier}`} />
              </svg>
            </div>
          )}

          {stats ? (
            <div className="work-telemetry-grid">
              <div className="work-telemetry-cell">
                <span>Draw calls</span>
                <b>{stats.calls}</b>
              </div>
              <div className="work-telemetry-cell">
                <span>Triangles</span>
                <b>{formatCompact(stats.triangles)}</b>
              </div>
              <div className="work-telemetry-cell">
                <span>Instances</span>
                <b>{stats.instTotal}</b>
              </div>
              <div className="work-telemetry-cell">
                <span>Dynamic</span>
                <b>{stats.dynamic}</b>
              </div>
              <div className="work-telemetry-cell">
                <span>LOD N/M/F</span>
                <b>{stats.instNear}/{stats.instMid}/{stats.instFar}</b>
              </div>
              <div className="work-telemetry-cell">
                <span>Culled</span>
                <b>{stats.instCulled}</b>
              </div>
              <div className="work-telemetry-cell">
                <span>Geo / Tex</span>
                <b>{stats.geometries}/{stats.textures}</b>
              </div>
              <div className="work-telemetry-cell">
                <span>{stats.heapMb !== undefined ? "JS Heap" : "Backend"}</span>
                <b>{stats.heapMb !== undefined ? `${stats.heapMb} MB` : (backend || "WebGL2")}</b>
              </div>
            </div>
          ) : (
            <div className="work-telemetry-wait">Sampling frames…</div>
          )}
        </div>
      )}
    </div>
  );
}
