import fs from "node:fs";
import path from "node:path";
import type { Source } from "./types";

export interface ManualDoc {
  id: string;
  title: string;
  url: string;
  chunks: string[];
}

const STOP = new Set(
  "a an the and or of to in on is it at for with by be as from this that if not do does are was can will your you into anything something nothing".split(" "),
);

// Light suffix stripping so singular and plural forms meet: "brakes" and "brake"
// both become "brake", "switches" and "switch" both become "switch".
export function stem(t: string): string {
  // Leave short words alone so "ring", "bring" and "string" keep their stem.
  // "housing" / "house" (cable housing in the derailleur manual). The regular
  // -ing rule would otherwise yield "hous".
  if (t === "housing" || t === "housings") return "house";
  // "taking" / "take" in the faucet manual ("before taking anything apart").
  // The regular -ing rule leaves "taking" alone because the remainder is short.
  if (t === "taking") return "take";
  // "Fixing" is the first word of the faucet manual title (counted twice in BM25).
  // The regular -ing rule leaves it alone because the remainder is short.
  if (t === "fixing") return "fix";
  // Past participles in the bundled manuals: "the chain replaced",
  // "O-rings coated with ... grease", "the drain hose is not kinked".
  if (t === "replaced") return "replace";
  if (t === "coated") return "coat";
  if (t === "kinked") return "kink";
  if (t.endsWith("ing") && t.length - 3 >= 4) {
    const s = t.slice(0, -3);
    // "skipping" / "skip", "running" / "run": drop the consonant doubled before -ing.
    // Leave "falling" / "fall" and "missing" / "miss" alone (ll, ss, zz).
    if (s.length >= 3 && s[s.length - 1] === s[s.length - 2] && !/[lsz]/.test(s[s.length - 1])) {
      return s.slice(0, -1);
    }
    return s;
  }
  // "thieves" / "thief". The -ives rule below would otherwise yield "thife".
  if (t === "thieves") return "thief";
  // "loaves" / "loaf". Leave "waves" / "wave" to the regular -s rule.
  if (t.endsWith("oaves") && t.length >= 6) return `${t.slice(0, -3)}f`;
  // "scarves" / "scarf", "wharves" / "wharf".
  if (t.endsWith("arves") && t.length >= 7) return `${t.slice(0, -3)}f`;
  // "hooves" / "hoof".
  if (t.endsWith("ooves") && t.length >= 6) return `${t.slice(0, -3)}f`;
  // "knives" / "knife". Leave short words like "fives" to the regular -s rule.
  if (t.endsWith("ives") && t.length >= 6) return `${t.slice(0, -4)}ife`;
  // "shelves" / "shelf", "wolves" / "wolf", "halves" / "half", "calves" / "calf".
  // Leave "valves" / "valve" and "solves" / "solve" on the regular -s rule.
  if (t === "shelves" || t === "wolves" || t === "halves" || t === "calves") return `${t.slice(0, -3)}f`;
  // "batteries" / "battery", "accessories" / "accessory". Leave short words like "pies" alone.
  if (t.endsWith("ies") && t.length - 3 >= 3) return `${t.slice(0, -3)}y`;
  // "tomatoes" / "tomato", "heroes" / "hero". Leave "oe" singulars that only add -s
  // ("shoes" / "shoe", "canoes" / "canoe", "throes" / "throe").
  if (t.endsWith("oes") && t.length >= 6 && t !== "canoes" && t !== "throes") return t.slice(0, -2);
  // "buses"/"bus", "gases"/"gas", "atlases"/"atlas". A generic "drop -es when the
  // remainder ends in s" rule would also turn "hoses" into "hos".
  if (t === "buses" || t === "gases" || t === "atlases" || t === "aliases" || t === "biases") return t.slice(0, -2);
  // "quizzes"/"quiz", "whizzes"/"whiz". The regular -zes rule would leave the
  // doubled z ("quizz"). Leave short words like "fizzes"/"fizz" on that rule.
  if (t.endsWith("izzes") && t.length >= 7) return t.slice(0, -3);
  if (/(ss|x|z|ch|sh)es$/.test(t)) return t.slice(0, -2);
  // "bus", "gas", "focus" and "chassis" are singular already.
  if (t.endsWith("s") && !/(ss|us|is|as)$/.test(t)) return t.slice(0, -1);
  return t;
}

export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    // Keep decimal points between digits so "0.5%" and "0.75%" stay as numbers
    // instead of being dropped or becoming "75".
    .replace(/(\d)\.(\d)/g, "$1\u0000$2")
    .replace(/[^a-z0-9\s\u0000]/g, " ")
    .replace(/\u0000/g, ".")
    .split(/\s+/)
    .filter((t) => t.length > 1 && !STOP.has(t))
    .map(stem)
    .filter((t) => t.length > 1 && !STOP.has(t));
}

export function parseManual(raw: string): ManualDoc {
  const m = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!m) throw new Error("manual missing front matter");
  const meta = Object.fromEntries(
    m[1].split("\n").map((l) => {
      const i = l.indexOf(":");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
    }),
  );
  const chunks = m[2].split("\n").map((s) => s.trim()).filter(Boolean);
  return { id: meta.id, title: meta.title, url: meta.url, chunks };
}

let cache: ManualDoc[] | null = null;
export function loadManuals(dir?: string): ManualDoc[] {
  const defaultDir = path.join(process.cwd(), "data", "manuals");
  const isDefault = dir === undefined || path.resolve(dir) === defaultDir;
  if (isDefault && cache) return cache;
  const docs = fs
    .readdirSync(dir ?? defaultDir)
    .filter((f) => f.endsWith(".md"))
    .sort()
    .map((f) => parseManual(fs.readFileSync(path.join(dir ?? defaultDir, f), "utf8")));
  // Only the default directory is cached; a custom dir must not replace it.
  if (isDefault) cache = docs;
  return docs;
}

// BM25 over whole documents (title counts twice), returning the top chunks of the best docs.
export function retrieve(query: string, docs: ManualDoc[], k = 2): Source[] {
  const q = tokenize(query);
  if (q.length === 0) return [];
  const docTokens = docs.map((d) => tokenize(`${d.title} ${d.title} ${d.chunks.join(" ")}`));
  const avg = docTokens.reduce((s, t) => s + t.length, 0) / docs.length;
  const df = new Map<string, number>();
  for (const toks of docTokens) for (const t of new Set(toks)) df.set(t, (df.get(t) ?? 0) + 1);
  const k1 = 1.4;
  const b = 0.75;
  const scored = docs.map((d, i) => {
    const toks = docTokens[i];
    let score = 0;
    for (const term of new Set(q)) {
      const tf = toks.filter((t) => t === term).length;
      if (!tf) continue;
      const n = df.get(term) ?? 0;
      const idf = Math.log(1 + (docs.length - n + 0.5) / (n + 0.5));
      score += (idf * tf * (k1 + 1)) / (tf + k1 * (1 - b + (b * toks.length) / avg));
    }
    return { d, score };
  });
  return scored
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, k)
    .map(({ d }) => ({ id: d.id, title: d.title, url: d.url, excerpt: d.chunks.join("\n") }));
}
