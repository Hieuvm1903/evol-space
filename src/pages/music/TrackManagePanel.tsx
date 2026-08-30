import React, { useState } from "react";
import { Button, Input, message } from "antd";
import { Pencil, Music2, Link2 } from "lucide-react";
import * as musicService from "../../lib/musicService";

export default function TrackManagePanel({ playlistId, track, onChanged }: {
  playlistId: number;
  track: musicService.PlaylistTrack;
  onChanged: () => void;
}) {
  const [customTitle, setCustomTitle] = useState(track.title !== track.original_title ? track.title : track.original_title);
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
          <Input allowClear = {true} size="small" value={customTitle} onChange={(e) => setCustomTitle(e.target.value)} placeholder={track.original_title} />
          <Button size="small" className="btn-glow" onClick={saveRename}>Save</Button>
          {isRenamed && <Button size="small" onClick={resetRename}>Reset</Button>}
        </div>
      </div>
      <div className="track-manage-field">
        <label><Music2 size={11} /> Artist</label>
        <Input allowClear = {true} size="small" value={artist} onChange={(e) => setArtist(e.target.value)} placeholder="Artist" />
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
