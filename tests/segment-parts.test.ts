import { describe, expect, it, vi } from "vitest";

// SAM rejects for every part; the OpenAI client is stubbed so no network is touched.
vi.mock("openai", () => ({
  default: class {
    responses = { create: vi.fn().mockRejectedValue(new Error("429 rate limit exceeded")) };
  },
}));

import type { MetaConfig } from "@/lib/config";
import { segmentParts } from "@/lib/segment";

describe("segmentParts", () => {
  it("logs a rejected SAM call instead of dropping the part silently", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const cfg: MetaConfig = {
      apiKey: "test-key",
      baseURL: "https://example.invalid/v1",
      model: "muse-spark-1.3",
      samModel: "sam-3.1",
      mode: "live",
    };
    const segments = await segmentParts(cfg, "data:image/png;base64,AAAA", ["chain", "gear"]);
    expect(segments).toEqual([]);
    expect(error).toHaveBeenCalledTimes(2);
    expect(error).toHaveBeenCalledWith('segment failed for "chain"', "429 rate limit exceeded");
    error.mockRestore();
  });
});
