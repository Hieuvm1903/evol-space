import GlassSurface from "../components/GlassSurface";


export function BlankPage() {
  

  return (
    <div className="page">
    <GlassSurface
  displace={0.5}
  distortionScale={-180}
  redOffset={0}
  greenOffset={10}
  blueOffset={20}
  brightness={50}
  opacity={0.93}
  mixBlendMode="screen"
>
  <span>Advanced Glass Distortion</span>
</GlassSurface>

    </div>
  );
}