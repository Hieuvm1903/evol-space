import { useLocation } from "react-router-dom";
import Galaxy from "./reactbits/Galaxy";
import "./reactbits/Galaxy.css";
import GalaxyRing from "./ImperfectCircle";

export default function GalaxyBackground() {
const location = useLocation();
  return (
    <div className="galaxy-background">
      {/* Galaxy stays in the background */}
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

      {/* Centered ring overlay */}
      <div
        style={{
          position: "absolute",   // or "fixed" if you prefer
          inset: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          zIndex: 10,
          pointerEvents: "none"
        }}
      >
        <GalaxyRing size={400} trigger={location.pathname}/>
      </div>
    </div>
  );
}