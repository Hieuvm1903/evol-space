import type { IncomingMessage, ServerResponse } from "node:http";

export default function handler(_req: IncomingMessage, res: ServerResponse) {
  res.statusCode = 200;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  const hasKey = Boolean(
    process.env.GEMINI_API_KEY?.trim() ||
    process.env.GOOGLE_API_KEY?.trim() ||
    process.env.API_KEY?.trim(),
  );
  res.end(
    JSON.stringify({
      ok: true,
      geminiConfigured: hasKey,
    }),
  );
}
