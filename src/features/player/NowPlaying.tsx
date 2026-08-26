import React, { useEffect, useRef, useState } from "react";
import { ConfigProvider, theme as antdTheme, Typography } from "antd";

import type { Mode, Track, View } from "./types";
import { EXPANDED_KEY } from "./constants";
import { formatTime } from "./utils/time";
import { shuffleQueue } from "./utils/queueOrder";

import { useDragPosition } from "./hooks/useDragPosition";
import { usePlayerEngine } from "./hooks/usePlayerEngine";
import { useLyrics, PersistLyricsSelection } from "./hooks/useLyrics";

import QueueList from "./QueueList";
import PanelHeader from "./components/PanelHeader";
import VideoView from "./components/VideoView";
import LyricsView from "./components/LyricsView";
import TransportControls from "./components/TransportControls";
import ModeRow from "./components/ModeRow";
import VolumeRow from "./components/VolumeRow";
import PillView from "./components/PillView";

import GlowBorder from "../../components/reactbits/GlowBorder";
import GlassSurface from "../../components/reactbits/GlassSurface";
import ElasticSlider from "../../components/reactbits/ElasticSlider";

import "./NowPlaying.css";

export type { Track };

interface Props {
  queue: Track[];
  initialMode: string;
  onClose: () => void;
  onPersistLyrics: PersistLyricsSelection;
  onEngineUpdate?: (
    state: { mode: Mode; playing: boolean; currentTrackIdx: number },
    controls: { setMode: (m: Mode) => void },
  ) => void;
}

export default function NowPlaying({ queue, initialMode, onClose, onPersistLyrics,onEngineUpdate }: Props) {
  const [expanded, setExpanded] = useState<boolean>(() => {
    try { return localStorage.getItem(EXPANDED_KEY) === "1"; } catch { return false; }
  });
  const [view, setView] = useState<View>("video");
  const rootRef = useRef<HTMLDivElement>(null);
  const pillRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLDivElement>(null);

  // Local seek preview: while the user is dragging the progress slider we
  // show their drag position instead of the live curTime (which is still
  // updating every 500ms from the actual player), so the thumb doesn't
  // fight the drag. Cleared shortly after the real seek lands.
  const [dragProgress, setDragProgress] = useState<number | null>(null);

  const engine = usePlayerEngine(queue, initialMode);
  const { startDrag, resetPos, applySavedPosition, snapEnabled, setSnapMode } = useDragPosition();
  const lyrics = useLyrics(queue, engine.currentTrackIdx, engine.curTime, onPersistLyrics);

  // Bubble the engine's live state (and a way to control it) up to
  // whoever owns this widget — PlayerProvider uses this so external UI
  // (the Music page's Play/Shuffle/Repeat buttons) can steer whatever is
  // already playing instead of only being able to restart it.
  useEffect(() => {
    onEngineUpdate?.(
      { mode: engine.mode, playing: engine.playing, currentTrackIdx: engine.currentTrackIdx },
      { setMode: engine.setMode },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [engine.mode, engine.playing, engine.currentTrackIdx]);

  useEffect(() => {
    const id = requestAnimationFrame(() => applySavedPosition());
    return () => cancelAnimationFrame(id);
  }, [expanded]);

  function toggleExpand(v: boolean) {
    setExpanded(v);
    try { localStorage.setItem(EXPANDED_KEY, v ? "1" : "0"); } catch { }
  }

  function closeWidget() {
    engine.stopVideo();
    onClose();
  }

  function handleSeekFromLyrics(time: number) {
    engine.seekToTime(time);
  }

  if (!queue.length) return null;
  const track = queue[engine.currentTrackIdx];

  const livePercent = engine.duration ? (engine.curTime / engine.duration) * 100 : 0;
  const progressPercent = dragProgress ?? livePercent;

  function handleProgressChange(v: number) {
    setDragProgress(v);
  }
  function handleProgressCommit(v: number) {
    engine.seekToFraction(v / 100);
    // Give the player a moment to report the new curTime before handing
    // display back to the live value, avoiding a visible snap-back.
    setTimeout(() => setDragProgress(null), 300);
  }

  return (
    <ConfigProvider
      theme={{
        algorithm: antdTheme.darkAlgorithm,
        token: { colorPrimary: "#8b6ff5", colorBgContainer: "#14121f", borderRadius: 10 },
      }}
    >
      <div ref={rootRef}>
        <PillView
          track={track}
          playing={engine.playing}
          pillRef={pillRef}
          visible={!expanded}
          onStartDrag={startDrag}
          onExpand={() => toggleExpand(true)}
          onTogglePlayPause={engine.togglePlayPause}
        />

        <div id="panel" className={expanded ? "panel-visible" : "panel-hidden"}>
          <GlowBorder borderRadius={16} active={engine.playing} className="panel-glow">
            <GlassSurface borderRadius={16} blur={16} backgroundOpacity={0.32} className="panel-glass">
              <div className="panel-inner">
                <PanelHeader
                  headerRef={headerRef}
                  view={view}
                  onViewChange={setView}
                  onStartDrag={startDrag}
                  onCollapse={() => toggleExpand(false)}
                  onResetPos={resetPos}
                  onClose={closeWidget}
                  snapEnabled={snapEnabled}
                  onToggleSnap={setSnapMode}
                />

                {engine.showUnmute && (
                  <div id="unmute-banner" onClick={engine.unmuteNow}>Sound off — tap to unmute</div>
                )}

                <VideoView visible={view === "video"} />
                <LyricsView visible={view === "lyrics"} track={track} lyrics={lyrics} onSeek={handleSeekFromLyrics} />

                <Typography.Text ellipsis style={{ display: "block", marginTop: 8, fontWeight: 600, fontSize: 13.5, color: "#e6e6e6" }}>
                  {track.title}
                </Typography.Text>

                <div id="progress-row">
                  <span>{formatTime(engine.curTime)}</span>
                  <ElasticSlider
                    className="progress-elastic-slider"
                    value={progressPercent}
                    onChange={handleProgressChange}
                    onChangeComplete={handleProgressCommit}
                    trackHeight={5}
                  />
                  <span>{formatTime(engine.duration)}</span>
                </div>

                <TransportControls
                  track={track}
                  playing={engine.playing}
                  onPrev={() => engine.advance(-1)}
                  onNext={() => engine.advance(1)}
                  onTogglePlayPause={engine.togglePlayPause}
                />

                <ModeRow
                  mode={engine.mode}
                  onModeChange={engine.setMode}
                  onReshuffle={() => engine.setOrder(shuffleQueue(engine.queueRef.current.length))}
                />

                <VolumeRow volume={engine.volume} onChange={engine.setVolume} />

                <QueueList
                  order={engine.order}
                  queue={queue}
                  currentTrackIdx={engine.currentTrackIdx}
                  onReorder={engine.setOrder}
                  onPlay={engine.playTrackIdx}
                />
              </div>
            </GlassSurface>
          </GlowBorder>
        </div>

        <div id="yt-preload" style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", opacity: 0, pointerEvents: "none" }} />
      </div>
    </ConfigProvider>
  );
}