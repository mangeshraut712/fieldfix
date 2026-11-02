import OpenAI from "openai";
import { decodeMaskToSVGPath, parseImageStream, recordsOfKind } from "@meta-sam/parser";
import type { MetaConfig } from "./config";
import type { Segment } from "./types";

type ImageResult = Awaited<ReturnType<typeof parseImageStream>["finalResult"]>;

export function segmentsFromResult(label: string, result: ImageResult): Segment[] {
  const boxes = recordsOfKind(result.records, "box");
  const masks = recordsOfKind(result.records, "mask");
  return boxes.map((b) => {
    const mask = masks.find((m) => m.objectId === b.objectId);
    // decodeMaskToSVGPath returns coordinates relative to the mask's own bounds.
    const raw = mask ? decodeMaskToSVGPath(mask.mask) : "";
    return {
      label,
      objectId: `${label}#${b.objectId}`,
      box: { left: b.left, top: b.top, right: b.right, bottom: b.bottom },
      ...(mask && raw ? { path: raw, pathOffset: { x: mask.bounds.left, y: mask.bounds.top } } : {}),
    };
  });
}

/** Run SAM 3.1 once per noun phrase, in parallel. One phrase per request, as the docs require. */
export async function segmentParts(cfg: MetaConfig, imageDataUrl: string, parts: string[]): Promise<Segment[]> {
  const client = new OpenAI({ baseURL: cfg.baseURL, apiKey: cfg.apiKey });
  const runs = parts.map(async (label) => {
    const events = await client.responses.create({
      model: cfg.samModel,
      input: [
        {
          type: "message",
          role: "user",
          content: [
            { type: "input_text", text: label },
            { type: "input_image", image_url: imageDataUrl, detail: "auto" },
          ],
        },
      ],
      stream: true,
    });
    const parsed = parseImageStream(events as never);
    for await (const _ of parsed) {
      // drain snapshots; we only need the final result
    }
    const result = await parsed.finalResult;
    return segmentsFromResult(label, result).slice(0, 3);
  });
  const settled = await Promise.allSettled(runs);
  return settled.flatMap((s) => (s.status === "fulfilled" ? s.value : []));
}
