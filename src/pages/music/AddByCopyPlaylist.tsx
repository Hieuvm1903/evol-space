import React, { useState } from "react";
import { Button, Select } from "antd";
import { Copy } from "lucide-react";
import * as musicService from "../../lib/musicService";
import HelpTip from "../../components/HelpTip";

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
      {otherPlaylists.length === 0 ? (
        <p className="placeholder-note" style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span>No other playlists yet.</span>
          <HelpTip content="Copy every track from another playlist into this one." />
        </p>
      ) : (
        <div className="detail-row" style={{ alignItems: "center" }}>
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
          <HelpTip content="Copy every track from another playlist into this one." />
        </div>
      )}
      {msg && <p className="success">{msg}</p>}
    </div>
  );
}