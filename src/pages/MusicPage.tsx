import React, { useEffect, useMemo, useState } from "react";
import { Select, Input, Button, Popconfirm, Empty, Skeleton, Tooltip, message, List } from "antd";
import {
  Music2, ListMusic, Plus, Search, Play, Shuffle, Repeat, Trash2, Pencil,
  Link2, Upload, Download, Copy, FileJson, FileText, Sparkles, Check, RadioTower,
} from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import { usePlayer } from "../features/player/PlayerProvider";
import * as musicService from "../lib/musicService";
import { searchSongs, searchPlaylists, SearchSongResult, SearchPlaylistResult } from "../lib/youtube";
import SpotlightCard from "../components/SpotlightCard";
import "./MusicPage.css";

// Small galaxy palette so each album card in the CardSwap stack gets a
// distinct, on-theme cover gradient instead of every card looking the same.
const PLAYLIST_GRADIENTS = [
  "linear-gradient(135deg, #8b6ff5, #22d3ee)",
  "linear-gradient(135deg, #e879f9, #8b6ff5)",
  "linear-gradient(135deg, #22d3ee, #60a5fa)",
  "linear-gradient(135deg, #f472b6, #8b6ff5)",
  "linear-gradient(135deg, #60a5fa, #22d3ee)",
];
function gradientForIndex(i: number) {
  return PLAYLIST_GRADIENTS[i % PLAYLIST_GRADIENTS.length];
}

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
// Workspace — album picker (left) + playlist/tracklist (right)
// ---------------------------------------------------------------------------

