import express, { type Request, type Response } from "express";
import path from "node:path";
import { GoogleGenAI, ThinkingLevel, Type } from "@google/genai";

type AiPartShape =
  | "box"
  | "cylinder"
  | "sphere"
  | "cone"
  | "torus"
  | "capsule"
  | "ring"
  | "octahedron";

interface RawAiPart {
  name?: string;
  shape?: string;
  position?: number[];
  rotationDeg?: number[];
  scale?: number[];
  color?: string;
  roughness?: number;
  metalness?: number;
  emissive?: string;
  emissiveIntensity?: number;
  opacity?: number;
}

interface RawAiBlueprint {
  name?: string;
  description?: string;
  parts?: RawAiPart[];
}

const VALID_SHAPES = new Set<AiPartShape>([
  "box",
  "cylinder",
  "sphere",
  "cone",
  "torus",
  "capsule",
  "ring",
  "octahedron",
]);

const BLUEPRINT_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    name: {
      type: Type.STRING,
      description: "Concise 2-4 word display name of the 3D asset.",
    },
    description: {
      type: Type.STRING,
      description: "Short 1-sentence summary of the generated 3D assembly.",
    },
    parts: {
      type: Type.ARRAY,
      description:
        "Ordered list of 8 to 26 composite geometric primitives forming a cohesive, grounded 3D assembly.",
      items: {
        type: Type.OBJECT,
        properties: {
          name: {
            type: Type.STRING,
            description: "Part identifier such as chassis_base, wheel_fl, mast_column, beacon.",
          },
          shape: {
            type: Type.STRING,
            enum: ["box", "cylinder", "sphere", "cone", "torus", "capsule", "ring", "octahedron"],
            description: "Primitive shape centered at its local origin with unit bounding size 1x1x1 before scale.",
          },
          position: {
            type: Type.ARRAY,
            items: { type: Type.NUMBER },
            description: "[x, y, z] center of this part in metres (Y up, ground floor at y=0).",
          },
          rotationDeg: {
            type: Type.ARRAY,
            items: { type: Type.NUMBER },
            description: "[rx, ry, rz] Euler XYZ rotation in degrees.",
          },
          scale: {
            type: Type.ARRAY,
            items: { type: Type.NUMBER },
            description: "[widthX, heightY, depthZ] positive dimensions in metres.",
          },
          color: {
            type: Type.STRING,
            description: "Albedo hex color like #2f3542 or #ff9f1c.",
          },
          roughness: {
            type: Type.NUMBER,
            description: "PBR surface roughness between 0.08 and 1.0.",
          },
          metalness: {
            type: Type.NUMBER,
            description: "PBR metalness between 0.0 and 1.0.",
          },
          emissive: {
            type: Type.STRING,
            description: "Optional emissive hex color (e.g. #22d3ee) for LEDs, screens, or beacons; #000000 if none.",
          },
          emissiveIntensity: {
            type: Type.NUMBER,
            description: "Emissive multiplier 0 to 2.5 (0 if non-emissive).",
          },
          opacity: {
            type: Type.NUMBER,
            description: "Optional opacity between 0.2 and 1.0 (1.0 for opaque).",
          },
        },
        required: ["name", "shape", "position", "rotationDeg", "scale", "color", "roughness", "metalness"],
      },
    },
  },
  required: ["name", "description", "parts"],
};

const SYSTEM_INSTRUCTION = `You are a senior industrial & 3D CAD assembly architect.
Convert a user prompt into a clean, multi-part 3D procedural blueprint for a real-time Three.js / GLTF scene.

Coordinate & Unit Rules (CRITICAL):
- Right-handed Y-up coordinate system in metres. Front faces +Z.
- Ground plane is y = 0. Base feet, tires, legs, or plinths MUST rest near y = 0 so the entire assembly sits solidly on the floor.
- Every primitive starts as a 1m x 1m x 1m unit shape centered at (0, 0, 0). Therefore 'scale: [sx, sy, sz]' directly sets its exact width (X), height (Y), and depth (Z) in metres!
  - Example: a wheel with diameter 0.4m and tire width 0.14m aligned with the X-axis axle uses shape "cylinder", scale [0.4, 0.14, 0.4], rotationDeg [0, 0, 90], position [x, 0.2, z].
  - Example: a tabletop at y = 0.75m measuring 1.4m wide x 0.06m thick x 0.8m deep uses shape "box", scale [1.4, 0.06, 0.8], position [0, 0.75, 0].
- Build 10 to 24 well-proportioned parts with clear silhouettes, secondary mechanical/architectural details (frames, handles, vents, screens, wheels, braces, sensors, bevel caps), and no floating disconnected parts.
- Use cohesive PBR materials:
  - Painted/powder-coated housing: metalness 0.25-0.45, roughness 0.35-0.5
  - Brushed steel / aluminum / chrome: metalness 0.8-0.95, roughness 0.2-0.38
  - Rubber tires / matte polymer / wood: metalness 0.0-0.08, roughness 0.65-0.9
  - Glass / visor: opacity 0.35-0.55, roughness 0.1, metalness 0.1
  - Status lights / displays: emissive "#22d3ee" or "#f59e0b" with emissiveIntensity 1.2-2.0.
Return strictly valid JSON conforming to the response schema.`;

