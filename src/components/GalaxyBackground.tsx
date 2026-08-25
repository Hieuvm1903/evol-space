import Galaxy from "./Galaxy";
import "./Galaxy.css"
export default function GalaxyBackground() {
  return (
    <div className="galaxy-background">
      <Galaxy
        starSpeed={0.3}
        density={1.4}
        hueShift={120}
        speed={0.6}
        glowIntensity={0.4}
        saturation={0.5}
        mouseRepulsion
        repulsionStrength={1}
        twinkleIntensity={0.3}
        rotationSpeed={0.1}
        transparent
      />
    </div>
  );
}