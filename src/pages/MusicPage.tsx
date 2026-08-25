import React, { useEffect, useState } from "react";
import { useAuth } from "../contexts/AuthContext";
import { usePlayer } from "../features/player/PlayerProvider";
import * as musicService from "../lib/musicService";
import { searchSongs, searchPlaylists, SearchSongResult, SearchPlaylistResult } from "../lib/youtube";
import type { Track } from "../features/player/types";

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
  const [showImport, setShowImport] = useState(false);

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
      <div className="music-toolbar">
        <form onSubmit={handleCreate} className="music-new-form">
          <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="New playlist name" />
          <button type="submit" disabled={creating || !newName.trim()}>+ New</button>
        </form>
        <button className="music-secondary-btn" onClick={() => setShowImport((v) => !v)}>
          {showImport ? "− Close import" : "⇩ Import"}
        </button>
      </div>

      {showImport && (
        <ImportPanel userId={userId} onImported={() => { setShowImport(false); load(); }} />
      )}

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

function ImportPanel({ userId, onImported }: { userId: string; onImported: () => void }) {
  const [raw, setRaw] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null);

  async function handleImport() {
    if (!raw.trim()) return;
    setBusy(true);
    const result = await musicService.importPlaylist(userId, raw);
    setBusy(false);
    setMessage({ text: result.message, ok: result.ok });
    if (result.ok) { setRaw(""); onImported(); }
  }

  return (
    <div className="evol-card">
      <p className="evol-card-meta">
        Paste JSON exported from EVOL Space's Export button, or plain text with one "Title - URL" per line.
      </p>
      <textarea
        value={raw}
        onChange={(e) => setRaw(e.target.value)}
        placeholder="Paste playlist data..."
        rows={6}
      />
      <button onClick={handleImport} disabled={busy || !raw.trim()} style={{ marginTop: 8 }}>
        {busy ? "…" : "Import"}
      </button>
      {message && <p className={message.ok ? "success" : "error"}>{message.text}</p>}
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
  const [allPlaylists, setAllPlaylists] = useState<musicService.Playlist[]>([]);
  const [tracks, setTracks] = useState<musicService.PlaylistTrack[]>([]);
  const [loading, setLoading] = useState(true);
  const [renameValue, setRenameValue] = useState("");
  const [showAddPanel, setShowAddPanel] = useState(false);
  const [showExportPanel, setShowExportPanel] = useState(false);
  const [expandedTrackId, setExpandedTrackId] = useState<number | null>(null);
  const [copySourceId, setCopySourceId] = useState<number | "">("");
  const [copyBusy, setCopyBusy] = useState(false);
  const [copyMessage, setCopyMessage] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    const [playlists, t] = await Promise.all([
      musicService.getPlaylists(userId),
      musicService.getPlaylistTracks(playlistId),
    ]);
    setAllPlaylists(playlists);
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

  async function handleCopy() {
    if (!copySourceId) return;
    setCopyBusy(true);
    const added = await musicService.copyPlaylistTracks(Number(copySourceId), playlistId);
    setCopyBusy(false);
    setCopyMessage(`Copied ${added} new track(s).`);
    load();
  }

  async function downloadExport(format: "json" | "text") {
    const content = format === "json"
      ? await musicService.exportPlaylistJson(playlistId)
      : await musicService.exportPlaylistText(playlistId);
    const blob = new Blob([content], { type: format === "json" ? "application/json" : "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `playlist.${format === "json" ? "json" : "txt"}`;
    a.click();
    URL.revokeObjectURL(url);
  }

  if (loading) return <p className="placeholder-note">Loading…</p>;
  if (!playlist) return <p>Playlist not found.</p>;

  const otherPlaylists = allPlaylists.filter((p) => p.id !== playlistId);

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
        <button onClick={() => setShowExportPanel((v) => !v)}>{showExportPanel ? "− Close" : "⇧ Export"}</button>
      </div>

      {showAddPanel && (
        <AddTrackPanel playlistId={playlistId} addedBy={userId} onAdded={load} />
      )}

      {showExportPanel && (
        <div className="evol-card">
          <p className="evol-card-meta">Copy tracks from another playlist</p>
          {otherPlaylists.length === 0 ? (
            <p className="placeholder-note">No other playlists yet.</p>
          ) : (
            <div className="music-copy-row">
              <select value={copySourceId} onChange={(e) => setCopySourceId(e.target.value ? Number(e.target.value) : "")}>
                <option value="">Choose a playlist…</option>
                {otherPlaylists.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
              <button onClick={handleCopy} disabled={!copySourceId || copyBusy}>
                {copyBusy ? "…" : "Copy tracks"}
              </button>
            </div>
          )}
          {copyMessage && <p className="success">{copyMessage}</p>}

          <p className="evol-card-meta" style={{ marginTop: 14 }}>Export / share</p>
          <div className="music-copy-row">
            <button onClick={() => downloadExport("json")}>Download JSON</button>
            <button onClick={() => downloadExport("text")}>Download text</button>
          </div>
        </div>
      )}

      {tracks.length === 0 ? (
        <p className="placeholder-note">No tracks yet — add some above.</p>
      ) : (
        tracks.map((t) => (
          <div className="evol-card" key={t.id}>
            <div className="music-track-row">
              <div>
                <div>{t.title}</div>
                {t.artist && <div className="evol-card-meta">{t.artist}</div>}
              </div>
              <div className="music-playlist-actions">
                <button onClick={() => handlePlayFromHere(t.id!)} title="Play from here">▶</button>
                <button
                  onClick={() => setExpandedTrackId(expandedTrackId === t.id ? null : t.id!)}
                  title="Manage"
                >
                  ⋯
                </button>
                <button onClick={() => handleRemove(t.id!)} title="Remove from playlist">🗑</button>
              </div>
            </div>
            {expandedTrackId === t.id && (
              <TrackManagePanel
                playlistId={playlistId}
                track={t}
                onChanged={load}
              />
            )}
          </div>
        ))
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Per-track management panel — rename-in-playlist, reset, artist/lyrics edit
// ---------------------------------------------------------------------------

function TrackManagePanel({ playlistId, track, onChanged }: {
  playlistId: number;
  track: musicService.PlaylistTrack;
  onChanged: () => void;
}) {
  const [customTitle, setCustomTitle] = useState(track.title !== track.original_title ? track.title : "");
  const [artist, setArtist] = useState(track.artist ?? "");
  const [lyricsUrl, setLyricsUrl] = useState(track.lyrics_url ?? "");
  const isRenamed = track.title !== track.original_title;

  async function handleSaveRename() {
    if (!customTitle.trim()) return;
    await musicService.renameTrackInPlaylist(playlistId, track.id!, customTitle.trim());
    onChanged();
  }

  async function handleResetRename() {
    await musicService.resetTrackTitleInPlaylist(playlistId, track.id!);
    onChanged();
  }

  async function handleSaveDetails() {
    await musicService.updateTrackDetails(track.id!, { artist, lyricsUrl });
    onChanged();
  }

  return (
    <div className="music-track-manage">
      <div className="music-manage-row">
        <label>Rename in this playlist (library: {track.original_title})</label>
        <div className="music-copy-row">
          <input value={customTitle} onChange={(e) => setCustomTitle(e.target.value)} placeholder={track.original_title} />
          <button onClick={handleSaveRename}>Save</button>
          {isRenamed && <button onClick={handleResetRename}>Reset</button>}
        </div>
      </div>
      <div className="music-manage-row">
        <label>Artist / lyrics (library-wide)</label>
        <div className="music-copy-row">
          <input value={artist} onChange={(e) => setArtist(e.target.value)} placeholder="Artist" />
        </div>
        <div className="music-copy-row">
          <input value={lyricsUrl} onChange={(e) => setLyricsUrl(e.target.value)} placeholder="Lyrics URL" />
          <button onClick={handleSaveDetails}>Save</button>
        </div>
        {lyricsUrl.trim() && (
          <a href={lyricsUrl} target="_blank" rel="noreferrer" className="music-lyrics-link">Open lyrics ↗</a>
        )}
      </div>
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
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchPlaylistResult[]>([]);
  const [searched, setSearched] = useState(false);
  const [searching, setSearching] = useState(false);
  const [addingId, setAddingId] = useState<string | null>(null);
  const [searchMessage, setSearchMessage] = useState<{ text: string; ok: boolean } | null>(null);

  const [url, setUrl] = useState("");
  const [linkBusy, setLinkBusy] = useState(false);
  const [linkMessage, setLinkMessage] = useState<{ text: string; ok: boolean } | null>(null);

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    if (!query.trim()) return;
    setSearching(true);
    const r = await searchPlaylists(query.trim());
    setResults(r);
    setSearched(true);
    setSearching(false);
  }

  async function handleAddFromSearch(pr: SearchPlaylistResult) {
    setAddingId(pr.playlist_id);
    setSearchMessage(null);
    const result = await musicService.addPlaylistFromYoutube(
      playlistId, `https://www.youtube.com/playlist?list=${pr.playlist_id}`, addedBy,
    );
    setAddingId(null);
    setSearchMessage({ text: result.message, ok: result.ok });
    if (result.ok) onAdded();
  }

  async function handleSubmitLink(e: React.FormEvent) {
    e.preventDefault();
    if (!url.trim()) return;
    setLinkBusy(true);
    const result = await musicService.addPlaylistFromYoutube(playlistId, url.trim(), addedBy);
    setLinkBusy(false);
    setLinkMessage({ text: result.message, ok: result.ok });
    if (result.ok) { setUrl(""); onAdded(); }
  }

  return (
    <div>
      <p className="evol-card-meta">
        Search for a playlist, or paste a playlist link directly, to add every track in it at once.
      </p>

      <form onSubmit={handleSearch} className="music-add-form">
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="playlist name..." />
        <button type="submit" disabled={searching || !query.trim()}>{searching ? "…" : "Search"}</button>
      </form>

      {results.map((pr) => (
        <div className="music-search-result" key={pr.playlist_id}>
          {pr.thumbnail_url && <img src={pr.thumbnail_url} width={48} height={48} alt="" />}
          <div className="music-search-result-info">
            <div>{pr.title}</div>
            <div className="evol-card-meta">
              {pr.author}{pr.item_count ? ` · ${pr.item_count} tracks` : ""}
            </div>
          </div>
          <button
            onClick={() => handleAddFromSearch(pr)}
            disabled={addingId === pr.playlist_id}
            title="Import this playlist"
          >
            {addingId === pr.playlist_id ? "…" : "+"}
          </button>
        </div>
      ))}
      {searched && !searching && results.length === 0 && (
        <p className="placeholder-note">No importable playlists found for "{query.trim()}".</p>
      )}
      {searchMessage && <p className={searchMessage.ok ? "success" : "error"}>{searchMessage.text}</p>}

      <p className="evol-card-meta" style={{ marginTop: 14 }}>Or paste a playlist link directly</p>
      <form onSubmit={handleSubmitLink} className="music-add-form">
        <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://www.youtube.com/playlist?list=..." />
        <button type="submit" disabled={linkBusy || !url.trim()}>{linkBusy ? "…" : "Add all"}</button>
      </form>
      {linkMessage && <p className={linkMessage.ok ? "success" : "error"}>{linkMessage.text}</p>}
    </div>
  );
}