function MusicWorkspace({ userId }: { userId: string }) {
  const player = usePlayer();

  const [playlists, setPlaylists] = useState<musicService.Playlist[]>([]);
  const [loadingPlaylists, setLoadingPlaylists] = useState(true);
  const [selectedPlaylistId, setSelectedPlaylistId] = useState<number | null>(null);

  const [tracks, setTracks] = useState<musicService.PlaylistTrack[]>([]);
  const [loadingTracks, setLoadingTracks] = useState(false);

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedPlaylistId]);

  const selectedPlaylist = playlists.find((p) => p.id === selectedPlaylistId) ?? null;

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
    loadTracks();
  }

  const isThisPlaylistPlaying = selectedPlaylistId !== null && player.playingPlaylistId === selectedPlaylistId;

  return (
    <div className="page music-page-shell">
      <div className="music-shell-header fade-in-up">
        <h2 className="music-title"><Sparkles size={20} className="music-title-icon" /> Music</h2>
        <p className="music-subtitle">Your galaxy of playlists — swap an album, then dive into the tracklist.</p>
      </div>

      {playlists.length === 0 && !loadingPlaylists ? (
        <div className="music-workspace">
          <AlbumPickerPane
            playlists={playlists}
            loadingPlaylists={loadingPlaylists}
            selectedPlaylistId={selectedPlaylistId}
            onSelect={setSelectedPlaylistId}
            showNewPlaylist={showNewPlaylist}
            setShowNewPlaylist={setShowNewPlaylist}
            newPlaylistName={newPlaylistName}
            setNewPlaylistName={setNewPlaylistName}
            creating={creating}
            onCreate={handleCreatePlaylist}
            showImport={showImport}
            setShowImport={setShowImport}
            userId={userId}
            onImported={() => { setShowImport(false); loadPlaylists(); }}
          />
          <div className="music-pane music-pane-right">
            <Empty className="fade-in music-empty-state" description="No playlists yet — tap + on the left to create one." image={Empty.PRESENTED_IMAGE_SIMPLE} />
          </div>
        </div>
      ) : (
        <div className="music-workspace">
          <AlbumPickerPane
            playlists={playlists}
            loadingPlaylists={loadingPlaylists}
            selectedPlaylistId={selectedPlaylistId}
            onSelect={setSelectedPlaylistId}
            showNewPlaylist={showNewPlaylist}
            setShowNewPlaylist={setShowNewPlaylist}
            newPlaylistName={newPlaylistName}
            setNewPlaylistName={setNewPlaylistName}
            creating={creating}
            onCreate={handleCreatePlaylist}
            showImport={showImport}
            setShowImport={setShowImport}
            userId={userId}
            onImported={() => { setShowImport(false); loadPlaylists(); }}
          />

          <div className="music-pane music-pane-right">
            {selectedPlaylist ? (
              <PlaylistPane
                key={selectedPlaylist.id}
                userId={userId}
                playlist={selectedPlaylist}
                playlists={playlists}
                tracks={tracks}
                loadingTracks={loadingTracks}
                isPlaying={isThisPlaylistPlaying && player.isPlaying}
                nowPlayingTrackId={player.nowPlayingTrackId}
                currentMode={isThisPlaylistPlaying ? player.currentMode : null}
                onPlayMode={playMode}
                onPlayFromTrack={playFromTrack}
                onRemoveTrack={handleRemoveTrack}
                onRenamed={loadPlaylists}
                onDeleted={handleDeletePlaylist}
                onTracksChanged={loadTracks}
              />
            ) : (
              <Empty className="fade-in" description="Pick an album on the left" image={Empty.PRESENTED_IMAGE_SIMPLE} />
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Left pane — CardSwap album picker + create/import
// ---------------------------------------------------------------------------

function AlbumPickerPane({
  playlists, loadingPlaylists, selectedPlaylistId, onSelect,
  showNewPlaylist, setShowNewPlaylist, newPlaylistName, setNewPlaylistName, creating, onCreate,
  showImport, setShowImport, userId, onImported,
}: {
  playlists: musicService.Playlist[];
  loadingPlaylists: boolean;
  selectedPlaylistId: number | null;
  onSelect: (id: number) => void;
  showNewPlaylist: boolean;
  setShowNewPlaylist: React.Dispatch<React.SetStateAction<boolean>>;
  newPlaylistName: string;
  setNewPlaylistName: (v: string) => void;
  creating: boolean;
  onCreate: () => void;
  showImport: boolean;
  setShowImport: React.Dispatch<React.SetStateAction<boolean>>;
  userId: string;
  onImported: () => void;
}) {
  const [albumSearch, setAlbumSearch] = useState("");
  const filteredPlaylists = useMemo(() => {
    const q = albumSearch.trim().toLowerCase();
    if (!q) return playlists;
    return playlists.filter((p) => p.name.toLowerCase().includes(q));
  }, [playlists, albumSearch]);

  return (
    <div className="music-pane music-pane-left album-picker-pane">
      <div className="album-picker-header">
        <h3 className="album-picker-title"><ListMusic size={15} /> Albums</h3>
        <div className="album-picker-actions">
          <Tooltip title="New playlist">
            <Button
              className="glow-icon-btn" size="small" icon={<Plus size={14} />}
              onClick={() => { setShowNewPlaylist((v) => !v); setShowImport(false); }}
            />
          </Tooltip>
          <Tooltip title="Import playlist">
            <Button
              className="glow-icon-btn" size="small" icon={<Upload size={14} />}
              onClick={() => { setShowImport((v) => !v); setShowNewPlaylist(false); }}
            />
          </Tooltip>
        </div>
      </div>

      {playlists.length > 0 && (
        <Input
          className="album-search-input"
          size="small"
          value={albumSearch}
          onChange={(e) => setAlbumSearch(e.target.value)}
          placeholder="Search albums..."
          prefix={<Search size={13} color="var(--evol-muted)" />}
          allowClear
        />
      )}

      {showNewPlaylist && (
        <SpotlightCard className="evol-glass-card music-inline-form fade-in-up">
          <Input
            size="small"
            value={newPlaylistName}
            onChange={(e) => setNewPlaylistName(e.target.value)}
            placeholder="New playlist name"
            onPressEnter={onCreate}
            autoFocus
          />
          <Button size="small" type="primary" className="btn-glow" loading={creating} disabled={!newPlaylistName.trim()} onClick={onCreate}>
            Create
          </Button>
        </SpotlightCard>
      )}

      {showImport && <ImportPanel userId={userId} onImported={onImported} />}

      {loadingPlaylists ? (
        <Skeleton active paragraph={{ rows: 3 }} className="fade-in" />
      ) : playlists.length === 0 ? (
        <Empty className="fade-in" description="No playlists yet" image={Empty.PRESENTED_IMAGE_SIMPLE} />
      ) : (
        <List
          className="album-list"
          size="small"
          dataSource={playlists}
          renderItem={(p) => (
            <List.Item
              key={p.id}
              className={`album-list-item${selectedPlaylistId === p.id ? " album-list-item-active" : ""}`}
              onClick={() => onSelect(p.id)}
            >
              <ListMusic size={14} className="album-list-item-icon" />
              <span className="album-list-item-name">{p.name}</span>
            </List.Item>
          )}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Right pane — the selected playlist: header, transport, tools, tracklist
// ---------------------------------------------------------------------------

function PlaylistPane({
  userId, playlist, playlists, tracks, loadingTracks,
  isPlaying, nowPlayingTrackId, currentMode,
  onPlayMode, onPlayFromTrack, onRemoveTrack, onRenamed, onDeleted, onTracksChanged,
}: {
  userId: string;
  playlist: musicService.Playlist;
  playlists: musicService.Playlist[];
  tracks: musicService.PlaylistTrack[];
  loadingTracks: boolean;
  isPlaying: boolean;
  nowPlayingTrackId: number | null;
  currentMode: string | null;
  onPlayMode: (mode: string) => void;
  onPlayFromTrack: (trackId: number) => void;
  onRemoveTrack: (trackId: number) => void;
  onRenamed: () => void;
  onDeleted: () => void;
  onTracksChanged: () => void;
}) {
  const [renameValue, setRenameValue] = useState(playlist.name);
  const [trackSearch, setTrackSearch] = useState("");
  const [expandedTrackId, setExpandedTrackId] = useState<number | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [showExport, setShowExport] = useState(false);
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
  const filteredTracks = useMemo(() => {
    const q = trackSearch.trim().toLowerCase();
    if (!q) return tracks;
    return tracks.filter((t) => t.title.toLowerCase().includes(q) || (t.artist ?? "").toLowerCase().includes(q));
  }, [tracks, trackSearch]);

  return (
    <div className="playlist-pane-body fade-in-up">
      <div className="playlist-header-row">
        <div className="transport-row transport-row-inline">
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
        </div>
        {/* {isPlaying && <span className="transport-live-badge"><RadioTower size={11} /> Live</span>} */}
        <Input className="playlist-name-input" value={renameValue} onChange={(e) => setRenameValue(e.target.value)} onPressEnter={saveRename} />
        <Tooltip title="Save name">
          <Button className="btn-glow" icon={<Check size={14} />} onClick={saveRename} />
        </Tooltip>
        <Popconfirm title="Delete this playlist?" description="This can't be undone." okText="Delete" cancelText="Cancel" okButtonProps={{ danger: true }} onConfirm={onDeleted}>
          <Button danger icon={<Trash2 size={14} />} />
        </Popconfirm>

      </div>



      <div className="playlist-toolbar-row">
        <Input
          className="music-track-search"
          value={trackSearch}
          onChange={(e) => setTrackSearch(e.target.value)}
          placeholder="Search tracks..."
          prefix={<Search size={14} color="var(--evol-muted)" />}
          allowClear
        />
        <Tooltip title="Add tracks">
          <Button
            className={`glow-icon-btn${showAdd ? " glow-icon-btn-active" : ""}`}
            icon={<Plus size={15} />}
            onClick={() => { setShowAdd((v) => !v); setShowExport(false); }}
          />
        </Tooltip>
        <Tooltip title="Export / copy">
          <Button
            className={`glow-icon-btn${showExport ? " glow-icon-btn-active" : ""}`}
            icon={<Download size={15} />}
            onClick={() => { setShowExport((v) => !v); setShowAdd(false); }}
          />
        </Tooltip>
      </div>

      {showAdd && (
        <SpotlightCard className="evol-glass-card music-inline-panel fade-in-up">
          <AddTrackPanel playlistId={playlist.id} addedBy={userId} onAdded={onTracksChanged} />
        </SpotlightCard>
      )}

      {showExport && (
        <SpotlightCard className="evol-glass-card music-inline-panel fade-in-up">
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
          <p className="evol-card-meta" style={{ marginTop: 14 }}>Download</p>
          <div className="detail-row">
            <Button icon={<FileJson size={14} />} onClick={() => downloadExport("json")}>JSON</Button>
            <Button icon={<FileText size={14} />} onClick={() => downloadExport("text")}>Text</Button>
          </div>
        </SpotlightCard>
      )}

      <div className="playlist-track-count">{tracks.length} track{tracks.length === 1 ? "" : "s"}</div>

      <div className="playlist-track-list">
        {loadingTracks ? (
          <Skeleton active paragraph={{ rows: 5 }} className="fade-in" />
        ) : filteredTracks.length === 0 ? (
          <Empty
            className="fade-in"
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description={tracks.length === 0 ? "No tracks yet — tap + above to add some." : "No tracks match your search."}
          />
        ) : (
          filteredTracks.map((t, i) => (
            <TrackRow
              key={t.id}
              index={i}
              track={t}
              playlistId={playlist.id}
              expanded={expandedTrackId === t.id}
              playing={isPlaying && nowPlayingTrackId === t.id}
              onToggleExpand={() => setExpandedTrackId(expandedTrackId === t.id ? null : t.id!)}
              onPlay={() => onPlayFromTrack(t.id!)}
              onRemove={() => onRemoveTrack(t.id!)}
              onChanged={onTracksChanged}
            />
          ))
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Track row + inline manage panel (right pane)
// ---------------------------------------------------------------------------

function TrackRow({ index, track, playlistId, expanded, playing, onToggleExpand, onPlay, onRemove, onChanged }: {
  index: number;
  track: musicService.PlaylistTrack;
  playlistId: number;
  expanded: boolean;
  playing: boolean;
  onToggleExpand: () => void;
  onPlay: () => void;
  onRemove: () => void;
  onChanged: () => void;
}) {
  return (
    <div className="track-row-wrap stagger-item" style={{ animationDelay: `${Math.min(index, 14) * 25}ms` }}>
      <div className={`track-row${expanded ? " track-row-expanded" : ""}${playing ? " track-row-playing" : ""}`}>
        <button className="track-row-play" onClick={(e) => { e.stopPropagation(); onPlay(); }} title="Play from here">
          {playing ? <span className="track-eq"><span /><span /><span /></span> : <Play size={13} />}
        </button>

        {track.thumbnail_url ? (
          <img className="track-row-thumb" src={track.thumbnail_url} alt="" />
        ) : (
          <div className="track-row-thumb track-row-thumb-empty"><Music2 size={14} /></div>
        )}

        <div className="track-row-info" onClick={onToggleExpand}>
          <div className="track-row-title">{track.title}</div>
          {track.artist && <div className="track-row-artist">{track.artist}</div>}
        </div>

        <button className="track-row-manage" onClick={(e) => { e.stopPropagation(); onToggleExpand(); }} title="Manage">
          <Pencil size={13} />
        </button>

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

      {expanded && <TrackManagePanel playlistId={playlistId} track={track} onChanged={onChanged} />}
    </div>
  );
}

function TrackManagePanel({ playlistId, track, onChanged }: {
  playlistId: number;
  track: musicService.PlaylistTrack;
  onChanged: () => void;
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
    <div className="track-manage-panel fade-in-up">
      <div className="track-manage-field">
        <label><Pencil size={11} /> Rename in this playlist</label>
        <div className="track-manage-row">
          <Input size="small" value={customTitle} onChange={(e) => setCustomTitle(e.target.value)} placeholder={track.original_title} />
          <Button size="small" className="btn-glow" onClick={saveRename}>Save</Button>
          {isRenamed && <Button size="small" onClick={resetRename}>Reset</Button>}
        </div>
      </div>
      <div className="track-manage-field">
        <label><Music2 size={11} /> Artist</label>
        <Input size="small" value={artist} onChange={(e) => setArtist(e.target.value)} placeholder="Artist" />
      </div>
      <div className="track-manage-field">
        <label><Link2 size={11} /> Lyrics URL</label>
        <div className="track-manage-row">
          <Input size="small" value={lyricsUrl} onChange={(e) => setLyricsUrl(e.target.value)} placeholder="Lyrics URL" />
          <Button size="small" className="btn-glow" onClick={saveDetails}>Save</Button>
        </div>
        {lyricsUrl.trim() && (
          <a href={lyricsUrl} target="_blank" rel="noreferrer" className="detail-lyrics-link">
            <Link2 size={11} /> Open lyrics
          </a>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Import panel (album picker pane)
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
      <Input.TextArea value={raw} onChange={(e) => setRaw(e.target.value)} placeholder="Paste playlist data..." rows={4} />
      <Button className="btn-glow" loading={busy} disabled={!raw.trim()} onClick={handleImport} icon={<Upload size={14} />}>
        Import
      </Button>
      {msg && <p className={msg.ok ? "success" : "error"}>{msg.text}</p>}
    </SpotlightCard>
  );
}

// ---------------------------------------------------------------------------
// Add-track panel — search / paste link / YT playlist import
// ---------------------------------------------------------------------------

function AddTrackPanel({ playlistId, addedBy, onAdded }: { playlistId: number; addedBy: string; onAdded: () => void }) {
  const [tab, setTab] = useState<"search" | "link" | "playlist">("search");

  return (
    <div>
      <div className="add-track-tabs">
        {(["search", "link", "playlist"] as const).map((t) => (
          <button
            key={t}
            type="button"
            className={`add-track-tab-btn${tab === t ? " add-track-tab-btn-active" : ""}`}
            onClick={() => setTab(t)}
          >
            {t === "search" ? "Search" : t === "link" ? "Paste link" : "YT playlist"}
          </button>
        ))}
      </div>
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