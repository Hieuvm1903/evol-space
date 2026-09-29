import React, { useEffect, useState } from "react";
import { Form, Input, Button, Alert, Segmented, Tag } from "antd";
import { UserOutlined, LockOutlined, SmileOutlined } from "@ant-design/icons";
import { Sparkles, LogOut, UserRound, KeyRound, AtSign } from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import "./music/MusicPage.css";
import "./AuthPage.css";

type Msg = { text: string; ok: boolean } | null;
type Section = "name" | "username" | "password";

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

  useEffect(() => { if (user) setDisplayName(user.name); }, [user?.name]); // eslint-disable-line
  useEffect(() => { if (user) setUsername(user.username); }, [user?.username]); // eslint-disable-line

  if (!user) return null; // ProtectedRoute handles the redirect

  async function handleDisplayName() {
    setDisplayBusy(true);
    setDisplayMsg(null);
    const r = await updateName(displayName);
    setDisplayBusy(false);
    setDisplayMsg({ text: r.message, ok: r.ok });
  }

  async function handleUsername() {
    setNameBusy(true);
    setNameMsg(null);
    const r = await updateUsername(username);
    setNameBusy(false);
    setNameMsg({ text: r.message, ok: r.ok });
  }

  async function handlePassword() {
    setPwMsg(null);
    if (newPw !== confirmPw) { setPwMsg({ text: "New passwords don't match.", ok: false }); return; }
    setPwBusy(true);
    const r = await changePassword(currentPw, newPw);
    setPwBusy(false);
    setPwMsg({ text: r.message, ok: r.ok });
    if (r.ok) { setCurrentPw(""); setNewPw(""); setConfirmPw(""); }
  }

  const grey = { color: "#9a9a9a" };
  const seg = (I: typeof UserRound, label: string) => (
    <span><I size={13} style={{ verticalAlign: -2, marginRight: 6 }} />{label}</span>
  );

  return (
    <div className="page auth-page-shell">
      <div className="music-shell-header fade-in-up">
        <h2 className="music-title"><Sparkles size={20} className="music-title-icon" /> Profile</h2>
        <p className="music-subtitle">Manage how you show up in the galaxy.</p>
      </div>

      <div className="auth-workspace">
        {/* Left: identity */}
        <div className="music-pane fade-in-up">
          <div className="auth-pane-body auth-side">
            <div className="auth-avatar">{(user.name || user.username).slice(0, 1) || "?"}</div>
            <div className="auth-username">{user.name}</div>
            <div className="auth-handle">@{user.username}</div>
            <Tag color={user.role === "admin" ? "purple" : "default"} style={{ marginInlineEnd: 0 }}>
              {user.role}
            </Tag>
            <Button danger className="btn-glow" icon={<LogOut size={14} />} onClick={() => logout()}>
              Log out
            </Button>
          </div>
        </div>

        {/* Right: settings */}
        <div className="music-pane fade-in-up">
          <div className="auth-pane-body">
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
                style={{ marginBottom: 18 }}
              />

              {section === "name" && (
                <Form layout="vertical" onFinish={handleDisplayName} key="name" className="fade-in">
                  <Form.Item label="Display name" extra="Shown in the navbar and greetings. Leave empty to use your username.">
                    <Input
                      prefix={<SmileOutlined style={grey} />} value={displayName}
                      onChange={(e) => setDisplayName(e.target.value)}
                      maxLength={40} autoComplete="nickname"
                    />
                  </Form.Item>
                  <Button
                    type="primary" htmlType="submit" block className="btn-glow" loading={displayBusy}
                    disabled={displayName.trim() === user.name}
                  >
                    Save name
                  </Button>
                  {displayMsg && (
                    <Alert className="fade-in-up" style={{ marginTop: 12 }} showIcon
                      type={displayMsg.ok ? "success" : "error"} message={displayMsg.text} />
                  )}
                </Form>
              )}

              {section === "username" && (
                <Form layout="vertical" onFinish={handleUsername} key="username" className="fade-in">
                  <Form.Item label="Username" extra="This is what you type to log in.">
                    <Input
                      prefix={<UserOutlined style={grey} />} value={username}
                      onChange={(e) => setUsername(e.target.value)} autoComplete="username"
                    />
                  </Form.Item>
                  <Button
                    type="primary" htmlType="submit" block className="btn-glow" loading={nameBusy}
                    disabled={!username.trim() || username.trim() === user.username}
                  >
                    Save username
                  </Button>
                  {nameMsg && (
                    <Alert className="fade-in-up" style={{ marginTop: 12 }} showIcon
                      type={nameMsg.ok ? "success" : "error"} message={nameMsg.text} />
                  )}
                </Form>
              )}

              {section === "password" && (
                <Form layout="vertical" onFinish={handlePassword} key="password" className="fade-in">
                  <Form.Item label="Current password">
                    <Input.Password prefix={<LockOutlined style={grey} />} value={currentPw}
                      onChange={(e) => setCurrentPw(e.target.value)} autoComplete="current-password" />
                  </Form.Item>
                  <Form.Item label="New password">
                    <Input.Password prefix={<LockOutlined style={grey} />} value={newPw}
                      onChange={(e) => setNewPw(e.target.value)} autoComplete="new-password" />
                  </Form.Item>
                  <Form.Item label="Confirm new password">
                    <Input.Password prefix={<LockOutlined style={grey} />} value={confirmPw}
                      onChange={(e) => setConfirmPw(e.target.value)} autoComplete="new-password" />
                  </Form.Item>
                  <Button
                    type="primary" htmlType="submit" block className="btn-glow" loading={pwBusy}
                    disabled={!currentPw || !newPw || !confirmPw}
                  >
                    Change password
                  </Button>
                  {pwMsg && (
                    <Alert className="fade-in-up" style={{ marginTop: 12 }} showIcon
                      type={pwMsg.ok ? "success" : "error"} message={pwMsg.text} />
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