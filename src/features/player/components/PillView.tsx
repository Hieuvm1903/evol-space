import React from "react";
import { Button, Typography } from "antd";
import { PlayCircleFilled, PauseCircleFilled } from "@ant-design/icons";
import type { Track } from "../types";
import GlassSurface from "../../../components/GlassSurface";

interface Props {
  track: Track;
  playing: boolean;
  visible: boolean;
  onPointerDownDrag: (e: React.PointerEvent) => void;
  onTap: () => void;
  onTogglePlayPause: () => void;
}

export default function PillView({ track, playing, visible, onPointerDownDrag, onTap, onTogglePlayPause }: Props) {
  return (
    <div id="pill-wrap" style={{ display: visible ? "block" : "none" }}>
      <GlassSurface
        borderRadius={999}
        height={50}
        width={260}
        blur={10}
        backgroundOpacity={0.25}
        saturation={1.6}
        distortionScale={-180}
        redOffset={0}
        greenOffset={10}
        blueOffset={20}
        brightness={50}
        opacity={100}
        mixBlendMode="screen"
      >
        <div
          id="pill"
          title="Drag to move · tap to expand"
          onPointerDown={onPointerDownDrag}
          onClick={onTap}
        >
          <span className={`pill-eq${playing ? " pill-eq-playing" : ""}`} aria-hidden="true">
            <span className="pill-eq-bar" />
            <span className="pill-eq-bar" />
            <span className="pill-eq-bar" />
            <span className="pill-eq-bar" />
          </span>
          <Typography.Text id="pill-title" ellipsis style={{ flex: 1, color: "#e6e6e6", fontSize: 12, fontWeight: 600 }}>
            {track.title}
          </Typography.Text>
          <span className="spin-disk-wrap spin-disk-sm">
            <span
              className={`spin-disk${playing ? " spin-disk-playing" : ""}`}
              style={track.thumbnail_url ? { backgroundImage: `url(${track.thumbnail_url})` } : undefined}
            />
            <Button
              type="text" shape="circle" size="small"
              style={{ color: "#22d3ee", position: "relative", zIndex: 1 }}
              icon={playing ? <PauseCircleFilled /> : <PlayCircleFilled />}
              onClick={(e) => { e.stopPropagation(); onTogglePlayPause(); }}
            />
          </span>
        </div>
      </GlassSurface>
    </div>
  );
}