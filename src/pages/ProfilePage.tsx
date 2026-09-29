import React, { useEffect, useState } from "react";
import { Card, Form, Input, Button, Alert, Typography, Tag } from "antd";
import { UserOutlined, LockOutlined } from "@ant-design/icons";
import { useAuth } from "../contexts/AuthContext";

type Msg = { text: string; ok: boolean } | null;

export function ProfilePage() {
  const { user, logout, updateUsername, changePassword } = useAuth();

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

  const cardStyle = { maxWidth: 420, margin: "0 auto 16px" };
  const title = { color: "#e6e6e6", marginTop: 0 } as const;

  return (
    <div className="page">
      <Card className="evol-glass-card fade-in-up" style={cardStyle}>
        <Typography.Title level={4} style={title}>Profile</Typography.Title>
        <p style={{ color: "#9a9a9a", margin: "0 0 12px" }}>
          Logged in as <strong style={{ color: "#3ddc57" }}>{user.username}</strong>{" "}
          <Tag color={user.role === "admin" ? "purple" : "default"}>{user.role}</Tag>
        </p>
        <Button danger className="btn-glow" onClick={() => logout()}>Log out</Button>
      </Card>

      <Card className="evol-glass-card fade-in-up" style={cardStyle}>
        <Typography.Title level={5} style={title}>Change username</Typography.Title>
        <Form layout="vertical" onFinish={handleName}>
          <Form.Item label="New username" style={{ marginBottom: 12 }}>
            <Input
              prefix={<UserOutlined style={{ color: "#9a9a9a" }} />}
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoComplete="username"
            />
          </Form.Item>
          <Button
            type="primary" htmlType="submit" className="btn-glow" loading={nameBusy}
            disabled={!name.trim() || name.trim() === user.username}
          >
            Save username
          </Button>
        </Form>
        {nameMsg && (
          <Alert className="fade-in-up" style={{ marginTop: 12 }} showIcon
            type={nameMsg.ok ? "success" : "error"} message={nameMsg.text} />
        )}
      </Card>

      <Card className="evol-glass-card fade-in-up" style={cardStyle}>
        <Typography.Title level={5} style={title}>Change password</Typography.Title>
        <Form layout="vertical" onFinish={handlePassword}>
          <Form.Item label="Current password" style={{ marginBottom: 12 }}>
            <Input.Password prefix={<LockOutlined style={{ color: "#9a9a9a" }} />}
              value={currentPw} onChange={(e) => setCurrentPw(e.target.value)} autoComplete="current-password" />
          </Form.Item>
          <Form.Item label="New password" style={{ marginBottom: 12 }}>
            <Input.Password prefix={<LockOutlined style={{ color: "#9a9a9a" }} />}
              value={newPw} onChange={(e) => setNewPw(e.target.value)} autoComplete="new-password" />
          </Form.Item>
          <Form.Item label="Confirm new password" style={{ marginBottom: 12 }}>
            <Input.Password prefix={<LockOutlined style={{ color: "#9a9a9a" }} />}
              value={confirmPw} onChange={(e) => setConfirmPw(e.target.value)} autoComplete="new-password" />
          </Form.Item>
          <Button
            type="primary" htmlType="submit" className="btn-glow" loading={pwBusy}
            disabled={!currentPw || !newPw || !confirmPw}
          >
            Change password
          </Button>
        </Form>
        {pwMsg && (
          <Alert className="fade-in-up" style={{ marginTop: 12 }} showIcon
            type={pwMsg.ok ? "success" : "error"} message={pwMsg.text} />
        )}
      </Card>
    </div>
  );
}