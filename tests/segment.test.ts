import fs from "node:fs";
import { describe, expect, it } from "vitest";
import { parseImageStream } from "@meta-sam/parser";
import { segmentsFromResult } from "@/lib/segment";

// Real sam-3.1 output for prompt "derailleur" on public/samples/derailleur.jpg (1200x900), captured 2026-11-02.
const line = fs.readFileSync("tests/fixtures/sam-derailleur.txt", "utf8");

async function* events() {
  yield { type: "response.output_text.delta", item_id: "m", output_index: 0, content_index: 0, delta: line };
  yield { type: "response.output_text.done", item_id: "m", output_index: 0, content_index: 0, text: line };
  yield { type: "response.completed" };
}

describe("segmentsFromResult", () => {
  it("turns SAM records into labelled boxes with a mask outline", async () => {
    const parsed = parseImageStream(events() as never);
    for await (const _ of parsed) {
      // drain
    }
    const segs = segmentsFromResult("derailleur", await parsed.finalResult);
    expect(segs).toHaveLength(1);
    expect(segs[0]).toMatchObject({ label: "derailleur", objectId: "derailleur#0", box: { left: 652, top: 345 } });
    expect(segs[0].path).toMatch(/^M/);
    expect(segs[0].pathOffset).toEqual({ x: 652, y: 345 });
  });
});
