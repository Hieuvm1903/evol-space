import express, { type Request, type Response } from "express";
import http from "node:http";
import path from "node:path";
import { GoogleGenAI, ThinkingLevel, Type } from "@google/genai";
import { VirtualRosRuntime } from "./server/rosRuntime";

try {
  // Load .env variables (e.g. VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY) if present locally
  (process as NodeJS.Process & { loadEnvFile?: () => void }).loadEnvFile?.();
} catch {
  /* .env is optional */
}

type AiPartShape =
  | "box"
  | "cylinder"
  | "sphere"
  | "cone"
  | "torus"
  | "capsule"
  | "ring"
  | "octahedron";

type JointType = "revolute" | "continuous" | "prismatic";

interface RawAiJoint {
  name?: string;
  type?: string;
  parentJoint?: string;
  pivot?: number[];
  axis?: number[];
  lower?: number;
  upper?: number;
}

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
  joint?: string;
}

interface RawAiBlueprint {
  name?: string;
  description?: string;
  parts?: RawAiPart[];
  joints?: RawAiJoint[];
}

interface ReferenceImageInput {
  mimeType: string;
  data: string;
}

interface GenerateInput {
  prompt: string;
  targetHeight: number;
  style?: string;
  materials?: string;
  extraDetails?: string;
  partDensity?: "standard" | "high";
  includeJoints?: boolean;
  jointDetails?: string;
  referenceImage?: ReferenceImageInput | null;
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

const VALID_JOINT_TYPES = new Set<JointType>(["revolute", "continuous", "prismatic"]);
const VALID_IMAGE_MIMES = new Set(["image/png", "image/jpeg", "image/webp"]);

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
    joints: {
      type: Type.ARRAY,
      description:
        "Optional list of 0 to 8 articulated joints controlling moving parts (revolute hinge/yaw, continuous wheel/rotor, or prismatic lift/slide).",
      items: {
        type: Type.OBJECT,
        properties: {
          name: {
            type: Type.STRING,
            description: "Joint identifier without spaces (e.g. turret_yaw, arm_pitch, lift_rail, wheel_fl).",
          },
          type: {
            type: Type.STRING,
            enum: ["revolute", "continuous", "prismatic"],
            description: "Joint kinematic type.",
          },
          parentJoint: {
            type: Type.STRING,
            description: "Optional name of an earlier parent joint for multi-axis articulated chains.",
          },
          pivot: {
            type: Type.ARRAY,
            items: { type: Type.NUMBER },
            description: "[x, y, z] joint pivot center in metres (same world coordinates as parts, floor y=0).",
          },
          axis: {
            type: Type.ARRAY,
            items: { type: Type.NUMBER },
            description: "[ax, ay, az] unit axis vector (e.g. [0,1,0] yaw/lift, [1,0,0] pitch, [0,0,1] roll).",
          },
          lower: {
            type: Type.NUMBER,
            description: "Lower limit in radians (revolute/continuous) or metres (prismatic).",
          },
          upper: {
            type: Type.NUMBER,
            description: "Upper limit in radians (revolute/continuous) or metres (prismatic).",
          },
        },
        required: ["name", "type", "pivot", "axis", "lower", "upper"],
      },
    },
    parts: {
      type: Type.ARRAY,
      description:
        "Ordered list of 8 to 28 composite geometric primitives forming a cohesive, grounded 3D assembly.",
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
          joint: {
            type: Type.STRING,
            description: "Optional joint name from 'joints' that owns/moves this part. Omit for fixed base parts.",
          },
        },
        required: ["name", "shape", "position", "rotationDeg", "scale", "color", "roughness", "metalness"],
      },
    },
  },
  required: ["name", "description", "parts"],
};

