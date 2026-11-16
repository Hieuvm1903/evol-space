import React, { useMemo, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { Segmented, Form, Input, Button, Alert } from "antd";
import { UserOutlined, LockOutlined, SmileOutlined } from "@ant-design/icons";
import {
  Music2,
  Map as MapIcon,
  Camera,
  Hammer,
  Check,
  ArrowRight,
} from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import { isSupabaseConfigured } from "../lib/supabaseClient";
import GalaxyRing from "../components/ImperfectCircle";
import "./music/MusicPage.css";
import "./AuthPage.css";

const FEATURES = [
  { icon: Music2, label: "Playlists & synced lyrics" },
  { icon: MapIcon, label: "Place atlas & lists" },
  { icon: Camera, label: "Photobooth & gallery" },
  { icon: Hammer, label: "3D scene studio" },
];

export function LoginPage() {
  const { user, login, signup } = useAuth();
  const navigate = useNavigate();

  const [tab, setTab] = useState<"login" | "signup">("login");
  const [username, setUsername] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null);
  const [busy, setBusy] = useState(false);

  const trimmedUsername = username.trim();
  const usernameInvalid = /[\s@]/.test(trimmedUsername);
  const passwordLongEnough = password.length >= 6;
  const passwordsMatch = password.length > 0 && password === confirmPassword;

  const canSubmit = useMemo(() => {
    if (!trimmedUsername || !password || usernameInvalid) return false;
    if (tab === "signup") return passwordLongEnough && passwordsMatch;
    return true;
  }, [trimmedUsername, password, usernameInvalid, tab, passwordLongEnough, passwordsMatch]);

  if (user) return <Navigate to="/profile" replace />;

  async function handleSubmit() {
    if (!canSubmit) return;
    setBusy(true);
    setMessage(null);
    const result =
      tab === "login"
        ? await login(trimmedUsername, password)
        : await signup(trimmedUsername, password, name);
    setBusy(false);
    setMessage({ text: result.message, ok: result.ok });
    if (result.ok) navigate("/profile");
  }

  async function handleDemoLogin() {
    setBusy(true);
    setMessage(null);
    const result = await login("evol", "evolspace");
    setBusy(false);
    setMessage({ text: result.message, ok: result.ok });
    if (result.ok) navigate("/profile");
  }

  function switchTab(next: "login" | "signup") {
    setTab(next);
    setMessage(null);
    setConfirmPassword("");
  }

  return (
    <div className="page auth-page-shell">
      <div className="auth-workspace">
        <div className="music-pane auth-side-pane fade-in-up">
          <div className="auth-pane-body auth-side">
            <div className="auth-brand-row">
              <GalaxyRing
                trigger={tab}
                size={28}
                strokeWidth={2.2}
                minRadius={7}
                duration={1.6}
                glowBlur={2}
                lineColor="#8b6ff5"
                finalColor="#22d3ee"
                showGlow={false}
              />
              <h2 className="auth-brand-title">EVOL Space</h2>
            </div>
            <p className="auth-side-lead">One account across every space.</p>

            <div className="auth-feature-list">
              {FEATURES.map(({ icon: Icon, label }) => (
                <div className="auth-feature" key={label}>
                  <Icon size={15} />
                  <span>{label}</span>
                </div>
              ))}
            </div>

            {!isSupabaseConfigured && (
              <div className="auth-demo-box">
                <p className="auth-demo-note">Local preview mode</p>
                <Button
                  block
                  onClick={handleDemoLogin}
                  loading={busy}
                  icon={<ArrowRight size={14} />}
                  iconPosition="end"
                  style={{ whiteSpace: "nowrap" }}
                >
                  Demo: EVOL Explorer
                </Button>
              </div>
            )}
          </div>
        </div>

        <div className="music-pane fade-in-up">
          <div className="auth-pane-body auth-form-pane">
            <div className="auth-form-wrap">
              <Segmented
                block
                value={tab}
                onChange={(v) => switchTab(v as "login" | "signup")}
                options={[
                  { label: "Log in", value: "login" },
                  { label: "Sign up", value: "signup" },
                ]}
                style={{ marginBottom: 14 }}
              />

              <h3 className="auth-form-heading">
                {tab === "login" ? "Welcome back" : "Create account"}
              </h3>

              <Form layout="vertical" onFinish={handleSubmit} key={tab} className="fade-in">
                <Form.Item
                  label="Username"
                  validateStatus={usernameInvalid ? "error" : undefined}
                  help={usernameInvalid ? "No spaces or @." : undefined}
                >
                  <Input
                    prefix={<UserOutlined style={{ color: "#9c97b8" }} />}
                    placeholder="Handle (no spaces or @)"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    autoComplete="username"
                    autoFocus
                  />
                </Form.Item>

                {tab === "signup" && (
                  <Form.Item label="Display name (optional)">
                    <Input
                      prefix={<SmileOutlined style={{ color: "#9c97b8" }} />}
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      maxLength={40}
                      placeholder="Shown in greetings"
                      autoComplete="nickname"
                    />
                  </Form.Item>
                )}

                <Form.Item label="Password">
                  <Input.Password
                    prefix={<LockOutlined style={{ color: "#9c97b8" }} />}
                    placeholder={tab === "signup" ? "6+ characters" : "Password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete={tab === "login" ? "current-password" : "new-password"}
                  />
                </Form.Item>

                {tab === "signup" && (
                  <>
                    <Form.Item
                      label="Confirm password"
                      validateStatus={confirmPassword && !passwordsMatch ? "error" : undefined}
                      help={confirmPassword && !passwordsMatch ? "Doesn't match." : undefined}
                    >
                      <Input.Password
                        prefix={<LockOutlined style={{ color: "#9c97b8" }} />}
                        placeholder="Repeat password"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        autoComplete="new-password"
                      />
                    </Form.Item>

                    <div className="auth-inline-hints" aria-live="polite">
                      <span className={`auth-inline-hint ${trimmedUsername && !usernameInvalid ? "valid" : ""}`}>
                        <Check size={12} /> Valid handle
                      </span>
                      <span className={`auth-inline-hint ${passwordLongEnough ? "valid" : ""}`}>
                        <Check size={12} /> 6+ chars
                      </span>
                      <span className={`auth-inline-hint ${passwordsMatch ? "valid" : ""}`}>
                        <Check size={12} /> Match
                      </span>
                    </div>
                  </>
                )}

                <Button
                  type="primary"
                  htmlType="submit"
                  block
                  className="btn-glow"
                  loading={busy}
                  disabled={!canSubmit}
                  style={{ whiteSpace: "nowrap", marginTop: 2 }}
                >
                  {tab === "login" ? "Log in" : "Create account"}
                </Button>
              </Form>

              {message && (
                <Alert
                  className="fade-in-up"
                  style={{ marginTop: 10 }}
                  showIcon
                  type={message.ok ? "success" : "error"}
                  message={message.text}
                />
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}