function clamp(n: unknown, min: number, max: number, fallback: number): number {
  const v = typeof n === "number" && Number.isFinite(n) ? n : fallback;
  return Math.min(max, Math.max(min, v));
}

function normalizeHex(hex: unknown, fallback: string): string {
  if (typeof hex !== "string") return fallback;
  const trimmed = hex.trim();
  if (/^#[0-9a-fA-F]{6}$/.test(trimmed)) return trimmed.toLowerCase();
  if (/^#[0-9a-fA-F]{3}$/.test(trimmed)) {
    const [, r, g, b] = trimmed;
    return `#${r}${r}${g}${g}${b}${b}`.toLowerCase();
  }
  return fallback;
}

function vec3(arr: unknown, fallback: [number, number, number], min: number, max: number): [number, number, number] {
  const src = Array.isArray(arr) ? arr : [];
  return [
    clamp(src[0], min, max, fallback[0]),
    clamp(src[1], min, max, fallback[1]),
    clamp(src[2], min, max, fallback[2]),
  ];
}

function makeAssetId(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 22);
  const suffix = Math.random().toString(36).slice(2, 6);
  return `ai_${slug || "model"}_${suffix}`;
}

function sanitizeBlueprint(raw: RawAiBlueprint, prompt: string, targetHeight: number) {
  const partsInput = Array.isArray(raw.parts) ? raw.parts.slice(0, 32) : [];
  if (partsInput.length === 0) {
    throw new Error("Gemini returned an empty 3D part list.");
  }

  const parts = partsInput.map((p, idx) => {
    const shapeRaw = String(p.shape ?? "box").toLowerCase() as AiPartShape;
    const shape: AiPartShape = VALID_SHAPES.has(shapeRaw) ? shapeRaw : "box";
    const emissiveHex = normalizeHex(p.emissive, "#000000");
    const emissiveIntensity =
      emissiveHex !== "#000000" ? clamp(p.emissiveIntensity, 0, 3, 1.2) : 0;
    const opacity = clamp(p.opacity, 0.15, 1, 1);

    return {
      name: String(p.name || `part_${idx + 1}`).replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 40),
      shape,
      position: vec3(p.position, [0, 0.5, 0], -25, 25),
      rotationDeg: vec3(p.rotationDeg, [0, 0, 0], -360, 360),
      scale: vec3(p.scale, [0.3, 0.3, 0.3], 0.015, 25),
      color: normalizeHex(p.color, "#8b6ff5"),
      roughness: clamp(p.roughness, 0.05, 1, 0.45),
      metalness: clamp(p.metalness, 0, 1, 0.25),
      emissive: emissiveIntensity > 0 ? emissiveHex : undefined,
      emissiveIntensity: emissiveIntensity > 0 ? emissiveIntensity : undefined,
      opacity: opacity < 0.99 ? opacity : undefined,
    };
  });

  const name = String(raw.name || prompt.slice(0, 32)).trim().slice(0, 48) || "AI 3D Model";
  const description = String(raw.description || `Procedural 3D model for "${prompt}"`).trim().slice(0, 220);

  return {
    id: makeAssetId(name),
    name,
    description,
    prompt,
    targetHeightMeters: targetHeight,
    parts,
    createdAt: new Date().toISOString(),
  };
}

