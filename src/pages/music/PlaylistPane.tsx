import React, { useEffect, useMemo, useRef, useState } from "react";
import { Input, Button, Popconfirm, Empty, Skeleton, Tooltip, Dropdown, message } from "antd";
import {
  Plus, Search, Play, Shuffle, Repeat, Trash2, Check,
  Download, FileJson, FileText, ArrowUpDown,
} from "lucide-react";
import * as musicService from "../../lib/musicService";
import SpotlightCard from "../../components/SpotlightCard";
import TrackRow from "./TrackRow";
import AddTrackPanel from "./AddTrackPanel";

type SortMode = "default" | "name-asc" | "name-desc" | "artist-asc" | "artist-desc";

const SORT_OPTIONS: { key: SortMode; label: string }[] = [
  { key: "default", label: "Playlist order" },
  { key: "name-asc", label: "Name A–Z" },
  { key: "name-desc", label: "Name Z–A" },
  { key: "artist-asc", label: "Artist A–Z" },
  { key: "artist-desc", label: "Artist Z–A" },
];

export default function PlaylistPane({
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
  const [sortMode, setSortMode] = useState<SortMode>("default");
  const [expandedTrackId, setExpandedTrackId] = useState<number | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [showExport, setShowExport] = useState(false);

  async function saveRename() {
    const trimmed = renameValue.trim();
    if (!trimmed || trimmed === playlist.name) return;
    await musicService.renamePlaylist(playlist.id, trimmed);
    message.success("Renamed.");
    onRenamed();
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
    const base = q
      ? tracks.filter((t) => t.title.toLowerCase().includes(q) || (t.artist ?? "").toLowerCase().includes(q))
      : tracks;
    switch (sortMode) {
      case "name-asc":
        return [...base].sort((a, b) => a.title.localeCompare(b.title, undefined, { sensitivity: "base" }));
      case "name-desc":
        return [...base].sort((a, b) => b.title.localeCompare(a.title, undefined, { sensitivity: "base" }));
      case "artist-asc":
        return [...base].sort((a, b) => (a.artist ?? "").localeCompare(b.artist ?? "", undefined, { sensitivity: "base" }));
      case "artist-desc":
        return [...base].sort((a, b) => (b.artist ?? "").localeCompare(a.artist ?? "", undefined, { sensitivity: "base" }));
      default:
        return base;
    }
  }, [tracks, trackSearch, sortMode]);
  const addPanelWrapRef = useRef<HTMLDivElement>(null);
  const addToggleRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!showAdd) return;
    function handleClickOutside(e: MouseEvent) {
      const target = e.target as Node;
      if (addPanelWrapRef.current?.contains(target)) return;
      if (addToggleRef.current?.contains(target)) return;
      setShowAdd(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [showAdd]);
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
        <Dropdown
          trigger={["click"]}
          menu={{
            items: SORT_OPTIONS.map((opt) => ({
              key: opt.key,
              label: opt.label,
              icon: sortMode === opt.key ? <Check size={13} /> : undefined,
            })),
            selectedKeys: [sortMode],
            onClick: ({ key }) => setSortMode(key as SortMode),
          }}
        >
          <Tooltip title="Sort">
            <Button
              className={`glow-icon-btn${sortMode !== "default" ? " glow-icon-btn-active" : ""}`}
              icon={<ArrowUpDown size={15} />}
            />
          </Tooltip>
        </Dropdown>
        <Tooltip title="Add tracks">
          <Button
            ref={addToggleRef}
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
        <div ref={addPanelWrapRef}>
          <SpotlightCard className="evol-glass-card music-inline-panel fade-in-up">
            <AddTrackPanel playlistId={playlist.id} addedBy={userId} otherPlaylists={otherPlaylists} onAdded={onTracksChanged} />
          </SpotlightCard>
        </div>
      )}

      {showExport && (
        <SpotlightCard className="evol-glass-card music-inline-panel fade-in-up">
          <p className="evol-card-meta">Download</p>
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