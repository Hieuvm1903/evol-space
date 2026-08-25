import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";

export function LoginPage() {
  const { user, login, signup, logout } = useAuth();
  const navigate = useNavigate();

  const [tab, setTab] = useState<"login" | "signup">("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null);
  const [busy, setBusy] = useState(false);

  if (user) {
    return (
      <div className="page">
        <h2>Login</h2>
        <p>You're logged in as <strong>{user.username}</strong>.</p>
        <button onClick={async () => { await logout(); }}>Log out</button>
      </div>
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMessage(null);
    const result = tab === "login" ? await login(username, password) : await signup(username, password);
    setBusy(false);
    setMessage({ text: result.message, ok: result.ok });
    if (result.ok && tab === "login") navigate("/");
  }

  return (
    <div className="page">
      <h2>Login</h2>
      <div className="tabs">
        <button className={tab === "login" ? "active" : ""} onClick={() => setTab("login")}>Log in</button>
        <button className={tab === "signup" ? "active" : ""} onClick={() => setTab("signup")}>Sign up</button>
      </div>

      <form onSubmit={handleSubmit}>
        <label>
          Username
          <input value={username} onChange={(e) => setUsername(e.target.value)} required />
        </label>
        <label>
          Password
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </label>
        <button type="submit" disabled={busy}>
          {busy ? "…" : tab === "login" ? "Log in" : "Create account"}
        </button>
      </form>

      {message && <p className={message.ok ? "success" : "error"}>{message.text}</p>}
    </div>
  );
}
