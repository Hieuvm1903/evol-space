import React from "react";
import type { ModelStats } from "./types";

export default function StatsHud({ fps, stats, modelName }: { fps: number; stats: ModelStats | null; modelName?: string }) {
  return (
    <div className="work-hud">
      <div className="work-hud-row">
        <span>FPS</span>
        <span className={fps > 0 && fps < 30 ? "work-hud-fps low" : "work-hud-fps"}>{fps || "—"}</span>
      </div>
      {stats && (
        <>
          <div className="work-hud-row"><span>Triangles</span><span>{stats.triangles.toLocaleString()}</span></div>
          <div className="work-hud-row"><span>Vertices</span><span>{stats.vertices.toLocaleString()}</span></div>
          <div className="work-hud-row"><span>Objects</span><span>{stats.objects}</span></div>
        </>
      )}
      {modelName && <div className="work-hud-row"><span>Model</span><span title={modelName} style={{ maxWidth: 90, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{modelName}</span></div>}
    </div>
  );
}