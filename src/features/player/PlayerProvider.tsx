import React, { createContext, useContext, useState } from "react";
import { supabase } from "../../lib/supabaseClient";
import NowPlaying, { Track } from "./NowPlaying";

interface PlayerContextValue {
  /** Equivalent of ui/now_playing_widget.py's load_queue(). Call this
   * from wherever "Play" / "Shuffle" / "Repeat all" buttons live (the
   * Music page, once it's ported) to start/replace playback. */
  loadQueue: (tracks: Track[], mode: string) => void;
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

  function loadQueue(tracks: Track[], newMode: string) {
    // Was: tracks.sample(frac=1) in Python for shuffle mode. The
    // component itself already does its own client-side shuffle when
    // mode === "shuffle" (see hooks/usePlayerEngine.ts), so no
    // shuffling needs to happen here — just pass the mode through.
    setQueue(tracks);
    setMode(newMode);
  }

  function handleClose() {
    setQueue(null);
  }

  return (
    <PlayerContext.Provider value={{ loadQueue }}>
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
