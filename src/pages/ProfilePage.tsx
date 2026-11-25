import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Form, Input, Button, Alert, Segmented } from "antd";
import { UserOutlined, LockOutlined, SmileOutlined } from "@ant-design/icons";
import {
  LogOut,
  UserRound,
  KeyRound,
  AtSign,
  Music2,
  Map as MapIcon,
  Camera,
  Hammer,
  Check,
  RotateCcw,
} from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import { getPlaylists } from "../lib/musicService";
import { getPlaces } from "../lib/placesService";
import { getPhotos } from "../lib/photosService";
import { listScenes } from "../lib/scenesService";
import { isSupabaseConfigured } from "../lib/supabaseClient";
import "./music/MusicPage.css";
import "./AuthPage.css";

type Msg = { text: string; ok: boolean } | null;
type Section = "name" | "username" | "password";

interface SpaceCounts {
  playlists: number;
  places: number;
  photos: number;
  scenes: number;
}

export function ProfilePage() {
  const { user, logout, updateName, updateUsername, changePassword } = useAuth();
  const [section, setSection] = useState<Section>("name");

  const [displayName, setDisplayName] = useState(user?.name ?? "");
  const [displayBusy, setDisplayBusy] = useState(false);
  const [displayMsg, setDisplayMsg] = useState<Msg>(null);

  const [username, setUsername] = useState(user?.username ?? "");
  const [nameBusy, setNameBusy] = useState(false);
  const [nameMsg, setNameMsg] = useState<Msg>(null);

  const [currentPw, setCurrentPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [pwBusy, setPwBusy] = useState(false);
  const [pwMsg, setPwMsg] = useState<Msg>(null);

  const [counts, setCounts] = useState<SpaceCounts>({
    playlists: 0,
    places: 0,
    photos: 0,
    scenes: 0,
  });
  const [loadingCounts, setLoadingCounts] = useState(true);

  useEffect(() => {
    if (user) setDisplayName(user.name);
  }, [user?.name]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (user) setUsername(user.username);
  }, [user?.username]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    setLoadingCounts(true);
    Promise.allSettled([
      getPlaylists(user.id),
      getPlaces(user.id),
      getPhotos(user.id),
      listScenes(user.id),
    ]).then(([pl, pm, ph, sc]) => {
      if (cancelled) return;
      setCounts({
        playlists: pl.status === "fulfilled" ? pl.value.length : 0,
        places: pm.status === "fulfilled" ? pm.value.length : 0,
        photos: ph.status === "fulfilled" ? ph.value.length : 0,
        scenes: sc.status === "fulfilled" ? sc.value.length : 0,
      });
      setLoadingCounts(false);
    });
    return () => {
      cancelled = true;
    };
  }, [user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!user) return null;

  const trimmedUsername = username.trim();
  const usernameInvalid = /[\s@]/.test(trimmedUsername);

  const pwLengthOk = newPw.length >= 6;
  const pwDiffOk = newPw.length > 0 && newPw !== currentPw;
  const pwMatchOk = newPw.length > 0 && newPw === confirmPw;
  const canChangePw = Boolean(currentPw) && pwLengthOk && pwDiffOk && pwMatchOk;

  async function handleDisplayName() {
    setDisplayBusy(true);
    setDisplayMsg(null);
    const r = await updateName(displayName);
    setDisplayBusy(false);
    setDisplayMsg({ text: r.message, ok: r.ok });
  }

  async function handleUsername() {
    if (usernameInvalid || !trimmedUsername) return;
    setNameBusy(true);
    setNameMsg(null);
    const r = await updateUsername(trimmedUsername);
    setNameBusy(false);
    setNameMsg({ text: r.message, ok: r.ok });
  }

  async function handlePassword() {
    setPwMsg(null);
    if (!pwMatchOk) {
      setPwMsg({ text: "New passwords don't match.", ok: false });
      return;
    }
    setPwBusy(true);
    const r = await changePassword(currentPw, newPw);
    setPwBusy(false);
    setPwMsg({ text: r.message, ok: r.ok });
    if (r.ok) {
      setCurrentPw("");
      setNewPw("");
      setConfirmPw("");
    }
  }

  const grey = { color: "var(--evol-muted)" };
  const seg = (I: typeof UserRound, label: string) => (
    <span style={{ whiteSpace: "nowrap" }}>
      <I size={13} style={{ verticalAlign: -2, marginRight: 5 }} />
      {label}
    </span>
  );

  const spaceLinks = [
    { label: "Playlists", value: counts.playlists, to: "/music", icon: Music2 },
    { label: "Places", value: counts.places, to: "/map", icon: MapIcon },
    { label: "Photos", value: counts.photos, to: "/photobooth", icon: Camera },
    { label: "Scenes", value: counts.scenes, to: "/work", icon: Hammer },
  ];

  const previewName = displayName.trim() || user.username;

  return (
    <div className="page auth-page-shell">
      <div className="auth-workspace">
        {/* Left: identity + space summary */}
        <div className="music-pane fade-in-up">
          <div className="auth-pane-body auth-side">
            <div className="auth-identity-head">
              <div className="auth-avatar">
                {(user.name || user.username).slice(0, 1) || "?"}
              </div>
              <div className="auth-identity-text">
                <div className="auth-username" title={user.name}>
                  {user.name}
                </div>
                <div className="auth-handle-meta">
                  <span>@{user.username}</span>
                  <span aria-hidden="true">·</span>
                  <span className="auth-role-text">{user.role}</span>
                  <span aria-hidden="true">·</span>
                  <span>{isSupabaseConfigured ? "Synced" : "Local"}</span>
                </div>
              </div>
            </div>

            <div className="profile-stats-grid">
              {spaceLinks.map(({ label, value, to, icon: Icon }) => (
                <Link to={to} className="profile-stat-link" key={label}>
                  <div className="profile-stat-top">
                    <span>{label}</span>
                    <Icon size={13} />
                  </div>
                  <div className="profile-stat-value">
                    {loadingCounts ? "—" : value}
                  </div>
                </Link>
              ))}
            </div>

            <div className="profile-side-actions">
              <Link to="/" className="profile-home-link">
                Home
              </Link>
              <Button
                danger
                size="small"
                icon={<LogOut size={13} />}
                onClick={() => logout()}
                style={{ whiteSpace: "nowrap" }}
              >
                Log out
              </Button>
            </div>
          </div>
        </div>

        {/* Right: settings */}
        <div className="music-pane fade-in-up">
          <div className="auth-pane-body auth-form-pane">
            <div className="auth-form-wrap">
              <Segmented
                block
                value={section}
                onChange={(v) => setSection(v as Section)}
                options={[
                  { label: seg(UserRound, "Name"), value: "name" },
                  { label: seg(AtSign, "Username"), value: "username" },
                  { label: seg(KeyRound, "Password"), value: "password" },
                ]}
                style={{ marginBottom: 14 }}
              />

              {section === "name" && (
                <Form layout="vertical" onFinish={handleDisplayName} key="name" className="fade-in">
                  <h3 className="auth-form-heading">Display name</h3>

                  <div className="auth-preview-line">
                    <span>
                      Shown as <span className="auth-preview-name">{previewName}</span>
                    </span>
                    <span className="auth-char-count">{displayName.length}/40</span>
                  </div>

                  <Form.Item label="Name">
                    <Input
                      prefix={<SmileOutlined style={grey} />}
                      value={displayName}
                      onChange={(e) => setDisplayName(e.target.value)}
                      maxLength={40}
                      placeholder={user.username}
                      autoComplete="nickname"
                    />
                  </Form.Item>

                  <div className="auth-btn-row">
                    <Button
                      type="primary"
                      htmlType="submit"
                      className="btn-glow"
                      loading={displayBusy}
                      disabled={displayName.trim() === user.name}
                    >
                      Save
                    </Button>
                    {displayName !== user.name && (
                      <Button
                        icon={<RotateCcw size={13} />}
                        onClick={() => {
                          setDisplayName(user.name);
                          setDisplayMsg(null);
                        }}
                      >
                        Reset
                      </Button>
                    )}
                  </div>

                  {displayMsg && (
                    <Alert
                      className="fade-in-up"
                      style={{ marginTop: 10 }}
                      showIcon
                      type={displayMsg.ok ? "success" : "error"}
                      message={displayMsg.text}
                    />
                  )}
                </Form>
              )}

              {section === "username" && (
                <Form layout="vertical" onFinish={handleUsername} key="username" className="fade-in">
                  <h3 className="auth-form-heading">Username</h3>

                  <Form.Item
                    label="Handle"
                    validateStatus={usernameInvalid ? "error" : undefined}
                    help={usernameInvalid ? "No spaces or @." : undefined}
                  >
                    <Input
                      prefix={<UserOutlined style={grey} />}
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      autoComplete="username"
                    />
                  </Form.Item>

                  <Button
                    type="primary"
                    htmlType="submit"
                    block
                    className="btn-glow"
                    loading={nameBusy}
                    disabled={!trimmedUsername || usernameInvalid || trimmedUsername === user.username}
                  >
                    Save username
                  </Button>

                  {nameMsg && (
                    <Alert
                      className="fade-in-up"
                      style={{ marginTop: 10 }}
                      showIcon
                      type={nameMsg.ok ? "success" : "error"}
                      message={nameMsg.text}
                    />
                  )}
                </Form>
              )}

              {section === "password" && (
                <Form layout="vertical" onFinish={handlePassword} key="password" className="fade-in">
                  <h3 className="auth-form-heading">Password</h3>

                  <Form.Item label="Current">
                    <Input.Password
                      prefix={<LockOutlined style={grey} />}
                      value={currentPw}
                      onChange={(e) => setCurrentPw(e.target.value)}
                      autoComplete="current-password"
                    />
                  </Form.Item>
                  <Form.Item label="New">
                    <Input.Password
                      prefix={<LockOutlined style={grey} />}
                      value={newPw}
                      onChange={(e) => setNewPw(e.target.value)}
                      autoComplete="new-password"
                    />
                  </Form.Item>
                  <Form.Item
                    label="Confirm"
                    validateStatus={confirmPw && !pwMatchOk ? "error" : undefined}
                    help={confirmPw && !pwMatchOk ? "Doesn't match." : undefined}
                  >
                    <Input.Password
                      prefix={<LockOutlined style={grey} />}
                      value={confirmPw}
                      onChange={(e) => setConfirmPw(e.target.value)}
                      autoComplete="new-password"
                    />
                  </Form.Item>

                  <div className="auth-inline-hints" aria-live="polite">
                    <span className={`auth-inline-hint ${pwLengthOk ? "valid" : ""}`}>
                      <Check size={12} /> 6+ chars
                    </span>
                    <span className={`auth-inline-hint ${pwDiffOk ? "valid" : ""}`}>
                      <Check size={12} /> New
                    </span>
                    <span className={`auth-inline-hint ${pwMatchOk ? "valid" : ""}`}>
                      <Check size={12} /> Match
                    </span>
                  </div>

                  <Button
                    type="primary"
                    htmlType="submit"
                    block
                    className="btn-glow"
                    loading={pwBusy}
                    disabled={!canChangePw}
                  >
                    Change password
                  </Button>

                  {pwMsg && (
                    <Alert
                      className="fade-in-up"
                      style={{ marginTop: 10 }}
                      showIcon
                      type={pwMsg.ok ? "success" : "error"}
                      message={pwMsg.text}
                    />
                  )}
                </Form>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}