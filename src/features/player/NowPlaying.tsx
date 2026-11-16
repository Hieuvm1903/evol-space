import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { YouTubePlayer } from "react-youtube";

import { usePlayerStore } from "./store";
import { useLyrics, type PersistLyricsSelection } from "./hooks/useLyrics";
import type { useDragPosition } from "./hooks/useDragPosition";
import { pickNextTrackIdx } from "./utils/queueOrder";
import { notify } from "../../lib/notify";

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
import BorderGlow from "../../components/BorderGlow";

export type { Track } from "./types";

interface Props {
  drag: ReturnType<typeof useDragPosition>;
  onPersistLyrics: PersistLyricsSelection;
}
const GLOW_COLORS = ['#c084fc', '#f472b6', '#38bdf8'];
const LOAD_TIMEOUT_MS = 12000;
const SKIP_DELAY_MS = 350;
const SKIP_NOTICE_KEY = "np-playback-skip";

function youtubeErrorReason(code: number): string {
  switch (code) {
    case 2:
      return "Invalid video ID";
    case 5:
      return "HTML5 player error";
    case 100:
      return "Video removed or private";
    case 101:
    case 150:
      return "Embedding disabled by owner";
    case -100:
      return "YouTube player failed to load";
    case -101:
      return "Failed to initialize video";
    case -102:
      return "Video timed out while loading";
    default:
      return `Playback error (${code})`;
  }
}

