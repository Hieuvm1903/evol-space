import React, { useState } from "react";
import { App, Button, Input } from "antd";
import { Upload } from "lucide-react";
import * as musicService from "../../lib/musicService";
import SpotlightCard from "../../components/SpotlightCard";
import HelpTip from "../../components/HelpTip";

export default function ImportPanel({ userId, onImported }: { userId: string; onImported: () => void }) {
  const { message } = App.useApp();
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
      <Input.TextArea value={raw} onChange={(e) => setRaw(e.target.value)} placeholder="Paste playlist data..." rows={4} />
      <div className="detail-row" style={{ alignItems: "center", marginBottom: 0 }}>
        <Button className="btn-glow" style={{ flex: 1 }} loading={busy} disabled={!raw.trim()} onClick={handleImport} icon={<Upload size={14} />}>
          Import
        </Button>
        <HelpTip content='Paste JSON exported from EVOL Space, or plain text with one "Title - URL" per line.' />
      </div>
      {msg && <p className={msg.ok ? "success" : "error"}>{msg.text}</p>}
    </SpotlightCard>
  );
}
