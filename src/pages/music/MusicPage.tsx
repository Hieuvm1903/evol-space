import React from "react";
import { Music2 } from "lucide-react";
import { useAuth } from "../../contexts/AuthContext";
import MusicWorkspace from "./MusicWorkspace";
import "./MusicPage.css";

// This folder holds the whole Music page: MusicPage.tsx (entry) + CSS +
// every sub-component split out of what used to be one ~650-line file:
// AlbumPickerPane / PlaylistPane (the two panes), TrackRow +
// TrackManagePanel (a single track row and its inline editor),
// AddTrackPanel + AddBySearch/AddByLink/AddByPlaylistImport (the three
// ways to add tracks), and ImportPanel (paste a whole exported playlist).
// MusicWorkspace.tsx owns all the playlist/track state and wires the
// panes together; this file only handles the logged-out gate.

export function MusicPage() {
  const { user } = useAuth();

  if (!user) {
    return (
      <div className="page">
        <div className="music-guest-gate fade-in-up">
          <Music2 size={40} className="music-guest-icon" />
          <h2>Music</h2>
          <p>Log in first (see the Login tab) to build playlists and listen to music.</p>
        </div>
      </div>
    );
  }

  return <MusicWorkspace userId={user.id} />;
}
