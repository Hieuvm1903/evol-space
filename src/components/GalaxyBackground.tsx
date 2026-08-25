import Galaxy from "./Galaxy";
import "./Galaxy.css"
export default function GalaxyBackground() {
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
    </div>
  );
}