import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { generateText, Output, type ModelMessage } from "ai";
import type { MetaConfig } from "./config";
import { diagnosisSchema, identifySchema, type Diagnosis, type Identify, type Source } from "./types";

function provider(cfg: MetaConfig) {
  return createOpenAICompatible({
    name: "meta",
    baseURL: cfg.baseURL,
    apiKey: cfg.apiKey,
    supportsStructuredOutputs: true,
  });
}

function imageMessage(text: string, imageDataUrl: string): ModelMessage {
  return {
    role: "user",
    content: [
      { type: "text", text },
      { type: "image", image: imageDataUrl },
    ],
  };
}

export async function identify(cfg: MetaConfig, imageDataUrl: string, symptom: string): Promise<Identify> {
  const { output } = await generateText({
    model: provider(cfg)(cfg.model),
    output: Output.object({ schema: identifySchema }),
    system:
      "You look at a photo of something broken. Name the object and up to 4 visible parts that matter for the reported problem. Parts must be one or two plain generic words a segmentation model can find, like 'chain', 'gear', 'handle' or 'fan'. Avoid brand names and jargon.",
    messages: [imageMessage(`Reported problem: ${symptom || "not given"}`, imageDataUrl)],
    providerOptions: { meta: { reasoningEffort: "low" } },
  });
  return output;
}

export function buildDiagnosisPrompt(symptom: string, parts: string[], sources: Source[]): string {
  const manual = sources.length
    ? sources.map((s) => `[${s.id}] ${s.title}\n${s.excerpt}`).join("\n\n")
    : "(no matching manual excerpt)";
  return [
    `Reported problem: ${symptom || "not given"}`,
    `Part labels found in the photo: ${parts.join(", ") || "none"}`,
    "Manual excerpts you may cite by id:",
    manual,
    "Diagnose the most likely issue from the photo and the problem. Give numbered repair steps a careful beginner can follow. Tie each step to a part label when it applies and to a manual excerpt id when the excerpt supports it. Do not cite an id that is not listed. Put safety warnings first.",
  ].join("\n\n");
}

export async function diagnose(
  cfg: MetaConfig,
  imageDataUrl: string,
  symptom: string,
  parts: string[],
  sources: Source[],
): Promise<Diagnosis> {
  const { output } = await generateText({
    model: provider(cfg)(cfg.model),
    output: Output.object({ schema: diagnosisSchema }),
    system: "You are FieldFix, a repair technician who explains clearly and never invents facts the photo or manuals do not support.",
    messages: [imageMessage(buildDiagnosisPrompt(symptom, parts, sources), imageDataUrl)],
    providerOptions: { meta: { reasoningEffort: "medium" } },
  });
  return output;
}
