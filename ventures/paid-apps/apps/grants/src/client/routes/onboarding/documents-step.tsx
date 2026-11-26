// Onboarding step 2: upload the documents that help most (POST /documents, multipart).

import { Badge, Button, ErrorMessage, Input, Select } from "@client/components/ui";
import { api, orgApi } from "@client/lib/api";
import { appPath } from "@client/lib/base-path";
import { cn } from "@client/lib/cn";
import { parseDollarsToCents } from "@client/routes/org/settings/form-bits";
import { DOCUMENT_KIND_LABELS, PAST_OUTCOME_LABELS } from "@client/routes/org/settings/labels";
import type { DocumentDto, ListResponse } from "@shared/api/types";
import { DOCUMENT_KINDS, type DocumentKind, PAST_OUTCOMES, type PastOutcome } from "@shared/enums";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, FileText, Loader2, Trash2, Upload, XCircle } from "lucide-react";
import { type DragEvent, useId, useRef, useState } from "react";

const HELPFUL: { kind: DocumentKind; why: string }[] = [
  { kind: "mission_statement", why: "Who you are, in your own words" },
  { kind: "charter_bylaws", why: "Proves eligibility and governance" },
  { kind: "annual_report", why: "Programs, people served, results" },
  { kind: "financial_statement", why: "Budget size, audits, 990s" },
  { kind: "program_description", why: "What each program does and for whom" },
  { kind: "past_application", why: "Tell us if it was awarded or declined — we learn from both" },
];

/** Guess a past application's outcome from its file name ("…-awarded.pdf"). */
export function guessOutcome(fileName: string): PastOutcome {
  const n = fileName.toLowerCase();
  if (/award|funded|won/.test(n)) return "awarded";
  if (/declin|reject|denied|unfunded/.test(n)) return "declined";
  return "unknown";
}

/** Guess a document kind from its file name (the user can change it). */
export function guessKind(fileName: string): DocumentKind {
  const n = fileName.toLowerCase();
  if (/bylaw|charter|articles/.test(n)) return "charter_bylaws";
  if (/mission/.test(n)) return "mission_statement";
  if (/annual.?report/.test(n)) return "annual_report";
  if (/990|audit|financ/.test(n)) return "financial_statement";
  if (/budget/.test(n)) return "budget";
  if (/application|proposal/.test(n)) return "past_application";
  if (/award/.test(n)) return "award_letter";
  if (/declin|reject/.test(n)) return "rejection_letter";
  if (/support/.test(n)) return "letter_of_support";
  if (/grant/.test(n)) return "past_application";
  if (/program/.test(n)) return "program_description";
  if (/policy/.test(n)) return "policy";
  return "other";
}

type UploadStatus = "ready" | "uploading" | "done" | "error";
interface QueuedFile {
  key: string;
  file: File;
  title: string;
  kind: DocumentKind;
  pastOutcome: PastOutcome;
  pastFunder: string;
  pastAmount: string;
  pastYear: string;
  status: UploadStatus;
  error?: string;
}

const MAX_BYTES = 25 * 1024 * 1024;
const ACCEPT = ".pdf,.docx,.doc,.txt,.md,.html,.htm,.png,.jpg,.jpeg,.xlsx,.csv";
const stripExt = (n: string) => n.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ");
const fmtSize = (b: number) =>
  b < 1024 * 1024
    ? `${Math.max(1, Math.round(b / 1024))} KB`
    : `${(b / 1024 / 1024).toFixed(1)} MB`;

