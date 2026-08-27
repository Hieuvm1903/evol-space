import React, { useMemo, useState } from "react";
import { Input, Button, Empty, Skeleton, Tooltip, List } from "antd";
import { ListMusic, Plus, Upload, Search } from "lucide-react";
import * as musicService from "../../lib/musicService";
import SpotlightCard from "../../components/SpotlightCard";
import ImportPanel from "./ImportPanel";

export default function AlbumPickerPane({
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
