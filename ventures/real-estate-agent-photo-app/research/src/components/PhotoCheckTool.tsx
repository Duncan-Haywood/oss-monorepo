"use client";

import { useCallback, useRef, useState, useSyncExternalStore } from "react";
import { AlertTriangle, CheckCircle2, ClipboardCopy, ShieldAlert, UploadCloud } from "lucide-react";

import {
  SPEC_DATE,
  SPEC_ID,
  UNIMPLEMENTED_RULES,
  buildReshootPlan,
  checkBatch,
  createEvidenceReport,
  formatReshootPlan,
  isListingPhoto,
  type PhotoReport,
  type ReshootKind,
} from "@/lib/photo-spec";
import { isUsageEnabled, recordUsageEvent, setUsageEnabled } from "@/lib/usage";

type RunSummary = {
  reports: PhotoReport[];
  skipped: string[];
  checkedAt: string;
};

function markdownCell(value: string): string {
  return value.replaceAll("|", "\\|").replaceAll("\n", " ");
}

export function reportMarkdown(run: RunSummary): string {
  const findingCount = run.reports.reduce((count, report) => count + report.findings.length, 0);
  const blockingCount = run.reports.reduce(
    (count, report) => count + report.findings.filter((finding) => finding.severity === "blocking").length,
    0,
  );
  const rows = run.reports.flatMap((report) => {
    if (report.findings.length === 0) {
      return [`| ${markdownCell(report.info.name)} | No findings | pass | File header checks passed |`];
    }
    return report.findings.map(
      (finding) =>
        `| ${markdownCell(report.info.name)} | ${markdownCell(finding.rule)} | ${finding.severity} | ${markdownCell(finding.detail)} |`,
    );
  });

  return [
    "# Listing Lens photo preflight record",
    "",
    `- Checked at: ${run.checkedAt}`,
    `- Spec: ${SPEC_ID} (${SPEC_DATE})`,
    `- Photos checked: ${run.reports.length}`,
    `- Findings: ${findingCount} (${blockingCount} blocking)`,
    `- Non-photo files skipped: ${run.skipped.length}`,
    "",
    "## Findings",
    "",
    "| File | Rule | Severity | Detail |",
    "| --- | --- | --- | --- |",
    ...rows,
    "",
    ...(run.skipped.length > 0
      ? ["## Skipped files", "", ...run.skipped.map((name) => `- ${markdownCell(name)}`), ""]
      : []),
    "## Scope and limitations",
    "",
    `This record checks file headers and filenames only: format, byte size, long edge, aspect ratio, branding/watermark filename tokens, and staged-photo pairing. It does not check ${UNIMPLEMENTED_RULES.join(", ")}. Those require a human review or the specific MLS board's rules.`,
    "",
    "A clean findings table is not a warranty that a board or portal will accept these photos. Review and verify this record before relying on it.",
    "",
  ].join("\n");
}

/** Plain-text handoff for email or a photographer thread. Filenames and rule ids only. */
export function formatHandoffSummary(run: RunSummary): string {
  const blockers = run.reports.reduce(
    (total, report) => total + report.findings.filter((finding) => finding.severity === "blocking").length,
    0,
  );
  const status = blockers === 0 ? "No blocking findings" : `${blockers} blocking finding${blockers === 1 ? "" : "s"}`;
  const lines = [
    `Listing Lens photo preflight | ${status}`,
    `Checked ${run.reports.length} photo${run.reports.length === 1 ? "" : "s"} against ${SPEC_ID}`,
    `Checked at: ${new Date(run.checkedAt).toISOString()}`,
    "",
  ];
  for (const report of run.reports) {
    lines.push(
      `${report.info.name}: ${
        report.findings.length === 0
          ? "no findings"
          : report.findings.map((finding) => `${finding.rule} (${finding.severity})`).join(", ")
      }`,
    );
  }
  if (run.skipped.length > 0) lines.push("", `Skipped non-photo files: ${run.skipped.join(", ")}`);
  lines.push(
    "",
    "Evidence only: review this report against the destination MLS board's current rules before relying on it.",
  );
  return lines.join("\n");
}

