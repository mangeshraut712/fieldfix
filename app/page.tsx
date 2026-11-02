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
  const [serverMode, setServerMode] = useState<string>("");
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch("/api/analyze").then((r) => r.json()).then((j) => setServerMode(j.mode)).catch(() => {});
  }, []);

  async function pick(src: string) {
    setResult(null);
    setError("");
    setImage(await loadImage(src));
  }

  async function run() {
    if (!image) return;
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
      setResult(json);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  const labels = [...new Set(result?.segments.map((s) => s.label) ?? [])];
  const color = (label: string) => COLORS[labels.indexOf(label) % COLORS.length];

  return (
    <main>
      <h1>
        FieldFix
        {serverMode && <span className={`badge ${serverMode}`}>{serverMode === "mock" ? "MOCK MODE: no API key, canned output" : "LIVE: Meta Model API"}</span>}
      </h1>
      <p className="sub">Take a photo of the broken thing, say what is wrong, get a parts map and repair steps backed by real manuals.</p>

      <div className="grid">
        <section className="panel">
          {!image ? (
            <div className="drop" onClick={() => fileRef.current?.click()}>
              Tap to take or upload a photo
              <div className="small">JPEG, PNG or WebP. Resized to 1024 px in your browser before upload.</div>
            </div>
          ) : (
            <div className="stage">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={image.dataUrl} alt="Uploaded photo" />
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
          <input ref={fileRef} type="file" accept="image/*" capture="environment" hidden onChange={(e) => e.target.files?.[0] && pick(URL.createObjectURL(e.target.files[0]))} />

          <textarea rows={2} placeholder="What is wrong? e.g. chain skips and won't shift to bigger gears" value={symptom} onChange={(e) => setSymptom(e.target.value)} style={{ marginTop: 12 }} />
          <div className="row">
            <button onClick={run} disabled={!image || busy}>{busy ? "Analyzing…" : "Diagnose"}</button>
            <button className="ghost" onClick={() => fileRef.current?.click()}>New photo</button>
            <button className="ghost" onClick={() => { pick("/samples/derailleur.jpg"); setSymptom("chain skips and won't shift to bigger gears"); }}>Try sample</button>
          </div>
          {result && (
            <div className="chips">
              {labels.map((l) => (
                <button key={l} className="chip" style={{ borderColor: color(l), outline: active === l ? `2px solid ${color(l)}` : undefined }} onClick={() => setActive(active === l ? null : l)}>
                  {l}
                </button>
              ))}
              {labels.length === 0 && <span className="small">Segmentation found no parts in this photo.</span>}
            </div>
          )}
          {error && <p className="err">{error}</p>}
        </section>

        <section className="panel">
          {!result && !busy && <p className="small">Results appear here. Hover a step to light up the part it touches.</p>}
          {busy && <p className="small">Identifying parts, running SAM 3.1 segmentation and writing the diagnosis. This takes 10 to 25 seconds.</p>}
          {result && (
            <>
              {result.mode === "mock" && <div className="warn">Mock mode: this is canned sample output, not a real analysis of your photo. Set META_API_KEY on the server for live results.</div>}
              <h2>{result.diagnosis.object}</h2>
              <p>
                <strong>Likely issue:</strong> {result.diagnosis.likelyIssue} <span className="meta">({result.diagnosis.confidence} confidence)</span>
              </p>
              {result.diagnosis.safety.length > 0 && (
                <div className="warn">
                  <strong>Safety first</strong>
                  <ul>{result.diagnosis.safety.map((s) => <li key={s}>{s}</li>)}</ul>
                </div>
              )}
              {result.diagnosis.tools.length > 0 && <p className="meta">Tools: {result.diagnosis.tools.join(", ")}</p>}
              <ol className="steps">
                {result.diagnosis.steps.map((s, i) => (
                  <li key={i} className={s.part && active === s.part ? "on" : ""} onMouseEnter={() => setActive(s.part)} onMouseLeave={() => setActive(null)}>
                    <strong>{s.title.replace(/^\d+\.\s*/, "")}</strong>
                    <div>{s.detail}</div>
                    <div className="meta">
                      {s.part && <span style={{ color: color(s.part) }}>● {s.part} </span>}
                      {s.sourceId && <a href={`#src-${s.sourceId}`}>[{s.sourceId}]</a>}
                    </div>
                  </li>
                ))}
              </ol>
              <p><strong>When to stop:</strong> {result.diagnosis.whenToStop}</p>
              {result.sources.length > 0 && (
                <>
                  <h2>Manual excerpts used</h2>
                  {result.sources.map((s) => (
                    <p key={s.id} id={`src-${s.id}`} className="small">
                      [{s.id}] <a href={s.url} target="_blank" rel="noreferrer">{s.title}</a>
                    </p>
                  ))}
                </>
              )}
              <p className="meta">
                Model: {result.model} · Segmentation: {result.segmentation === "mock" ? "mock boxes (no SAM call)" : "SAM 3.1"}
                {Object.keys(result.timingsMs).length > 0 && ` · ${Object.entries(result.timingsMs).map(([k, v]) => `${k} ${(v / 1000).toFixed(1)}s`).join(", ")}`}
              </p>
            </>
          )}
        </section>
      </div>
      <p className="small" style={{ marginTop: 24 }}>
        Repair guidance is generated by AI and can be wrong. Unplug power and shut off water or gas before working. Sample photo: “Rear Derailleur Neos” by AKK, CC BY-SA 4.0, Wikimedia Commons.
      </p>
    </main>
  );
}
