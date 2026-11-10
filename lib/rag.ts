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
  "a an the and or of to in on is it at for with by be as from this that if not do does are was can will your you into".split(" "),
);

// Light suffix stripping so singular and plural forms meet: "brakes" and "brake"
// both become "brake", "switches" and "switch" both become "switch".
export function stem(t: string): string {
  // Leave short words alone so "ring", "bring" and "string" keep their stem.
  if (t.endsWith("ing") && t.length - 3 >= 4) return t.slice(0, -3);
  // "batteries" / "battery", "accessories" / "accessory". Leave short words like "pies" alone.
  if (t.endsWith("ies") && t.length - 3 >= 3) return `${t.slice(0, -3)}y`;
  if (/(ss|x|z|ch|sh)es$/.test(t)) return t.slice(0, -2);
  // "bus", "gas", "focus" and "chassis" are singular already.
  if (t.endsWith("s") && !/(ss|us|is|as)$/.test(t)) return t.slice(0, -1);
  return t;
}

export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
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
