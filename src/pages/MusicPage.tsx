import React, { useEffect, useState } from "react";
import { useAuth } from "../contexts/AuthContext";
import { usePlayer } from "../features/player/PlayerProvider";
import * as musicService from "../lib/musicService";
import { searchSongs, SearchSongResult } from "../lib/youtube";
import type { Track } from "../features/player/types";

// NOT YET PORTED from ui/pages/music.py (straightforward follow-ups,
// same patterns as what's here — flagging honestly rather than silently
// dropping them):
//   - Export/import playlist as JSON or plain text
//   - Copy tracks from one playlist into another
//   - Per-playlist track rename / reset-to-library-title
//   - Editing a track's artist/lyrics URL from the playlist view (the
//     Now Playing widget's lyrics panel already does this for the
//     currently-playing track, via PlayerProvider's persistLyricsSelection)

type ViewMode = "list" | "detail";

export function MusicPage() {
  const { user } = useAuth();
  const { loadQueue } = usePlayer();
  const [view, setView] = useState<ViewMode>("list");
  const [selectedId, setSelectedId] = useState<number | null>(null);

  if (!user) {
    return (
      <div className="page">
        <h2>🎵 Music</h2>
        <p>Log in first (see the Login tab) to build playlists and listen to music.</p>
      </div>
    );
  }

  return (
    <div className="page">
      <h2>🎵 Music</h2>
      {view === "list" ? (
        <PlaylistListView
          userId={user.id}
          onOpen={(id) => { setSelectedId(id); setView("detail"); }}
          onPlay={loadQueue}
        />
      ) : (
        <PlaylistDetailView
          userId={user.id}
          playlistId={selectedId!}
          onBack={() => setView("list")}
          onPlay={loadQueue}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// List view
// ---------------------------------------------------------------------------

function PlaylistListView({ userId, onOpen, onPlay }: {
  userId: string;
  onOpen: (id: number) => void;
  onPlay: (tracks: Track[], mode: string) => void;
}) {
  const [playlists, setPlaylists] = useState<musicService.Playlist[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);

  async function load() {
    setLoading(true);
    setPlaylists(await musicService.getPlaylists(userId));
    setLoading(false);
  }
  useEffect(() => { load(); }, [userId]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!newName.trim()) return;
    setCreating(true);
    await musicService.createPlaylist(userId, newName.trim());
    setNewName("");
    setCreating(false);
    load();
  }

  async function handlePlay(playlistId: number, mode: string) {
    const tracks = await musicService.getPlaylistTracks(playlistId);
    if (!tracks.length) { alert("This playlist is empty."); return; }
    onPlay(tracks, mode);
  }

  async function handleDelete(playlistId: number) {
    if (!confirm("Delete this playlist?")) return;
    await musicService.deletePlaylist(playlistId);
    load();
  }

  const filtered = playlists.filter((p) => p.name.toLowerCase().includes(search.toLowerCase()));

  return (
    <div>
      <form onSubmit={handleCreate} className="music-new-form">
        <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="New playlist name" />
        <button type="submit" disabled={creating || !newName.trim()}>+ New</button>
      </form>

      <input
        className="music-search"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search playlists..."
      />

      {loading ? (
        <p className="placeholder-note">Loading…</p>
      ) : filtered.length === 0 ? (
        <p className="placeholder-note">No playlists yet — create one above.</p>
      ) : (
        filtered.map((p) => (
          <div className="evol-card music-playlist-row" key={p.id}>
            <button className="music-playlist-name" onClick={() => onOpen(p.id)}>
              🎵 {p.name}
            </button>
            <div className="music-playlist-actions">
              <button onClick={() => handlePlay(p.id, "Normal")} title="Play">▶</button>
              <button onClick={() => handlePlay(p.id, "Shuffle")} title="Shuffle">🔀</button>
              <button onClick={() => handlePlay(p.id, "Repeat All")} title="Repeat all">🔁</button>
              <button onClick={() => handleDelete(p.id)} title="Delete">🗑</button>
            </div>
          </div>
        ))
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Detail view
// ---------------------------------------------------------------------------

function PlaylistDetailView({ userId, playlistId, onBack, onPlay }: {
  userId: string;
  playlistId: number;
  onBack: () => void;
  onPlay: (tracks: Track[], mode: string) => void;
}) {
  const [playlist, setPlaylist] = useState<musicService.Playlist | null>(null);
  const [tracks, setTracks] = useState<musicService.PlaylistTrack[]>([]);
  const [loading, setLoading] = useState(true);
  const [renameValue, setRenameValue] = useState("");
  const [showAddPanel, setShowAddPanel] = useState(false);

  async function load() {
    setLoading(true);
    const [playlists, t] = await Promise.all([
      musicService.getPlaylists(userId),
      musicService.getPlaylistTracks(playlistId),
    ]);
    const p = playlists.find((pl) => pl.id === playlistId) ?? null;
    setPlaylist(p);
    setRenameValue(p?.name ?? "");
    setTracks(t);
    setLoading(false);
  }
  useEffect(() => { load(); }, [playlistId]);

  async function handleRename(e: React.FormEvent) {
    e.preventDefault();
    if (!renameValue.trim() || renameValue.trim() === playlist?.name) return;
    await musicService.renamePlaylist(playlistId, renameValue.trim());
    load();
  }

  async function handleRemove(trackId: number) {
    await musicService.removeTrackFromPlaylist(playlistId, trackId);
    load();
  }

  function handlePlayFromHere(trackId: number) {
    const idx = tracks.findIndex((t) => t.id === trackId);
    if (idx === -1) return;
    onPlay(tracks.slice(idx), "Normal");
  }

  function playOrWarn(mode: string) {
    if (!tracks.length) { alert("This playlist is empty."); return; }
    onPlay(tracks, mode);
  }

  if (loading) return <p className="placeholder-note">Loading…</p>;
  if (!playlist) return <p>Playlist not found.</p>;

  return (
    <div>
      <button onClick={onBack} className="music-back-btn">← Back to playlists</button>

      <form onSubmit={handleRename} className="music-rename-form">
        <input value={renameValue} onChange={(e) => setRenameValue(e.target.value)} />
        <button type="submit">Save</button>
      </form>

      <div className="music-control-row">
        <button onClick={() => playOrWarn("Normal")}>▶ Play</button>
        <button onClick={() => playOrWarn("Shuffle")}>🔀 Shuffle</button>
        <button onClick={() => playOrWarn("Repeat All")}>🔁 Repeat all</button>
        <button onClick={() => setShowAddPanel((v) => !v)}>{showAddPanel ? "− Close" : "+ Add track"}</button>
      </div>

      {showAddPanel && (
        <AddTrackPanel playlistId={playlistId} addedBy={userId} onAdded={load} />
      )}

      {tracks.length === 0 ? (
        <p className="placeholder-note">No tracks yet — add some above.</p>
      ) : (
        tracks.map((t) => (
          <div className="evol-card music-track-row" key={t.id}>
            <div>
              <div>{t.title}</div>
              {t.artist && <div className="evol-card-meta">{t.artist}</div>}
            </div>
            <div className="music-playlist-actions">
              <button onClick={() => handlePlayFromHere(t.id!)} title="Play from here">▶</button>
              <button onClick={() => handleRemove(t.id!)} title="Remove from playlist">🗑</button>
            </div>
          </div>
        ))
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Add track panel — three tabs, same shape as music.py's _render_add_track
// ---------------------------------------------------------------------------

function AddTrackPanel({ playlistId, addedBy, onAdded }: {
  playlistId: number; addedBy: string; onAdded: () => void;
}) {
  const [tab, setTab] = useState<"link" | "search" | "playlist">("search");

  return (
    <div className="evol-card">
      <div className="tabs">
        <button className={tab === "search" ? "active" : ""} onClick={() => setTab("search")}>Search</button>
        <button className={tab === "link" ? "active" : ""} onClick={() => setTab("link")}>Paste link</button>
        <button className={tab === "playlist" ? "active" : ""} onClick={() => setTab("playlist")}>YT playlist</button>
      </div>
      {tab === "search" && <AddBySearch playlistId={playlistId} addedBy={addedBy} onAdded={onAdded} />}
      {tab === "link" && <AddByLink playlistId={playlistId} addedBy={addedBy} onAdded={onAdded} />}
      {tab === "playlist" && <AddByPlaylistImport playlistId={playlistId} addedBy={addedBy} onAdded={onAdded} />}
    </div>
  );
}

function AddByLink({ playlistId, addedBy, onAdded }: {
  playlistId: number; addedBy: string; onAdded: () => void;
}) {
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!url.trim()) return;
    setBusy(true);
    const result = await musicService.addTrackAndAttach(playlistId, url.trim(), addedBy);
    setBusy(false);
    setMessage({ text: result.message, ok: result.ok });
    if (result.ok) { setUrl(""); onAdded(); }
  }

  return (
    <form onSubmit={handleSubmit} className="music-add-form">
      <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://www.youtube.com/watch?v=..." />
      <button type="submit" disabled={busy || !url.trim()}>{busy ? "…" : "Fetch & add"}</button>
      {message && <p className={message.ok ? "success" : "error"}>{message.text}</p>}
    </form>
  );
}

function AddBySearch({ playlistId, addedBy, onAdded }: {
  playlistId: number; addedBy: string; onAdded: () => void;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchSongResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [addingId, setAddingId] = useState<string | null>(null);

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    if (!query.trim()) return;
    setSearching(true);
    setResults(await searchSongs(query.trim()));
    setSearching(false);
  }

  async function handleAdd(r: SearchSongResult) {
    setAddingId(r.video_id);
    await musicService.addTrackAndAttach(
      playlistId, `https://www.youtube.com/watch?v=${r.video_id}`, addedBy,
      { title: r.title, thumbnail_url: r.thumbnail_url, artist: r.artist },
    );
    setAddingId(null);
    onAdded();
  }

  return (
    <div>
      <form onSubmit={handleSearch} className="music-add-form">
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="song title or artist..." />
        <button type="submit" disabled={searching || !query.trim()}>{searching ? "…" : "Search"}</button>
      </form>
      {results.map((r) => (
        <div className="music-search-result" key={r.video_id}>
          {r.thumbnail_url && <img src={r.thumbnail_url} width={48} height={48} alt="" />}
          <div className="music-search-result-info">
            <div>{r.title}</div>
            <div className="evol-card-meta">{r.artist}{r.duration ? ` · ${r.duration}` : ""}</div>
          </div>
          <button onClick={() => handleAdd(r)} disabled={addingId === r.video_id}>
            {addingId === r.video_id ? "…" : "+"}
          </button>
        </div>
      ))}
    </div>
  );
}

function AddByPlaylistImport({ playlistId, addedBy, onAdded }: {
  playlistId: number; addedBy: string; onAdded: () => void;
}) {
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!url.trim()) return;
    setBusy(true);
    const result = await musicService.addPlaylistFromYoutube(playlistId, url.trim(), addedBy);
    setBusy(false);
    setMessage({ text: result.message, ok: result.ok });
    if (result.ok) { setUrl(""); onAdded(); }
  }

  return (
    <form onSubmit={handleSubmit} className="music-add-form">
      <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://www.youtube.com/playlist?list=..." />
      <button type="submit" disabled={busy || !url.trim()}>{busy ? "…" : "Add all"}</button>
      {message && <p className={message.ok ? "success" : "error"}>{message.text}</p>}
    </form>
  );
}
