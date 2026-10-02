import { useLocation } from "react-router-dom";
import Galaxy from "./Galaxy";
import "./Galaxy.css";
import GalaxyRing from "./ImperfectCircle";
import React from "react";
function RingOverlay() {
  const { pathname } = useLocation();
  return (
    <div style={{
      position: "fixed",
      inset: 0,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      zIndex: 0,
      pointerEvents: "none"
    }}>
      <GalaxyRing size={400} trigger={pathname} />
    </div>
  );
}

export default React.memo(function GalaxyBackground() {
  return (
    <div className="galaxy-background">
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
      <RingOverlay />
    </div>
  );
});