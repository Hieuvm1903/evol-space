import React from "react";
import { useLocation } from "react-router-dom";
import Galaxy from "./Galaxy";
import ThemeAmbientCanvas from "./ThemeAmbientCanvas";
import GalaxyRing from "./ImperfectCircle";
import { useTheme, type ThemeId } from "../contexts/ThemeContext";
import "./Galaxy.css";

interface RingStyle {
  lineColor: string;
  finalColor: string;
  showGlow: boolean;
  glowBlur: number;
}

const RING_STYLES: Record<ThemeId, RingStyle> = {
  evol: {
    lineColor: "#111",
    finalColor: "#ffffff",
    showGlow: true,
    glowBlur: 8,
  },
  light: {
    lineColor: "#5b3df5",
    finalColor: "rgba(91, 61, 245, 0.36)",
    showGlow: true,
    glowBlur: 6,
  },
  warm: {
    lineColor: "#4338ca",
    finalColor: "rgba(67, 56, 202, 0.34)",
    showGlow: false,
    glowBlur: 4,
  },
  "hc-dark": {
    lineColor: "#facc15",
    finalColor: "rgba(255, 255, 255, 0.45)",
    showGlow: false,
    glowBlur: 0,
  },
  "hc-light": {
    lineColor: "#003ecb",
    finalColor: "rgba(0, 62, 203, 0.38)",
    showGlow: false,
    glowBlur: 0,
  },
};

function RingOverlay({ themeId }: { themeId: ThemeId }) {
  const { pathname } = useLocation();
  const ring = RING_STYLES[themeId];
  return (
    <div className="ring-overlay">
      <GalaxyRing
        size={400}
        trigger={`${pathname}-${themeId}`}
        lineColor={ring.lineColor}
        finalColor={ring.finalColor}
        showGlow={ring.showGlow}
        glowBlur={ring.glowBlur}
      />
    </div>
  );
}

export default React.memo(function GalaxyBackground() {
  const { themeId } = useTheme();

  return (
    <div className={`galaxy-background theme-bg-${themeId}`} aria-hidden="true">
      {themeId === "evol" && (
        <>
          <div className="theme-fx-layer theme-fx-evol">
            <span className="fx-orb fx-orb-a" />
            <span className="fx-orb fx-orb-b" />
          </div>
          <Galaxy
            starSpeed={0.1}
            density={1.4}
            hueShift={120}
            speed={0.3}
            glowIntensity={0.4}
            saturation={0.5}
            mouseRepulsion
            repulsionStrength={0.5}
            twinkleIntensity={0.3}
            rotationSpeed={0.05}
            transparent
          />
        </>
      )}

      {themeId === "light" && (
        <>
          <div className="theme-fx-layer theme-fx-light">
            <div className="fx-dot-grid" />
            <span className="fx-orb fx-orb-a" />
            <span className="fx-orb fx-orb-b" />
            <div className="fx-prism-sheen" />
          </div>
          <ThemeAmbientCanvas variant="light" />
        </>
      )}

      {themeId === "warm" && (
        <>
          <div className="theme-fx-layer theme-fx-warm">
            <div className="fx-paper-grain" />
            <div className="fx-sunbeam" />
            <span className="fx-orb fx-orb-a" />
            <span className="fx-orb fx-orb-b" />
          </div>
          <ThemeAmbientCanvas variant="warm" />
        </>
      )}

      {(themeId === "hc-dark" || themeId === "hc-light") && (
        <div className={`theme-fx-layer theme-fx-${themeId}`}>
          <div className="fx-hc-grid" />
          <div className="fx-hc-orbit fx-hc-orbit-outer" />
          <div className="fx-hc-orbit fx-hc-orbit-inner" />
          <span className="fx-hc-corner tl" />
          <span className="fx-hc-corner tr" />
          <span className="fx-hc-corner bl" />
          <span className="fx-hc-corner br" />
        </div>
      )}

      <RingOverlay themeId={themeId} />
    </div>
  );
});