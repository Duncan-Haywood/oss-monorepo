"use client";

import { useId, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, FileImage, Upload } from "lucide-react";
import {
  MAX_COMPARE_FILES,
  PREFLIGHT_DISCLAIMER,
  batchPreflightExportFileName,
  buildBatchPreflightExportRecord,
  buildPreflightExportRecord,
  comparePreflightCandidates,
  defaultCompareSize,
  formatBytes,
  listPrintSizes,
  preflightExportFileName,
  preflightImage,
  summarizeFindings,
  type PreflightComparison,
  type PreflightResult,
} from "@/lib/print-file-preflight";
import { trackUsageEvent } from "@/components/shared/UsageTracker";

const USAGE_OPT_OUT_KEY = "print-atelier:usage-opt-out";

type AnalyzeState = "idle" | "reading" | "ready" | "error" | "partial";

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

function recordPreflightUsage(
  name: "preflight_completed" | "preflight_exported" | "preflight_compared",
): void {
  if (!shouldRecordUsage()) return;
  trackUsageEvent(name, "/print-file-preflight");
}

function readImageSize(file: File): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    const objectUrl = URL.createObjectURL(file);
    image.onload = () => {
      resolve({ width: image.naturalWidth, height: image.naturalHeight });
      URL.revokeObjectURL(objectUrl);
    };
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("unreadable"));
    };
    image.src = objectUrl;
  });
}

