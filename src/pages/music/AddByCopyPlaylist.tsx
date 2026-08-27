import React, { useState } from "react";
import { Button, Select } from "antd";
import { Copy } from "lucide-react";
import * as musicService from "../../lib/musicService";

export default function AddByCopyPlaylist({ targetPlaylistId, otherPlaylists, onAdded }: {
  targetPlaylistId: number;
  otherPlaylists: musicService.Playlist[];
  onAdded: () => void;
}) {
  const [sourceId, setSourceId] = useState<number | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function handleCopy() {
    if (!sourceId) return;
    setBusy(true);
    const added = await musicService.copyPlaylistTracks(sourceId, targetPlaylistId);
    setBusy(false);
    setMsg(`Copied ${added} new track(s).`);
    onAdded();
  }

  return (
    <div>
      <p className="evol-card-meta">Copy every track from another playlist into this one.</p>
      {otherPlaylists.length === 0 ? (
        <p className="placeholder-note">No other playlists yet.</p>
      ) : (
        <div className="detail-row">
          <Select
            className="copy-select"
            value={sourceId}
            placeholder="Choose a playlist…"
            onChange={(v) => setSourceId(v)}
            options={otherPlaylists.map((p) => ({ value: p.id, label: p.name }))}
          />
          <Button className="btn-glow" disabled={!sourceId} loading={busy} icon={<Copy size={14} />} onClick={handleCopy}>
            Copy
          </Button>
        </div>
      )}
      {msg && <p className="success">{msg}</p>}
    </div>
  );
}