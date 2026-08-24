"use client";

import { useCallback, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, ShieldAlert, UploadCloud } from "lucide-react";

import {
  SPEC_DATE,
  SPEC_ID,
  UNIMPLEMENTED_RULES,
  checkBatch,
  isListingPhoto,
  type PhotoReport,
} from "@/lib/photo-spec";
import { recordUsageEvent } from "@/lib/usage";

type RunSummary = {
  reports: PhotoReport[];
  skipped: string[];
  checkedAt: string;
};

function markdownCell(value: string): string {
  return value.replaceAll("|", "\\|").replaceAll("\n", " ");
}

function buildReportMarkdown(run: RunSummary): string {
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
    "## Scope and limitations",
    "",
    `This record checks file headers and filenames only: format, byte size, long edge, aspect ratio, branding/watermark filename tokens, and staged-photo pairing. It does not check ${UNIMPLEMENTED_RULES.join(", ")}. Those require a human review or the specific MLS board's rules.",
    "",
    "A clean findings table is not a warranty that a board or portal will accept these photos. Review and verify this record before relying on it.",
    "",
  ].join("\n");
}

async function toFileList(files: File[]): Promise<Array<{ name: string; data: Uint8Array }>> {
  return Promise.all(
    files.map(async (file) => ({
      name: file.name,
      data: new Uint8Array(await file.arrayBuffer()),
    })),
  );
}

function severityStyle(severity: "blocking" | "degrading"): string {
  return severity === "blocking"
    ? "border-red-400/30 bg-red-500/10 text-red-200"
    : "border-amber-400/30 bg-amber-500/10 text-amber-200";
}

export function PhotoCheckTool() {
  const [run, setRun] = useState<RunSummary | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  function downloadReport() {
    if (!run) return;
    const blob = new Blob([buildReportMarkdown(run)], { type: "text/markdown;charset=utf-8" });
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

          <button
            type="button"
            onClick={downloadReport}
            className="mt-4 rounded-lg border border-brand-300/40 bg-brand-400/10 px-4 py-2 text-sm font-semibold text-brand-100 transition hover:bg-brand-400/20"
          >
            Download dated Markdown record
          </button>

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
      </div>
    </div>
  );
}
