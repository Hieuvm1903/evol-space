import React, { useEffect, useState } from "react";
import { Form, Input, Button, Alert, Segmented, Tag } from "antd";
import { UserOutlined, LockOutlined } from "@ant-design/icons";
import { Sparkles, LogOut, UserRound, KeyRound } from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import "./music/MusicPage.css";
import "./AuthPage.css";

type Msg = { text: string; ok: boolean } | null;

export function ProfilePage() {
  const { user, logout, updateUsername, changePassword } = useAuth();
  const [section, setSection] = useState<"username" | "password">("username");

  const [name, setName] = useState(user?.username ?? "");
  const [nameBusy, setNameBusy] = useState(false);
  const [nameMsg, setNameMsg] = useState<Msg>(null);

  const [currentPw, setCurrentPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [pwBusy, setPwBusy] = useState(false);
  const [pwMsg, setPwMsg] = useState<Msg>(null);

  useEffect(() => { if (user) setName(user.username); }, [user?.username]); // eslint-disable-line

  if (!user) return null; // ProtectedRoute handles the redirect

  async function handleName() {
    setNameBusy(true);
    setNameMsg(null);
    const r = await updateUsername(name);
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

  const icon = (I: typeof UserOutlined) => <I style={{ color: "#9a9a9a" }} />;

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
            <div className="auth-avatar">{user.username.slice(0, 1) || "?"}</div>
            <div className="auth-username">{user.username}</div>
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
                onChange={(v) => setSection(v as "username" | "password")}
                options={[
                  { label: <span><UserRound size={13} style={{ verticalAlign: -2, marginRight: 6 }} />Username</span>, value: "username" },
                  { label: <span><KeyRound size={13} style={{ verticalAlign: -2, marginRight: 6 }} />Password</span>, value: "password" },
                ]}
                style={{ marginBottom: 18 }}
              />

              {section === "username" ? (
                <Form layout="vertical" onFinish={handleName} key="username" className="fade-in">
                  <Form.Item label="New username">
                    <Input
                      prefix={icon(UserOutlined)} value={name}
                      onChange={(e) => setName(e.target.value)} autoComplete="username"
                    />
                  </Form.Item>
                  <Button
                    type="primary" htmlType="submit" block className="btn-glow" loading={nameBusy}
                    disabled={!name.trim() || name.trim() === user.username}
                  >
                    Save username
                  </Button>
                  {nameMsg && (
                    <Alert className="fade-in-up" style={{ marginTop: 12 }} showIcon
                      type={nameMsg.ok ? "success" : "error"} message={nameMsg.text} />
                  )}
                </Form>
              ) : (
                <Form layout="vertical" onFinish={handlePassword} key="password" className="fade-in">
                  <Form.Item label="Current password">
                    <Input.Password prefix={icon(LockOutlined)} value={currentPw}
                      onChange={(e) => setCurrentPw(e.target.value)} autoComplete="current-password" />
                  </Form.Item>
                  <Form.Item label="New password">
                    <Input.Password prefix={icon(LockOutlined)} value={newPw}
                      onChange={(e) => setNewPw(e.target.value)} autoComplete="new-password" />
                  </Form.Item>
                  <Form.Item label="Confirm new password">
                    <Input.Password prefix={icon(LockOutlined)} value={confirmPw}
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