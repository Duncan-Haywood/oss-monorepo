"use client";

import { useId, useState } from "react";
import { AlertTriangle, CheckCircle2, FileImage, Upload } from "lucide-react";
import {
  PREFLIGHT_DISCLAIMER,
  buildPreflightExportRecord,
  formatBytes,
  preflightExportFileName,
  preflightImage,
  summarizeFindings,
  type PreflightResult,
} from "@/lib/print-file-preflight";
import { trackUsageEvent } from "@/components/shared/UsageTracker";

const USAGE_OPT_OUT_KEY = "print-atelier:usage-opt-out";

type AnalyzeState = "idle" | "reading" | "ready" | "error";

function shouldRecordUsage(): boolean {
  if (typeof window === "undefined") return false;
  try {
    if (window.localStorage.getItem(USAGE_OPT_OUT_KEY) === "1") return false;
  } catch {
    return false;
  }
  const nav = window.navigator as Navigator & { globalPrivacyControl?: boolean };
  if (nav.doNotTrack === "1" || nav.globalPrivacyControl) return false;
  return true;
}

function recordPreflightUsage(name: "preflight_completed" | "preflight_exported"): void {
  if (!shouldRecordUsage()) return;
  trackUsageEvent(name, "/print-file-preflight");
}

export default function PrintFilePreflight() {
  const inputId = useId();
  const [result, setResult] = useState<PreflightResult | null>(null);
  const [state, setState] = useState<AnalyzeState>("idle");
  const [optOut, setOptOut] = useState(() => {
    if (typeof window === "undefined") return false;
    try {
      return window.localStorage.getItem(USAGE_OPT_OUT_KEY) === "1";
    } catch {
      return false;
    }
  });

  const analyze = (file: File) => {
    setState("reading");
    setResult(null);
    const image = new Image();
    const objectUrl = URL.createObjectURL(file);
    image.onload = () => {
      const next = preflightImage(file, image.naturalWidth, image.naturalHeight);
      setResult(next);
      setState("ready");
      recordPreflightUsage("preflight_completed");
      URL.revokeObjectURL(objectUrl);
    };
    image.onerror = () => {
      setState("error");
      URL.revokeObjectURL(objectUrl);
    };
    image.src = objectUrl;
  };

  const toggleOptOut = (next: boolean) => {
    setOptOut(next);
    try {
      if (next) {
        window.localStorage.setItem(USAGE_OPT_OUT_KEY, "1");
      } else {
        window.localStorage.removeItem(USAGE_OPT_OUT_KEY);
      }
    } catch {
      // Opt-out storage is best-effort; the check still stays local.
    }
  };

  return (
    <section className="rounded-3xl border border-stone-200 bg-white p-6 shadow-sm sm:p-10">
      <div className="grid gap-8 lg:grid-cols-[1fr_0.85fr]">
        <div>
          <p className="mb-3 text-xs font-bold uppercase tracking-[0.2em] text-orange-700">
            Free file check
          </p>
          <h2 className="font-serif text-3xl text-stone-950 sm:text-4xl">
            Know what your printer can see.
          </h2>
          <p className="mt-4 max-w-xl text-stone-600">
            Drop in a JPEG or PNG and get a dated technical record before you pay
            for a proof. Your artwork stays in this browser; it is never uploaded.
          </p>
          <label
            htmlFor={inputId}
            className="mt-7 flex min-h-36 cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed border-orange-200 bg-orange-50/50 px-6 text-center transition hover:border-orange-400"
          >
            <Upload className="mb-3 h-7 w-7 text-orange-700" aria-hidden="true" />
            <span className="font-semibold text-stone-900">
              {state === "reading" ? "Reading image metadata…" : "Choose a print master"}
            </span>
            <span className="mt-1 text-sm text-stone-500">JPEG or PNG, up to 50 MiB</span>
            <input
              id={inputId}
              className="sr-only"
              type="file"
              accept="image/jpeg,image/png"
              aria-busy={state === "reading"}
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) analyze(file);
              }}
            />
          </label>
          {state === "error" && (
            <p role="alert" className="mt-3 text-sm text-red-700">
              That file could not be read as a JPEG or PNG. Try another master, or
              re-export it from your editor.
            </p>
          )}
          <p className="mt-4 text-xs leading-5 text-stone-500">
            Checks format, file size, pixel floor, named-size DPI, aspect ratio, and
            web-export names. It does not inspect bleed, ICC profiles, fonts, or any
            lab-specific acceptance rule.
          </p>
          <label className="mt-5 flex items-start gap-2 text-xs text-stone-500">
            <input
              type="checkbox"
              className="mt-0.5"
              checked={optOut}
              onChange={(event) => toggleOptOut(event.target.checked)}
            />
            <span>
              Do not count anonymous usage events from this browser. Do Not Track
              and Global Privacy Control are also honoured.
            </span>
          </label>
        </div>
        <div className="rounded-2xl bg-stone-950 p-6 text-stone-100" aria-live="polite">
          {!result ? (
            <div className="flex h-full min-h-52 flex-col justify-center">
              <FileImage className="mb-4 h-8 w-8 text-orange-300" aria-hidden="true" />
              <p className="font-semibold">Your record will appear here</p>
              <p className="mt-2 text-sm text-stone-400">
                No sign-in, upload, or payment required.
              </p>
            </div>
          ) : (
            <Result result={result} />
          )}
        </div>
      </div>
    </section>
  );
}

