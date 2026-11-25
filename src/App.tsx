import React, { useEffect } from "react";
import { App as AntdApp, ConfigProvider } from "antd";
import { BrowserRouter, Routes, Route, useLocation } from "react-router-dom";
import { AuthProvider } from "./contexts/AuthContext";
import { PlayerProvider } from "./features/player/PlayerProvider";
import { ConfirmProvider } from "./components/ConfirmDialog";
import { bindAntdFeedback } from "./lib/notify";
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
import { AsciiPage } from "./pages/ascii/AsciiPage";
import { World3DPage } from "./pages/world3d/World3DPage";
import { SharedPlacesPage } from "./pages/SharedPlacesPage";
import { SharedAlbumPage } from "./pages/SharedAlbumPage";
import { ProfilePage } from "./pages/ProfilePage";
import { ThemeProvider, useTheme } from "./contexts/ThemeContext";
import { ProtectedRoute } from "./components/ProtectedRoute";

function AppBody() {
  const location = useLocation();
  const is3DMode = location.pathname === "/3d";
  const hideGalaxy =
    location.pathname === "/work" || location.pathname === "/ascii" || is3DMode;
  return (
    <>
      {!hideGalaxy && <GalaxyBackground />}
      {!is3DMode && <NavBar />}
      <main className="app-content">
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/profile" element={<ProtectedRoute><ProfilePage /></ProtectedRoute>} />
          <Route path="/relax" element={<RelaxPage />} />
          <Route path="/music" element={<MusicPage />} />
          <Route path="/secret" element={<SecretPage />} />
          <Route path="/history" element={<HistoryPage />} />
          <Route path="/map" element={<MapPage />} />
          <Route path="/blank" element={<BlankPage />} />
          <Route path="/photobooth" element={<PhotoboothPage />} />
          <Route path="/work" element={<WorkPage />} />
          <Route path="/ascii" element={<AsciiPage />} />
          <Route path="/3d" element={<World3DPage />} />
          <Route path="/share/album/:token" element={<SharedAlbumPage />} />
          <Route path="/share/places/:token" element={<SharedPlacesPage />} />
        </Routes>
      </main>
    </>
  );
}

function AntdFeedbackBridge() {
  const { notification, message } = AntdApp.useApp();
  useEffect(() => {
    bindAntdFeedback(notification, message);
  }, [notification, message]);
  return null;
}

function ThemedApp() {
  const { theme } = useTheme();
  return (
    <ConfigProvider theme={theme.antd}>
      <AntdApp>
        <AntdFeedbackBridge />
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
      </AntdApp>
    </ConfigProvider>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <ThemedApp />
    </ThemeProvider>
  );
}