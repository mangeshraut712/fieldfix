import { z } from "zod";

export const identifySchema = z.object({
  object: z.string().describe("What the photographed thing is, e.g. 'bicycle rear derailleur'"),
  parts: z
    .array(z.string())
    .min(1)
    .max(4)
    .describe("Up to 4 short concrete noun phrases for visible parts relevant to the problem, e.g. 'chain'"),
});
export type Identify = z.infer<typeof identifySchema>;

export const diagnosisSchema = z.object({
  object: z.string(),
  likelyIssue: z.string(),
  confidence: z.enum(["low", "medium", "high"]),
  safety: z.array(z.string()).describe("Safety warnings; empty if none"),
  tools: z.array(z.string()),
  steps: z
    .array(
      z.object({
        title: z.string(),
        detail: z.string(),
        part: z.string().nullable().describe("One of the provided part labels this step touches, or null"),
        sourceId: z.string().nullable().describe("Id of the manual excerpt that supports this step, or null"),
      }),
    )
    .min(1)
    .max(10),
  whenToStop: z.string().describe("When the user should stop and call a professional"),
});
export type Diagnosis = z.infer<typeof diagnosisSchema>;

export interface Segment {
  label: string;
  objectId: string;
  box: { left: number; top: number; right: number; bottom: number };
  path?: string; // SVG mask outline, relative to pathOffset
  pathOffset?: { x: number; y: number };
}

export interface Source {
  id: string;
  title: string;
  url: string;
  excerpt: string;
}

export interface AnalyzeResult {
  mode: "live" | "mock";
  model: string;
  /** Segmentation model id used for the live call (cfg.samModel), or "mock". */
  segmentation: string;
  segments: Segment[];
  diagnosis: Diagnosis;
  sources: Source[];
  timingsMs: Record<string, number>;
}
