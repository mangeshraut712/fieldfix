import { describe, expect, it, vi } from "vitest";
import { bodySchema, describeBodyError } from "@/app/api/analyze/schema";
import { getConfig } from "@/lib/config";
import { analyze, sanitize } from "@/lib/pipeline";
import { MOCK_DIAGNOSIS } from "@/lib/mock";
import { buildDiagnosisPrompt } from "@/lib/model";
import { diagnosisSchema } from "@/lib/types";

const input = { imageDataUrl: "data:image/jpeg;base64,AAAA", symptom: "chain skips", width: 1000, height: 500 };

describe("config", () => {
  it("is mock without a key and live with one", () => {
    expect(getConfig({}).mode).toBe("mock");
    const live = getConfig({ META_API_KEY: "k" });
    expect(live.mode).toBe("live");
    expect(live.baseURL).toBe("https://api.meta.ai/v1");
    expect(live.model).toBe("muse-spark-1.3");
    expect(live.samModel).toBe("sam-3.1");
  });
  it("honours overrides and the force-mock flag", () => {
    const c = getConfig({ META_API_KEY: "k", META_MODEL: "muse-wonder-1.0", META_BASE_URL: "http://x/v1", FIELDFIX_MOCK: "1" });
    expect(c).toMatchObject({ model: "muse-wonder-1.0", baseURL: "http://x/v1", mode: "mock" });
  });
});

describe("pipeline", () => {
  it("returns labelled mock output with boxes inside the image", async () => {
    const r = await analyze(getConfig({}), input);
    expect(r.mode).toBe("mock");
    expect(r.segmentation).toBe("mock");
    expect(diagnosisSchema.parse(r.diagnosis)).toBeTruthy();
    for (const s of r.segments) {
      expect(s.box.left).toBeGreaterThanOrEqual(0);
      expect(s.box.right).toBeLessThanOrEqual(1000);
      expect(s.box.bottom).toBeLessThanOrEqual(500);
    }
    expect(r.sources.map((s) => s.id)).toContain("park-rd-adjust");
  });

  it("wires identify -> SAM + diagnose in live mode", async () => {
    const deps = {
      identify: vi.fn().mockResolvedValue({ object: "bike", parts: ["chain"] }),
      segmentParts: vi.fn().mockResolvedValue([{ label: "chain", objectId: "chain#0", box: { left: 1, top: 2, right: 3, bottom: 4 } }]),
      diagnose: vi.fn().mockResolvedValue({ ...MOCK_DIAGNOSIS, steps: [{ title: "t", detail: "d", part: "chain", sourceId: "made-up" }] }),
    };
    const r = await analyze(getConfig({ META_API_KEY: "k" }), input, deps);
    expect(r.mode).toBe("live");
    expect(deps.segmentParts).toHaveBeenCalledWith(expect.anything(), input.imageDataUrl, ["chain"]);
    expect(r.diagnosis.steps[0].part).toBe("chain");
    expect(r.diagnosis.steps[0].sourceId).toBeNull();
    expect(Object.keys(r.timingsMs).sort()).toEqual(["diagnose", "identify", "segment"]);
    expect(r.segmentation).toBe("sam-3.1");
  });

  it("reports the configured SAM model in live mode", async () => {
    const deps = {
      identify: vi.fn().mockResolvedValue({ object: "bike", parts: ["chain"] }),
      segmentParts: vi.fn().mockResolvedValue([]),
      diagnose: vi.fn().mockResolvedValue(MOCK_DIAGNOSIS),
    };
    const r = await analyze(getConfig({ META_API_KEY: "k", META_SAM_MODEL: "sam-3.2" }), input, deps);
    expect(r.segmentation).toBe("sam-3.2");
  });
});

describe("sanitize and prompt", () => {
  it("drops unknown parts and citations", () => {
    const d = sanitize(MOCK_DIAGNOSIS, ["chain"], ["park-chain-wear"]);
    expect(d.steps.filter((s) => s.part).every((s) => s.part === "chain")).toBe(true);
    expect(d.steps.filter((s) => s.sourceId).every((s) => s.sourceId === "park-chain-wear")).toBe(true);
  });
  it("keeps links the model wrote with different case or spacing, using the canonical label", () => {
    const d = sanitize(
      { ...MOCK_DIAGNOSIS, steps: [{ title: "t", detail: "d", part: " Chain ", sourceId: "Park-Chain-Wear" }] },
      ["chain"],
      ["park-chain-wear"],
    );
    expect(d.steps[0].part).toBe("chain");
    expect(d.steps[0].sourceId).toBe("park-chain-wear");
  });
  it("puts excerpt ids in the prompt", () => {
    const p = buildDiagnosisPrompt("drip", ["handle"], [{ id: "faucet-cartridge", title: "T", url: "u", excerpt: "E" }]);
    expect(p).toContain("[faucet-cartridge]");
    expect(p).toContain("handle");
  });
});

describe("bodySchema", () => {
  it("accepts jpeg, jpg, png, and webp data urls", () => {
    for (const mime of ["jpeg", "jpg", "png", "webp"]) {
      const res = bodySchema.safeParse({
        imageDataUrl: `data:image/${mime};base64,AAAA`,
        symptom: "test",
        width: 100,
        height: 100,
      });
      expect(res.success).toBe(true);
    }
  });
  it("rejects unsupported mime types", () => {
    const res = bodySchema.safeParse({
      imageDataUrl: "data:image/gif;base64,AAAA",
      symptom: "test",
      width: 100,
      height: 100,
    });
    expect(res.success).toBe(false);
  });

  it("does not blame the image when the symptom is too long", () => {
    const res = bodySchema.safeParse({
      imageDataUrl: "data:image/png;base64,AAAA",
      symptom: "x".repeat(501),
      width: 100,
      height: 100,
    });
    expect(res.success).toBe(false);
    if (!res.success) {
      expect(describeBodyError(res.error)).toBe("Keep the symptom description under 500 characters.");
      expect(describeBodyError(res.error)).not.toMatch(/4 MB/);
    }
  });

  it("does not blame the image when the dimensions are invalid", () => {
    const res = bodySchema.safeParse({
      imageDataUrl: "data:image/png;base64,AAAA",
      symptom: "leak",
      width: 0,
      height: 100,
    });
    expect(res.success).toBe(false);
    if (!res.success) {
      expect(describeBodyError(res.error)).toBe("Width and height must be positive integers up to 4096.");
    }
  });

  it("still mentions the size limit only when the data URL is too large", () => {
    const res = bodySchema.safeParse({
      imageDataUrl: `data:image/png;base64,${"A".repeat(6_000_000)}`,
      symptom: "leak",
      width: 100,
      height: 100,
    });
    expect(res.success).toBe(false);
    if (!res.success) {
      expect(describeBodyError(res.error)).toBe("Send a JPEG, PNG or WebP image under about 4 MB.");
    }
  });
});
