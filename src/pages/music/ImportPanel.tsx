import React, { useState } from "react";
import { Button, Input, message } from "antd";
import { Upload } from "lucide-react";
import * as musicService from "../../lib/musicService";
import SpotlightCard from "../../components/SpotlightCard";

export default function ImportPanel({ userId, onImported }: { userId: string; onImported: () => void }) {
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
