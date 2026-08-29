import React, { useEffect, useMemo, useRef } from "react";
import type { YouTubePlayer } from "react-youtube";

import { usePlayerStore } from "./store";
import { useLyrics, type PersistLyricsSelection } from "./hooks/useLyrics";
import type { useDragPosition } from "./hooks/useDragPosition";
import { pickNextTrackIdx } from "./utils/queueOrder";

import PillView from "./components/PillView";
import PanelHeader from "./components/PanelHeader";
import VideoView from "./components/VideoView";
import LyricsPanel from "./components/LyricsPanel";
import TransportControls from "./components/TransportControls";
import ModeRow from "./components/ModeRow";
import VolumeSlider from "./components/VolumeSlider";
import ProgressBar from "./components/ProgressBar";
import QueueList from "./QueueList";

import "./NowPlaying.css";

export type { Track } from "./types";

interface Props {
  drag: ReturnType<typeof useDragPosition>;
  onPersistLyrics: PersistLyricsSelection;
}

export default function NowPlaying({ drag, onPersistLyrics }: Props) {
  const queue = usePlayerStore((s) => s.queue);
  const order = usePlayerStore((s) => s.order);
  const currentIdx = usePlayerStore((s) => s.currentIdx);
  const mode = usePlayerStore((s) => s.mode);
  const playing = usePlayerStore((s) => s.playing);
  const curTime = usePlayerStore((s) => s.curTime);
  const duration = usePlayerStore((s) => s.duration);
  const volume = usePlayerStore((s) => s.volume);
  const view = usePlayerStore((s) => s.view);
  const expanded = usePlayerStore((s) => s.expanded);
  const showUnmute = usePlayerStore((s) => s.showUnmute);

  const setOrder = usePlayerStore((s) => s.setOrder);
  const setMode = usePlayerStore((s) => s.setMode);
  const setView = usePlayerStore((s) => s.setView);
  const setExpanded = usePlayerStore((s) => s.setExpanded);
  const setShowUnmute = usePlayerStore((s) => s.setShowUnmute);
  const setVolumeValue = usePlayerStore((s) => s.setVolume);
  const setProgress = usePlayerStore((s) => s.setProgress);
  const setPlaying = usePlayerStore((s) => s.setPlaying);
  const advance = usePlayerStore((s) => s.advance);
  const playIdx = usePlayerStore((s) => s.playIdx);
  const reshuffle = usePlayerStore((s) => s.reshuffle);
  const close = usePlayerStore((s) => s.close);

  const playerRef = useRef<YouTubePlayer | null>(null);
  const track = queue[currentIdx];
  const lyrics = useLyrics(track, curTime, onPersistLyrics);

  // Keep the next track cued in a hidden player for a snappier transition
  // when it comes up — same intent as the old preload player.
  const nextIdx = useMemo(() => pickNextTrackIdx(order, mode, currentIdx), [order, mode, currentIdx]);
  const nextTrack = nextIdx !== null ? queue[nextIdx] : undefined;

  function handleReady(e: { target: YouTubePlayer }) {
    playerRef.current = e.target;
    try { e.target.setVolume(volume); } catch {}
    setTimeout(() => {
      try { if (e.target.isMuted()) setShowUnmute(true); } catch {}
    }, 500);
  }

  function handleStateChange(e: { data: number }) {
    // YT.PlayerState: -1 unstarted, 0 ended, 1 playing, 2 paused, 3 buffering, 5 cued
    if (e.data === 1) setPlaying(true);
    else if (e.data === 2) setPlaying(false);
    else if (e.data === 0) handleEnded();
  }

  function handleEnded() {
    if (mode === "repeatTrack") {
      try { playerRef.current?.seekTo(0, true); playerRef.current?.playVideo(); } catch {}
    } else {
      advance(1);
    }
  }

  // Poll playback progress every 500ms — same cadence as before.
  useEffect(() => {
    const id = setInterval(() => {
      const p = playerRef.current;
      if (!p?.getCurrentTime) return;
      try {
        const cur = p.getCurrentTime();
        const dur = p.getDuration();
        if (dur > 0) setProgress(cur, dur);
      } catch {}
    }, 500);
    return () => clearInterval(id);
  }, [setProgress]);

  // Re-center the widget's saved position whenever it resizes between
  // pill <-> panel, so it doesn't drift off-screen or overlap content.
  useEffect(() => {
    const id = requestAnimationFrame(() => drag.applySavedPosition(true));
    return () => cancelAnimationFrame(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expanded]);

  function togglePlayPause() {
    const p = playerRef.current;
    if (!p) return;
    try {
      const state = p.getPlayerState();
      if (state === 1) p.pauseVideo(); else p.playVideo();
    } catch {}
  }

  function seekToFraction(frac: number) {
    const p = playerRef.current;
    if (!p) return;
    try { p.seekTo(frac * p.getDuration(), true); } catch {}
  }

  function seekToTime(seconds: number) {
    try { playerRef.current?.seekTo(seconds, true); } catch {}
  }

  function handleVolumeChange(v: number) {
    setVolumeValue(v);
    try { playerRef.current?.setVolume(v); } catch {}
  }

  function unmuteNow() {
    try { playerRef.current?.unMute(); } catch {}
    setShowUnmute(false);
  }

  function closeWidget() {
    try { playerRef.current?.stopVideo?.(); } catch {}
    close();
  }

  if (!track) return null;

  return (
    <div>
      <PillView
        track={track}
        playing={playing}
        visible={!expanded}
        onPointerDownDrag={drag.startDrag}
        onTap={() => { if (!drag.wasJustDragged()) setExpanded(true); }}
        onTogglePlayPause={togglePlayPause}
      />

      <div id="panel" className={expanded ? "panel-visible" : "panel-hidden"} style={{ display: expanded ? "block" : "none" }}>
        <div className="panel-inner">
          <PanelHeader
            view={view}
            onViewChange={setView}
            onPointerDownDrag={drag.startDrag}
            onTap={() => { if (!drag.wasJustDragged()) setExpanded(false); }}
            onResetPos={drag.resetPos}
            onClose={closeWidget}
            snapEnabled={drag.snapEnabled}
            onToggleSnap={drag.setSnapMode}
          />

          {showUnmute && (
            <div id="unmute-banner" onClick={unmuteNow}>Sound off — tap to unmute</div>
          )}

          <VideoView
            visible={view === "video"}
            track={track}
            nextVideoId={nextTrack?.video_id}
            onReady={handleReady}
            onStateChange={handleStateChange}
          />
          <LyricsPanel visible={view === "lyrics"} track={track} lyrics={lyrics} onSeek={seekToTime} />

          <p className="np-track-title" title={track.title}>{track.title}</p>

          <ProgressBar curTime={curTime} duration={duration} onSeekFraction={seekToFraction} />

          <TransportControls
            track={track}
            playing={playing}
            onPrev={() => advance(-1)}
            onNext={() => advance(1)}
            onTogglePlayPause={togglePlayPause}
          />

          <ModeRow mode={mode} onModeChange={setMode} onReshuffle={reshuffle} />

          <VolumeSlider volume={volume} onChange={handleVolumeChange} />

          <QueueList order={order} queue={queue} currentTrackIdx={currentIdx} onReorder={setOrder} onPlay={playIdx} />
        </div>
      </div>
    </div>
  );
}
