import React, { useEffect, useMemo, useState } from "react";
import { Select, Input, Button, Popconfirm, Empty, Skeleton, Segmented, Tooltip, Typography, message } from "antd";
import {
  Music2, ListMusic, Plus, Search, Play, Shuffle, Repeat, Trash2, Pencil,
  X, Link2, Upload, Copy, FileJson, FileText, Sparkles, Check, RadioTower,
} from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import { usePlayer } from "../features/player/PlayerProvider";
import * as musicService from "../lib/musicService";
import { searchSongs, searchPlaylists, SearchSongResult, SearchPlaylistResult } from "../lib/youtube";
import "./MusicPage.css";
import SpotlightCard from "../components/SpotlightCard";

const { Text } = Typography;

type RightTab = "overview" | "add" | "export";

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

// ---------------------------------------------------------------------------
// Workspace — playlist toolbar + tracklist (left) + detail (right)
// ---------------------------------------------------------------------------

function MusicWorkspace({ userId }: { userId: string }) {
  const player = usePlayer();

  const [playlists, setPlaylists] = useState<musicService.Playlist[]>([]);
  const [loadingPlaylists, setLoadingPlaylists] = useState(true);
  const [selectedPlaylistId, setSelectedPlaylistId] = useState<number | null>(null);

  const [tracks, setTracks] = useState<musicService.PlaylistTrack[]>([]);
  const [loadingTracks, setLoadingTracks] = useState(false);
  const [trackSearch, setTrackSearch] = useState("");
  const [selectedTrackId, setSelectedTrackId] = useState<number | null>(null);
  const [rightTab, setRightTab] = useState<RightTab>("overview");

  const [showNewPlaylist, setShowNewPlaylist] = useState(false);
  const [newPlaylistName, setNewPlaylistName] = useState("");
  const [creating, setCreating] = useState(false);
  const [showImport, setShowImport] = useState(false);

  async function loadPlaylists() {
    setLoadingPlaylists(true);
    const rows = await musicService.getPlaylists(userId);
    setPlaylists(rows);
    setLoadingPlaylists(false);
    setSelectedPlaylistId((current) => {
      if (current !== null && rows.some((p) => p.id === current)) return current;
      return rows[0]?.id ?? null;
    });
  }
  useEffect(() => { loadPlaylists(); /* eslint-disable-next-line */ }, [userId]);

  async function loadTracks() {
    if (selectedPlaylistId === null) { setTracks([]); return; }
    setLoadingTracks(true);
    const rows = await musicService.getPlaylistTracks(selectedPlaylistId);
    setTracks(rows);
    setLoadingTracks(false);
  }
  useEffect(() => {
    loadTracks();
    setSelectedTrackId(null);
    setRightTab("overview");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedPlaylistId]);

  const selectedPlaylist = playlists.find((p) => p.id === selectedPlaylistId) ?? null;
  const selectedTrack = tracks.find((t) => t.id === selectedTrackId) ?? null;

  const filteredTracks = useMemo(() => {
    const q = trackSearch.trim().toLowerCase();
    if (!q) return tracks;
    return tracks.filter(
      (t) => t.title.toLowerCase().includes(q) || (t.artist ?? "").toLowerCase().includes(q),
    );
  }, [tracks, trackSearch]);

  async function handleCreatePlaylist() {
    const name = newPlaylistName.trim();
    if (!name) return;
    setCreating(true);
    await musicService.createPlaylist(userId, name);
    setCreating(false);
    setNewPlaylistName("");
    setShowNewPlaylist(false);
    message.success(`Created "${name}"`);
    const rows = await musicService.getPlaylists(userId);
    setPlaylists(rows);
    setSelectedPlaylistId(rows.find((p) => p.name === name)?.id ?? rows[0]?.id ?? null);
  }

  async function handleDeletePlaylist() {
    if (!selectedPlaylist) return;
    const { id, name } = selectedPlaylist;
    await musicService.deletePlaylist(id);
    message.success(`Deleted "${name}"`);
    const rows = await musicService.getPlaylists(userId);
    setPlaylists(rows);
    setSelectedPlaylistId(rows[0]?.id ?? null);
  }

  function playMode(modeLabel: string) {
    if (!selectedPlaylistId || !tracks.length) { message.warning("This playlist is empty."); return; }
    player.playPlaylistMode(selectedPlaylistId, tracks, modeLabel);
  }

  function playFromTrack(trackId: number) {
    if (!selectedPlaylistId) return;
    const idx = tracks.findIndex((t) => t.id === trackId);
    if (idx === -1) return;
    player.loadQueue(tracks.slice(idx), "Normal", selectedPlaylistId);
  }

  async function handleRemoveTrack(trackId: number) {
    if (!selectedPlaylistId) return;
    await musicService.removeTrackFromPlaylist(selectedPlaylistId, trackId);
    if (selectedTrackId === trackId) setSelectedTrackId(null);
    loadTracks();
  }

  const isThisPlaylistPlaying = selectedPlaylistId !== null && player.playingPlaylistId === selectedPlaylistId;

  return (
    <div className="page music-page-shell">
      <div className="music-shell-header fade-in-up">
        <h2 className="music-title"><Sparkles size={20} className="music-title-icon" /> Music</h2>
        <p className="music-subtitle">Your galaxy of playlists — search, spin, and share.</p>
      </div>

      <div className="music-toolbar fade-in-up">
        <Select
          className="playlist-select"
          value={selectedPlaylistId ?? undefined}
          placeholder="Choose a playlist"
          loading={loadingPlaylists}
          onChange={(v) => setSelectedPlaylistId(v)}
          suffixIcon={<ListMusic size={15} />}
          options={playlists.map((p) => ({ value: p.id, label: p.name }))}
          notFoundContent={<Empty description="No playlists yet" image={Empty.PRESENTED_IMAGE_SIMPLE} />}
        />
        <Tooltip title="New playlist">
          <Button className="glow-icon-btn" icon={<Plus size={16} />} onClick={() => setShowNewPlaylist((v) => !v)} />
        </Tooltip>
        <Tooltip title="Import playlist">
          <Button className="glow-icon-btn" icon={<Upload size={16} />} onClick={() => setShowImport((v) => !v)} />
        </Tooltip>
      </div>

      {showNewPlaylist && (
        <SpotlightCard className="evol-glass-card music-inline-form fade-in-up">
          <Input
            value={newPlaylistName}
            onChange={(e) => setNewPlaylistName(e.target.value)}
            placeholder="New playlist name"
            onPressEnter={handleCreatePlaylist}
            autoFocus
          />
          <Button type="primary" className="btn-glow" loading={creating} disabled={!newPlaylistName.trim()} onClick={handleCreatePlaylist}>
            Create
          </Button>
        </SpotlightCard>
      )}

      {showImport && (
        <ImportPanel userId={userId} onImported={() => { setShowImport(false); loadPlaylists(); }} />
      )}

      {playlists.length === 0 && !loadingPlaylists ? (
        <Empty className="fade-in music-empty-state" description="No playlists yet — create one above to get started." image={Empty.PRESENTED_IMAGE_SIMPLE} />
      ) : (
        <div className="music-workspace">
          {/* LEFT — tracklist */}
          <div className="music-pane music-pane-left">
            <div className="music-pane-left-header">
              <Input
                className="music-track-search"
                value={trackSearch}
                onChange={(e) => setTrackSearch(e.target.value)}
                placeholder="Search tracks..."
                prefix={<Search size={14} color="var(--evol-muted)" />}
                allowClear
              />
              <span className="music-track-count">{tracks.length} track{tracks.length === 1 ? "" : "s"}</span>
            </div>

            <div className="music-track-list">
              {loadingTracks ? (
                <Skeleton active paragraph={{ rows: 5 }} className="fade-in" />
              ) : filteredTracks.length === 0 ? (
                <Empty
                  className="fade-in"
                  image={Empty.PRESENTED_IMAGE_SIMPLE}
                  description={tracks.length === 0 ? "No tracks yet — add some from the panel." : "No tracks match your search."}
                />
              ) : (
                filteredTracks.map((t, i) => (
                  <TrackRow
                    key={t.id}
                    index={i}
                    track={t}
                    active={selectedTrackId === t.id}
                    playing={isThisPlaylistPlaying && player.nowPlayingTrackId === t.id}
                    onSelect={() => { setSelectedTrackId(t.id!); setRightTab("overview"); }}
                    onPlay={() => playFromTrack(t.id!)}
                    onRemove={() => handleRemoveTrack(t.id!)}
                  />
                ))
              )}
            </div>
          </div>

          {/* RIGHT — detail */}
          <div className="music-pane music-pane-right">
            {selectedTrack ? (
              <TrackDetailPanel
                key={selectedTrack.id}
                playlistId={selectedPlaylistId!}
                track={selectedTrack}
                onBack={() => setSelectedTrackId(null)}
                onChanged={loadTracks}
                onRemoved={() => handleRemoveTrack(selectedTrack.id!)}
              />
            ) : selectedPlaylist ? (
              <PlaylistDetailPanel
                key={selectedPlaylist.id}
                userId={userId}
                playlist={selectedPlaylist}
                playlists={playlists}
                tracks={tracks}
                tab={rightTab}
                onTabChange={setRightTab}
                onRenamed={loadPlaylists}
                onDeleted={handleDeletePlaylist}
                onPlayMode={playMode}
                isPlaying={isThisPlaylistPlaying && player.isPlaying}
                currentMode={isThisPlaylistPlaying ? player.currentMode : null}
                onTracksChanged={loadTracks}
              />
            ) : (
              <Empty className="fade-in" description="Select a playlist" image={Empty.PRESENTED_IMAGE_SIMPLE} />
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Track row (left pane)
// ---------------------------------------------------------------------------

function TrackRow({ index, track, active, playing, onSelect, onPlay, onRemove }: {
  index: number;
  track: musicService.PlaylistTrack;
  active: boolean;
  playing: boolean;
  onSelect: () => void;
  onPlay: () => void;
  onRemove: () => void;
}) {
  return (
    <div
      className={`track-row stagger-item${active ? " track-row-active" : ""}${playing ? " track-row-playing" : ""}`}
      style={{ animationDelay: `${Math.min(index, 14) * 30}ms` }}
      onClick={onSelect}
    >
      <button className="track-row-play" onClick={(e) => { e.stopPropagation(); onPlay(); }} title="Play from here">
        {playing ? <span className="track-eq"><span /><span /><span /></span> : <Play size={13} />}
      </button>

      {track.thumbnail_url ? (
        <img className="track-row-thumb" src={track.thumbnail_url} alt="" />
      ) : (
        <div className="track-row-thumb track-row-thumb-empty"><Music2 size={14} /></div>
      )}

      <div className="track-row-info">
        <div className="track-row-title">{track.title}</div>
        {track.artist && <div className="track-row-artist">{track.artist}</div>}
      </div>

      <Popconfirm
        title="Remove from playlist?"
        okText="Remove"
        cancelText="Cancel"
        okButtonProps={{ danger: true }}
        onConfirm={(e) => { e?.stopPropagation?.(); onRemove(); }}
      >
        <button className="track-row-remove" onClick={(e) => e.stopPropagation()} title="Remove">
          <Trash2 size={13} />
        </button>
      </Popconfirm>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Track detail panel (right pane — when a track is selected)
// ---------------------------------------------------------------------------

function TrackDetailPanel({ playlistId, track, onBack, onChanged, onRemoved }: {
  playlistId: number;
  track: musicService.PlaylistTrack;
  onBack: () => void;
  onChanged: () => void;
  onRemoved: () => void;
}) {
  const [customTitle, setCustomTitle] = useState(track.title !== track.original_title ? track.title : "");
  const [artist, setArtist] = useState(track.artist ?? "");
  const [lyricsUrl, setLyricsUrl] = useState(track.lyrics_url ?? "");
  const isRenamed = track.title !== track.original_title;

  async function saveRename() {
    if (!customTitle.trim()) return;
    await musicService.renameTrackInPlaylist(playlistId, track.id!, customTitle.trim());
    message.success("Renamed in this playlist.");
    onChanged();
  }
  async function resetRename() {
    await musicService.resetTrackTitleInPlaylist(playlistId, track.id!);
    onChanged();
  }
  async function saveDetails() {
    await musicService.updateTrackDetails(track.id!, { artist, lyricsUrl });
    message.success("Track details saved.");
    onChanged();
  }

  return (
    <SpotlightCard className="evol-glass-card detail-card fade-in-up">
      <button className="detail-back-btn" onClick={onBack}><X size={14} /> Close</button>

      <div className="detail-track-hero">
        {track.thumbnail_url
          ? <img src={track.thumbnail_url} alt="" />
          : <div className="detail-track-hero-empty"><Music2 size={26} /></div>}
        <div>
          <Text className="detail-track-title">{track.title}</Text>
          <Text className="detail-track-meta">{track.artist || "Unknown artist"}</Text>
        </div>
      </div>

      <div className="detail-section">
        <label><Pencil size={13} /> Rename in this playlist</label>
        <p className="detail-hint">Library title: {track.original_title}</p>
        <div className="detail-row">
          <Input value={customTitle} onChange={(e) => setCustomTitle(e.target.value)} placeholder={track.original_title} />
          <Button className="btn-glow" onClick={saveRename}>Save</Button>
          {isRenamed && <Button onClick={resetRename}>Reset</Button>}
        </div>
      </div>

      <div className="detail-section">
        <label><Music2 size={13} /> Artist &amp; lyrics (library-wide)</label>
        <div className="detail-row">
          <Input value={artist} onChange={(e) => setArtist(e.target.value)} placeholder="Artist" />
        </div>
        <div className="detail-row">
          <Input value={lyricsUrl} onChange={(e) => setLyricsUrl(e.target.value)} placeholder="Lyrics URL" />
          <Button className="btn-glow" onClick={saveDetails}>Save</Button>
        </div>
        {lyricsUrl.trim() && (
          <a href={lyricsUrl} target="_blank" rel="noreferrer" className="detail-lyrics-link">
            <Link2 size={12} /> Open lyrics
          </a>
        )}
      </div>

      <Popconfirm title="Remove from playlist?" okText="Remove" cancelText="Cancel" okButtonProps={{ danger: true }} onConfirm={onRemoved}>
        <Button danger icon={<Trash2 size={14} />} className="detail-remove-btn">Remove from playlist</Button>
      </Popconfirm>
    </SpotlightCard>
  );
}

// ---------------------------------------------------------------------------
// Playlist detail panel (right pane — default, no track selected)
// ---------------------------------------------------------------------------

function PlaylistDetailPanel({
  userId, playlist, playlists, tracks, tab, onTabChange, onRenamed, onDeleted,
  onPlayMode, isPlaying, currentMode, onTracksChanged,
}: {
  userId: string;
  playlist: musicService.Playlist;
  playlists: musicService.Playlist[];
  tracks: musicService.PlaylistTrack[];
  tab: RightTab;
  onTabChange: (t: RightTab) => void;
  onRenamed: () => void;
  onDeleted: () => void;
  onPlayMode: (mode: string) => void;
  isPlaying: boolean;
  currentMode: string | null;
  onTracksChanged: () => void;
}) {
  const [renameValue, setRenameValue] = useState(playlist.name);
  const [copySourceId, setCopySourceId] = useState<number | undefined>(undefined);
  const [copyBusy, setCopyBusy] = useState(false);
  const [copyMessage, setCopyMessage] = useState<string | null>(null);

  async function saveRename() {
    const trimmed = renameValue.trim();
    if (!trimmed || trimmed === playlist.name) return;
    await musicService.renamePlaylist(playlist.id, trimmed);
    message.success("Renamed.");
    onRenamed();
  }

  async function handleCopy() {
    if (!copySourceId) return;
    setCopyBusy(true);
    const added = await musicService.copyPlaylistTracks(copySourceId, playlist.id);
    setCopyBusy(false);
    setCopyMessage(`Copied ${added} new track(s).`);
    onTracksChanged();
  }

  async function downloadExport(format: "json" | "text") {
    const content = format === "json"
      ? await musicService.exportPlaylistJson(playlist.id)
      : await musicService.exportPlaylistText(playlist.id);
    const blob = new Blob([content], { type: format === "json" ? "application/json" : "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${playlist.name || "playlist"}.${format === "json" ? "json" : "txt"}`;
    a.click();
    URL.revokeObjectURL(url);
    message.success("Download started.");
  }

  const otherPlaylists = playlists.filter((p) => p.id !== playlist.id);

  return (
    <SpotlightCard className="evol-glass-card detail-card fade-in-up">
      <div className="detail-row">
        <Input
          className="playlist-name-input"
          value={renameValue}
          onChange={(e) => setRenameValue(e.target.value)}
          onPressEnter={saveRename}
        />
        <Tooltip title="Save name">
          <Button className="btn-glow" icon={<Check size={14} />} onClick={saveRename} />
        </Tooltip>
        <Popconfirm title="Delete this playlist?" description="This can't be undone." okText="Delete" cancelText="Cancel" okButtonProps={{ danger: true }} onConfirm={onDeleted}>
          <Button danger icon={<Trash2 size={14} />} />
        </Popconfirm>
      </div>

      <div className="transport-row">
        <Tooltip title="Play">
          <button
            className={`transport-glow-btn${isPlaying && currentMode === "normal" ? " transport-glow-btn-active" : ""}`}
            onClick={() => onPlayMode("Normal")}
          >
            <Play size={16} />
          </button>
        </Tooltip>
        <Tooltip title="Shuffle">
          <button
            className={`transport-glow-btn${isPlaying && currentMode === "shuffle" ? " transport-glow-btn-active" : ""}`}
            onClick={() => onPlayMode("Shuffle")}
          >
            <Shuffle size={16} />
          </button>
        </Tooltip>
        <Tooltip title="Repeat all">
          <button
            className={`transport-glow-btn${isPlaying && currentMode === "repeatAll" ? " transport-glow-btn-active" : ""}`}
            onClick={() => onPlayMode("Repeat All")}
          >
            <Repeat size={16} />
          </button>
        </Tooltip>
        {isPlaying && (
          <span className="transport-live-badge"><RadioTower size={11} /> Live</span>
        )}
      </div>

      <Segmented
        className="detail-tabs"
        block
        value={tab}
        onChange={(v) => onTabChange(v as RightTab)}
        options={[
          { label: "Overview", value: "overview" },
          { label: "Add tracks", value: "add" },
          { label: "Export", value: "export" },
        ]}
      />

      <div className="detail-tab-body fade-in" key={tab}>
        {tab === "overview" && (
          <div className="playlist-overview-body">
            <p className="evol-card-meta">{tracks.length} track{tracks.length === 1 ? "" : "s"} in this playlist.</p>
            <p className="detail-hint">
              Pick a track on the left to rename it, edit its artist, or attach lyrics — or use the tabs above to add more music or export this playlist.
              {isPlaying && " Playback follows whatever mode you pick above, live — no need to hit play again."}
            </p>
          </div>
        )}

        {tab === "add" && <AddTrackPanel playlistId={playlist.id} addedBy={userId} onAdded={onTracksChanged} />}

        {tab === "export" && (
          <div className="playlist-export-body">
            <p className="evol-card-meta">Copy tracks from another playlist</p>
            {otherPlaylists.length === 0 ? (
              <p className="placeholder-note">No other playlists yet.</p>
            ) : (
              <div className="detail-row">
                <Select
                  className="copy-select"
                  value={copySourceId}
                  placeholder="Choose a playlist…"
                  onChange={(v) => setCopySourceId(v)}
                  options={otherPlaylists.map((p) => ({ value: p.id, label: p.name }))}
                />
                <Button className="btn-glow" disabled={!copySourceId} loading={copyBusy} icon={<Copy size={14} />} onClick={handleCopy}>
                  Copy
                </Button>
              </div>
            )}
            {copyMessage && <p className="success">{copyMessage}</p>}

            <p className="evol-card-meta" style={{ marginTop: 16 }}>Download</p>
            <div className="detail-row">
              <Button icon={<FileJson size={14} />} onClick={() => downloadExport("json")}>JSON</Button>
              <Button icon={<FileText size={14} />} onClick={() => downloadExport("text")}>Text</Button>
            </div>
          </div>
        )}
      </div>
    </SpotlightCard>
  );
}

// ---------------------------------------------------------------------------
// Import panel (top toolbar)
// ---------------------------------------------------------------------------

function ImportPanel({ userId, onImported }: { userId: string; onImported: () => void }) {
  const [raw, setRaw] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);

  async function handleImport() {
    if (!raw.trim()) return;
    setBusy(true);
    const result = await musicService.importPlaylist(userId, raw);
    setBusy(false);
    setMsg({ text: result.message, ok: result.ok });
    if (result.ok) { message.success(result.message); setRaw(""); onImported(); }
  }

  return (
    <SpotlightCard className="evol-glass-card music-inline-form music-import-form fade-in-up">
      <p className="evol-card-meta">Paste JSON exported from EVOL Space, or plain text with one "Title - URL" per line.</p>
      <Input.TextArea value={raw} onChange={(e) => setRaw(e.target.value)} placeholder="Paste playlist data..." rows={5} />
      <Button className="btn-glow" loading={busy} disabled={!raw.trim()} onClick={handleImport} icon={<Upload size={14} />}>
        Import
      </Button>
      {msg && <p className={msg.ok ? "success" : "error"}>{msg.text}</p>}
    </SpotlightCard>
  );
}

// ---------------------------------------------------------------------------
// Add-track panel — three tabs: search / paste link / YT playlist import
// ---------------------------------------------------------------------------

function AddTrackPanel({ playlistId, addedBy, onAdded }: { playlistId: number; addedBy: string; onAdded: () => void }) {
  const [tab, setTab] = useState<"search" | "link" | "playlist">("search");

  return (
    <div>
      <Segmented
        size="small"
        block
        value={tab}
        onChange={(v) => setTab(v as "search" | "link" | "playlist")}
        options={[
          { label: "Search", value: "search" },
          { label: "Paste link", value: "link" },
          { label: "YT playlist", value: "playlist" },
        ]}
        style={{ marginBottom: 10 }}
      />
      <div className="fade-in" key={tab}>
        {tab === "search" && <AddBySearch playlistId={playlistId} addedBy={addedBy} onAdded={onAdded} />}
        {tab === "link" && <AddByLink playlistId={playlistId} addedBy={addedBy} onAdded={onAdded} />}
        {tab === "playlist" && <AddByPlaylistImport playlistId={playlistId} addedBy={addedBy} onAdded={onAdded} />}
      </div>
    </div>
  );
}

function AddByLink({ playlistId, addedBy, onAdded }: { playlistId: number; addedBy: string; onAdded: () => void }) {
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);

  async function handleSubmit() {
    if (!url.trim()) return;
    setBusy(true);
    const result = await musicService.addTrackAndAttach(playlistId, url.trim(), addedBy);
    setBusy(false);
    setMsg({ text: result.message, ok: result.ok });
    if (result.ok) { message.success(result.message); setUrl(""); onAdded(); }
  }

  return (
    <div>
      <div className="detail-row">
        <Input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://www.youtube.com/watch?v=..."
          onPressEnter={handleSubmit}
          prefix={<Link2 size={13} color="var(--evol-muted)" />}
        />
        <Button className="btn-glow" loading={busy} disabled={!url.trim()} onClick={handleSubmit}>Add</Button>
      </div>
      {msg && <p className={msg.ok ? "success" : "error"}>{msg.text}</p>}
    </div>
  );
}

function AddBySearch({ playlistId, addedBy, onAdded }: { playlistId: number; addedBy: string; onAdded: () => void }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchSongResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [addingId, setAddingId] = useState<string | null>(null);

  async function handleSearch() {
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
    message.success(`Added "${r.title}"`);
    onAdded();
  }

  return (
    <div>
      <div className="detail-row">
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="song title or artist..."
          onPressEnter={handleSearch}
          prefix={<Search size={13} color="var(--evol-muted)" />}
        />
        <Button className="btn-glow" loading={searching} disabled={!query.trim()} onClick={handleSearch}>Search</Button>
      </div>
      <div className="search-result-list">
        {searching ? (
          <Skeleton active paragraph={{ rows: 2 }} className="fade-in" />
        ) : (
          results.map((r, i) => (
            <div className="search-result-row stagger-item" style={{ animationDelay: `${i * 30}ms` }} key={r.video_id}>
              {r.thumbnail_url
                ? <img src={r.thumbnail_url} alt="" />
                : <div className="search-result-thumb-empty"><Music2 size={14} /></div>}
              <div className="search-result-info">
                <div className="search-result-title">{r.title}</div>
                <div className="evol-card-meta">{r.artist}{r.duration ? ` · ${r.duration}` : ""}</div>
              </div>
              <button className="search-result-add" onClick={() => handleAdd(r)} disabled={addingId === r.video_id}>
                {addingId === r.video_id ? <span className="mini-spinner" /> : <Plus size={14} />}
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function AddByPlaylistImport({ playlistId, addedBy, onAdded }: { playlistId: number; addedBy: string; onAdded: () => void }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchPlaylistResult[]>([]);
  const [searched, setSearched] = useState(false);
  const [searching, setSearching] = useState(false);
  const [addingId, setAddingId] = useState<string | null>(null);
  const [searchMsg, setSearchMsg] = useState<{ text: string; ok: boolean } | null>(null);

  const [url, setUrl] = useState("");
  const [linkBusy, setLinkBusy] = useState(false);
  const [linkMsg, setLinkMsg] = useState<{ text: string; ok: boolean } | null>(null);

  async function handleSearch() {
    if (!query.trim()) return;
    setSearching(true);
    const r = await searchPlaylists(query.trim());
    setResults(r);
    setSearched(true);
    setSearching(false);
  }

  async function handleAddFromSearch(pr: SearchPlaylistResult) {
    setAddingId(pr.playlist_id);
    setSearchMsg(null);
    const result = await musicService.addPlaylistFromYoutube(playlistId, `https://www.youtube.com/playlist?list=${pr.playlist_id}`, addedBy);
    setAddingId(null);
    setSearchMsg({ text: result.message, ok: result.ok });
    if (result.ok) { message.success(result.message); onAdded(); }
  }

  async function handleSubmitLink() {
    if (!url.trim()) return;
    setLinkBusy(true);
    const result = await musicService.addPlaylistFromYoutube(playlistId, url.trim(), addedBy);
    setLinkBusy(false);
    setLinkMsg({ text: result.message, ok: result.ok });
    if (result.ok) { message.success(result.message); setUrl(""); onAdded(); }
  }

  return (
    <div>
      <p className="evol-card-meta">Search for a playlist, or paste a link, to add every track at once.</p>

      <div className="detail-row">
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="playlist name..."
          onPressEnter={handleSearch}
          prefix={<Search size={13} color="var(--evol-muted)" />}
        />
        <Button className="btn-glow" loading={searching} disabled={!query.trim()} onClick={handleSearch}>Search</Button>
      </div>

      <div className="search-result-list">
        {searching ? (
          <Skeleton active paragraph={{ rows: 2 }} className="fade-in" />
        ) : (
          results.map((pr, i) => (
            <div className="search-result-row stagger-item" style={{ animationDelay: `${i * 30}ms` }} key={pr.playlist_id}>
              {pr.thumbnail_url
                ? <img src={pr.thumbnail_url} alt="" />
                : <div className="search-result-thumb-empty"><ListMusic size={14} /></div>}
              <div className="search-result-info">
                <div className="search-result-title">{pr.title}</div>
                <div className="evol-card-meta">{pr.author}{pr.item_count ? ` · ${pr.item_count} tracks` : ""}</div>
              </div>
              <button
                className="search-result-add"
                onClick={() => handleAddFromSearch(pr)}
                disabled={addingId === pr.playlist_id}
                title="Import this playlist"
              >
                {addingId === pr.playlist_id ? <span className="mini-spinner" /> : <Plus size={14} />}
              </button>
            </div>
          ))
        )}
        {searched && !searching && results.length === 0 && (
          <Empty className="fade-in" image={Empty.PRESENTED_IMAGE_SIMPLE} description={`No importable playlists found for "${query.trim()}".`} />
        )}
      </div>
      {searchMsg && <p className={searchMsg.ok ? "success" : "error"}>{searchMsg.text}</p>}

      <p className="evol-card-meta" style={{ marginTop: 16 }}>Or paste a playlist link directly</p>
      <div className="detail-row">
        <Input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://www.youtube.com/playlist?list=..."
          onPressEnter={handleSubmitLink}
          prefix={<Link2 size={13} color="var(--evol-muted)" />}
        />
        <Button className="btn-glow" loading={linkBusy} disabled={!url.trim()} onClick={handleSubmitLink}>Add all</Button>
      </div>
      {linkMsg && <p className={linkMsg.ok ? "success" : "error"}>{linkMsg.text}</p>}
    </div>
  );
}