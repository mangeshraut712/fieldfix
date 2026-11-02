export type Mode = "live" | "mock";

export interface MetaConfig {
  apiKey: string | undefined;
  baseURL: string;
  model: string;
  samModel: string;
  mode: Mode;
}

// Defaults match Meta Model API docs (dev.meta.ai/docs/models), checked 2026-11-02.
export function getConfig(env: Record<string, string | undefined> = process.env): MetaConfig {
  const apiKey = env.META_API_KEY?.trim() || undefined;
  const forceMock = env.FIELDFIX_MOCK === "1";
  return {
    apiKey,
    baseURL: env.META_BASE_URL?.trim() || "https://api.meta.ai/v1",
    model: env.META_MODEL?.trim() || "muse-spark-1.3",
    samModel: env.META_SAM_MODEL?.trim() || "sam-3.1",
    mode: apiKey && !forceMock ? "live" : "mock",
  };
}
