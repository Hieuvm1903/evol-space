import React, { createContext, useContext, useRef, useState } from "react";
import { supabase } from "../../lib/supabaseClient";
import NowPlaying, { Track } from "./NowPlaying";
import { MODE_MAP } from "./constants";
import type { Mode } from "./types";
import { shuffleArray } from "./utils/queueOrder";

interface EngineState {
  mode: Mode;
  playing: boolean;
  currentTrackIdx: number;
}

interface PlayerContextValue {
  /** Equivalent of ui/now_playing_widget.py's load_queue(). Always
   * (re)starts playback from the top of `tracks`. Pass `playlistId` so
   * the widget can be recognised as "this playlist is playing" later. */
  loadQueue: (tracks: Track[], mode: string, playlistId?: number) => void;
  /** Smart play/shuffle/repeat: if `playlistId` is the playlist already
   * loaded into the widget, this just flips the live player's mode
   * in place — it does NOT restart the track. Otherwise it behaves like
   * loadQueue(). This is what makes clicking Shuffle/Repeat/Play while
   * something is already playing "follow the click" instead of yanking
   * playback back to track #1. */
  playPlaylistMode: (playlistId: number, tracks: Track[], mode: string) => void;
  /** id of the playlist currently loaded into the Now Playing widget, or null. */
  playingPlaylistId: number | null;
  /** id of the track currently playing, or null. */
  nowPlayingTrackId: number | null;
  isPlaying: boolean;
  /** Raw engine mode ("normal" | "shuffle" | "repeatTrack" | "repeatAll"),
   * only meaningful while playingPlaylistId is set. */
  currentMode: Mode | null;
}

const PlayerContext = createContext<PlayerContextValue | undefined>(undefined);

// Was: services/music_service.py's update_track_details(track_id, artist, lyrics_url),
// called from ui/now_playing_widget.py after Streamlit handed back the
// component's return value. Now it's a direct Supabase call — no
// round-trip through a backend needed since supabase-js + RLS handles
// this safely straight from the browser (the tracks table's RLS policy
// allows any authenticated user to update, matching the old behavior of
// music.py's per-track popover).
async function persistLyricsSelection(
  trackId: number,
  artistName: string | null,
  lyricsUrl: string,
) {
  const changes: Record<string, string> = {};
  if (artistName) changes.artist = artistName;
  if (lyricsUrl) changes.lyrics_url = lyricsUrl;
  if (Object.keys(changes).length === 0) return;

  const { error } = await supabase.from("tracks").update(changes).eq("id", trackId);
  if (error) console.error("Failed to save lyrics selection:", error);
}

export function PlayerProvider({ children }: { children: React.ReactNode }) {
  const [queue, setQueue] = useState<Track[] | null>(null);
  const [mode, setMode] = useState<string>("Normal");
  const [playingPlaylistId, setPlayingPlaylistId] = useState<number | null>(null);
  const [engineState, setEngineState] = useState<EngineState>({
    mode: "normal",
    playing: false,
    currentTrackIdx: 0,
  });

  // NowPlaying reports its live `setMode` setter up through this ref every
  // time it (re)mounts or updates, so playPlaylistMode can reach straight
  // into the running engine without lifting the whole engine up.
  const setEngineModeRef = useRef<((m: Mode) => void) | null>(null);

  function loadQueue(tracks: Track[], newMode: string, playlistId?: number) {
    if(newMode.toLowerCase() == "shuffle"){
      tracks = shuffleArray(tracks)
    }
    setQueue(tracks);
    setMode(newMode);
    setPlayingPlaylistId(playlistId ?? null);
  }

  function playPlaylistMode(playlistId: number, tracks: Track[], modeLabel: string) {
    if (playingPlaylistId === playlistId && setEngineModeRef.current) {
      // Same playlist is already playing — just switch its mode live.
      setEngineModeRef.current(MODE_MAP[modeLabel] || "normal");
      return;
    }
    // Different (or no) playlist playing — start it fresh.
    loadQueue(tracks, modeLabel, playlistId);
  }

  function handleClose() {
    setQueue(null);
    setPlayingPlaylistId(null);
  }

  function handleEngineUpdate(state: EngineState, controls: { setMode: (m: Mode) => void }) {
    setEngineState(state);
    setEngineModeRef.current = controls.setMode;
  }

  const nowPlayingTrackId = queue ? queue[engineState.currentTrackIdx]?.id ?? null : null;

  return (
    <PlayerContext.Provider
      value={{
        loadQueue,
        playPlaylistMode,
        playingPlaylistId,
        nowPlayingTrackId,
        isPlaying: engineState.playing,
        currentMode: playingPlaylistId !== null ? engineState.mode : null,
      }}
    >
      {children}
      {queue && queue.length > 0 && (
        // This id is what utils/dom.ts's getContainer() looks for, and
        // what the #now-playing-widget CSS rule (App.css) positions as a
        // fixed floating box — same visual spot as the old
        // .st-key-now_playing_drawer container did.
        <div id="now-playing-widget">
          <NowPlaying
            queue={queue}
            initialMode={mode}
            onClose={handleClose}
            onPersistLyrics={persistLyricsSelection}
            onEngineUpdate={handleEngineUpdate}
          />
        </div>
      )}
    </PlayerContext.Provider>
  );
}

export function usePlayer(): PlayerContextValue {
  const ctx = useContext(PlayerContext);
  if (!ctx) throw new Error("usePlayer must be used inside <PlayerProvider>");
  return ctx;
}