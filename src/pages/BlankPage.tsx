import FluidGlass from "../components/FluidGlass";
import GlassSurface from "../components/GlassSurface";


export function BlankPage() {


  return (
    <div style={{ height: '600px', position: 'relative' }}>
      <FluidGlass
        mode="lens" // or "bar", "cube"
        lensProps={{
          scale: 0.25,
          ior: 1.15,
          thickness: 5,
          chromaticAberration: 0.1,
          anisotropy: 0.01
        }}
      />
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