async function toFileList(files: File[]): Promise<Array<{ name: string; data: Uint8Array }>> {
  return Promise.all(
    files.map(async (file) => ({
      name: file.name,
      data: new Uint8Array(await file.arrayBuffer()),
    })),
  );
}

export function photoReadErrorMessage(error: unknown): string {
  const detail = error instanceof Error ? error.message.trim() : "The browser could not read one or more files.";
  return `Could not read the selected photos. ${detail} Try selecting them again.`;
}

function severityStyle(severity: "blocking" | "degrading"): string {
  return severity === "blocking"
    ? "border-red-400/30 bg-red-500/10 text-red-200"
    : "border-amber-400/30 bg-amber-500/10 text-amber-200";
}

const KIND_LABEL: Record<ReshootKind, string> = {
  recapture: "Recapture / re-export from RAW",
  pair: "Add the original",
  reexport: "Fix the export",
  rename: "Rename the file",
};

function ReshootList({ reports }: { reports: PhotoReport[] }) {
  const [copied, setCopied] = useState(false);
  const plan = buildReshootPlan(reports);

  const copyList = useCallback(async () => {
    const text = formatReshootPlan(plan);
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const area = document.createElement("textarea");
      area.value = text;
      document.body.appendChild(area);
      area.select();
      document.execCommand("copy");
      area.remove();
    }
    setCopied(true);
    recordUsageEvent("reshoot_list_copied");
    window.setTimeout(() => setCopied(false), 2000);
  }, [plan]);

  if (plan.items.length === 0) {
    return (
      <div className="mt-6 rounded-xl border border-emerald-400/20 bg-emerald-500/5 p-5">
        <p className="font-medium text-emerald-100">Nothing to reshoot on this floor spec.</p>
        <p className="mt-1 text-sm text-slate-400">
          A clean table is still not a clean photo — visual watermarks and burned-in contact
          info are not checked.
        </p>
      </div>
    );
  }

  return (
    <div className="mt-6 rounded-xl border border-brand-400/30 bg-brand-500/5 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-white">What to fix next</h2>
          <p className="mt-1 text-sm text-slate-400">
            {plan.recaptureCount} room{plan.recaptureCount === 1 ? "" : "s"} to recapture or
            re-export from RAW, {plan.deskFixCount} desk fix
            {plan.deskFixCount === 1 ? "" : "es"}. Take this list back to the property.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void copyList()}
          className="inline-flex items-center gap-2 rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-sm font-medium text-white hover:bg-white/10"
        >
          <ClipboardCopy className="h-4 w-4" aria-hidden="true" />
          {copied ? "Copied" : "Copy shot list"}
        </button>
      </div>
      <ol className="mt-4 space-y-3">
        {plan.items.map((item) => (
          <li key={item.fileName} className="rounded-lg border border-white/10 bg-slate-950/40 p-3">
            <p className="font-mono text-sm text-white">{item.fileName}</p>
            <p className="mt-1 text-xs font-semibold uppercase tracking-wide text-brand-200">
              {KIND_LABEL[item.kind]}
            </p>
            <p className="mt-1 text-sm text-slate-300">{item.action}</p>
          </li>
        ))}
      </ol>
    </div>
  );
}

// The JSON sibling of the Markdown record below: same run, machine-readable,
// for agents who file preflight evidence rather than read it.
function downloadJsonReport(run: RunSummary): void {
  const evidence = createEvidenceReport(run.reports, run.skipped, run.checkedAt);
  const payload = {
    product: "Listing Lens MLS Photo Preflight",
    report_type: evidence.reportType,
    spec_id: evidence.specId,
    spec_date: evidence.specDate,
    checked_at: evidence.checkedAt,
    checked_photos: evidence.checkedPhotos,
    scope: "File headers and filenames only; not an MLS acceptance determination.",
    unimplemented_rules: evidence.unimplementedRules,
    photos: evidence.photos.map((report) => ({
      name: report.info.name,
      format: report.info.format,
      width: report.info.width,
      height: report.info.height,
      bytes: report.info.nbytes,
      findings: report.findings,
    })),
    skipped_non_photo_files: evidence.skippedFiles,
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `listing-lens-photo-preflight-${SPEC_DATE}.json`;
  link.click();
  URL.revokeObjectURL(url);
  recordUsageEvent("json_report_downloaded");
}

async function copyHandoff(run: RunSummary): Promise<void> {
  const text = formatHandoffSummary(run);
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const area = document.createElement("textarea");
    area.value = text;
    document.body.appendChild(area);
    area.select();
    document.execCommand("copy");
    area.remove();
  }
  recordUsageEvent("handoff_summary_copied");
}

