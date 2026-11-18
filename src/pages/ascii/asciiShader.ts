import * as THREE from "three";

export type AsciiCharsetKey = "classic" | "blocks" | "matrix" | "minimal";
export type AsciiColorMode = "full" | "phosphor" | "amber" | "duotone";
export type AsciiViewMode = "ascii" | "split" | "raw";

export const ASCII_CHARSETS: Record<AsciiCharsetKey, { label: string; chars: string }> = {
  classic: {
    label: "Classic",
    chars: " .:-=+*#%@",
  },
  blocks: {
    label: "Blocks",
    chars: " ░▒▓█",
  },
  matrix: {
    label: "Glyphs",
    chars: " .·:+*xX#%$&@",
  },
  minimal: {
    label: "Binary",
    chars: " .01#",
  },
};

const ATLAS_CELL_W = 32;
const ATLAS_CELL_H = 48;

export function buildGlyphAtlasTexture(chars: string): {
  texture: THREE.CanvasTexture;
  charCount: number;
} {
  const safeChars = chars.length > 0 ? chars : " .:-=+*#%@";
  const count = safeChars.length;
  const canvas = document.createElement("canvas");
  canvas.width = ATLAS_CELL_W * count;
  canvas.height = ATLAS_CELL_H;

  const ctx = canvas.getContext("2d");
  if (ctx) {
    ctx.fillStyle = "#000000";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.fillStyle = "#ffffff";
    ctx.font = `700 ${Math.round(ATLAS_CELL_H * 0.78)}px "JetBrains Mono", "Fira Code", ui-monospace, SFMono-Regular, Menlo, monospace`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    for (let i = 0; i < count; i++) {
      const ch = safeChars[i];
      if (ch === " ") continue;
      const cx = i * ATLAS_CELL_W + ATLAS_CELL_W / 2;
      const cy = ATLAS_CELL_H / 2 + 1;
      ctx.fillText(ch, cx, cy);
    }
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.colorSpace = THREE.NoColorSpace;
  texture.needsUpdate = true;

  return { texture, charCount: count };
}

const VERT_SHADER = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

const FRAG_SHADER = /* glsl */ `
  precision highp float;

  uniform sampler2D tScene;
  uniform sampler2D tAtlas;
  uniform vec2 uResolution;
  uniform vec2 uCellSize;
  uniform float uCharCount;
  uniform float uContrast;
  uniform int uColorMode;   // 0 = full color, 1 = phosphor green, 2 = amber, 3 = cyan/violet duotone
  uniform int uViewMode;    // 0 = ascii, 1 = split compare, 2 = raw 3D
  uniform float uSplitX;
  uniform float uTime;

  varying vec2 vUv;

  vec3 linearToSrgbSafe(vec3 c) {
    vec3 safe = max(c, vec3(0.00001));
    return clamp(pow(safe, vec3(1.0 / 2.2)), 0.0, 1.0);
  }

  vec3 boostSaturation(vec3 c, float boost) {
    float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
    return clamp(mix(vec3(l), c, boost), 0.0, 1.0);
  }

  // 5-tap supersampling inside each character cell so thin 3D edges and grid lines stay visible
  vec3 sampleCellColor(vec2 cellCenterPx) {
    vec2 q = uCellSize * 0.28;
    vec2 invRes = 1.0 / max(uResolution, vec2(1.0));
    vec3 c0 = texture2D(tScene, clamp(cellCenterPx * invRes, vec2(0.001), vec2(0.999))).rgb;
    vec3 c1 = texture2D(tScene, clamp((cellCenterPx + vec2(-q.x, -q.y)) * invRes, vec2(0.001), vec2(0.999))).rgb;
    vec3 c2 = texture2D(tScene, clamp((cellCenterPx + vec2( q.x, -q.y)) * invRes, vec2(0.001), vec2(0.999))).rgb;
    vec3 c3 = texture2D(tScene, clamp((cellCenterPx + vec2(-q.x,  q.y)) * invRes, vec2(0.001), vec2(0.999))).rgb;
    vec3 c4 = texture2D(tScene, clamp((cellCenterPx + vec2( q.x,  q.y)) * invRes, vec2(0.001), vec2(0.999))).rgb;

    vec3 avgCol = (c0 * 2.0 + c1 + c2 + c3 + c4) / 6.0;
    vec3 peakCol = max(max(c0, max(c1, c2)), max(c3, c4));
    return linearToSrgbSafe(mix(avgCol, peakCol, 0.38));
  }

  void main() {
    // Raw 3D mode or right side of split comparison
    if (uViewMode == 2 || (uViewMode == 1 && vUv.x > uSplitX)) {
      vec3 rawCol = linearToSrgbSafe(texture2D(tScene, vUv).rgb);
      gl_FragColor = vec4(rawCol, 1.0);
      return;
    }

    // Subtle divider line in split compare mode
    if (uViewMode == 1 && abs(vUv.x - uSplitX) * uResolution.x < 1.5) {
      gl_FragColor = vec4(0.133, 0.827, 0.933, 1.0);
      return;
    }

    vec2 fragPx = vUv * uResolution;
    vec2 cellIndex = floor(fragPx / uCellSize);
    vec2 cellCenterPx = (cellIndex + 0.5) * uCellSize;

    vec3 sceneCol = sampleCellColor(cellCenterPx);
    float rawLum = dot(sceneCol, vec3(0.2126, 0.7152, 0.0722));

    // Safe exponent (never pass 0.0 to pow() to avoid NaN on Metal/ANGLE GPUs)
    float safeLum = max(rawLum, 0.0001);
    float lum = rawLum <= 0.012
      ? 0.0
      : clamp(pow(safeLum, 1.0 / max(0.35, uContrast)), 0.0, 1.0);

    float charIdx = floor(clamp(lum, 0.0, 0.9999) * uCharCount);
    vec2 localUv = fract(fragPx / uCellSize);

    // Slight inner margin so neighboring glyphs stay sharp and separated
    vec2 paddedUv = clamp((localUv - 0.05) / 0.90, 0.0, 1.0);
    vec2 atlasUv = vec2((charIdx + paddedUv.x) / uCharCount, paddedUv.y);
    float glyphMask = texture2D(tAtlas, atlasUv).r;

    vec3 inkCol;
    if (uColorMode == 0) {
      // Full colored ASCII: keep PBR hue vivid and lift midtones cleanly
      inkCol = boostSaturation(sceneCol, 1.35);
      inkCol = max(inkCol, sceneCol * 1.18);
      float minFloor = smoothstep(0.02, 0.16, rawLum) * 0.16;
      inkCol = max(inkCol, vec3(minFloor * 0.65, minFloor * 0.88, minFloor));
    } else if (uColorMode == 1) {
      // Classic Phosphor Green CRT
      vec3 darkG = vec3(0.05, 0.34, 0.14);
      vec3 brightG = vec3(0.38, 1.0, 0.58);
      inkCol = mix(darkG, brightG, lum);
    } else if (uColorMode == 2) {
      // Warm Amber Terminal
      vec3 darkA = vec3(0.38, 0.16, 0.02);
      vec3 brightA = vec3(1.0, 0.78, 0.24);
      inkCol = mix(darkA, brightA, lum);
    } else {
      // Cyan / Violet Duotone
      vec3 shadowC = vec3(0.545, 0.435, 0.961);
      vec3 highC = vec3(0.133, 0.827, 0.933);
      inkCol = mix(shadowC, highC, lum) * (0.42 + 0.68 * lum);
    }

    // Subtle scanline texture across cells
    float scan = 0.93 + 0.07 * sin(fragPx.y * 1.15 + uTime * 2.0);
    vec3 bgCol = vec3(0.02, 0.016, 0.042);
    vec3 finalCol = mix(bgCol, inkCol * scan, glyphMask);

    gl_FragColor = vec4(finalCol, 1.0);
  }
`;

export interface AsciiPipelineConfig {
  charset: AsciiCharsetKey;
  colorMode: AsciiColorMode;
  viewMode: AsciiViewMode;
  cellWidth: number;
  contrast: number;
}

export class AsciiRenderPipeline {
  private target: THREE.WebGLRenderTarget;
  private quadScene: THREE.Scene;
  private quadCamera: THREE.OrthographicCamera;
  private quadMesh: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;
  private atlasTex: THREE.CanvasTexture;
  private currentCharset: AsciiCharsetKey;

  constructor(width: number, height: number, initial: AsciiPipelineConfig) {
    this.target = new THREE.WebGLRenderTarget(Math.max(1, width), Math.max(1, height), {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      format: THREE.RGBAFormat,
      type: THREE.UnsignedByteType,
      depthBuffer: true,
    });

    this.currentCharset = initial.charset;
    const atlas = buildGlyphAtlasTexture(ASCII_CHARSETS[initial.charset].chars);
    this.atlasTex = atlas.texture;

    const mat = new THREE.ShaderMaterial({
      uniforms: {
        tScene: { value: this.target.texture },
        tAtlas: { value: this.atlasTex },
        uResolution: { value: new THREE.Vector2(Math.max(1, width), Math.max(1, height)) },
        uCellSize: { value: new THREE.Vector2(initial.cellWidth, Math.round(initial.cellWidth * 1.72)) },
        uCharCount: { value: atlas.charCount },
        uContrast: { value: initial.contrast },
        uColorMode: { value: colorModeToInt(initial.colorMode) },
        uViewMode: { value: viewModeToInt(initial.viewMode) },
        uSplitX: { value: 0.55 },
        uTime: { value: 0 },
      },
      vertexShader: VERT_SHADER,
      fragmentShader: FRAG_SHADER,
      depthTest: false,
      depthWrite: false,
    });

    this.quadScene = new THREE.Scene();
    this.quadCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.quadMesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat);
    this.quadMesh.frustumCulled = false;
    this.quadScene.add(this.quadMesh);
  }

  resize(drawW: number, drawH: number) {
    const pw = Math.max(1, Math.floor(drawW));
    const ph = Math.max(1, Math.floor(drawH));
    this.target.setSize(pw, ph);
    this.quadMesh.material.uniforms.uResolution.value.set(pw, ph);
  }

  updateConfig(cfg: AsciiPipelineConfig, dpr: number) {
    if (cfg.charset !== this.currentCharset) {
      this.currentCharset = cfg.charset;
      const next = buildGlyphAtlasTexture(ASCII_CHARSETS[cfg.charset].chars);
      this.atlasTex.dispose();
      this.atlasTex = next.texture;
      this.quadMesh.material.uniforms.tAtlas.value = this.atlasTex;
      this.quadMesh.material.uniforms.uCharCount.value = next.charCount;
    }
    const cellW = Math.max(4, Math.round(cfg.cellWidth * dpr));
    const cellH = Math.max(7, Math.round(cellW * 1.72));
    this.quadMesh.material.uniforms.uCellSize.value.set(cellW, cellH);
    this.quadMesh.material.uniforms.uContrast.value = cfg.contrast;
    this.quadMesh.material.uniforms.uColorMode.value = colorModeToInt(cfg.colorMode);
    this.quadMesh.material.uniforms.uViewMode.value = viewModeToInt(cfg.viewMode);
  }

  render(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera, elapsedSec: number) {
    this.quadMesh.material.uniforms.uTime.value = elapsedSec;
    renderer.setRenderTarget(this.target);
    renderer.clear();
    renderer.render(scene, camera);
    renderer.setRenderTarget(null);
    renderer.render(this.quadScene, this.quadCamera);
  }

  dispose() {
    this.target.dispose();
    this.atlasTex.dispose();
    this.quadMesh.geometry.dispose();
    this.quadMesh.material.dispose();
  }
}

function colorModeToInt(mode: AsciiColorMode): number {
  switch (mode) {
    case "full":
      return 0;
    case "phosphor":
      return 1;
    case "amber":
      return 2;
    case "duotone":
      return 3;
  }
}

function viewModeToInt(mode: AsciiViewMode): number {
  switch (mode) {
    case "ascii":
      return 0;
    case "split":
      return 1;
    case "raw":
      return 2;
  }
}
