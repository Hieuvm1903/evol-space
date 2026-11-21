import * as THREE from "three";

export interface ProceduralTexturePair {
  map: THREE.CanvasTexture;
  bumpMap: THREE.CanvasTexture;
}

/**
 * Radial engraved plaza floor texture (sRGB albedo + linear bump) with zero external 404s.
 */
export function createPlazaFloorTextures(maxAnisotropy: number): ProceduralTexturePair {
  const size = 1024;
  const albedo = document.createElement("canvas");
  albedo.width = size;
  albedo.height = size;
  const aCtx = albedo.getContext("2d");

  const bump = document.createElement("canvas");
  bump.width = size;
  bump.height = size;
  const bCtx = bump.getContext("2d");

  if (aCtx && bCtx) {
    const c = size / 2;

    // Deep slate cosmic basalt base
    const grad = aCtx.createRadialGradient(c, c, 40, c, c, c);
    grad.addColorStop(0, "#1c1938");
    grad.addColorStop(0.55, "#110f24");
    grad.addColorStop(1, "#090814");
    aCtx.fillStyle = grad;
    aCtx.fillRect(0, 0, size, size);

    bCtx.fillStyle = "#767676";
    bCtx.fillRect(0, 0, size, size);

    // Subtle stone grain speckles
    for (let i = 0; i < 4200; i++) {
      const rx = (Math.sin(i * 12.9898) * 43758.5453) % 1;
      const ry = (Math.sin(i * 78.233) * 19341.123) % 1;
      const px = Math.abs(rx) * size;
      const py = Math.abs(ry) * size;
      aCtx.fillStyle = i % 2 === 0 ? "rgba(255,255,255,0.02)" : "rgba(0,0,0,0.08)";
      aCtx.fillRect(px, py, 2, 2);
      bCtx.fillStyle = i % 2 === 0 ? "#808080" : "#6b6b6b";
      bCtx.fillRect(px, py, 2, 2);
    }

    // Concentric architectural rings
    const ringRadii = [110, 175, 290, 395, 470];
    ringRadii.forEach((r, idx) => {
      aCtx.strokeStyle =
        idx % 2 === 0 ? "rgba(34, 211, 238, 0.22)" : "rgba(139, 111, 245, 0.20)";
      aCtx.lineWidth = idx === 2 ? 3 : 1.5;
      aCtx.beginPath();
      aCtx.arc(c, c, r, 0, Math.PI * 2);
      aCtx.stroke();

      bCtx.strokeStyle = "#3a3a3a";
      bCtx.lineWidth = 3;
      bCtx.beginPath();
      bCtx.arc(c, c, r, 0, Math.PI * 2);
      bCtx.stroke();
    });

    // Compass tick markings around the central ring
    for (let deg = 0; deg < 360; deg += 5) {
      const rad = (deg * Math.PI) / 180;
      const major = deg % 30 === 0;
      const r0 = major ? 156 : 165;
      const r1 = 175;
      aCtx.strokeStyle = major ? "rgba(34, 211, 238, 0.45)" : "rgba(167, 139, 250, 0.18)";
      aCtx.lineWidth = major ? 2 : 1;
      aCtx.beginPath();
      aCtx.moveTo(c + Math.cos(rad) * r0, c + Math.sin(rad) * r0);
      aCtx.lineTo(c + Math.cos(rad) * r1, c + Math.sin(rad) * r1);
      aCtx.stroke();
    }

    // Fine orthogonal tile grid seams
    aCtx.strokeStyle = "rgba(139, 111, 245, 0.08)";
    aCtx.lineWidth = 1.5;
    bCtx.strokeStyle = "#4d4d4d";
    bCtx.lineWidth = 2;
    const step = 64;
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
  }

  const map = new THREE.CanvasTexture(albedo);
  map.colorSpace = THREE.SRGBColorSpace;
  map.anisotropy = maxAnisotropy;
  map.needsUpdate = true;

  const bumpMap = new THREE.CanvasTexture(bump);
  bumpMap.colorSpace = THREE.NoColorSpace;
  bumpMap.anisotropy = maxAnisotropy;
  bumpMap.needsUpdate = true;

  return { map, bumpMap };
}