export default function PrintFilePreflight() {
  const inputId = useId();
  const sizeId = useId();
  const [results, setResults] = useState<PreflightResult[]>([]);
  const [targetSize, setTargetSize] = useState(defaultCompareSize([]));
  const [sizeTouched, setSizeTouched] = useState(false);
  const [state, setState] = useState<AnalyzeState>("idle");
  const [unreadCount, setUnreadCount] = useState(0);
  const [truncated, setTruncated] = useState(false);
  const [optOut, setOptOut] = useState(() => {
    if (typeof window === "undefined") return false;
    try {
      return window.localStorage.getItem(USAGE_OPT_OUT_KEY) === "1";
    } catch {
      return false;
    }
  });

  const comparison = useMemo(
    () => (results.length > 0 ? comparePreflightCandidates(results, targetSize) : null),
    [results, targetSize],
  );

  const analyze = async (fileList: FileList | null) => {
    const incoming = Array.from(fileList ?? []);
    if (incoming.length === 0) return;

    const selected = incoming.slice(0, MAX_COMPARE_FILES);
    setTruncated(incoming.length > MAX_COMPARE_FILES);
    setState("reading");
    setResults([]);
    setUnreadCount(0);

    const next: PreflightResult[] = [];
    let failed = 0;
    for (const file of selected) {
      try {
        const { width, height } = await readImageSize(file);
        next.push(preflightImage(file, width, height));
      } catch {
        failed += 1;
      }
    }

    setResults(next);
    setUnreadCount(failed);
    if (!sizeTouched) {
      setTargetSize(defaultCompareSize(next));
    }

    if (next.length === 0) {
      setState("error");
      return;
    }

    setState(failed > 0 ? "partial" : "ready");
    recordPreflightUsage("preflight_completed");
    if (next.length > 1) {
      recordPreflightUsage("preflight_compared");
    }
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
            Know which master to send.
          </h2>
          <p className="mt-4 max-w-xl text-stone-600">
            Drop in one JPEG or PNG, or compare up to five, before you pay for a
            proof. Artwork stays in this browser; it is never uploaded.
          </p>
          <label
            htmlFor={inputId}
            className="mt-7 flex min-h-36 cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed border-orange-200 bg-orange-50/50 px-6 text-center transition hover:border-orange-400"
          >
            <Upload className="mb-3 h-7 w-7 text-orange-700" aria-hidden="true" />
            <span className="font-semibold text-stone-900">
              {state === "reading" ? "Reading image metadata…" : "Choose print masters"}
            </span>
            <span className="mt-1 text-sm text-stone-500">
              JPEG or PNG, up to 50 MiB each. Select more than one to compare.
            </span>
            <input
              id={inputId}
              className="sr-only"
              type="file"
              accept="image/jpeg,image/png"
              multiple
              aria-busy={state === "reading"}
              onChange={(event) => {
                void analyze(event.target.files);
                event.target.value = "";
              }}
            />
          </label>
          {results.length > 0 && (
            <div className="mt-4">
              <label htmlFor={sizeId} className="text-sm font-semibold text-stone-800">
                Compare at print size
              </label>
              <select
                id={sizeId}
                className="mt-1 w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm text-stone-900"
                value={targetSize}
                onChange={(event) => {
                  setSizeTouched(true);
                  setTargetSize(event.target.value);
                }}
              >
                {listPrintSizes().map((size) => (
                  <option key={size} value={size}>
                    {size.replace("x", " × ")} in
                  </option>
                ))}
              </select>
            </div>
          )}
          {state === "error" && (
            <p role="alert" className="mt-3 text-sm text-red-700">
              Those files could not be read as JPEG or PNG. Try another master, or
              re-export it from your editor.
            </p>
          )}
          {state === "partial" && unreadCount > 0 && (
            <p role="status" className="mt-3 text-sm text-amber-800">
              {unreadCount} file{unreadCount === 1 ? "" : "s"} could not be read and
              {unreadCount === 1 ? " was" : " were"} skipped.
            </p>
          )}
          {truncated && (
            <p role="status" className="mt-3 text-sm text-stone-600">
              Only the first {MAX_COMPARE_FILES} files were compared.
            </p>
          )}
          <p className="mt-4 text-xs leading-5 text-stone-500">
            Checks format, file size, pixel floor, named-size DPI, aspect ratio, and
            web-export names. Compare ranks implied DPI at the size you pick. It
            does not inspect bleed, ICC profiles, fonts, or any lab-specific
            acceptance rule.
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
          {!comparison ? (
            <div className="flex h-full min-h-52 flex-col justify-center">
              <FileImage className="mb-4 h-8 w-8 text-orange-300" aria-hidden="true" />
              <p className="font-semibold">Your record will appear here</p>
              <p className="mt-2 text-sm text-stone-400">
                No sign-in, upload, or payment required.
              </p>
            </div>
          ) : results.length === 1 && results[0] ? (
            <Result result={results[0]} />
          ) : (
            <CompareResult comparison={comparison} results={results} />
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
      <ResultFacts result={result} />
      <FindingList result={result} />
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

function CompareResult({
  comparison,
  results,
}: {
  comparison: PreflightComparison;
  results: PreflightResult[];
}) {
  return (
    <div>
      <p className="text-xs uppercase tracking-widest text-stone-400">Compare at {comparison.targetSize}</p>
      <h3 className="mt-2 text-xl font-semibold">Which master should you send?</h3>
      <p className="mt-4 text-sm leading-6 text-stone-300">{comparison.reason}</p>
      <div className="-mx-1 mt-5 overflow-x-auto">
        <table className="min-w-full text-left text-sm">
          <caption className="sr-only">
            Print masters ranked by implied DPI at {comparison.targetSize}
          </caption>
          <thead>
            <tr className="text-xs uppercase tracking-wider text-stone-500">
              <th scope="col" className="pb-2 pr-3 font-medium">
                File
              </th>
              <th scope="col" className="pb-2 pr-3 font-medium">
                DPI
              </th>
              <th scope="col" className="pb-2 font-medium">
                Floor
              </th>
            </tr>
          </thead>
          <tbody>
            {comparison.rows.map((row) => (
              <tr key={row.fileName} className="border-t border-stone-800">
                <th scope="row" className="py-3 pr-3 font-medium text-stone-100">
                  <span className="break-all">{row.fileName}</span>
                  {row.recommended && (
                    <span className="mt-1 block text-xs font-semibold text-emerald-300">
                      Better at this size
                    </span>
                  )}
                </th>
                <td className="py-3 pr-3 tabular-nums">{Math.round(row.dpiAtTarget)}</td>
                <td className="py-3">
                  {row.meetsDpiFloor && row.passed ? (
                    <span className="text-emerald-300">Clears</span>
                  ) : (
                    <span className="text-amber-200">Below / blocked</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-6 space-y-5 border-t border-stone-800 pt-5">
        {results.map((result) => (
          <details key={result.fileName} className="text-sm">
            <summary className="cursor-pointer font-semibold text-stone-200">
              Findings for {result.fileName}
            </summary>
            <div className="mt-3">
              <ResultFacts result={result} />
              <FindingList result={result} />
            </div>
          </details>
        ))}
      </div>
      <button
        type="button"
        className="mt-6 rounded-lg border border-stone-600 px-3 py-2 text-sm font-semibold text-stone-200 transition hover:border-stone-300"
        onClick={() => {
          downloadBatchRecord(results, comparison.targetSize);
          recordPreflightUsage("preflight_exported");
        }}
      >
        Download comparison record
      </button>
      <p className="mt-6 border-t border-stone-800 pt-4 text-xs leading-5 text-stone-500">
        {PREFLIGHT_DISCLAIMER}
      </p>
    </div>
  );
}

function ResultFacts({ result }: { result: PreflightResult }) {
  return (
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
  );
}

function FindingList({ result }: { result: PreflightResult }) {
  if (result.findings.length === 0) return null;
  return (
    <ul className="mt-6 space-y-3 border-t border-stone-800 pt-5">
      {result.findings.map((finding) => (
        <li key={`${result.fileName}-${finding.rule}`} className="text-sm">
          <span className={finding.severity === "blocking" ? "text-amber-300" : "text-orange-300"}>
            {finding.severity === "blocking" ? "Blocking" : "Review"}
          </span>
          <span className="ml-2 text-stone-300">{finding.detail}</span>
        </li>
      ))}
    </ul>
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

function downloadBatchRecord(results: PreflightResult[], targetSize: string): void {
  const generatedAt = new Date().toISOString();
  const record = buildBatchPreflightExportRecord(results, targetSize, generatedAt);
  const blob = new Blob([JSON.stringify(record, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = batchPreflightExportFileName(targetSize, generatedAt);
  link.click();
  URL.revokeObjectURL(url);
}
