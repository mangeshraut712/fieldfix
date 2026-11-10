import type { MetaConfig } from "./config";
import { diagnose, identify } from "./model";
import { MOCK_DIAGNOSIS, MOCK_IDENTIFY, mockSegments } from "./mock";
import { loadManuals, retrieve } from "./rag";
import { segmentParts } from "./segment";
import type { AnalyzeResult, Diagnosis } from "./types";

export interface AnalyzeInput {
  imageDataUrl: string;
  symptom: string;
  width: number;
  height: number;
}

export interface Deps {
  identify: typeof identify;
  segmentParts: typeof segmentParts;
  diagnose: typeof diagnose;
}

const realDeps: Deps = { identify, segmentParts, diagnose };

/** Map a model-written label back to the canonical one, ignoring case and surrounding spaces. */
function canonical(value: string | null, known: string[]): string | null {
  if (!value) return null;
  const key = value.trim().toLowerCase();
  return known.find((k) => k.trim().toLowerCase() === key) ?? null;
}

/** Drop citations and part links the model made up. */
export function sanitize(d: Diagnosis, partLabels: string[], sourceIds: string[]): Diagnosis {
  return {
    ...d,
    steps: d.steps.map((s) => ({
      ...s,
      part: canonical(s.part, partLabels),
      sourceId: canonical(s.sourceId, sourceIds),
    })),
  };
}

export async function analyze(cfg: MetaConfig, input: AnalyzeInput, deps: Deps = realDeps): Promise<AnalyzeResult> {
  const t: Record<string, number> = {};
  const time = async <T>(k: string, f: () => Promise<T>) => {
    const s = Date.now();
    try {
      return await f();
    } finally {
      t[k] = Date.now() - s;
    }
  };
  const manuals = loadManuals();

  if (cfg.mode === "mock") {
    const sources = retrieve(`${MOCK_IDENTIFY.object} ${input.symptom} shifting chain`, manuals);
    return {
      mode: "mock",
      model: "mock",
      segmentation: "mock",
      segments: mockSegments(input.width, input.height),
      diagnosis: sanitize(MOCK_DIAGNOSIS, MOCK_IDENTIFY.parts, sources.map((s) => s.id)),
      sources,
      timingsMs: {},
    };
  }

  const id = await time("identify", () => deps.identify(cfg, input.imageDataUrl, input.symptom));
  const sources = retrieve(`${id.object} ${id.parts.join(" ")} ${input.symptom}`, manuals);
  const [segments, diagnosis] = await Promise.all([
    time("segment", () => deps.segmentParts(cfg, input.imageDataUrl, id.parts)),
    time("diagnose", () => deps.diagnose(cfg, input.imageDataUrl, input.symptom, id.parts, sources)),
  ]);
  return {
    mode: "live",
    model: cfg.model,
    segmentation: cfg.samModel,
    segments,
    diagnosis: sanitize(diagnosis, id.parts, sources.map((s) => s.id)),
    sources,
    timingsMs: t,
  };
}