const SYSTEM_INSTRUCTION = `You are a senior industrial & 3D CAD assembly architect.
Convert a user prompt (and optional reference image) into a clean, multi-part 3D procedural blueprint for a real-time Three.js / GLTF scene.

Coordinate & Unit Rules (CRITICAL):
- Right-handed Y-up coordinate system in metres. Front faces +Z.
- Ground plane is y = 0. Base feet, tires, legs, or plinths MUST rest near y = 0 so the entire assembly sits solidly on the floor.
- Every primitive starts as a 1m x 1m x 1m unit shape centered at (0, 0, 0). Therefore 'scale: [sx, sy, sz]' directly sets its exact width (X), height (Y), and depth (Z) in metres!
  - Example: a wheel with diameter 0.4m and tire width 0.14m aligned with the X-axis axle uses shape "cylinder", scale [0.4, 0.14, 0.4], rotationDeg [0, 0, 90], position [x, 0.2, z].
  - Example: a tabletop at y = 0.75m measuring 1.4m wide x 0.06m thick x 0.8m deep uses shape "box", scale [1.4, 0.06, 0.8], position [0, 0.75, 0].
- Build well-proportioned parts with clear silhouettes, secondary mechanical/architectural details (frames, handles, vents, screens, wheels, braces, sensors, bevel caps), and no floating disconnected parts.
- When a reference image is provided, closely match its proportions, silhouette, structural sub-assemblies, colors, and material contrast.
- Use cohesive PBR materials:
  - Painted/powder-coated housing: metalness 0.25-0.45, roughness 0.35-0.5
  - Brushed steel / aluminum / chrome: metalness 0.8-0.95, roughness 0.2-0.38
  - Rubber tires / matte polymer / wood: metalness 0.0-0.08, roughness 0.65-0.9
  - Glass / visor: opacity 0.35-0.55, roughness 0.1, metalness 0.1
  - Status lights / displays: emissive "#22d3ee" or "#f59e0b" with emissiveIntensity 1.2-2.0.
- Articulated Joints Rules (when joints are enabled or requested):
  - Define each moving degree of freedom in 'joints' with 'pivot' in the EXACT same model coordinates as 'parts[].position'.
  - Set 'part.joint' to the joint name for every part that moves with that joint; keep static base parts without 'joint'.
  - For multi-link chains (e.g. shoulder -> elbow -> wrist), set 'parentJoint' cleanly without cycles.
  - Use realistic limits: revolute in radians (e.g. lower -1.57, upper 1.57), continuous 0..6.283, prismatic in metres (e.g. lower 0, upper 1.2).
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

function normalizeAxis(arr: unknown): [number, number, number] {
  const raw = vec3(arr, [0, 1, 0], -1, 1);
  const len = Math.hypot(raw[0], raw[1], raw[2]);
  if (len < 1e-4) return [0, 1, 0];
  return [
    Number((raw[0] / len).toFixed(4)),
    Number((raw[1] / len).toFixed(4)),
    Number((raw[2] / len).toFixed(4)),
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

function decodeJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const part = token.split(".")[1];
    if (!part) return null;
    const b64 = part.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(part.length / 4) * 4, "=");
    return JSON.parse(Buffer.from(b64, "base64").toString("utf8")) as Record<string, unknown>;
  } catch {
    return null;
  }
}

async function verifyAdminFromAuthHeader(
  authHeader: string | undefined,
): Promise<{ ok: true; userId: string } | { ok: false; status: number; error: string }> {
  const match = typeof authHeader === "string" ? authHeader.match(/^Bearer\s+(.+)$/i) : null;
  const token = match?.[1]?.trim();
  if (!token) {
    return {
      ok: false,
      status: 401,
      error: "Authentication required. Log in as an admin user to generate AI models.",
    };
  }

  const supabaseUrl = (process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || "").trim();
  const supabaseAnonKey = (process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || "").trim();

  if (supabaseUrl && supabaseAnonKey && !token.endsWith(".local")) {
    try {
      const authRes = await fetch(`${supabaseUrl.replace(/\/+$/, "")}/auth/v1/user`, {
        headers: {
          apikey: supabaseAnonKey,
          Authorization: `Bearer ${token}`,
        },
      });
      if (!authRes.ok) {
        return {
          ok: false,
          status: 401,
          error: "Invalid or expired session. Please log in again.",
        };
      }
      const userData = (await authRes.json()) as { id?: string; app_metadata?: { role?: string } };
      if (userData?.app_metadata?.role !== "admin") {
        return {
          ok: false,
          status: 403,
          error: "Only users with role = admin can generate AI 3D models.",
        };
      }
      return { ok: true, userId: userData.id || "admin" };
    } catch {
      return {
        ok: false,
        status: 502,
        error: "Could not verify user role with Supabase Auth.",
      };
    }
  }

  const payload = decodeJwtPayload(token);
  if (!payload) {
    return { ok: false, status: 401, error: "Invalid authorization token." };
  }
  if (typeof payload.exp === "number" && payload.exp * 1000 < Date.now()) {
    return { ok: false, status: 401, error: "Session expired. Please log in again." };
  }
  const appMeta = payload.app_metadata as { role?: unknown } | undefined;
  if (appMeta?.role !== "admin") {
    return {
      ok: false,
      status: 403,
      error: "Only users with role = admin can generate AI 3D models.",
    };
  }
  return { ok: true, userId: String(payload.sub || "admin") };
}

function sanitizeBlueprint(raw: RawAiBlueprint, prompt: string, targetHeight: number) {
  const jointsInput = Array.isArray(raw.joints) ? raw.joints.slice(0, 10) : [];
  const seenJoints = new Set<string>();
  const joints = jointsInput
    .map((j, idx) => {
      const cleanName = String(j.name || `joint_${idx + 1}`).replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 32);
      if (!cleanName || seenJoints.has(cleanName)) return null;
      seenJoints.add(cleanName);

      const typeRaw = String(j.type ?? "revolute").toLowerCase() as JointType;
      const type: JointType = VALID_JOINT_TYPES.has(typeRaw) ? typeRaw : "revolute";
      let lower =
        type === "continuous"
          ? 0
          : type === "prismatic"
            ? clamp(j.lower, -5, 5, 0)
            : clamp(j.lower, -6.283, 6.283, -1.57);
      let upper =
        type === "continuous"
          ? Number((Math.PI * 2).toFixed(4))
          : type === "prismatic"
            ? clamp(j.upper, -5, 5, 0.8)
            : clamp(j.upper, -6.283, 6.283, 1.57);
      if (lower > upper) [lower, upper] = [upper, lower];

      const parentRaw = typeof j.parentJoint === "string"
        ? j.parentJoint.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 32)
        : "";
      return {
        name: cleanName,
        type,
        ...(parentRaw && parentRaw !== cleanName ? { parentJoint: parentRaw } : {}),
        pivot: vec3(j.pivot, [0, 0.5, 0], -25, 25),
        axis: normalizeAxis(j.axis),
        lower,
        upper,
      };
    })
    .filter((j): j is NonNullable<typeof j> => Boolean(j));

  const jointNames = new Set(joints.map((j) => j.name));
  // Ensure parentJoint references exist and break any cycles
  const parentMap = new Map(joints.map((j) => [j.name, j.parentJoint]));
  for (const j of joints) {
    if (j.parentJoint && !jointNames.has(j.parentJoint)) {
      delete j.parentJoint;
      parentMap.delete(j.name);
      continue;
    }
    const visited = new Set<string>([j.name]);
    let cur = j.parentJoint;
    while (cur) {
      if (visited.has(cur)) {
        delete j.parentJoint;
        parentMap.delete(j.name);
        break;
      }
      visited.add(cur);
      cur = parentMap.get(cur);
    }
  }

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
    const jointClean = typeof p.joint === "string"
      ? p.joint.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 32)
      : "";

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
      ...(jointClean && jointNames.has(jointClean) ? { joint: jointClean } : {}),
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
    ...(joints.length > 0 ? { joints } : {}),
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

function buildUserPrompt(input: GenerateInput): string {
  const lines: string[] = [];
  lines.push(`Create a detailed multi-part 3D model blueprint for: "${input.prompt}"`);

  if (input.targetHeight > 0) {
    lines.push(`Target overall height: approximately ${input.targetHeight.toFixed(2)} metres.`);
  } else {
    lines.push("Choose realistic real-world industrial/architectural dimensions in metres.");
  }

  if (input.style) lines.push(`Category / design style: ${input.style}.`);
  if (input.materials) lines.push(`Preferred materials & colors: ${input.materials}.`);
  if (input.extraDetails) lines.push(`Additional structural & silhouette requirements: ${input.extraDetails}.`);

  lines.push(
    input.partDensity === "high"
      ? "Part complexity: high detail (aim for 16 to 26 well-crafted parts)."
      : "Part complexity: clean balanced detail (aim for 10 to 16 well-crafted parts).",
  );

  if (input.includeJoints) {
    lines.push(
      "Articulated joints ARE REQUIRED: define realistic moving joints in 'joints' and assign each moving part's 'joint' property to the appropriate joint name.",
    );
    if (input.jointDetails) {
      lines.push(`Requested joint mechanics: ${input.jointDetails}.`);
    }
  } else {
    lines.push("Omit 'joints' unless the prompt specifically asks for articulated or moving joints.");
  }

  if (input.referenceImage) {
    lines.push("Analyze the attached reference image carefully and translate its shape, proportions, components, and color scheme into the 3D blueprint.");
  }

  return lines.join("\n");
}

async function generateWithRetry(ai: GoogleGenAI, input: GenerateInput) {
  const userPrompt = buildUserPrompt(input);
  const contents = input.referenceImage
    ? {
        parts: [
          {
            inlineData: {
              mimeType: input.referenceImage.mimeType,
              data: input.referenceImage.data,
            },
          },
          { text: userPrompt },
        ],
      }
    : userPrompt;

  let lastErr: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const response = await ai.models.generateContent({
        model: "gemini-4-hydrogen",
        contents,
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
      return sanitizeBlueprint(parsed, input.prompt, input.targetHeight);
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

function parseReferenceImage(raw: unknown): ReferenceImageInput | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as { mimeType?: unknown; data?: unknown };
  const mimeType = typeof obj.mimeType === "string" ? obj.mimeType.trim().toLowerCase() : "";
  const data = typeof obj.data === "string" ? obj.data.trim() : "";
  if (!VALID_IMAGE_MIMES.has(mimeType) || !data) return null;
  if (data.length > 5_500_000) {
    throw new Error("Reference image is too large (max ~4 MB).");
  }
  return { mimeType, data };
}

async function startServer() {
  const app = express();
  const port = Number(process.env.PORT) || 3000;

  app.use(express.json({ limit: "8mb" }));

  const rosRuntime = new VirtualRosRuntime();

  app.get("/api/health", (_req: Request, res: Response) => {
    const hasKey = Boolean(
      process.env.GEMINI_API_KEY?.trim() ||
      process.env.GOOGLE_API_KEY?.trim() ||
      process.env.API_KEY?.trim(),
    );
    res.json({
      ok: true,
      geminiConfigured: hasKey,
      rosBridge: rosRuntime.getStatus().running,
    });
  });

  app.get("/api/ros/status", (_req: Request, res: Response) => {
    res.json(rosRuntime.getStatus());
  });

  app.post("/api/work/generate-model", async (req: Request, res: Response) => {
    const authCheck = await verifyAdminFromAuthHeader(req.headers.authorization);
    if (!authCheck.ok) {
      res.status(authCheck.status).json({ error: authCheck.error });
      return;
    }

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

    let referenceImage: ReferenceImageInput | null = null;
    try {
      referenceImage = parseReferenceImage(req.body?.referenceImage);
    } catch (e) {
      res.status(400).json({ error: e instanceof Error ? e.message : "Invalid reference image." });
      return;
    }

    const apiKey =
      process.env.GEMINI_API_KEY?.trim() ||
      process.env.GOOGLE_API_KEY?.trim() ||
      process.env.API_KEY?.trim();
    if (!apiKey) {
      res.status(500).json({
        error:
          "GEMINI_API_KEY is not configured on the server (a free Gemini API key works). Add GEMINI_API_KEY in AI Studio Settings > Secrets, or in your host's Environment Variables (e.g. Vercel Project Settings > Environment Variables) and redeploy.",
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
      const blueprint = await generateWithRetry(ai, {
        prompt,
        targetHeight,
        style: typeof req.body?.style === "string" ? req.body.style.trim().slice(0, 120) : undefined,
        materials: typeof req.body?.materials === "string" ? req.body.materials.trim().slice(0, 240) : undefined,
        extraDetails: typeof req.body?.extraDetails === "string" ? req.body.extraDetails.trim().slice(0, 400) : undefined,
        partDensity: req.body?.partDensity === "high" ? "high" : "standard",
        includeJoints: Boolean(req.body?.includeJoints),
        jointDetails: typeof req.body?.jointDetails === "string" ? req.body.jointDetails.trim().slice(0, 300) : undefined,
        referenceImage,
      });
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

  const server = http.createServer(app);
  rosRuntime.attach(server);

  server.listen(port, "0.0.0.0", () => {
    console.log(`[EVOL Space] server listening on http://0.0.0.0:${port} (ROS bridge at /ws/ros)`);
  });
}

startServer().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});
