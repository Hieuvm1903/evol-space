import React, { useEffect, useState } from "react";
import { Empty, message } from "antd";
import { Sparkles } from "lucide-react";
import { usePlayer } from "../../features/player/PlayerProvider";
import * as musicService from "../../lib/musicService";
import AlbumPickerPane from "./AlbumPickerPane";
import PlaylistPane from "./PlaylistPane";

export default function MusicWorkspace({ userId }: { userId: string }) {
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
