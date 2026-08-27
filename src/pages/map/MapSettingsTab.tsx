import React from "react";
import { Switch, Typography } from "antd";
import { MAP_MODE_OPTIONS, MAP_TOOL_OPTIONS } from "./constants";
import type { MapMode, MapTool } from "./types";

const { Text } = Typography;

interface Props {
  mapMode: MapMode;
  onMapModeChange: (mode: MapMode) => void;
  activeTools: MapTool[];
  onActiveToolsChange: (tools: MapTool[]) => void;
}

export default function MapSettingsTab({ mapMode, onMapModeChange, activeTools, onActiveToolsChange }: Props) {
  return (
    <div className="map-sidebar-body" style={{ paddingTop: 14 }}>
      <Text style={{ fontSize: 12, color: "#9c97b8" }}>Map mode</Text>
      <div className="map-mode-grid">
        {MAP_MODE_OPTIONS.map((opt) => {
          const Icon = opt.icon;
          return (
            <button
              key={opt.value}
              type="button"
              className={`map-mode-btn cursor-target${mapMode === opt.value ? " active" : ""}`}
              onClick={() => onMapModeChange(opt.value)}
            >
              <Icon size={16} />
              <span>{opt.label}</span>
            </button>
          );
        })}
      </div>

      <Text style={{ fontSize: 12, color: "#9c97b8", display: "block", marginTop: 18 }}>Map tools</Text>
      <div className="map-tool-list">
        {MAP_TOOL_OPTIONS.map((opt) => {
          const Icon = opt.icon;
          const checked = activeTools.includes(opt.value);
          return (
            <div key={opt.value} className="map-tool-row">
              <span className="map-tool-row-label">
                <Icon size={15} />
                {opt.label}
              </span>
              <Switch
                size="small"
                checked={checked}
                onChange={(v) =>
                  onActiveToolsChange(v ? [...activeTools, opt.value] : activeTools.filter((t) => t !== opt.value))
                }
              />
            </div>
          );
        })}
      </div>

      <Text style={{ fontSize: 11.5, color: "#7d78a0", display: "block", marginTop: 10 }}>
        Measure: click points on the map, double-click to clear. Draw: click-drag on the map to sketch; panning is disabled while it's on.
      </Text>
    </div>
  );
}
