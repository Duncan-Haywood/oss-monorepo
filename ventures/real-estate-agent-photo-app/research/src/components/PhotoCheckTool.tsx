"use client";

import { useCallback, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, ClipboardCopy, ShieldAlert, UploadCloud } from "lucide-react";

import {
  SPEC_DATE,
  SPEC_ID,
  UNIMPLEMENTED_RULES,
  buildReshootPlan,
  checkBatch,
  formatReshootPlan,
  isListingPhoto,
  type PhotoReport,
  type ReshootKind,
} from "@/lib/photo-spec";
import { recordUsageEvent } from "@/lib/usage";

type RunSummary = {
  reports: PhotoReport[];
  skipped: string[];
  checkedAt: string;
};

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

export function PhotoCheckTool() {
  const [run, setRun] = useState<RunSummary | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

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
      if (buildReshootPlan(reports).items.length > 0) {
        recordUsageEvent("reshoot_list_viewed");
      }
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
      </div>
    </div>
  );
}
