# FieldFix

Take a photo of something broken, say what is wrong, and get a map of the parts plus repair steps you can follow. Each step points at the part it touches and at the manual excerpt it came from.

Built for the Meta Global AI Developer Hackathon 2026 (Indie track, "Build for Your World").

## What it does

1. **Upload a photo** (phone camera works). The browser shrinks it to 1024 px before upload.
2. **Identify.** Muse Spark 1.3 names the object and up to four visible parts that matter for the problem.
3. **Segment.** SAM 3.1 on Meta Model API finds each part and returns boxes and pixel masks. One request per part, run in parallel.
4. **Retrieve.** A small BM25 search over five public repair manuals picks the excerpts that match.
5. **Diagnose.** Muse Spark 1.3 looks at the photo again with the parts and excerpts and returns structured JSON: likely issue, confidence, safety notes, tools, steps, and when to stop and call a pro.
6. **Overlay.** The UI draws the masks over the photo. Hover a step to light up its part. Citations link to the source manual.

Steps that name a part or cite an excerpt the model was not given are cleaned up before they reach the UI.

## Models and endpoints

Checked against the Meta Model API docs (dev.meta.ai/docs) and `GET /v1/models` on 2026-11-02.

| Use | Model | Endpoint |
| --- | --- | --- |
| Identify and diagnose (vision + structured output) | `muse-spark-1.3` | `POST https://api.meta.ai/v1/chat/completions` via Vercel AI SDK `@ai-sdk/openai-compatible` |
| Part segmentation | `sam-3.1` | `POST https://api.meta.ai/v1/responses` (streamed), decoded with `@meta-sam/parser` |

## Stack

Next.js 15 (App Router), React 19, TypeScript, Vercel AI SDK 7 (`generateText` with `Output.object` and a Zod schema), OpenAI SDK for the SAM Responses stream, `@meta-sam/parser`, Vitest.

## Setup

```bash
npm install
cp .env.example .env.local   # add META_API_KEY to go live
npm run dev                  # http://localhost:3000
```

| Variable | Default | Notes |
| --- | --- | --- |
| `META_API_KEY` | empty | Meta Model API key. Empty means mock mode. |
| `META_BASE_URL` | `https://api.meta.ai/v1` | Any OpenAI-compatible base URL. |
| `META_MODEL` | `muse-spark-1.3` | Try `muse-wonder-1.0` for harder cases. |
| `META_SAM_MODEL` | `sam-3.1` | Segmentation model. |
| `FIELDFIX_MOCK` | empty | Set to `1` to force mock mode with a key present. |

### Mock mode

With no key, the app still runs end to end with canned output for the bike sample. A yellow banner and a "MOCK MODE" badge say so on every screen, and the boxes are fixed positions, not SAM output. Use it for UI work and CI.

## Architecture

```
browser (app/page.tsx)
  resize to 1024px -> POST /api/analyze {imageDataUrl, symptom, width, height}
app/api/analyze/route.ts   validates input (zod), calls lib/pipeline.analyze
lib/pipeline.ts
  identify()      lib/model.ts    Muse Spark -> {object, parts[]}
  retrieve()      lib/rag.ts      BM25 over data/manuals/*.md
  in parallel:
    segmentParts() lib/segment.ts SAM 3.1 per part -> boxes + mask paths
    diagnose()     lib/model.ts   Muse Spark -> Diagnosis (zod schema)
  sanitize()      drops made-up part labels and citations
```

Typical live timings on the sample: identify about 2 s, SAM about 2 s, diagnosis 11 to 15 s.

## Tests

```bash
npm run typecheck && npm test && npm run build
```

Tests cover config and mock switching, retrieval quality on each manual, the pipeline wiring with stubbed model calls, citation cleanup, and SAM parsing against a real `sam-3.1` response saved in `tests/fixtures`.

## Demo script (about 2 minutes)

1. Open the app. Point at the LIVE badge.
2. Click **Try sample**. The symptom fills in: "chain skips and won't shift to bigger gears". Click **Diagnose**.
3. While it runs (about 15 s), explain the four stages.
4. Show the masks on the photo. Click a part chip to isolate it.
5. Hover steps 2 and 6: the derailleur lights up, and the citation points to the Park Tool guide.
6. Scroll to "When to stop" and the source links.
7. Take a phone photo of a dripping faucet or a laptop vent and run it live to show it is not limited to bikes.

## Manuals

`data/manuals` holds short paraphrased notes from public guides (Park Tool, EPA WaterSense, HP support, Whirlpool), each with its source URL. They are summaries for retrieval, not copies of the originals. Add a Markdown file with the same front matter to extend coverage.

## Limits

- Repair advice is AI-generated and can be wrong. The app always shows safety notes and a stop point.
- Five manuals is a small corpus. Problems outside it get steps without citations.
- SAM sometimes finds no match for a part name; the UI says so instead of guessing.

## Credits

Sample photo: "Rear Derailleur Neos" by AKK, CC BY-SA 4.0, via Wikimedia Commons.

## License

MIT
