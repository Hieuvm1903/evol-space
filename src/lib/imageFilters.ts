// Ported from utils/image_filters.py. The Python version did manual pixel
// math (a sepia color matrix multiply, a radial vignette mask) via PIL/
// numpy. This uses the browser's native CanvasRenderingContext2D.filter
// (same CSS filter functions as `filter: sepia(1)` etc.) instead — visually
// equivalent output, much less code, and GPU-accelerated, at the cost of
// not being pixel-identical to the old matrix math. Vintage still needs a
// manual vignette pass since there's no CSS filter for that.

export const PHOTO_FILTERS = ["None", "Grayscale", "Sepia", "Invert", "Blur", "Vintage"] as const;
export type PhotoFilter = (typeof PHOTO_FILTERS)[number];

function cssFilterFor(name: string): string {
  switch (name) {
    case "Grayscale": return "grayscale(1)";
    case "Sepia": return "sepia(1)";
    case "Invert": return "invert(1)";
    case "Blur": return "blur(4px)";
    case "Vintage": return "sepia(0.6) contrast(0.9) saturate(0.85)";
    default: return "none";
  }
}

/** Draws `source` onto a new canvas at (width, height) with the named
 * filter applied. Vintage additionally gets a multiply-blend vignette,
 * same visual effect as the original's _vignette() radial mask. */
export function applyFilter(
  source: CanvasImageSource, width: number, height: number, filterName: string,
): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d")!;

  ctx.filter = cssFilterFor(filterName);
  ctx.drawImage(source, 0, 0, width, height);

  if (filterName === "Vintage") {
    const gradient = ctx.createRadialGradient(
      width / 2, height / 2, width * 0.2,
      width / 2, height / 2, width * 0.75,
    );
    gradient.addColorStop(0, "rgba(0,0,0,0)");
    gradient.addColorStop(1, "rgba(0,0,0,0.55)");
    ctx.filter = "none";
    ctx.globalCompositeOperation = "multiply";
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);
    ctx.globalCompositeOperation = "source-over";
  }

  return canvas;
}

export function canvasToBlob(canvas: HTMLCanvasElement, quality = 0.9): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("toBlob failed"))), "image/jpeg", quality);
  });
}