function formatGeminiError(err: unknown): { status: number; message: string } {
  const anyErr = err as { status?: number; code?: number; message?: string };
  const status = typeof anyErr?.status === "number" ? anyErr.status : 502;
  const rawMsg = anyErr?.message || String(err);

  if (status === 400 && /API_KEY_INVALID|API key not valid/i.test(rawMsg)) {
    return {
      status: 400,
      message: "Invalid Gemini API key. Check your key in the Settings > Secrets panel.",
    };
  }
  if (status === 403 || /PERMISSION_DENIED/i.test(rawMsg)) {
    return {
      status: 403,
      message: "Gemini API permission denied. Verify your API key in the Settings > Secrets panel.",
    };
  }
  if (status === 429 || /RESOURCE_EXHAUSTED/i.test(rawMsg)) {
    return {
      status: 429,
      message: "Gemini API rate limit or quota reached. Wait a moment and try again.",
    };
  }
  return { status: status >= 400 && status < 600 ? status : 502, message: rawMsg };
}

async function generateWithRetry(ai: GoogleGenAI, prompt: string, targetHeight: number) {
  const heightHint =
    targetHeight > 0
      ? `Target overall height: approximately ${targetHeight.toFixed(2)} metres.`
      : "Choose realistic real-world industrial/architectural dimensions in metres.";

  const userPrompt = `Create a detailed multi-part 3D model blueprint for: "${prompt}"\n${heightHint}`;

  let lastErr: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const response = await ai.models.generateContent({
        model: "gemini-4-hydrogen",
        contents: userPrompt,
        config: {
          systemInstruction: SYSTEM_INSTRUCTION,
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
          responseMimeType: "application/json",
          responseSchema: BLUEPRINT_SCHEMA,
        },
      });
      const text = (response.text ?? "").trim();
      if (!text) {
        throw new Error("Gemini returned an empty response.");
      }
      const parsed = JSON.parse(text) as RawAiBlueprint;
      return sanitizeBlueprint(parsed, prompt, targetHeight);
    } catch (err) {
      lastErr = err;
      const status = (err as { status?: number })?.status;
      const transient = status === 429 || status === 503 || status === 500;
      if (!transient || attempt === 2) throw err;
      await new Promise((r) => setTimeout(r, 400 * Math.pow(2, attempt)));
    }
  }
  throw lastErr;
}

async function startServer() {
  const app = express();
  const port = Number(process.env.PORT) || 3000;

  app.use(express.json({ limit: "1mb" }));

  app.get("/api/health", (_req: Request, res: Response) => {
    res.json({
      ok: true,
      geminiConfigured: Boolean(process.env.GEMINI_API_KEY?.trim()),
    });
  });

  app.post("/api/work/generate-model", async (req: Request, res: Response) => {
    const prompt = typeof req.body?.prompt === "string" ? req.body.prompt.trim() : "";
    const targetHeightRaw = Number(req.body?.targetHeight ?? 0);
    const targetHeight = Number.isFinite(targetHeightRaw) && targetHeightRaw > 0
      ? Math.min(12, Math.max(0.25, targetHeightRaw))
      : 0;

    if (!prompt) {
      res.status(400).json({ error: "Please enter a prompt describing the 3D model." });
      return;
    }
    if (prompt.length > 600) {
      res.status(400).json({ error: "Prompt must be 600 characters or fewer." });
      return;
    }

    const apiKey = process.env.GEMINI_API_KEY?.trim();
    if (!apiKey) {
      res.status(500).json({
        error: "GEMINI_API_KEY is not configured. Add it in the Settings > Secrets panel and retry.",
      });
      return;
    }

    try {
      const ai = new GoogleGenAI({
        apiKey,
        httpOptions: {
          headers: {
            "User-Agent": "aistudio-build",
          },
        },
      });
      const blueprint = await generateWithRetry(ai, prompt, targetHeight);
      res.json({ blueprint });
    } catch (err) {
      console.error("[/api/work/generate-model] failed:", err);
      const formatted = formatGeminiError(err);
      res.status(formatted.status).json({ error: formatted.message });
    }
  });

  if (process.env.NODE_ENV !== "production") {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve("dist");
    app.use(express.static(distDir));
    app.use((_req: Request, res: Response) => {
      res.sendFile(path.join(distDir, "index.html"));
    });
  }

  app.listen(port, "0.0.0.0", () => {
    console.log(`[EVOL Space] server listening on http://0.0.0.0:${port}`);
  });
}

startServer().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});