export default function NowPlaying({ drag, onPersistLyrics }: Props) {
  const queue = usePlayerStore((s) => s.queue);
  const currentIdx = usePlayerStore((s) => s.currentIdx);
  const mode = usePlayerStore((s) => s.mode);
  const playing = usePlayerStore((s) => s.playing);
  const volume = usePlayerStore((s) => s.volume);
  const view = usePlayerStore((s) => s.view);
  const expanded = usePlayerStore((s) => s.expanded);
  const showUnmute = usePlayerStore((s) => s.showUnmute);

  const reorderQueue = usePlayerStore((s) => s.reorderQueue);
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
  const lyrics = useLyrics(track, onPersistLyrics);

  const [retryNonce, setRetryNonce] = useState(0);
  const [errorBanner, setErrorBanner] = useState<string | null>(null);

  const endHandledRef = useRef(false);
  const playerReadyRef = useRef(false);
  const lastStateRef = useRef<number>(-1);
  const errorHandledRef = useRef(false);
  const failedIndicesRef = useRef<Set<number>>(new Set());
  const skipTimerRef = useRef<number | null>(null);
  const watchdogTimerRef = useRef<number | null>(null);
  const wasActivePlaybackRef = useRef(false);

  const clearTimers = useCallback(() => {
    if (skipTimerRef.current !== null) {
      window.clearTimeout(skipTimerRef.current);
      skipTimerRef.current = null;
    }
    if (watchdogTimerRef.current !== null) {
      window.clearTimeout(watchdogTimerRef.current);
      watchdogTimerRef.current = null;
    }
  }, []);

  useEffect(() => clearTimers, [clearTimers]);

  // Reset consecutive-error tracking when a new queue is loaded.
  useEffect(() => {
    failedIndicesRef.current.clear();
    setErrorBanner(null);
  }, [queue]);

  // Keep the next track cued in a hidden player for a snappier transition
  // when it comes up — same intent as the old preload player.
  const nextIdx = useMemo(() => pickNextTrackIdx(queue.length, mode, currentIdx), [queue.length, mode, currentIdx]);
  const nextTrack = nextIdx !== null ? queue[nextIdx] : undefined;

  const findNextPlayableIdx = useCallback((): number | null => {
    const state = usePlayerStore.getState();
    const qLen = state.queue.length;
    if (qLen <= 1) return null;

    const searchMode = state.mode === "normal" ? "normal" : "repeatAll";
    let candidate: number | null = state.currentIdx;
    for (let step = 0; step < qLen - 1; step++) {
      candidate = pickNextTrackIdx(qLen, searchMode, candidate);
      if (candidate === null) return null;
      if (!failedIndicesRef.current.has(candidate)) return candidate;
    }
    return null;
  }, []);

  const handlePlayerError = useCallback((e: { data: number }) => {
    if (errorHandledRef.current) return;
    errorHandledRef.current = true;
    clearTimers();

    const state = usePlayerStore.getState();
    const failedTrack = state.queue[state.currentIdx];
    if (!failedTrack) return;

    const reason = youtubeErrorReason(e.data);
    failedIndicesRef.current.add(state.currentIdx);
    const nextPlayable = findNextPlayableIdx();

    if (nextPlayable !== null) {
      wasActivePlaybackRef.current = true;
      notify.info(
        "Skipped unavailable video",
        `"${failedTrack.title}" — ${reason}`,
        2.5,
        SKIP_NOTICE_KEY,
      );
      skipTimerRef.current = window.setTimeout(() => {
        skipTimerRef.current = null;
        usePlayerStore.getState().playIdx(nextPlayable);
      }, SKIP_DELAY_MS);
    } else {
      wasActivePlaybackRef.current = false;
      setPlaying(false);
      const allFailed = failedIndicesRef.current.size >= state.queue.length;
      const msg = allFailed
        ? `Could not load any playable video (${reason}).`
        : `"${failedTrack.title}" unavailable (${reason}).`;
      setErrorBanner(msg);
      notify.error("Playback stopped", msg, 4, SKIP_NOTICE_KEY);
    }
  }, [clearTimers, findNextPlayableIdx, setPlaying]);

  const armWatchdog = useCallback((ms = LOAD_TIMEOUT_MS) => {
    if (watchdogTimerRef.current !== null) {
      window.clearTimeout(watchdogTimerRef.current);
    }
    watchdogTimerRef.current = window.setTimeout(() => {
      watchdogTimerRef.current = null;
      const st = lastStateRef.current;
      const stuckBuffering = st === 3;
      const stuckUnstartedDuringPlayback = st === -1 && wasActivePlaybackRef.current;
      if (!playerReadyRef.current || stuckBuffering || stuckUnstartedDuringPlayback) {
        handlePlayerError({ data: -102 });
      }
    }, ms);
  }, [handlePlayerError]);

  function handleReady(e: { target: YouTubePlayer }) {
    playerReadyRef.current = true;
    playerRef.current = e.target;
    try { e.target.setVolume(volume); } catch { }
    setTimeout(() => {
      try { if (e.target.isMuted()) setShowUnmute(true); } catch { }
    }, 500);
  }

  useEffect(() => {
    endHandledRef.current = false;
    errorHandledRef.current = false;
    lastStateRef.current = -1;
    clearTimers();
    if (track) {
      armWatchdog();
    }
  }, [track?.video_id, currentIdx, retryNonce, track, clearTimers, armWatchdog]);

  function handleStateChange(e: { data: number }) {
    lastStateRef.current = e.data;
    if (e.data === 1) {
      // Confirmed playing — clear any error banner and reset consecutive-skip history.
      if (watchdogTimerRef.current !== null) {
        window.clearTimeout(watchdogTimerRef.current);
        watchdogTimerRef.current = null;
      }
      wasActivePlaybackRef.current = true;
      failedIndicesRef.current.clear();
      setErrorBanner(null);
      setPlaying(true);
    } else if (e.data === 2 || e.data === 5) {
      if (watchdogTimerRef.current !== null) {
        window.clearTimeout(watchdogTimerRef.current);
        watchdogTimerRef.current = null;
      }
      wasActivePlaybackRef.current = false;
      setPlaying(false);
    } else if (e.data === 3) {
      // Buffering — fail-safe skip if stream stalls indefinitely.
      armWatchdog();
    } else if (e.data === 0 && !endHandledRef.current) {
      if (watchdogTimerRef.current !== null) {
        window.clearTimeout(watchdogTimerRef.current);
        watchdogTimerRef.current = null;
      }
      endHandledRef.current = true;
      handleEnded();
    }
  }

  function handleEnded() {
    if (mode === "repeatTrack") {
      try { playerRef.current?.seekTo(0, true); playerRef.current?.playVideo(); } catch { }
    } else {
      wasActivePlaybackRef.current = true;
      advance(1);
    }
  }

  function handleManualAdvance(step: number) {
    clearTimers();
    failedIndicesRef.current.clear();
    setErrorBanner(null);
    wasActivePlaybackRef.current = true;
    advance(step);
  }

  function handleManualPlayIdx(idx: number) {
    clearTimers();
    failedIndicesRef.current.clear();
    setErrorBanner(null);
    wasActivePlaybackRef.current = true;
    playIdx(idx);
  }

  function retryCurrentTrack() {
    clearTimers();
    failedIndicesRef.current.clear();
    errorHandledRef.current = false;
    setErrorBanner(null);
    wasActivePlaybackRef.current = true;
    setRetryNonce((n) => n + 1);
  }

  // Poll playback progress every 500ms — same cadence as before.
  useEffect(() => {
    const id = setInterval(() => {
      const p = playerRef.current;
      if (!p?.getCurrentTime) return;
      try {
        const cur = p.getCurrentTime();
        const dur = p.getDuration();
        if (!(dur > 0)) return;

        // the pill doesn't show time, so don't touch the store when collapsed
        if (usePlayerStore.getState().expanded) setProgress(cur, dur);

        if (!endHandledRef.current && dur - cur < 0.75) {
          endHandledRef.current = true;
          handleEnded();
        }
      } catch { }
    }, 500);
    return () => clearInterval(id);
  }, [setProgress, mode]);

  useEffect(() => {
    setProgress(0, 0);
  }, [track?.video_id, setProgress]);

  useEffect(() => {
    if (!track || !("mediaSession" in navigator)) return;
    navigator.mediaSession.metadata = new MediaMetadata({
      title: track.title,
      artist: track.artist ?? "",
      artwork: track.thumbnail_url ? [{ src: track.thumbnail_url, sizes: "512x512", type: "image/jpeg" }] : [],
    });
    navigator.mediaSession.setActionHandler("play", togglePlayPause);
    navigator.mediaSession.setActionHandler("pause", togglePlayPause);
    navigator.mediaSession.setActionHandler("previoustrack", () => handleManualAdvance(-1));
    navigator.mediaSession.setActionHandler("nexttrack", () => handleManualAdvance(1));
    navigator.mediaSession.playbackState = playing ? "playing" : "paused";
  }, [track?.video_id, playing]); // eslint-disable-line react-hooks/exhaustive-deps

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
      if (state === 1) {
        wasActivePlaybackRef.current = false;
        p.pauseVideo();
      } else {
        wasActivePlaybackRef.current = true;
        setErrorBanner(null);
        p.playVideo();
      }
    } catch { }
  }

  function seekToFraction(frac: number) {
    const p = playerRef.current;
    if (!p) return;
    try { p.seekTo(frac * p.getDuration(), true); } catch { }
  }

  function seekToTime(seconds: number) {
    try { playerRef.current?.seekTo(seconds, true); } catch { }
  }

  function handleVolumeChange(v: number) {
    setVolumeValue(v);
    try { playerRef.current?.setVolume(v); } catch { }
  }

  function unmuteNow() {
    try { playerRef.current?.unMute(); } catch { }
    setShowUnmute(false);
  }

  function closeWidget() {
    clearTimers();
    try { playerRef.current?.stopVideo?.(); } catch { }
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
        <BorderGlow
          edgeSensitivity={30}
          className="np-panel-borderglow"
          glowColor="40 80 80"
          backgroundColor="#120F17"
          borderRadius={28}
          glowRadius={40}
          glowIntensity={1}
          coneSpread={25}
          animated={false}
          colors={GLOW_COLORS}
        >
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

            {errorBanner && (
              <div id="np-error-banner">
                <span className="np-error-banner-text">{errorBanner}</span>
                <button type="button" className="np-error-retry-btn" onClick={retryCurrentTrack}>
                  Retry
                </button>
              </div>
            )}

            <VideoView
              visible={view === "video"}
              track={track}
              nextVideoId={nextTrack?.video_id}
              retryNonce={retryNonce}
              onReady={handleReady}
              onStateChange={handleStateChange}
              onError={handlePlayerError}
            />
            <LyricsPanel visible={view === "lyrics"} track={track} lyrics={lyrics} onSeek={seekToTime} />

            <p className="np-track-title" title={track.title}>{track.title}</p>

            <ProgressBar onSeekFraction={seekToFraction} />

            <TransportControls
              track={track}
              playing={playing}
              onPrev={() => handleManualAdvance(-1)}
              onNext={() => handleManualAdvance(1)}
              onTogglePlayPause={togglePlayPause}
            />

            <ModeRow mode={mode} onModeChange={setMode} onReshuffle={reshuffle} />

            <VolumeSlider volume={volume} onChange={handleVolumeChange} />

            <QueueList queue={queue} currentTrackIdx={currentIdx} onReorder={reorderQueue} onPlay={handleManualPlayIdx} />
          </div>
        </BorderGlow>

      </div>
    </div>
  );
}
