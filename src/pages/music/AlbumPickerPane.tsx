import React, { useMemo, useState } from "react";
import { Input, Button, Empty, Skeleton, Tooltip, List } from "antd";
import { ListMusic, Plus, Upload, Search } from "lucide-react";
import * as musicService from "../../lib/musicService";
import SpotlightCard from "../../components/SpotlightCard";
import ImportPanel from "./ImportPanel";
import type { LongPressSelect } from "../../hooks/useLongPressSelect";
import SelectCheckbox from "../../components/SelectCheckbox";
import LongPressRing from "../../components/LongPressRing";

export default function AlbumPickerPane({
  playlists, loadingPlaylists, selectedPlaylistId, onSelect,
  showNewPlaylist, setShowNewPlaylist, newPlaylistName, setNewPlaylistName, creating, onCreate,
  showImport, setShowImport, userId, onImported, longPress,
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
  /** Hold-1.5s-to-select template — see hooks/useLongPressSelect.ts */
  longPress: LongPressSelect<number>;
}) {
  const [albumSearch, setAlbumSearch] = useState("");
  const filteredPlaylists = useMemo(() => {
    const q = albumSearch.trim().toLowerCase();
    if (!q) return playlists;
    return playlists.filter((p) => p.name.toLowerCase().includes(q));
  }, [playlists, albumSearch]);

  return (
    <div className="music-pane music-pane-left album-picker-pane">
      <div className="album-picker-fixed">
        <div className="album-picker-header">
          <h3 className="album-picker-title"><ListMusic size={15} /> Albums</h3>
          {!longPress.selectMode && (
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
          )}
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

        {!longPress.selectMode && playlists.length > 0 && (
          <div className="album-list-hint">Hold an album to select several</div>
        )}
      </div>

      {loadingPlaylists ? (
        <Skeleton active paragraph={{ rows: 3 }} className="fade-in" style={{ padding: "0 4px" }} />
      ) : playlists.length === 0 ? (
        <Empty className="fade-in" description="No playlists yet" image={Empty.PRESENTED_IMAGE_SIMPLE} />
      ) : (
        <List
          className="album-list"
          size="small"
          dataSource={filteredPlaylists}
          renderItem={(p) => {
            const checked = longPress.isSelected(p.id);
            const pressing = longPress.isPressing(p.id);
            const lp = longPress.bind(p.id);
            return (
              <List.Item
                key={p.id}
                className={`album-list-item${selectedPlaylistId === p.id ? " album-list-item-active" : ""}${checked ? " album-list-item-checked" : ""}${pressing ? " pressing" : ""}`}
                {...lp}
                onClick={(e) => {
                  lp.onClick(e);
                  // Only switch albums if this click wasn't a long-press
                  // and didn't just toggle a checkbox in select mode.
                  if (!longPress.selectMode && !e.defaultPrevented) onSelect(p.id);
                }}
              >
                {longPress.selectMode ? (
                  <SelectCheckbox checked={checked} />
                ) : pressing ? (
                  <LongPressRing />
                ) : null}
                <ListMusic size={14} className="album-list-item-icon" />
                <span className="album-list-item-name">{p.name}</span>
              </List.Item>
            );
          }}
        />
      )}
    </div>
  );
}