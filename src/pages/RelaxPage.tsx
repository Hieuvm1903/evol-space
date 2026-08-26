import React, { useEffect, useState } from "react";
import { Button, Input, message, Empty } from "antd";
import { Wind, Send } from "lucide-react";
import { supabase } from "../lib/supabaseClient";

interface Note {
  id: number;
  content: string;
  time: string; // ISO timestamptz from Postgres
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getMonth() + 1)}/${pad(d.getDate())}/${d.getFullYear()}, ` +
    `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

export function RelaxPage() {
  const [text, setText] = useState("");
  const [notes, setNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  async function loadNotes() {
    setLoading(true);
    const { data, error } = await supabase
      .from("notes")
      .select("*")
      .order("id", { ascending: false });
    if (!error && data) setNotes(data as Note[]);
    setLoading(false);
  }

  useEffect(() => {
    loadNotes();
  }, []);

  async function handleSubmit() {
    if (!text.trim()) return;
    setSubmitting(true);
    // Same "{" + text + "}" wrapping the original notes_service.add_note()
    // call does in relax.py — kept as-is even though its purpose isn't
    // obvious, since this is a straight port, not a redesign.
    const { error } = await supabase.from("notes").insert({ content: `{${text}}` });
    setSubmitting(false);
    if (!error) {
      message.success("Sent 💭");
      setText("");
      loadNotes();
    } else {
      message.error("Couldn't save that — try again.");
    }
  }

  return (
    <div className="page">
      <h2>
        <Wind size={22} style={{ verticalAlign: -4, marginRight: 8, color: "#22d3ee" }} />
        Relax
      </h2>

      <div className="evol-glass-card relax-form" style={{ padding: 16 }}>
        <Input.TextArea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Tâm sự vào đây (Ẩn danh 100%)"
          rows={4}
          autoSize={{ minRows: 4, maxRows: 8 }}
        />
        <Button
          type="primary"
          icon={<Send size={14} />}
          onClick={handleSubmit}
          loading={submitting}
          disabled={!text.trim()}
          className="btn-glow"
          style={{ marginTop: 10 }}
        >
          Submit
        </Button>
      </div>

      {loading ? (
        <p className="placeholder-note">Loading…</p>
      ) : notes.length === 0 ? (
        <Empty className="fade-in" description={<span style={{ color: "#9c97b8" }}>No thoughts shared yet.</span>} image={Empty.PRESENTED_IMAGE_SIMPLE} />
      ) : (
        notes.map((note, i) => (
          <div className="evol-card stagger-item" style={{ animationDelay: `${Math.min(i, 15) * 40}ms` }} key={note.id}>
            <div className="evol-card-meta">{formatTime(note.time)}</div>
            <div className="evol-card-body">{note.content}</div>
          </div>
        ))
      )}
    </div>
  );
}