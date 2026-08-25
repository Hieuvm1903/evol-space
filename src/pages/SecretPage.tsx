import React, { useEffect, useState } from "react";
import { message } from "antd";
import { supabase } from "../lib/supabaseClient";

interface Post {
  id: number;
  content: string;
  time: string;
}

// Same substring check (not exact match) as config.SECRET_KEY /
// ui/pages/secret.py's `if SECRET_KEY in key_input`. Worth being honest
// about: embedding this in client-side JS means anyone reading the
// bundle can find it, same as any "hidden" client-side check — it was
// never real security in the Python version either (SECRET_KEY sat in
// a plain .py file in the repo), just a lightweight easter egg gate.
const SECRET_KEY = "/Evolut!0n";

function formatTime(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getMonth() + 1)}/${pad(d.getDate())}/${d.getFullYear()}, ` +
    `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

export function SecretPage() {
  const [keyInput, setKeyInput] = useState("/Evolut??n"); // same hint-default as the original
  const [text, setText] = useState("");
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [warning, setWarning] = useState<string | null>(null);
  const [shake, setShake] = useState(false);

  async function loadPosts() {
    setLoading(true);
    const { data, error } = await supabase.from("blog").select("*").order("id", { ascending: false });
    if (!error && data) setPosts(data as Post[]);
    setLoading(false);
  }

  useEffect(() => { loadPosts(); }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setWarning(null);
    if (!keyInput.includes(SECRET_KEY)) {
      setWarning("Don't ya remember it, EVOL?");
      setShake(true);
      setTimeout(() => setShake(false), 400);
      return;
    }
    const { error } = await supabase.from("blog").insert({ content: text.trim() });
    if (!error) {
      message.success("Posted.");
      setText("");
      loadPosts();
    } else {
      message.error("Couldn't post — try again.");
    }
  }

  return (
    <div className="page">
      <div className={`secret-form-row${shake ? " shake" : ""}`}>
        <input
          value={keyInput}
          onChange={(e) => setKeyInput(e.target.value)}
          placeholder="Key???"
        />
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="My thought"
          rows={2}
        />
        <button onClick={handleSubmit}>Submit</button>
      </div>
      {warning && <p className="error">{warning}</p>}

      {loading ? (
        <p className="placeholder-note">Loading…</p>
      ) : (
        posts.map((post, i) => (
          <div className="evol-card stagger-item" style={{ animationDelay: `${Math.min(i, 15) * 40}ms` }} key={post.id}>
            <div className="evol-card-meta">{formatTime(post.time)}</div>
            <div className="evol-card-body">{post.content}</div>
          </div>
        ))
      )}
    </div>
  );
}