import * as THREE from "three";

export interface ProceduralTextureSet {
  map: THREE.CanvasTexture;
  bumpMap: THREE.CanvasTexture;
}

/**
 * Procedural sci-fi trench deck plates (albedo sRGB + linear bump/roughness)
 * with zero external URL dependencies.
 */
export function createFloorTextures(maxAnisotropy: number): ProceduralTextureSet {
  const size = 512;

  const albedoCanvas = document.createElement("canvas");
  albedoCanvas.width = size;
  albedoCanvas.height = size;
  const aCtx = albedoCanvas.getContext("2d");

  const bumpCanvas = document.createElement("canvas");
  bumpCanvas.width = size;
  bumpCanvas.height = size;
  const bCtx = bumpCanvas.getContext("2d");

  if (aCtx && bCtx) {
    // Base deck slate
    aCtx.fillStyle = "#161332";
    aCtx.fillRect(0, 0, size, size);

    bCtx.fillStyle = "#707070";
    bCtx.fillRect(0, 0, size, size);

    // Subtle brushed deck grain
    for (let y = 0; y < size; y += 4) {
      const shade = y % 8 === 0 ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.08)";
      aCtx.fillStyle = shade;
      aCtx.fillRect(0, y, size, 2);

      bCtx.fillStyle = y % 8 === 0 ? "#7a7a7a" : "#646464";
      bCtx.fillRect(0, y, size, 2);
    }

    // Panel grid seams
    aCtx.strokeStyle = "#2b2559";
    aCtx.lineWidth = 4;
    bCtx.strokeStyle = "#242424";
    bCtx.lineWidth = 5;

    const step = 128;
    for (let p = 0; p <= size; p += step) {
      aCtx.beginPath();
      aCtx.moveTo(p, 0);
      aCtx.lineTo(p, size);
      aCtx.stroke();

      aCtx.beginPath();
      aCtx.moveTo(0, p);
      aCtx.lineTo(size, p);
      aCtx.stroke();

      bCtx.beginPath();
      bCtx.moveTo(p, 0);
      bCtx.lineTo(p, size);
      bCtx.stroke();

      bCtx.beginPath();
      bCtx.moveTo(0, p);
      bCtx.lineTo(size, p);
      bCtx.stroke();
    }

    // Center conduit guide strip & edge rails
    aCtx.fillStyle = "#22d3ee";
    aCtx.globalAlpha = 0.28;
    aCtx.fillRect(size / 2 - 6, 0, 12, size);
    aCtx.fillStyle = "#8b6ff5";
    aCtx.fillRect(28, 0, 8, size);
    aCtx.fillRect(size - 36, 0, 8, size);
    aCtx.globalAlpha = 1;

    bCtx.fillStyle = "#c8c8c8";
    bCtx.fillRect(size / 2 - 6, 0, 12, size);
    bCtx.fillRect(28, 0, 8, size);
    bCtx.fillRect(size - 36, 0, 8, size);

    // Corner rivets on each 128px deck tile
    for (let gx = 0; gx < size; gx += step) {
      for (let gy = 0; gy < size; gy += step) {
        const pts: [number, number][] = [
          [gx + 14, gy + 14],
          [gx + step - 14, gy + 14],
          [gx + 14, gy + step - 14],
          [gx + step - 14, gy + step - 14],
        ];
        for (const [rx, ry] of pts) {
          aCtx.fillStyle = "#433b7a";
          aCtx.beginPath();
          aCtx.arc(rx, ry, 3, 0, Math.PI * 2);
          aCtx.fill();

          bCtx.fillStyle = "#dcdcdc";
          bCtx.beginPath();
          bCtx.arc(rx, ry, 3, 0, Math.PI * 2);
          bCtx.fill();
        }
      }
    }
  }

  const map = new THREE.CanvasTexture(albedoCanvas);
  map.colorSpace = THREE.SRGBColorSpace;
  map.wrapS = THREE.RepeatWrapping;
  map.wrapT = THREE.RepeatWrapping;
  map.repeat.set(4, 16);
  map.anisotropy = maxAnisotropy;
  map.needsUpdate = true;

  const bumpMap = new THREE.CanvasTexture(bumpCanvas);
  bumpMap.colorSpace = THREE.NoColorSpace;
  bumpMap.wrapS = THREE.RepeatWrapping;
  bumpMap.wrapT = THREE.RepeatWrapping;
  bumpMap.repeat.set(4, 16);
  bumpMap.anisotropy = maxAnisotropy;
  bumpMap.needsUpdate = true;

  return { map, bumpMap };
}