/**
 * Vinyl record radial groove texture for the Music monument.
 */
export function createVinylTexture(maxAnisotropy: number): THREE.CanvasTexture {
  const size = 512;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");

  if (ctx) {
    const c = size / 2;
    ctx.fillStyle = "#0e0d15";
    ctx.fillRect(0, 0, size, size);

    for (let r = 82; r < 246; r += 3) {
      ctx.strokeStyle = r % 9 === 0 ? "rgba(167, 139, 250, 0.16)" : "rgba(255, 255, 255, 0.06)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(c, c, r, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Center label
    const lblGrad = ctx.createRadialGradient(c, c, 8, c, c, 76);
    lblGrad.addColorStop(0, "#22d3ee");
    lblGrad.addColorStop(1, "#7c3aed");
    ctx.fillStyle = lblGrad;
    ctx.beginPath();
    ctx.arc(c, c, 74, 0, Math.PI * 2);
    ctx.fill();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = maxAnisotropy;
  tex.needsUpdate = true;
  return tex;
}

/**
 * Procedural cartographic globe texture for the Map astrolabe monument.
 */
export function createGlobeTexture(maxAnisotropy: number): THREE.CanvasTexture {
  const w = 512;
  const h = 256;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");

  if (ctx) {
    ctx.fillStyle = "#0b1a2e";
    ctx.fillRect(0, 0, w, h);

    // Lat/lon grid lines
    ctx.strokeStyle = "rgba(34, 211, 238, 0.25)";
    ctx.lineWidth = 1;
    for (let x = 0; x <= w; x += 32) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
      ctx.stroke();
    }
    for (let y = 0; y <= h; y += 32) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }

    // Stylized vector continents
    ctx.fillStyle = "#164e63";
    ctx.strokeStyle = "#22d3ee";
    ctx.lineWidth = 1.5;
    const blobs: Array<[number, number, number, number]> = [
      [115, 86, 48, 30],
      [148, 152, 26, 42],
      [275, 76, 52, 28],
      [285, 138, 34, 44],
      [375, 92, 64, 34],
      [412, 172, 32, 22],
    ];
    for (const [bx, by, rx, ry] of blobs) {
      ctx.beginPath();
      ctx.ellipse(bx, by, rx, ry, 0.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = maxAnisotropy;
  tex.needsUpdate = true;
  return tex;
}

/**
 * Procedural phosphor ASCII matrix screen texture for the ASCII 3D monument.
 */
export function createAsciiScreenTexture(maxAnisotropy: number): THREE.CanvasTexture {
  const size = 256;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");

  if (ctx) {
    ctx.fillStyle = "#04120c";
    ctx.fillRect(0, 0, size, size);

    const chars = " .:-=+*#%@01";
    ctx.font = "bold 12px monospace";
    for (let y = 16; y < size - 8; y += 14) {
      for (let x = 10; x < size - 10; x += 11) {
        const dx = (x - size / 2) / (size / 2);
        const dy = (y - size / 2) / (size / 2);
        const ring = Math.abs(Math.sqrt(dx * dx + dy * dy) - 0.52);
        const idx = Math.min(
          chars.length - 1,
          Math.max(0, Math.floor((1 - Math.min(1, ring * 2.4)) * chars.length)),
        );
        ctx.fillStyle = ring < 0.16 ? "#34d399" : "rgba(52, 211, 153, 0.35)";
        ctx.fillText(chars[idx], x, y);
      }
    }
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = maxAnisotropy;
  tex.needsUpdate = true;
  return tex;
}

/**
 * Soft radial contact shadow decal texture for grounded pedestals and monuments.
 */
export function createRadialContactShadowTexture(): THREE.CanvasTexture {
  const size = 256;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");

  if (ctx) {
    const c = size / 2;
    const grad = ctx.createRadialGradient(c, c, 12, c, c, c);
    grad.addColorStop(0, "rgba(2, 2, 10, 0.90)");
    grad.addColorStop(0.5, "rgba(4, 3, 14, 0.45)");
    grad.addColorStop(1, "rgba(4, 3, 14, 0.0)");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, size, size);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}
