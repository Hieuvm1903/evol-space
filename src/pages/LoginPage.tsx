import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, Segmented, Form, Input, Button, Alert, Typography } from "antd";
import { UserOutlined, LockOutlined } from "@ant-design/icons";
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
        <Card className="evol-glass-card fade-in-up" style={{ maxWidth: 380, margin: "0 auto" }}>
          <Typography.Title level={4} style={{ color: "#e6e6e6", marginTop: 0 }}>Welcome back</Typography.Title>
          <p style={{ color: "#9a9a9a" }}>
            You're logged in as <strong style={{ color: "#3ddc57" }}>{user.username}</strong>.
          </p>
          <Button danger className="btn-glow" onClick={async () => { await logout(); }}>
            Log out
          </Button>
        </Card>
      </div>
    );
  }

  async function handleSubmit() {
    setBusy(true);
    setMessage(null);
    const result = tab === "login" ? await login(username, password) : await signup(username, password);
    setBusy(false);
    setMessage({ text: result.message, ok: result.ok });
    if (result.ok && tab === "login") navigate("/");
  }

  return (
    <div className="page">
      <Card className="evol-glass-card fade-in-up" style={{ maxWidth: 380, margin: "0 auto" }}>
        <Segmented
          block
          size="large"
          value={tab}
          onChange={(v) => { setTab(v as "login" | "signup"); setMessage(null); }}
          options={[
            { label: "Log in", value: "login" },
            { label: "Sign up", value: "signup" },
          ]}
          style={{ marginBottom: 20 }}
        />

        {/* key={tab} remounts the form fields so the fade-in replays on tab switch */}
        <Form layout="vertical" onFinish={handleSubmit} key={tab} className="fade-in">
          <Form.Item label="Username" required>
            <Input
              size="large"
              prefix={<UserOutlined style={{ color: "#9a9a9a" }} />}
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
              autoFocus
            />
          </Form.Item>
          <Form.Item label="Password" required style={{ marginBottom: 8 }}>
            <Input.Password
              size="large"
              prefix={<LockOutlined style={{ color: "#9a9a9a" }} />}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete={tab === "login" ? "current-password" : "new-password"}
            />
          </Form.Item>
          <Button
            type="primary" htmlType="submit" size="large" block
            loading={busy} disabled={!username || !password}
            className="btn-glow"
            style={{ marginTop: 12 }}
          >
            {busy ? "" : tab === "login" ? "Log in" : "Create account"}
          </Button>
        </Form>

        {message && (
          <Alert
            className="fade-in-up"
            style={{ marginTop: 16 }}
            type={message.ok ? "success" : "error"}
            message={message.text}
            showIcon
          />
        )}
      </Card>
    </div>
  );
}