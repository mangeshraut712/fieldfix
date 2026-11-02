import { describe, expect, it } from "vitest";
import { loadManuals, parseManual, retrieve, tokenize } from "@/lib/rag";

describe("rag", () => {
  const docs = loadManuals();

  it("loads every manual with id, title and url", () => {
    expect(docs.length).toBeGreaterThanOrEqual(5);
    for (const d of docs) {
      expect(d.id).toMatch(/^[a-z0-9-]+$/);
      expect(d.url).toMatch(/^https:\/\//);
      expect(d.chunks.length).toBeGreaterThan(0);
    }
    expect(new Set(docs.map((d) => d.id)).size).toBe(docs.length);
  });

  it("finds the derailleur manual for a shifting problem", () => {
    expect(retrieve("rear derailleur won't shift to bigger cogs", docs)[0].id).toBe("park-rd-adjust");
  });

  it("finds the faucet manual for a drip", () => {
    expect(retrieve("kitchen faucet dripping from spout", docs)[0].id).toBe("faucet-cartridge");
  });

  it("finds the washer manual", () => {
    expect(retrieve("washing machine won't drain, water left in drum", docs)[0].id).toBe("washer-drain-filter");
  });

  it("returns nothing for an empty or unrelated query", () => {
    expect(retrieve("", docs)).toEqual([]);
    expect(retrieve("zzqx", docs)).toEqual([]);
  });

  it("tokenizes and strips stop words", () => {
    expect(tokenize("The chains are skipping!")).toEqual(["chain", "skipp"]);
  });

  it("rejects a manual without front matter", () => {
    expect(() => parseManual("no header")).toThrow();
  });
});
