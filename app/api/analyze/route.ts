import { getConfig } from "@/lib/config";
import { analyze } from "@/lib/pipeline";
import { bodySchema } from "./schema";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: Request) {
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Send a JPEG, PNG or WebP image under about 4 MB." }, { status: 400 });
  try {
    return Response.json(await analyze(getConfig(), parsed.data));
  } catch (err) {
    console.error("analyze failed", err instanceof Error ? err.message : err);
    return Response.json({ error: "The model call failed. Try again, or check the server logs." }, { status: 502 });
  }
}

export async function GET() {
  const cfg = getConfig();
  return Response.json({ mode: cfg.mode, model: cfg.mode === "live" ? cfg.model : "mock" });
}