export function DocumentsStep({
  orgId,
  onNext,
  onBack,
}: {
  orgId: string;
  onNext: () => void;
  onBack: () => void;
}) {
  const qc = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const consentId = useId();
  const [queue, setQueue] = useState<QueuedFile[]>([]);
  const [consent, setConsent] = useState(false);
  const [consentError, setConsentError] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);

  const existing = useQuery({
    queryKey: ["org", orgId, "documents"],
    queryFn: () => api<ListResponse<DocumentDto>>(orgApi(orgId, "/documents")),
  });

  const addFiles = (files: FileList | File[]) => {
    const next: QueuedFile[] = Array.from(files).map((file) => ({
      key: `${file.name}-${file.size}-${file.lastModified}-${Math.random().toString(36).slice(2, 7)}`,
      file,
      title: stripExt(file.name),
      kind: guessKind(file.name),
      pastOutcome: guessOutcome(file.name),
      pastFunder: "",
      pastAmount: "",
      pastYear: "",
      status: file.size > MAX_BYTES ? "error" : "ready",
      error: file.size > MAX_BYTES ? "This file is larger than 25 MB." : undefined,
    }));
    setQueue((q) => [...q, ...next]);
  };

  const update = (key: string, patch: Partial<QueuedFile>) =>
    setQueue((q) => q.map((f) => (f.key === key ? { ...f, ...patch } : f)));

  const uploadAll = async () => {
    if (!consent) {
      setConsentError(true);
      return;
    }
    setUploading(true);
    for (const item of queue) {
      if (item.status !== "ready" && item.status !== "error") continue;
      if (item.file.size > MAX_BYTES) continue;
      update(item.key, { status: "uploading", error: undefined });
      const fd = new FormData();
      fd.set("file", item.file);
      fd.set("kind", item.kind);
      fd.set("title", item.title.trim() || stripExt(item.file.name));
      fd.set("consent", "true");
      if (item.kind === "past_application") {
        fd.set("pastOutcome", item.pastOutcome);
        if (item.pastFunder.trim()) fd.set("pastFunder", item.pastFunder.trim());
        const cents = parseDollarsToCents(item.pastAmount);
        if (cents != null) fd.set("pastAmountCents", String(cents));
        if (/^\d{4}$/.test(item.pastYear.trim())) fd.set("pastYear", item.pastYear.trim());
      }
      try {
        await api<DocumentDto>(orgApi(orgId, "/documents"), { method: "POST", body: fd });
        update(item.key, { status: "done" });
      } catch (e) {
        update(item.key, {
          status: "error",
          error: e instanceof Error ? e.message : "Upload failed",
        });
      }
    }
    setUploading(false);
    qc.invalidateQueries({ queryKey: ["org", orgId, "documents"] });
  };

  const pending = queue.filter((f) => f.status === "ready" || f.status === "uploading");
  const retryable = queue.filter((f) => f.status === "error" && f.file.size <= MAX_BYTES);
  const hasUploads =
    (existing.data?.items.length ?? 0) > 0 || queue.some((f) => f.status === "done");

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragging(false);
    if (e.dataTransfer.files.length) addFiles(e.dataTransfer.files);
  };

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-sm font-semibold text-neutral-900">What helps most</h3>
        <p className="mt-1 text-sm text-neutral-500">
          Everything we write comes from these. The more we have, the less we'll need to ask you.
        </p>
        <ul className="mt-3 grid gap-2 sm:grid-cols-2">
          {HELPFUL.map((h) => (
            <li key={h.kind} className="flex gap-2 rounded-md bg-neutral-50 px-3 py-2 text-sm">
              <FileText className="mt-0.5 h-4 w-4 shrink-0 text-brand-600" aria-hidden />
              <span>
                <span className="font-medium text-neutral-900">{DOCUMENT_KIND_LABELS[h.kind]}</span>
                <span className="block text-neutral-500">{h.why}</span>
              </span>
            </li>
          ))}
        </ul>
      </div>

      <section
        aria-label="Add files"
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={cn(
          "rounded-lg border-2 border-dashed px-6 py-8 text-center transition-colors",
          dragging ? "border-brand-500 bg-brand-50" : "border-neutral-300 bg-white",
        )}
      >
        <Upload className="mx-auto h-8 w-8 text-neutral-400" aria-hidden />
        <p className="mt-2 text-sm text-neutral-700">
          Drag files here, or{" "}
          <button
            type="button"
            className="font-medium text-brand-700 underline"
            onClick={() => inputRef.current?.click()}
          >
            choose files
          </button>
        </p>
        <p className="mt-1 text-xs text-neutral-500">
          PDF, Word, text or images · up to 25 MB each
        </p>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept={ACCEPT}
          className="sr-only"
          aria-label="Choose files to upload"
          onChange={(e) => {
            if (e.target.files) addFiles(e.target.files);
            e.target.value = "";
          }}
        />
      </section>

      {queue.length > 0 && (
        <ul className="space-y-3" aria-label="Files to upload">
          {queue.map((f) => (
            <FileRow
              key={f.key}
              item={f}
              disabled={uploading || f.status === "done" || f.status === "uploading"}
              onChange={(patch) => update(f.key, patch)}
              onRemove={() => setQueue((q) => q.filter((x) => x.key !== f.key))}
            />
          ))}
        </ul>
      )}

      {queue.length > 0 && (
        <div className="space-y-1">
          <div className="flex items-start gap-3">
            <input
              id={consentId}
              type="checkbox"
              className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer accent-brand-600"
              checked={consent}
              onChange={(e) => {
                setConsent(e.target.checked);
                setConsentError(false);
              }}
              aria-invalid={consentError || undefined}
            />
            <label htmlFor={consentId} className="text-sm text-neutral-700">
              We have the right to share these documents, and agree they will be processed under the{" "}
              <a
                href={appPath("/legal/data-use")}
                target="_blank"
                rel="noreferrer"
                className="text-brand-700 underline"
              >
                Data Use Policy
              </a>{" "}
              to draft our own applications.
            </label>
          </div>
          {consentError && (
            <p role="alert" className="pl-7 text-sm text-danger-700">
              Please confirm before uploading.
            </p>
          )}
        </div>
      )}

      {existing.data && existing.data.items.length > 0 && (
        <div className="rounded-md bg-success-50 px-4 py-3 text-sm text-success-800">
          <p className="font-medium">
            {existing.data.items.length} document{existing.data.items.length === 1 ? "" : "s"} in
            your library
          </p>
          <p className="mt-0.5 text-success-700">
            {existing.data.items
              .slice(0, 6)
              .map((d) => d.title)
              .join(" · ")}
            {existing.data.items.length > 6 ? " · …" : ""}
          </p>
        </div>
      )}
      {existing.isError && <ErrorMessage error={existing.error} />}

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-neutral-100 pt-4">
        <Button variant="ghost" onClick={onBack} disabled={uploading}>
          Back
        </Button>
        <div className="flex flex-wrap items-center gap-2">
          {pending.length + retryable.length > 0 ? (
            <>
              <Button variant="ghost" onClick={onNext} disabled={uploading}>
                Skip for now
              </Button>
              <Button onClick={uploadAll} loading={uploading}>
                Upload {pending.length + retryable.length} file
                {pending.length + retryable.length === 1 ? "" : "s"}
              </Button>
            </>
          ) : hasUploads ? (
            <Button onClick={onNext}>Continue</Button>
          ) : (
            <Button variant="secondary" onClick={onNext}>
              Skip for now
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

function FileRow({
  item,
  disabled,
  onChange,
  onRemove,
}: {
  item: QueuedFile;
  disabled: boolean;
  onChange: (patch: Partial<QueuedFile>) => void;
  onRemove: () => void;
}) {
  const base = useId();
  const statusBadge = {
    ready: <Badge tone="neutral">Ready</Badge>,
    uploading: (
      <Badge tone="info">
        <Loader2 className="mr-1 h-3 w-3 animate-spin" aria-hidden />
        Uploading
      </Badge>
    ),
    done: (
      <Badge tone="success">
        <CheckCircle2 className="mr-1 h-3 w-3" aria-hidden />
        Uploaded — reading it now
      </Badge>
    ),
    error: (
      <Badge tone="danger">
        <XCircle className="mr-1 h-3 w-3" aria-hidden />
        Not uploaded
      </Badge>
    ),
  }[item.status];

  return (
    <li className="rounded-lg border border-neutral-200 bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-neutral-900">{item.file.name}</p>
          <p className="text-xs text-neutral-500">{fmtSize(item.file.size)}</p>
        </div>
        <div className="flex items-center gap-2" aria-live="polite">
          {statusBadge}
          {item.status !== "done" && item.status !== "uploading" && (
            <button
              type="button"
              className="rounded p-1 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700"
              aria-label={`Remove ${item.file.name}`}
              onClick={onRemove}
            >
              <Trash2 className="h-4 w-4" aria-hidden />
            </button>
          )}
        </div>
      </div>
      {item.error && <p className="mt-2 text-sm text-danger-700">{item.error}</p>}
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor={`${base}-title`} className="text-xs font-medium text-neutral-600">
            Title
          </label>
          <Input
            id={`${base}-title`}
            value={item.title}
            disabled={disabled}
            onChange={(e) => onChange({ title: e.target.value })}
          />
        </div>
        <div>
          <label htmlFor={`${base}-kind`} className="text-xs font-medium text-neutral-600">
            What is it?
          </label>
          <Select
            id={`${base}-kind`}
            value={item.kind}
            disabled={disabled}
            onChange={(e) => onChange({ kind: e.target.value as DocumentKind })}
          >
            {DOCUMENT_KINDS.filter((k) => k !== "interview_transcript" && k !== "website_page").map(
              (k) => (
                <option key={k} value={k}>
                  {DOCUMENT_KIND_LABELS[k]}
                </option>
              ),
            )}
          </Select>
        </div>
      </div>
      {item.kind === "past_application" && (
        <fieldset className="mt-3 rounded-md bg-neutral-50 p-3">
          <legend className="sr-only">About this past application</legend>
          <div className="grid gap-3 sm:grid-cols-4">
            <div>
              <label htmlFor={`${base}-outcome`} className="text-xs font-medium text-neutral-600">
                Result
              </label>
              <Select
                id={`${base}-outcome`}
                value={item.pastOutcome}
                disabled={disabled}
                onChange={(e) => onChange({ pastOutcome: e.target.value as PastOutcome })}
              >
                {PAST_OUTCOMES.map((o) => (
                  <option key={o} value={o}>
                    {PAST_OUTCOME_LABELS[o]}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <label htmlFor={`${base}-funder`} className="text-xs font-medium text-neutral-600">
                Funder
              </label>
              <Input
                id={`${base}-funder`}
                value={item.pastFunder}
                disabled={disabled}
                onChange={(e) => onChange({ pastFunder: e.target.value })}
              />
            </div>
            <div>
              <label htmlFor={`${base}-amount`} className="text-xs font-medium text-neutral-600">
                Amount asked
              </label>
              <Input
                id={`${base}-amount`}
                inputMode="decimal"
                placeholder="$25,000"
                value={item.pastAmount}
                disabled={disabled}
                onChange={(e) => onChange({ pastAmount: e.target.value })}
              />
            </div>
            <div>
              <label htmlFor={`${base}-year`} className="text-xs font-medium text-neutral-600">
                Year
              </label>
              <Input
                id={`${base}-year`}
                inputMode="numeric"
                maxLength={4}
                placeholder="2025"
                value={item.pastYear}
                disabled={disabled}
                onChange={(e) => onChange({ pastYear: e.target.value })}
              />
            </div>
          </div>
          <p className="mt-2 text-xs text-neutral-500">
            Awarded applications show us what works; declined ones show what to avoid.
          </p>
        </fieldset>
      )}
    </li>
  );
}
