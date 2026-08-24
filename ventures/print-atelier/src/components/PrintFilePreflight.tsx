"use client";

import { useState } from "react";
import { AlertTriangle, CheckCircle2, FileImage, Upload } from "lucide-react";
import { formatBytes, preflightImage, type PreflightResult } from "@/lib/print-file-preflight";

const USAGE_KEY = "print-atelier:print-file-preflight-events";

export default function PrintFilePreflight() {
  const [result, setResult] = useState<PreflightResult | null>(null);
  const [busy, setBusy] = useState(false);

  const analyze = (file: File) => {
    setBusy(true);
    const image = new Image();
    image.onload = () => {
      const next = preflightImage(file, image.naturalWidth, image.naturalHeight);
      setResult(next);
      setBusy(false);
      const events = JSON.parse(localStorage.getItem(USAGE_KEY) || "[]") as unknown[];
      events.push({ event: "preflight_completed", timestamp: new Date().toISOString(), findingCount: next.findings.length });
      localStorage.setItem(USAGE_KEY, JSON.stringify(events.slice(-100)));
      URL.revokeObjectURL(image.src);
    };
    image.onerror = () => setBusy(false);
    image.src = URL.createObjectURL(file);
  };

  return (
    <section className="rounded-3xl border border-stone-200 bg-white p-6 shadow-sm sm:p-10">
      <div className="grid gap-8 lg:grid-cols-[1fr_0.85fr]">
        <div>
          <p className="mb-3 text-xs font-bold uppercase tracking-[0.2em] text-orange-700">Free file check</p>
          <h2 className="font-serif text-3xl text-stone-950 sm:text-4xl">Know what your printer can see.</h2>
          <p className="mt-4 max-w-xl text-stone-600">Drop in a JPEG or PNG and get a dated technical record before you pay for a proof. Your artwork stays in this browser; it is never uploaded.</p>
          <label className="mt-7 flex min-h-36 cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed border-orange-200 bg-orange-50/50 px-6 text-center transition hover:border-orange-400">
            <Upload className="mb-3 h-7 w-7 text-orange-700" />
            <span className="font-semibold text-stone-900">{busy ? "Reading image metadata…" : "Choose a print master"}</span>
            <span className="mt-1 text-sm text-stone-500">JPEG or PNG, up to 50 MiB</span>
            <input className="sr-only" type="file" accept="image/jpeg,image/png" onChange={(event) => event.target.files?.[0] && analyze(event.target.files[0])} />
          </label>
          <p className="mt-4 text-xs leading-5 text-stone-500">Checks format, file size, pixel floor, named-size DPI, aspect ratio, and web-export names. It does not inspect bleed, ICC profiles, fonts, or any lab-specific acceptance rule.</p>
        </div>
        <div className="rounded-2xl bg-stone-950 p-6 text-stone-100">
          {!result ? <div className="flex h-full min-h-52 flex-col justify-center"><FileImage className="mb-4 h-8 w-8 text-orange-300" /><p className="font-semibold">Your record will appear here</p><p className="mt-2 text-sm text-stone-400">No sign-in, upload, or payment required.</p></div> : <Result result={result} />}
        </div>
      </div>
    </section>
  );
}

function Result({ result }: { result: PreflightResult }) {
  const blocking = result.findings.filter((finding) => finding.severity === "blocking");
  const passed = blocking.length === 0;
  return <div>
    <div className="flex items-start justify-between gap-4"><div><p className="text-xs uppercase tracking-widest text-stone-400">Preflight record</p><h3 className="mt-2 break-all text-xl font-semibold">{result.fileName}</h3></div>{passed ? <CheckCircle2 className="h-7 w-7 shrink-0 text-emerald-400" /> : <AlertTriangle className="h-7 w-7 shrink-0 text-amber-300" />}</div>
    <p className={`mt-5 text-lg font-semibold ${passed ? "text-emerald-300" : "text-amber-200"}`}>{passed ? "No blocking findings" : `${blocking.length} blocking finding${blocking.length === 1 ? "" : "s"}`}</p>
    <dl className="mt-5 grid grid-cols-2 gap-3 text-sm"><div><dt className="text-stone-500">Dimensions</dt><dd>{result.width}x{result.height}px</dd></div><div><dt className="text-stone-500">File size</dt><dd>{formatBytes(result.bytes)}</dd></div><div><dt className="text-stone-500">Format</dt><dd>{result.format.toUpperCase()}</dd></div><div><dt className="text-stone-500">Named size</dt><dd>{result.sizeToken || "Not detected"}</dd></div></dl>
    {result.findings.length > 0 && <ul className="mt-6 space-y-3 border-t border-stone-800 pt-5">{result.findings.map((finding) => <li key={finding.rule} className="text-sm"><span className={finding.severity === "blocking" ? "text-amber-300" : "text-orange-300"}>{finding.severity === "blocking" ? "Blocking" : "Review"}</span><span className="ml-2 text-stone-300">{finding.detail}</span></li>)}</ul>}
    <p className="mt-6 border-t border-stone-800 pt-4 text-xs leading-5 text-stone-500">This is evidence from a limited automated floor, not a print-ready warranty, lab approval, or professional advice. Confirm requirements with your printer.</p>
  </div>;
}