// Usage-enabled state lives in localStorage, which the server cannot read, so
// it is subscribed to as an external store rather than copied into state inside
// an effect. That keeps the server render ("off") and the first client render
// consistent without a setState-in-effect, which react-hooks flags.
const usageListeners = new Set<() => void>();

function subscribeUsage(onChange: () => void): () => void {
  usageListeners.add(onChange);
  return () => {
    usageListeners.delete(onChange);
  };
}

export function PhotoCheckTool() {
  const [run, setRun] = useState<RunSummary | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [readError, setReadError] = useState<string | null>(null);
  const [handoffCopied, setHandoffCopied] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const usageEnabled = useSyncExternalStore(
    subscribeUsage,
    () => isUsageEnabled(),
    () => false,
  );

  const toggleUsage = useCallback(() => {
    setUsageEnabled(!isUsageEnabled());
    // forEach, not for...of: this project targets an ES level whose Set is not iterable.
    usageListeners.forEach((listener) => listener());
  }, []);

  function downloadReport() {
    if (!run) return;
    const blob = new Blob([reportMarkdown(run)], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `listing-lens-preflight-${run.checkedAt.slice(0, 10)}.md`;
    link.click();
    URL.revokeObjectURL(url);
    recordUsageEvent("report_downloaded");
  }

  const handleFiles = useCallback(async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;
    setIsProcessing(true);
    setReadError(null);
    try {
      const files = Array.from(fileList);
      const skipped = files.filter((f) => !isListingPhoto(f.name)).map((f) => f.name);
      const readable = await toFileList(files.filter((f) => isListingPhoto(f.name)));
      const reports = checkBatch(readable);
      setRun({ reports, skipped, checkedAt: new Date().toISOString() });

      const blockingCount = reports.filter((r) => r.findings.some((f) => f.severity === "blocking")).length;
      recordUsageEvent(
        blockingCount === 0 ? "batch_checked_all_clear" : "batch_checked_with_blockers",
      );
      if (buildReshootPlan(reports).items.length > 0) {
        recordUsageEvent("reshoot_list_viewed");
      }
    } catch (error) {
      // File access can fail after the picker accepts a file (for example when
      // a temporary mobile file disappears). Keep the page usable and explain
      // the recovery instead of leaving the user with a stuck-looking run.
      setReadError(photoReadErrorMessage(error));
    } finally {
      setIsProcessing(false);
    }
  }, []);

  return (
    <div className="mt-10">
      <div
        className="flex cursor-pointer flex-col items-center gap-3 rounded-2xl border-2 border-dashed border-white/15 bg-white/5 px-6 py-12 text-center transition hover:border-brand-400/50 hover:bg-white/[0.07]"
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          void handleFiles(e.dataTransfer.files);
        }}
      >
        <UploadCloud className="h-8 w-8 text-brand-300" aria-hidden="true" />
        <p className="text-base font-medium text-white">
          Drag listing photos here, or click to choose files
           </p>
        <p className="text-sm text-slate-400">JPEG or PNG. Nothing is uploaded — checks run in this tab.</p>
        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png"
          multiple
          className="hidden"
          onChange={(e) => void handleFiles(e.target.files)}
        />
      </div>

      {isProcessing && <p className="mt-4 text-sm text-slate-400">Checking…</p>}

      {readError && (
        <p role="alert" className="mt-4 rounded-lg border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          {readError}
        </p>
      )}

      {run && (
        <div className="mt-8">
          <p className="text-sm text-slate-400">
            Checked {run.reports.length} photo{run.reports.length === 1 ? "" : "s"} against{" "}
            <span className="font-mono text-slate-300">{SPEC_ID}</span> at{" "}
            {new Date(run.checkedAt).toLocaleString()}.
            {run.skipped.length > 0 && (
              <> Skipped {run.skipped.length} non-photo file{run.skipped.length === 1 ? "" : "s"}.</>
             )}
           </p>

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => {
                void copyHandoff(run).then(() => {
                  setHandoffCopied(true);
                  window.setTimeout(() => setHandoffCopied(false), 2000);
                });
              }}
              className="rounded-lg border border-white/15 bg-white/5 px-4 py-2 text-sm font-medium text-white hover:bg-white/10"
            >
              {handoffCopied ? "Handoff copied" : "Copy handoff summary"}
            </button>
            <button
              type="button"
              onClick={downloadReport}
              className="rounded-lg border border-brand-300/40 bg-brand-400/10 px-4 py-2 text-sm font-semibold text-brand-100 transition hover:bg-brand-400/20"
            >
              Download dated Markdown record
            </button>
            <button
              type="button"
              onClick={() => downloadJsonReport(run)}
              className="rounded-lg border border-brand-400/40 bg-brand-500/10 px-3 py-2 text-sm font-medium text-brand-100 hover:bg-brand-500/20"
            >
              Download dated JSON report
            </button>
            <span className="text-xs text-slate-500">Contains filenames and findings, never photo pixels.</span>
          </div>

          <ul className="mt-4 divide-y divide-white/10 overflow-hidden rounded-xl border border-white/10">
            {run.reports.map((report) => (
              <li key={report.info.name} className="bg-white/[0.03] p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-mono text-sm text-white">{report.info.name}</span>
                  {report.findings.length === 0 ? (
                    <span className="inline-flex items-center gap-1 rounded-full border border-emerald-400/30 bg-emerald-500/10 px-2.5 py-0.5 text-xs font-semibold text-emerald-200">
                      <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                      No findings
                    </span>
                  ) : (
                    <span className="text-xs text-slate-400">
                      {report.info.width && report.info.height
                        ? `${report.info.width}×${report.info.height}`
                        : null}
                    </span>
                  )}
                </div>
                {report.findings.length > 0 && (
                  <ul className="mt-3 space-y-2">
                    {report.findings.map((finding, idx) => (
                      <li
                        key={idx}
                        className={`flex items-start gap-2 rounded-lg border px-3 py-2 text-sm ${severityStyle(finding.severity)}`}
                      >
                        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                        <span>
                          <span className="font-semibold">{finding.rule}</span> ({finding.severity}):{" "}
                          {finding.detail}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
          <ReshootList reports={run.reports} />
        </div>
      )}

      <div className="mt-10 rounded-xl border border-white/10 bg-white/[0.03] p-5 text-sm leading-6 text-slate-400">
        <p className="flex items-start gap-2 font-medium text-slate-300">
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" aria-hidden="true" />
          This is not a board rulebook, and a clean findings table is not a clean photo.
        </p>
        <p className="mt-2">
          This tool checks the subset of MLS listing-photo requirements that can be decided
          from a file header and a filename — long edge, byte size, format, aspect ratio,
          branding/watermark filenames, and staged-photo pairing (spec{" "}
          <span className="font-mono">{SPEC_ID}</span>, dated {SPEC_DATE}). It does not check{" "}
          {UNIMPLEMENTED_RULES.join(", ")} — those need a human look or a specific MLS
          board&apos;s own rules, which vary by board. No portal account is used, nothing is
          uploaded, and this is not a warranty that any specific MLS will accept your photos.
        </p>
        <p className="mt-3 text-xs text-slate-500">
          <strong className="text-slate-300">No warranty.</strong> This free tool is provided as-is,
          is not legal, financial, or professional real-estate advice, and does not replace a qualified
          MLS professional. Review and verify every result before relying on it; the authors accept no
          liability to the maximum extent permitted by law.
        </p>
        <p className="mt-3 text-xs text-slate-500">
          Local usage counting is currently {usageEnabled ? "on" : "off"}. It records only feature names
          in this browser and never sends data anywhere. <button type="button" onClick={toggleUsage} className="text-brand-200 underline">Turn {usageEnabled ? "off" : "on"}</button>
        </p>
      </div>
    </div>
  );
}