function Result({ result }: { result: PreflightResult }) {
  const summary = summarizeFindings(result);
  return (
    <div>
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-widest text-stone-400">Preflight record</p>
          <h3 className="mt-2 break-all text-xl font-semibold">{result.fileName}</h3>
        </div>
        {summary.passed ? (
          <CheckCircle2 className="h-7 w-7 shrink-0 text-emerald-400" aria-hidden="true" />
        ) : (
          <AlertTriangle className="h-7 w-7 shrink-0 text-amber-300" aria-hidden="true" />
        )}
      </div>
      <p className={`mt-5 text-lg font-semibold ${summary.passed ? "text-emerald-300" : "text-amber-200"}`}>
        {summary.passed
          ? "No blocking findings"
          : `${summary.blockingCount} blocking finding${summary.blockingCount === 1 ? "" : "s"}`}
      </p>
      <dl className="mt-5 grid grid-cols-2 gap-3 text-sm">
        <div>
          <dt className="text-stone-500">Dimensions</dt>
          <dd>
            {result.width}x{result.height}px
          </dd>
        </div>
        <div>
          <dt className="text-stone-500">File size</dt>
          <dd>{formatBytes(result.bytes)}</dd>
        </div>
        <div>
          <dt className="text-stone-500">Format</dt>
          <dd>{result.format.toUpperCase()}</dd>
        </div>
        <div>
          <dt className="text-stone-500">Named size</dt>
          <dd>{result.sizeToken || "Not detected"}</dd>
        </div>
      </dl>
      {result.findings.length > 0 && (
        <ul className="mt-6 space-y-3 border-t border-stone-800 pt-5">
          {result.findings.map((finding) => (
            <li key={finding.rule} className="text-sm">
              <span className={finding.severity === "blocking" ? "text-amber-300" : "text-orange-300"}>
                {finding.severity === "blocking" ? "Blocking" : "Review"}
              </span>
              <span className="ml-2 text-stone-300">{finding.detail}</span>
            </li>
          ))}
        </ul>
      )}
      <button
        type="button"
        className="mt-6 rounded-lg border border-stone-600 px-3 py-2 text-sm font-semibold text-stone-200 transition hover:border-stone-300"
        onClick={() => {
          downloadRecord(result);
          recordPreflightUsage("preflight_exported");
        }}
      >
        Download dated record
      </button>
      <p className="mt-6 border-t border-stone-800 pt-4 text-xs leading-5 text-stone-500">
        {PREFLIGHT_DISCLAIMER}
      </p>
    </div>
  );
}

function downloadRecord(result: PreflightResult): void {
  const record = buildPreflightExportRecord(result, new Date().toISOString());
  const blob = new Blob([JSON.stringify(record, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = preflightExportFileName(result.fileName);
  link.click();
  URL.revokeObjectURL(url);
}
