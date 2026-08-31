import React, { createContext, useContext, useRef } from "react";
import { motion } from "framer-motion";
import { supabase } from "../../lib/supabaseClient";
import NowPlaying, { Track } from "./NowPlaying";
import { usePlayerStore } from "./store";
import { useDragPosition } from "./hooks/useDragPosition";
import type { Mode } from "./types";

interface PlayerContextValue {
  /** Always (re)starts playback from the top of `tracks`. Pass `playlistId`
   * so the widget can be recognised as "this playlist is playing" later. */
  loadQueue: (tracks: Track[], mode: string, playlistId?: number) => void;
  /** If `playlistId` is the playlist already loaded, this just flips the
   * live player's mode in place instead of restarting the track. */
  playPlaylistMode: (playlistId: number, tracks: Track[], mode: string) => void;
  playingPlaylistId: number | null;
  nowPlayingTrackId: number | null;
  isPlaying: boolean;
  currentMode: Mode | null;
}

const PlayerContext = createContext<PlayerContextValue | undefined>(undefined);

async function persistLyricsSelection(trackId: number, artistName: string | null, lyricsUrl: string) {
  const changes: Record<string, string> = {};
  if (artistName) changes.artist = artistName;
  if (lyricsUrl) changes.lyrics_url = lyricsUrl;
  if (Object.keys(changes).length === 0) return;

  const { error } = await supabase.from("tracks").update(changes).eq("id", trackId);
  if (error) console.error("Failed to save lyrics selection:", error);
}

export function PlayerProvider({ children }: { children: React.ReactNode }) {
  const widgetRef = useRef<HTMLDivElement>(null);
  const drag = useDragPosition(widgetRef);

  const queue = usePlayerStore((s) => s.queue);
  const currentIdx = usePlayerStore((s) => s.currentIdx);
  const playing = usePlayerStore((s) => s.playing);
  const mode = usePlayerStore((s) => s.mode);
  const playingPlaylistId = usePlayerStore((s) => s.playingPlaylistId);
  const loadQueueAction = usePlayerStore((s) => s.loadQueue);
  const setPlaylistMode = usePlayerStore((s) => s.setPlaylistMode);

  function loadQueue(tracks: Track[], modeLabel: string, playlistId?: number) {
    loadQueueAction(tracks, modeLabel, playlistId);
  }

  function playPlaylistMode(playlistId: number, tracks: Track[], modeLabel: string) {
    if (playingPlaylistId === playlistId && queue.length) {
      setPlaylistMode(modeLabel);
      return;
    }
    loadQueue(tracks, modeLabel, playlistId);
  }

  const nowPlayingTrackId = queue[currentIdx]?.id ?? null;

  return (
    <PlayerContext.Provider
      value={{
        loadQueue,
        playPlaylistMode,
        playingPlaylistId,
        nowPlayingTrackId,
        isPlaying: playing,
        currentMode: playingPlaylistId !== null ? mode : null,
      }}
    >
      {children}
      {queue.length > 0 && (
        <motion.div
          id="now-playing-widget"
          ref={widgetRef}
          drag
          dragControls={drag.dragControls}
          dragListener={false}
          dragMomentum={false}
          dragElastic={0}
          dragTransition={{ power: 0, timeConstant: 0 }}
          dragConstraints={drag.dragConstraints}   // NEW — hard-clamps the drag itself to the viewport

          // `x`/`y` render as `transform: translate()`, which stacks on TOP of
          // whatever position the element's CSS gives it — App.css's
          // `#now-playing-widget` rule sets `top: 4.5rem; right: 1.25rem`,
          // which would otherwise double up with the snap/drag math (which
          // assumes x/y ARE the absolute viewport position). Pinning the box
          // to a (0,0) fixed anchor inline — inline styles beat the external
          // stylesheet rule regardless of CSS load order — makes x/y the
          // single source of truth for position, so the widget can never
          // drift off-screen after expanding, resizing, or a reload.
          style={{ position: "fixed", top: 0, left: 0, x: drag.x, y: drag.y, touchAction: "none", willChange: "transform" }}
          onDragStart={drag.handleDragStart}
          onDragEnd={drag.handleDragEnd}
          className="cursor-target"
        >
          <NowPlaying drag={drag} onPersistLyrics={persistLyricsSelection} />
        </motion.div>
      )}
    </PlayerContext.Provider>
  );
}

export function usePlayer(): PlayerContextValue {
  const ctx = useContext(PlayerContext);
  if (!ctx) throw new Error("usePlayer must be used inside <PlayerProvider>");
  return ctx;
}
