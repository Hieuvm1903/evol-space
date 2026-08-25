import React from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "./contexts/AuthContext";
import { PlayerProvider } from "./features/player/PlayerProvider";
import { NavBar } from "./components/NavBar";
import { HomePage } from "./pages/HomePage";
import { LoginPage } from "./pages/LoginPage";
import { RelaxPage } from "./pages/RelaxPage";
import { MusicPage } from "./pages/MusicPage";
import "./App.css";

export default function App() {
  return (
    <AuthProvider>
      {/* PlayerProvider wraps everything (like app.py's top-level
          render_now_playing_drawer() call) so the widget floats over
          whatever page is showing, and any page can call usePlayer().loadQueue(...)
          once the Music page is ported. */}
      <PlayerProvider>
        <BrowserRouter>
          <NavBar />
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/login" element={<LoginPage />} />
            <Route path="/relax" element={<RelaxPage />} />
            <Route path="/music" element={<MusicPage />} />
            {/* Each later step adds one line here, e.g.:
                <Route path="/secret" element={<ProtectedRoute><SecretPage /></ProtectedRoute>} /> */}
          </Routes>
        </BrowserRouter>
      </PlayerProvider>
    </AuthProvider>
  );
}
