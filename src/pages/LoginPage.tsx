import React, { useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { Segmented, Form, Input, Button, Alert } from "antd";
import { UserOutlined, LockOutlined } from "@ant-design/icons";
import { Sparkles, Music2, Map as MapIcon, Camera } from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import "./music/MusicPage.css";
import "./AuthPage.css";

const FEATURES = [
  { icon: Music2, text: "Build playlists & share albums" },
  { icon: MapIcon, text: "Pin places and make lists" },
  { icon: Camera, text: "Save photobooth shots" },
];

export function LoginPage() {
  const { user, login, signup } = useAuth();
  const navigate = useNavigate();

  const [tab, setTab] = useState<"login" | "signup">("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null);
  const [busy, setBusy] = useState(false);

  if (user) return <Navigate to="/profile" replace />;

  async function handleSubmit() {
    setBusy(true);
    setMessage(null);
    const result = tab === "login" ? await login(username, password) : await signup(username, password);
    setBusy(false);
    setMessage({ text: result.message, ok: result.ok });
    if (result.ok && tab === "login") navigate("/profile");
  }

  return (
    <div className="page auth-page-shell">
      <div className="music-shell-header fade-in-up">
        <h2 className="music-title"><Sparkles size={20} className="music-title-icon" /> Account</h2>
        <p className="music-subtitle">Log in to unlock your music, places and photos.</p>
      </div>

      <div className="auth-workspace">
        {/* Left: info pane */}
        <div className="music-pane fade-in-up">
          <div className="auth-pane-body auth-side">
            <Sparkles size={38} className="auth-side-icon" />
            <h3>EVOL Space</h3>
            <p className="auth-side-sub">Your own little corner of the galaxy.</p>
            <div className="auth-feature-list">
              {FEATURES.map(({ icon: Icon, text }) => (
                <div className="auth-feature" key={text}><Icon size={15} />{text}</div>
              ))}
            </div>
          </div>
        </div>

        {/* Right: form pane */}
        <div className="music-pane fade-in-up">
          <div className="auth-pane-body">
            <div className="auth-form-wrap">
              <Segmented
                block
                value={tab}
                onChange={(v) => { setTab(v as "login" | "signup"); setMessage(null); }}
                options={[
                  { label: "Log in", value: "login" },
                  { label: "Sign up", value: "signup" },
                ]}
                style={{ marginBottom: 18 }}
              />

              <Form layout="vertical" onFinish={handleSubmit} key={tab} className="fade-in">
                <Form.Item label="Username">
                  <Input
                    prefix={<UserOutlined style={{ color: "#9a9a9a" }} />}
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    autoComplete="username"
                    autoFocus
                  />
                </Form.Item>
                <Form.Item label="Password">
                  <Input.Password
                    prefix={<LockOutlined style={{ color: "#9a9a9a" }} />}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete={tab === "login" ? "current-password" : "new-password"}
                  />
                </Form.Item>
                <Button
                  type="primary" htmlType="submit" block className="btn-glow"
                  loading={busy} disabled={!username || !password}
                >
                  {tab === "login" ? "Log in" : "Create account"}
                </Button>
              </Form>

              {message && (
                <Alert
                  className="fade-in-up" style={{ marginTop: 12 }} showIcon
                  type={message.ok ? "success" : "error"} message={message.text}
                />
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}