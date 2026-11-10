import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { excerptForQuery, loadManuals, parseManual, retrieve, stem, tokenize } from "@/lib/rag";

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
    expect(tokenize("The chains are skipping!")).toEqual(["chain", "skip"]);
    // "does" must be dropped before stemming; otherwise it becomes "doe" and escapes STOP.
    expect(tokenize("does the chain skip")).toEqual(["chain", "skip"]);
    expect(tokenize("does the chain skip")).toEqual(tokenize("do the chains skip"));
    expect(tokenize("anti-static bag")).toEqual(tokenize("anti static bag"));
    expect(tokenize("single-handle faucet")).toEqual(["single", "handle", "faucet"]);
    expect(tokenize("washer-drain-filter")).toEqual(["wash", "drain", "filter"]);
    expect(tokenize("o-ring")).toEqual(tokenize("o ring"));
    // Manuals contain "anything"; stemming it first yields "anyth" and pollutes BM25.
    expect(tokenize("before taking anything apart")).toEqual(tokenize("before taking apart"));
    expect(tokenize("anything something nothing")).toEqual([]);
    // Chain-wear manual uses "0.5%" and "0.75%"; punctuation must not drop them.
    expect(tokenize("at 0.5% elongation")).toEqual(["0.5", "elongate"]);
    expect(tokenize("at 0.75% on 10 speed")).toEqual(["0.75", "10", "speed"]);
    expect(tokenize("0.5%")).toEqual(["0.5"]);
    expect(tokenize("0.75%")).toEqual(["0.75"]);
    // laptop-fan: "opening the heatsink" should meet a "heat sink" query.
    expect(tokenize("heatsink")).toEqual(["heat", "sink"]);
    expect(tokenize("heatsink")).toEqual(tokenize("heat sink"));
  });

  it("does not let a custom manuals dir replace the default cache", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "manuals-"));
    fs.writeFileSync(path.join(dir, "x.md"), "---\nid: only-one\ntitle: Only one\nurl: https://example.com\n---\nOne chunk.\n");
    expect(loadManuals(dir).map((d) => d.id)).toEqual(["only-one"]);
    expect(loadManuals().map((d) => d.id)).toEqual(docs.map((d) => d.id));
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("stems singular and plural forms to the same token", () => {
    expect(stem("brakes")).toBe(stem("brake"));
    expect(stem("cables")).toBe(stem("cable"));
    expect(stem("hoses")).toBe(stem("hose"));
    expect(stem("switches")).toBe(stem("switch"));
    expect(stem("boxes")).toBe(stem("box"));
    expect(stem("glasses")).toBe(stem("glass"));
    expect(stem("leaking")).toBe(stem("leak"));
    expect(stem("string")).toBe("string");
    expect(stem("ring")).toBe("ring");
    expect(stem("bus")).toBe("bus");
    expect(stem("gas")).toBe("gas");
    expect(stem("batteries")).toBe(stem("battery"));
    expect(stem("batteries")).toBe("battery");
    expect(stem("accessories")).toBe(stem("accessory"));
    expect(stem("cities")).toBe(stem("city"));
    expect(stem("policies")).toBe(stem("policy"));
    expect(stem("ties")).not.toBe("ty");
    expect(stem("skipping")).toBe(stem("skip"));
    expect(stem("running")).toBe(stem("run"));
    expect(stem("stopping")).toBe(stem("stop"));
    expect(stem("falling")).toBe("fall");
    expect(stem("missing")).toBe("miss");
    expect(stem("knives")).toBe(stem("knife"));
    expect(stem("shelves")).toBe(stem("shelf"));
    expect(stem("halves")).toBe(stem("half"));
    expect(stem("wolves")).toBe(stem("wolf"));
    expect(stem("calves")).toBe(stem("calf"));
    expect(stem("valves")).toBe(stem("valve"));
    expect(stem("valves")).toBe("valve");
    expect(stem("solves")).toBe(stem("solve"));
    expect(stem("waves")).toBe(stem("wave"));
    expect(stem("fives")).toBe(stem("five"));
    expect(stem("tomatoes")).toBe(stem("tomato"));
    expect(stem("potatoes")).toBe(stem("potato"));
    expect(stem("heroes")).toBe(stem("hero"));
    expect(stem("echoes")).toBe(stem("echo"));
    expect(stem("mangoes")).toBe(stem("mango"));
    expect(stem("canoes")).toBe(stem("canoe"));
    expect(stem("shoes")).toBe(stem("shoe"));
    expect(stem("throes")).toBe(stem("throe"));
    expect(stem("thieves")).toBe(stem("thief"));
    expect(stem("thieves")).toBe("thief");
    expect(stem("loaves")).toBe(stem("loaf"));
    expect(stem("scarves")).toBe(stem("scarf"));
    expect(stem("wharves")).toBe(stem("wharf"));
    expect(stem("hooves")).toBe(stem("hoof"));
    expect(stem("waves")).toBe("wave");
    expect(stem("buses")).toBe(stem("bus"));
    expect(stem("buses")).toBe("bus");
    expect(stem("gases")).toBe(stem("gas"));
    expect(stem("atlases")).toBe(stem("atlas"));
    expect(stem("aliases")).toBe(stem("alias"));
    expect(stem("biases")).toBe(stem("bias"));
    expect(stem("hoses")).toBe(stem("hose"));
    expect(stem("phases")).toBe(stem("phase"));
    expect(stem("quizzes")).toBe(stem("quiz"));
    expect(stem("quizzes")).toBe("quiz");
    expect(stem("whizzes")).toBe(stem("whiz"));
    expect(stem("fizzes")).toBe(stem("fizz"));
    expect(stem("fizzes")).toBe("fizz");
    expect(stem("housing")).toBe(stem("house"));
    expect(stem("housing")).toBe("house");
    expect(stem("housings")).toBe(stem("house"));
    expect(stem("bearing")).toBe(stem("bearings"));
    expect(stem("bearing")).toBe("bearing");
    expect(stem("bearings")).toBe("bearing");
    expect(stem("rattling")).toBe(stem("rattle"));
    expect(stem("rattling")).toBe("rattle");
    expect(stem("rattles")).toBe("rattle");
    expect(stem("slowly")).toBe(stem("slow"));
    expect(stem("slowly")).toBe("slow");
    expect(stem("worn")).toBe(stem("wear"));
    expect(stem("worn")).toBe("wear");
    expect(stem("wears")).toBe("wear");
    expect(stem("washer")).toBe(stem("washing"));
    expect(stem("washer")).toBe("wash");
    expect(stem("washers")).toBe("wash");
    expect(stem("taking")).toBe(stem("take"));
    expect(stem("taking")).toBe("take");
    expect(stem("fixing")).toBe(stem("fix"));
    expect(stem("fixing")).toBe("fix");
    expect(stem("replaced")).toBe(stem("replace"));
    expect(stem("replaced")).toBe("replace");
    expect(stem("coated")).toBe(stem("coat"));
    expect(stem("kinked")).toBe(stem("kink"));
    expect(stem("replacement")).toBe(stem("replace"));
    expect(stem("replacement")).toBe("replace");
    expect(stem("replacing")).toBe(stem("replace"));
    expect(stem("replacing")).toBe("replace");
    expect(stem("removing")).toBe(stem("remove"));
    expect(stem("removing")).toBe("remove");
    expect(stem("removed")).toBe(stem("remove"));
    expect(stem("removed")).toBe("remove");
    expect(stem("measured")).toBe(stem("measure"));
    expect(stem("measured")).toBe("measure");
    expect(stem("measurement")).toBe(stem("measure"));
    expect(stem("measurement")).toBe("measure");
    expect(stem("skipped")).toBe(stem("skip"));
    expect(stem("skipped")).toBe("skip");
    expect(stem("skipping")).toBe("skip");
    expect(stem("shifted")).toBe(stem("shift"));
    expect(stem("shifted")).toBe("shift");
    expect(stem("shifting")).toBe("shift");
    expect(stem("lubricant")).toBe(stem("lubricate"));
    expect(stem("lubricant")).toBe("lubricate");
    expect(stem("lubrication")).toBe("lubricate");
    expect(stem("lubricated")).toBe(stem("lubricate"));
    expect(stem("lubricated")).toBe("lubricate");
    expect(stem("reassemble")).toBe(stem("assemble"));
    expect(stem("reassemble")).toBe("assemble");
    expect(stem("assembled")).toBe("assemble");
    expect(stem("elongation")).toBe(stem("elongate"));
    expect(stem("elongation")).toBe("elongate");
    expect(stem("elongated")).toBe("elongate");
    expect(stem("compressed")).toBe(stem("compress"));
    expect(stem("compressed")).toBe("compress");
    expect(stem("adjustment")).toBe(stem("adjust"));
    expect(stem("adjustment")).toBe("adjust");
    expect(stem("adjusted")).toBe(stem("adjust"));
    expect(stem("adjusted")).toBe("adjust");
    expect(stem("cleaned")).toBe(stem("clean"));
    expect(stem("cleaned")).toBe("clean");
    expect(stem("unplugged")).toBe(stem("unplug"));
    expect(stem("unplugged")).toBe("unplug");
    expect(stem("unscrewed")).toBe(stem("unscrew"));
    expect(stem("unscrewed")).toBe("unscrew");
    expect(stem("drained")).toBe(stem("drain"));
    expect(stem("drained")).toBe("drain");
    expect(stem("damaged")).toBe(stem("damage"));
    expect(stem("damaged")).toBe("damage");
    expect(stem("openings")).toBe(stem("opening"));
    expect(stem("openings")).toBe("open");
    expect(stem("opening")).toBe("open");
    expect(stem("plugged")).toBe(stem("plug"));
    expect(stem("plugged")).toBe("plug");
    expect(stem("rusted")).toBe(stem("rust"));
    expect(stem("rusted")).toBe("rust");
  });

  it("excerpt includes only the matching chunks, in document order", () => {
    const docs = [
      {
        id: "long-manual",
        title: "Long manual",
        url: "https://example.com/long",
        chunks: [
          "This intro is about packing and shipping.",
          "Replace the worn chain when elongation reaches the mark.",
          "Warranty terms and contact hours for the service desk.",
          "A second chain wear check uses the same elongation mark.",
        ],
      },
    ];
    const [hit] = retrieve("worn chain elongation", docs);
    expect(hit.id).toBe("long-manual");
    expect(hit.excerpt).toContain("Replace the worn chain");
    expect(hit.excerpt).toContain("second chain wear check");
    expect(hit.excerpt).not.toContain("packing and shipping");
    expect(hit.excerpt).not.toContain("Warranty terms");
    expect(excerptForQuery(docs[0].chunks, tokenize("worn chain elongation"))).toBe(
      "Replace the worn chain when elongation reaches the mark.\nA second chain wear check uses the same elongation mark.",
    );
  });

  it("rejects a manual without front matter", () => {
    expect(() => parseManual("no header")).toThrow();
  });
});
