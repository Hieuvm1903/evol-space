import React from "react";
import { ConfigProvider, theme as antdTheme } from "antd";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "./contexts/AuthContext";
import { PlayerProvider } from "./features/player/PlayerProvider";
import { NavBar } from "./components/NavBar";
import { HomePage } from "./pages/HomePage";
import { LoginPage } from "./pages/LoginPage";
import { RelaxPage } from "./pages/RelaxPage";
import { MusicPage } from "./pages/MusicPage";
import { SecretPage } from "./pages/SecretPage";
import { HistoryPage } from "./pages/HistoryPage";
import "./App.css";
import GalaxyBackground from "./components/GalaxyBackground";
import { MapPage } from "./pages/MapPage";
import { PhotoboothPage } from "./pages/PhotoboothPage";

// One dark theme for every antd component in the app (buttons, inputs,
// cards, skeletons, alerts, toasts, ...) instead of re-declaring
// ConfigProvider per-page. NowPlaying.tsx still wraps itself too — nested
// ConfigProviders are fine and let that widget stay fully self-contained.
const evolAntdTheme = {
  algorithm: antdTheme.darkAlgorithm,
  token: {
    colorPrimary: "#02ab21",
    colorInfo: "#02ab21",
    colorBgContainer: "#161616",
    colorBgElevated: "#1c1c1c",
    colorBorder: "#2a2a2a",
    colorTextBase: "#e6e6e6",
    borderRadius: 10,
    fontFamily: `"Be Vietnam Pro", sans-serif`,
  },
};

export default function App() {
  return (
    <ConfigProvider theme={evolAntdTheme}>
      <AuthProvider>
        {/* PlayerProvider wraps everything (like app.py's top-level
            render_now_playing_drawer() call) so the widget floats over
            whatever page is showing, and any page can call usePlayer().loadQueue(...)
            once the Music page is ported. */}
        <PlayerProvider>
          <BrowserRouter>
            <GalaxyBackground />
            <NavBar />
            <Routes>
              <Route path="/" element={<HomePage />} />
              <Route path="/login" element={<LoginPage />} />
              <Route path="/relax" element={<RelaxPage />} />
              <Route path="/music" element={<MusicPage />} />
              <Route path="/secret" element={<SecretPage />} />
              <Route path="/history" element={<HistoryPage />} />
               <Route path="/map" element={<MapPage />} />
            <Route path="/photobooth" element={<PhotoboothPage />} />

            </Routes>
          </BrowserRouter>
        </PlayerProvider>
      </AuthProvider>
    </ConfigProvider>
  );
}