import { afterEach, describe, expect, it, vi } from "vitest";
import type { AnalyzeResult } from "@/lib/types";

vi.mock("@/lib/pipeline", () => ({ analyze: vi.fn() }));

import { analyze } from "@/lib/pipeline";
import { POST } from "@/app/api/analyze/route";

const analyzeMock = vi.mocked(analyze);

const validBody = { imageDataUrl: "data:image/jpeg;base64,AAAA", width: 640, height: 480 };

function post(body: string) {
  return POST(new Request("http://localhost/api/analyze", { method: "POST", body }));
}

afterEach(() => {
  analyzeMock.mockReset();
  vi.restoreAllMocks();
});

describe("POST /api/analyze", () => {
  it("answers 400 with the overall hint when the body is not JSON at all", async () => {
    const res = await post("{not json");
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Send a JPEG, PNG or WebP image, a short symptom, and the image size." });
    expect(analyzeMock).not.toHaveBeenCalled();
  });

  it("answers 400 when the base64 payload is truncated (length not a multiple of 4)", async () => {
    const res = await post(JSON.stringify({ ...validBody, imageDataUrl: "data:image/jpeg;base64,AAA" }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Send a JPEG, PNG or WebP image." });
    expect(analyzeMock).not.toHaveBeenCalled();
  });

  it("passes the parsed body, with the symptom default, to analyze and returns its result", async () => {
    const result = { mode: "mock" } as unknown as AnalyzeResult;
    analyzeMock.mockResolvedValue(result);
    const res = await post(JSON.stringify(validBody));
    expect(res.status).toBe(200);
    expect(analyzeMock).toHaveBeenCalledWith(expect.anything(), { ...validBody, symptom: "" });
    expect(await res.json()).toEqual({ mode: "mock" });
  });

  it("answers 502, not 500, and logs the cause when analyze throws", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    analyzeMock.mockRejectedValue(new Error("boom"));
    const res = await post(JSON.stringify({ ...validBody, symptom: "chain skips" }));
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ error: "The model call failed. Try again, or check the server logs." });
    expect(log).toHaveBeenCalledWith("analyze failed", "boom");
  });
});