/**
 * Procedural radial telemetry markings for the 3D Sandbox studio turntable.
 */
export function createSandboxPlinthTextures(maxAnisotropy: number): ProceduralTextureSet {
  const size = 512;

  const albedoCanvas = document.createElement("canvas");
  albedoCanvas.width = size;
  albedoCanvas.height = size;
  const aCtx = albedoCanvas.getContext("2d");

  const bumpCanvas = document.createElement("canvas");
  bumpCanvas.width = size;
  bumpCanvas.height = size;
  const bCtx = bumpCanvas.getContext("2d");

  if (aCtx && bCtx) {
    const c = size / 2;
    aCtx.fillStyle = "#161430";
    aCtx.fillRect(0, 0, size, size);
    bCtx.fillStyle = "#787878";
    bCtx.fillRect(0, 0, size, size);

    // Concentric rings
    const radii = [92, 146, 198, 238];
    for (let i = 0; i < radii.length; i++) {
      aCtx.strokeStyle = i % 2 === 0 ? "rgba(34, 211, 238, 0.35)" : "rgba(139, 111, 245, 0.32)";
      aCtx.lineWidth = i === 3 ? 3 : 2;
      aCtx.beginPath();
      aCtx.arc(c, c, radii[i], 0, Math.PI * 2);
      aCtx.stroke();

      bCtx.strokeStyle = "#b8b8b8";
      bCtx.lineWidth = 2;
      bCtx.beginPath();
      bCtx.arc(c, c, radii[i], 0, Math.PI * 2);
      bCtx.stroke();
    }

    // Radial tick dial markings
    for (let deg = 0; deg < 360; deg += 10) {
      const rad = (deg * Math.PI) / 180;
      const major = deg % 30 === 0;
      const r0 = major ? 182 : 190;
      const r1 = 204;
      aCtx.strokeStyle = major ? "rgba(34, 211, 238, 0.55)" : "rgba(167, 139, 250, 0.25)";
      aCtx.lineWidth = major ? 2.5 : 1.2;
      aCtx.beginPath();
      aCtx.moveTo(c + Math.cos(rad) * r0, c + Math.sin(rad) * r0);
      aCtx.lineTo(c + Math.cos(rad) * r1, c + Math.sin(rad) * r1);
      aCtx.stroke();
    }
  }

  const map = new THREE.CanvasTexture(albedoCanvas);
  map.colorSpace = THREE.SRGBColorSpace;
  map.anisotropy = maxAnisotropy;
  map.needsUpdate = true;

  const bumpMap = new THREE.CanvasTexture(bumpCanvas);
  bumpMap.colorSpace = THREE.NoColorSpace;
  bumpMap.anisotropy = maxAnisotropy;
  bumpMap.needsUpdate = true;

  return { map, bumpMap };
}

/**
 * Soft radial contact shadow decal texture for grounded ships and hero models.
 */
export function createRadialContactShadowTexture(): THREE.CanvasTexture {
  const size = 256;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");

  if (ctx) {
    const c = size / 2;
    const grad = ctx.createRadialGradient(c, c, 8, c, c, c);
    grad.addColorStop(0, "rgba(2, 2, 8, 0.92)");
    grad.addColorStop(0.45, "rgba(4, 3, 12, 0.52)");
    grad.addColorStop(1, "rgba(4, 3, 12, 0.0)");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, size, size);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}
