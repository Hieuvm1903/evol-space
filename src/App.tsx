import React from "react";
import { ConfigProvider, theme as antdTheme } from "antd";
import { BrowserRouter, Routes, Route, useLocation } from "react-router-dom";
import { AuthProvider } from "./contexts/AuthContext";
import { PlayerProvider } from "./features/player/PlayerProvider";
import { ConfirmProvider } from "./components/ConfirmDialog";
import { NavBar } from "./components/NavBar";
import { HomePage } from "./pages/HomePage";
import { LoginPage } from "./pages/LoginPage";
import { RelaxPage } from "./pages/RelaxPage";
import { MusicPage } from "./pages/music/MusicPage";
import { SecretPage } from "./pages/SecretPage";
import { HistoryPage } from "./pages/HistoryPage";
import { BlankPage } from "./pages/BlankPage";
import "./App.css";
import GalaxyBackground from "./components/GalaxyBackground";
import { MapPage } from "./pages/map/MapPage";
import { PhotoboothPage } from "./pages/PhotoboothPage";
import { WorkPage } from "./pages/work/WorkPage";

// One dark theme for every antd component in the app (buttons, inputs,
// cards, skeletons, alerts, toasts, ...) instead of re-declaring
// ConfigProvider per-page. NowPlaying.tsx still wraps itself too — nested
// ConfigProviders are fine and let that widget stay fully self-contained.
const evolAntdTheme = {
  algorithm: antdTheme.darkAlgorithm,
  token: {
    colorPrimary: "#8b6ff5",
    colorInfo: "#22d3ee",
    colorBgContainer: "#14121f",
    colorBgElevated: "#1a1830",
    colorBorder: "#2a2740",
    colorTextBase: "#e8e6f5",
    borderRadius: 10,
    fontFamily: `"Be Vietnam Pro", sans-serif`,
  },
};
function AppBody() {
  const location = useLocation();
  const hideGalaxy = location.pathname === "/work";
  return (
    <>
      {!hideGalaxy && <GalaxyBackground />}
      <NavBar />
      <main className="app-content">
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/relax" element={<RelaxPage />} />
          <Route path="/music" element={<MusicPage />} />
          <Route path="/secret" element={<SecretPage />} />
          <Route path="/history" element={<HistoryPage />} />
          <Route path="/map" element={<MapPage />} />
          <Route path="/blank" element={<BlankPage />} />
          <Route path="/photobooth" element={<PhotoboothPage />} />
          <Route path="/work" element={<WorkPage />} />
        </Routes>
      </main>
    </>
  );
}
export default function App() {
  
  return (
    <ConfigProvider theme={evolAntdTheme}>
      {/* ConfirmProvider wraps everything so useConfirm() works from any
          page — it replaces window.confirm() with a themed dialog. See
          components/ConfirmDialog.tsx. */}
      <ConfirmProvider>
        <AuthProvider>
          {/* PlayerProvider wraps everything (like app.py's top-level
              render_now_playing_drawer() call) so the widget floats over
              whatever page is showing, and any page can call usePlayer().loadQueue(...)
              once the Music page is ported. */}
          <PlayerProvider>
            <BrowserRouter>

            <AppBody />

            </BrowserRouter>
          </PlayerProvider>
        </AuthProvider>
      </ConfirmProvider>
    </ConfigProvider>
  );
}