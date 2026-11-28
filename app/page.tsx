"use client";

import { useEffect, useRef, useState } from "react";
import type { AnalyzeResult } from "@/lib/types";

const COLORS = ["#ffb020", "#4fc3f7", "#3ecf8e", "#f06292", "#b388ff", "#ff7043"];
const MAX_SIDE = 1024;

async function loadImage(src: string): Promise<{ dataUrl: string; width: number; height: number }> {
  const img = new Image();
  img.src = src;
  await img.decode();
  const scale = Math.min(1, MAX_SIDE / Math.max(img.naturalWidth, img.naturalHeight));
  const width = Math.round(img.naturalWidth * scale);
  const height = Math.round(img.naturalHeight * scale);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  canvas.getContext("2d")!.drawImage(img, 0, 0, width, height);
  return { dataUrl: canvas.toDataURL("image/jpeg", 0.88), width, height };
}

export default function Home() {
  const [image, setImage] = useState<{ dataUrl: string; width: number; height: number } | null>(null);
  const [symptom, setSymptom] = useState("");
  const [result, setResult] = useState<AnalyzeResult | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [active, setActive] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);
  const [serverMode, setServerMode] = useState<string>("");
  const fileRef = useRef<HTMLInputElement>(null);
  const pickSeq = useRef(0);

  useEffect(() => {
    fetch("/api/analyze").then((r) => r.json()).then((j) => setServerMode(j.mode)).catch(() => {});
  }, []);

  async function pick(src: string) {
    // Only the latest pick may update state; a slower earlier decode must not
    // overwrite a newer photo or leave a stale error behind.
    const seq = ++pickSeq.current;
    setResult(null);
    setError("");
    // A part filter from the previous photo would dim every box of the next one.
    setActive(null);
    setPicking(true);
    try {
      const loaded = await loadImage(src);
      if (seq === pickSeq.current) setImage(loaded);
    } catch {
      // img.decode() rejects for formats the browser cannot draw (HEIC on most desktops, corrupt files).
      if (seq === pickSeq.current) setError("Could not read that photo. Try a JPEG, PNG or WebP image.");
    } finally {
      if (seq === pickSeq.current) setPicking(false);
      if (src.startsWith("blob:")) URL.revokeObjectURL(src);
    }
  }

  async function run() {
    if (!image) return;
    // A new photo picked while this request is in flight bumps pickSeq; drop the stale answer then.
    const seq = pickSeq.current;
    setBusy(true);
    setError("");
    setResult(null);
    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageDataUrl: image.dataUrl, symptom, width: image.width, height: image.height }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Request failed");
      if (seq === pickSeq.current) setResult(json);
    } catch (e) {
      if (seq === pickSeq.current) setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  const labels = [...new Set(result?.segments.map((s) => s.label) ?? [])];
  // A step can name a part SAM did not box. indexOf is -1 there, and COLORS[-1]
  // is undefined, so give it a neutral colour instead of borrowing a part's.
  const UNBOXED = "#9aa0a6";
  const color = (label: string) => (labels.includes(label) ? COLORS[labels.indexOf(label) % COLORS.length] : UNBOXED);

  const toggle = (part: string | null) => setActive((current) => (part && current !== part ? part : null));

  return (
    <main>
      <header className="masthead">
        <div>
          <h1>FieldFix</h1>
          <p className="lede">Photograph the part, say what is wrong, and get a parts map with repair steps you can follow.</p>
          {serverMode && (
            <p className={`mode mode-${serverMode}`}>
              {serverMode === "mock" ? "Demo mode: results are a sample diagnosis" : "Live analysis with the Meta Model API"}
            </p>
          )}
        </div>
        <figure className="figure">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/samples/derailleur.jpg" alt="Bicycle rear derailleur used in the sample repair" />
          <figcaption>Sample: a bicycle rear derailleur</figcaption>
        </figure>
      </header>

      <div className="layout">
        <section className="bench" aria-label="Your part">
          <h2 className="step-head"><span className="n" aria-hidden="true">1</span>Photograph the part</h2>
          <div className="mat">
            {!image ? (
              <button type="button" className="drop" onClick={() => fileRef.current?.click()}>
                <strong>Take or upload a photo</strong>
                <span>JPEG, PNG or WebP. Your browser shrinks it to 1024 px before upload.</span>
              </button>
            ) : (
              <div className="stage">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={image.dataUrl} alt="Your photo" />
                {result && (
                  <svg viewBox={`0 0 ${image.width} ${image.height}`} preserveAspectRatio="none" aria-label="Detected parts">
                    {result.segments.map((s) => {
                      const on = !active || active === s.label;
                      const c = color(s.label);
                      return (
                        <g key={s.objectId} opacity={on ? 1 : 0.15}>
                          {s.path && s.pathOffset && (
                            <path d={s.path} transform={`translate(${s.pathOffset.x} ${s.pathOffset.y})`} fill={c} fillOpacity={0.35} stroke={c} strokeWidth={2} />
                          )}
                          <rect x={s.box.left} y={s.box.top} width={s.box.right - s.box.left} height={s.box.bottom - s.box.top} fill="none" stroke={c} strokeWidth={3} strokeDasharray={s.path ? "6 4" : undefined} rx={4} />
                          <text x={s.box.left + 4} y={Math.max(16, s.box.top - 6)} fill={c} fontSize={18} fontWeight={700} stroke="#000" strokeWidth={0.6}>
                            {s.label}
                          </text>
                        </g>
                      );
                    })}
                  </svg>
                )}
              </div>
            )}
          </div>
          <input ref={fileRef} type="file" accept="image/*" capture="environment" hidden onChange={(e) => {
              const file = e.target.files?.[0];
              // Reset so choosing the same file again still fires onChange.
              e.target.value = "";
              if (file) pick(URL.createObjectURL(file));
            }} />
          {result && (
            <div className="parts" aria-label="Show one part">
              {labels.map((l) => (
                <button key={l} type="button" className="part" aria-pressed={active === l} style={{ "--swatch": color(l) } as React.CSSProperties} onClick={() => toggle(l)}>
                  {l}
                </button>
              ))}
              {labels.length === 0 && <p className="hint">Segmentation found no parts in this photo.</p>}
            </div>
          )}

          <h2 className="step-head"><label htmlFor="symptom"><span className="n" aria-hidden="true">2</span> Describe the fault</label></h2>
          <textarea id="symptom" rows={3} placeholder="For example: the chain skips and won't shift to bigger gears" value={symptom} onChange={(e) => setSymptom(e.target.value)} />

          <div className="actions">
            <button type="button" className="primary" onClick={run} disabled={!image || busy || picking}>{busy ? "Diagnosing…" : "Diagnose"}</button>
            {image && <button type="button" className="secondary" onClick={() => fileRef.current?.click()}>Change photo</button>}
            <button type="button" className="secondary" onClick={() => { pick("/samples/derailleur.jpg"); setSymptom("chain skips and won't shift to bigger gears"); }}>Try the bicycle example</button>
          </div>
          {!image && <p className="hint">Add a photo to diagnose, or try the bicycle example.</p>}
          {error && <p className="err" role="alert">{error}</p>}
        </section>

        <section className="sheet" aria-live="polite">
          {!result && !busy && (
            <div className="waiting">
              <h2>Your repair sheet</h2>
              <p>After you diagnose a photo, this sheet shows:</p>
              <ul>
                <li>the likely issue and how sure the model is</li>
                <li>safety notes and the tools you need</li>
                <li>repair steps, each linked to a part on your photo</li>
                <li>the manual excerpts the steps came from</li>
              </ul>
            </div>
          )}
          {busy && (
            <div className="waiting">
              <h2>Diagnosing</h2>
              <p>Identifying parts, outlining them on your photo and writing the repair steps. This takes 10 to 25 seconds.</p>
            </div>
          )}
          {result && (
            <>
              {result.mode === "mock" && <p className="demo-note">Demo mode: this is a sample diagnosis, not an analysis of your photo. Set META_API_KEY on the server for live results.</p>}
              <h2>{result.diagnosis.object}</h2>
              <p className="issue">
                <strong>Likely issue:</strong> {result.diagnosis.likelyIssue} <span className="confidence">({result.diagnosis.confidence} confidence)</span>
              </p>
              {result.diagnosis.safety.length > 0 && (
                <div className="safety">
                  <strong>Before you start</strong>
                  <ul>{result.diagnosis.safety.map((s) => <li key={s}>{s}</li>)}</ul>
                </div>
              )}
              {result.diagnosis.tools.length > 0 && <p className="tools"><strong>Tools:</strong> {result.diagnosis.tools.join(", ")}</p>}
              <h3>Repair steps</h3>
              <p className="hint">Tap or point at a step to highlight its part on your photo.</p>
              <ol className="steps">
                {result.diagnosis.steps.map((s, i) => (
                  <li
                    key={i}
                    className={s.part && active === s.part ? "on" : ""}
                    data-part={s.part || undefined}
                    tabIndex={s.part ? 0 : undefined}
                    aria-pressed={s.part ? active === s.part : undefined}
                    role={s.part ? "button" : undefined}
                    onClick={() => s.part && setActive(s.part)}
                    onKeyDown={(e) => { if (s.part && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); setActive(s.part); } }}
                    onMouseEnter={() => s.part && setActive(s.part)}
                    onMouseLeave={(e) => setActive(document.activeElement === e.currentTarget ? s.part : null)}
                    onFocus={() => s.part && setActive(s.part)}
                    onBlur={(e) => setActive(e.currentTarget.matches(":hover") ? s.part : null)}
                  >
                    <span className="step-title">{s.title.replace(/^\d+\.\s*/, "")}</span>
                    <div>{s.detail}</div>
                    {(s.part || s.sourceId) && (
                      <div className="step-part">
                        {s.part && (
                          <span>
                            <span className="dot" style={{ background: color(s.part) }} aria-hidden="true" />
                            {s.part}
                            {!labels.includes(s.part) && " (not outlined on the photo)"}{" "}
                          </span>
                        )}
                        {s.sourceId && <a href={`#src-${s.sourceId}`} onClick={(e) => e.stopPropagation()}>Manual [{s.sourceId}]</a>}
                      </div>
                    )}
                  </li>
                ))}
              </ol>
              <p className="stop"><strong>When to stop and call a pro:</strong> {result.diagnosis.whenToStop}</p>
              {result.sources.length > 0 && (
                <div className="sources">
                  <h3>Manual excerpts used</h3>
                  {result.sources.map((s) => (
                    <p key={s.id} id={`src-${s.id}`}>
                      [{s.id}] <a href={s.url} target="_blank" rel="noreferrer">{s.title}</a>
                      {s.excerpt ? <span className="excerpt">{s.excerpt}</span> : null}
                    </p>
                  ))}
                </div>
              )}
              <dl className="run-details">
                <dt>Model</dt><dd>{result.model}</dd>
                <dt>Segmentation</dt><dd>{result.segmentation === "mock" ? "sample boxes (no SAM call)" : result.segmentation}</dd>
                {Object.keys(result.timingsMs).length > 0 && (
                  <><dt>Time</dt><dd>{Object.entries(result.timingsMs).map(([k, v]) => `${k} ${(v / 1000).toFixed(1)}s`).join(", ")}</dd></>
                )}
              </dl>
            </>
          )}
        </section>
      </div>
      <p className="footnote">
        Repair guidance is generated by AI and can be wrong. Unplug power and shut off water or gas before working. Sample photo: “Rear Derailleur Neos” by AKK, CC BY-SA 4.0, Wikimedia Commons.
      </p>
    </main>
  );
}
