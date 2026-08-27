import React, { useState } from "react";
import AddBySearch from "./AddBySearch";
import AddByLink from "./AddByLink";
import AddByPlaylistImport from "./AddByPlaylistImport";
import * as musicService from "../../lib/musicService";
import AddByCopyPlaylist from "./AddByCopyPlaylist";

export default function AddTrackPanel({ playlistId, addedBy, otherPlaylists, onAdded }: {
  playlistId: number;
  addedBy: string;
  otherPlaylists: musicService.Playlist[];
  onAdded: () => void;
}) {
  const [tab, setTab] = useState<"search" | "link" | "playlist" | "copy">("search");

  return (
    <div>
      <div className="add-track-tabs">
        {(["search", "link", "playlist", "copy"] as const).map((t) => (
          <button
            key={t}
            type="button"
            className={`add-track-tab-btn${tab === t ? " add-track-tab-btn-active" : ""}`}
            onClick={() => setTab(t)}
          >
            {t === "search" ? "Search" : t === "link" ? "Paste link" : t === "playlist" ? "YT playlist" : "Copy"}
          </button>
        ))}
      </div>
      <div className="fade-in" key={tab}>
        {tab === "search" && <AddBySearch playlistId={playlistId} addedBy={addedBy} onAdded={onAdded} />}
        {tab === "link" && <AddByLink playlistId={playlistId} addedBy={addedBy} onAdded={onAdded} />}
        {tab === "playlist" && <AddByPlaylistImport playlistId={playlistId} addedBy={addedBy} onAdded={onAdded} />}
        {tab === "copy" && <AddByCopyPlaylist targetPlaylistId={playlistId} otherPlaylists={otherPlaylists} onAdded={onAdded} />}
      </div>
    </div>
  );
}