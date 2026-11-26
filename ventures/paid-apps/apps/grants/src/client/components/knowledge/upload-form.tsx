// Document upload panel: drag & drop (multiple files), kind selector with helper text,
// past-application details, and a required data-use consent checkbox.

import { friendlyError } from "@client/components/grants/api-errors";
import { Button, Field, Input, Select } from "@client/components/ui";
import { appPath } from "@client/lib/base-path";
import { cn } from "@client/lib/cn";
import { DOCUMENT_KINDS, type DocumentKind, type PastOutcome } from "@shared/enums";
import { CheckCircle2, FileUp, Loader2, TriangleAlert, X } from "lucide-react";
import type * as React from "react";
import { useId, useRef, useState } from "react";
import {
  DOCUMENT_KIND_INFO,
  formatBytes,
  PAST_OUTCOME_LABELS,
  parseDollarsToCents,
} from "./labels";

/** Mirrors services/ingestion/files.ts EXT_TO_MIME (anything else is rejected with 415). */
export const ACCEPTED_FILE_TYPES =
  ".pdf,.docx,.doc,.txt,.md,.markdown,.html,.htm,.rtf,.csv,.xlsx,.png,.jpg,.jpeg";
const ACCEPTED_EXTENSIONS = new Set(ACCEPTED_FILE_TYPES.split(",").map((e) => e.slice(1)));

/** POST /documents error codes -> what the user should do. */
export const UPLOAD_ERRORS = {
  file_too_large: "This file is larger than 25 MB. Compress it or split it into smaller files.",
  unsupported_file_type:
    "We can't read this file type. Save it as PDF, Word (.docx), text, HTML, CSV, Excel or an image.",
  consent_required: "Please confirm consent before uploading.",
};

/** Message for a failed upload: per-code guidance, and the existing title for duplicates. */
export function uploadErrorMessage(err: unknown): string {
  return friendlyError(err, UPLOAD_ERRORS);
}
export const MAX_FILE_BYTES = 25 * 1024 * 1024;
const OUTCOME_OPTIONS: PastOutcome[] = ["awarded", "declined", "pending", "unknown"];

export interface UploadMeta {
  kind: DocumentKind | "";
  title: string;
  pastOutcome: PastOutcome | "";
  pastFunder: string;
  pastAmount: string;
  pastYear: string;
  consent: boolean;
}
export type UploadErrors = Partial<Record<keyof UploadMeta | "files", string>>;

export const emptyUploadMeta: UploadMeta = {
  kind: "",
  title: "",
  pastOutcome: "",
  pastFunder: "",
  pastAmount: "",
  pastYear: "",
  consent: false,
};

export function validateUpload(files: File[], meta: UploadMeta, now = new Date()): UploadErrors {
  const e: UploadErrors = {};
  if (files.length === 0) e.files = "Choose at least one file.";
  else if (files.some((f) => f.size > MAX_FILE_BYTES))
    e.files = `Files must be smaller than ${formatBytes(MAX_FILE_BYTES)}.`;
  else if (
    files.some((f) => !ACCEPTED_EXTENSIONS.has(f.name.split(".").pop()?.toLowerCase() ?? ""))
  )
    e.files = "Some files aren't a supported type (PDF, Word, text, HTML, CSV, Excel or image).";
  if (!meta.kind) e.kind = "Choose what kind of document this is.";
  if (meta.kind === "past_application") {
    if (!meta.pastOutcome) e.pastOutcome = "Tell us how this application turned out.";
    if (meta.pastAmount.trim()) {
      const c = parseDollarsToCents(meta.pastAmount);
      if (c == null || Number.isNaN(c)) e.pastAmount = "Enter a dollar amount, e.g. 25,000.";
    }
    if (meta.pastYear.trim()) {
      const y = Number(meta.pastYear);
      if (!Number.isInteger(y) || y < 1950 || y > now.getFullYear() + 1)
        e.pastYear = "Enter a 4-digit year.";
    }
  }
  if (!meta.consent) e.consent = "Please confirm consent before uploading.";
  return e;
}

/** Build the multipart body for POST /documents (one file per request). */
export function buildUploadFormData(file: File, meta: UploadMeta, includeTitle: boolean) {
  const fd = new FormData();
  fd.set("file", file);
  fd.set("kind", meta.kind);
  if (includeTitle && meta.title.trim()) fd.set("title", meta.title.trim());
  if (meta.kind === "past_application") {
    if (meta.pastOutcome) fd.set("pastOutcome", meta.pastOutcome);
    if (meta.pastFunder.trim()) fd.set("pastFunder", meta.pastFunder.trim());
    const cents = parseDollarsToCents(meta.pastAmount);
    if (cents != null && !Number.isNaN(cents)) fd.set("pastAmountCents", String(cents));
    if (meta.pastYear.trim()) fd.set("pastYear", meta.pastYear.trim());
  }
  fd.set("consent", "true");
  return fd;
}

type FileState = { status: "pending" | "uploading" | "done" | "error"; error?: string };

export function UploadForm({
  onUpload,
  onComplete,
}: {
  /** Called once per file with the multipart body for POST /documents. */
  onUpload: (body: FormData) => Promise<unknown>;
  onComplete?: () => void;
}) {
  const uid = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [states, setStates] = useState<Record<string, FileState>>({});
  const [meta, setMeta] = useState<UploadMeta>(emptyUploadMeta);
  const [errors, setErrors] = useState<UploadErrors>({});
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [summary, setSummary] = useState<string | null>(null);

  const keyOf = (f: File) => `${f.name}:${f.size}:${f.lastModified}`;
  const set = <K extends keyof UploadMeta>(k: K, v: UploadMeta[K]) =>
    setMeta((m) => ({ ...m, [k]: v }));

  const addFiles = (list: FileList | File[] | null) => {
    if (!list) return;
    const incoming = Array.from(list);
    setFiles((prev) => {
      const seen = new Set(prev.map(keyOf));
      return [...prev, ...incoming.filter((f) => !seen.has(keyOf(f)))];
    });
    setSummary(null);
    setErrors((e) => ({ ...e, files: undefined }));
  };
  const removeFile = (f: File) => setFiles((prev) => prev.filter((p) => keyOf(p) !== keyOf(f)));

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    addFiles(e.dataTransfer?.files ?? null);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const errs = validateUpload(files, meta);
    setErrors(errs);
    if (Object.values(errs).some(Boolean)) return;
    setBusy(true);
    let ok = 0;
    const failed: File[] = [];
    for (const f of files) {
      const k = keyOf(f);
      setStates((s) => ({ ...s, [k]: { status: "uploading" } }));
      try {
        await onUpload(buildUploadFormData(f, meta, files.length === 1));
        ok++;
        setStates((s) => ({ ...s, [k]: { status: "done" } }));
      } catch (err) {
        failed.push(f);
        const message = uploadErrorMessage(err);
        setStates((s) => ({ ...s, [k]: { status: "error", error: message } }));
      }
    }
    setBusy(false);
    setSummary(
      failed.length
        ? `${ok} uploaded, ${failed.length} failed. Fix the problem and try again.`
        : `${ok} ${ok === 1 ? "document" : "documents"} uploaded. We'll read ${ok === 1 ? "it" : "them"} and propose facts for you to review.`,
    );
    setFiles(failed);
    if (failed.length === 0) {
      setMeta((m) => ({ ...emptyUploadMeta, kind: m.kind, consent: m.consent }));
      setStates({});
    }
    onComplete?.();
  };

  const kindInfo = meta.kind ? DOCUMENT_KIND_INFO[meta.kind] : null;
  const isPast = meta.kind === "past_application";

  return (
    <form onSubmit={submit} noValidate className="space-y-4" aria-label="Upload documents">
      {/* biome-ignore lint/a11y/noStaticElementInteractions: drop target; keyboard users use the browse button */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        data-testid="dropzone"
        className={cn(
          "flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed px-6 py-8 text-center transition-colors",
          dragging ? "border-brand-500 bg-brand-50" : "border-neutral-300 bg-neutral-50",
          errors.files && "border-danger-400",
        )}
      >
        <FileUp className="h-8 w-8 text-neutral-400" aria-hidden />
        <p className="text-sm text-neutral-700">
          Drag &amp; drop files here, or{" "}
          <button
            type="button"
            className="font-medium text-brand-700 underline underline-offset-2"
            onClick={() => inputRef.current?.click()}
          >
            browse
          </button>
        </p>
        <p className="text-xs text-neutral-500">
          PDF, Word, text, HTML, spreadsheets or images · up to {formatBytes(MAX_FILE_BYTES)} each
        </p>
        <label htmlFor={`${uid}-files`} className="sr-only">
          Files to upload
        </label>
        <input
          ref={inputRef}
          id={`${uid}-files`}
          type="file"
          multiple
          accept={ACCEPTED_FILE_TYPES}
          className="sr-only"
          onChange={(e) => {
            addFiles(e.target.files);
            e.target.value = "";
          }}
        />
      </div>
      {errors.files && (
        <p className="text-sm text-danger-600" role="alert">
          {errors.files}
        </p>
      )}

      {files.length > 0 && (
        <ul
          className="divide-y divide-neutral-100 rounded-md border border-neutral-200"
          aria-label="Selected files"
        >
          {files.map((f) => {
            const st = states[keyOf(f)];
            return (
              <li key={keyOf(f)} className="flex items-center gap-3 px-3 py-2 text-sm">
                {st?.status === "uploading" ? (
                  <Loader2 className="h-4 w-4 animate-spin text-brand-600" aria-label="Uploading" />
                ) : st?.status === "done" ? (
                  <CheckCircle2 className="h-4 w-4 text-success-600" aria-label="Uploaded" />
                ) : st?.status === "error" ? (
                  <TriangleAlert className="h-4 w-4 text-danger-600" aria-label="Failed" />
                ) : null}
                <span className="min-w-0 flex-1 truncate">{f.name}</span>
                <span className="text-xs text-neutral-500">{formatBytes(f.size)}</span>
                {st?.error && <span className="text-xs text-danger-600">{st.error}</span>}
                <button
                  type="button"
                  onClick={() => removeFile(f)}
                  disabled={busy}
                  className="rounded p-1 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700"
                  aria-label={`Remove ${f.name}`}
                >
                  <X className="h-4 w-4" aria-hidden />
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label="What kind of document is this?"
          htmlFor={`${uid}-kind`}
          error={errors.kind}
          hint={kindInfo?.help ?? "This helps us know how to read it."}
        >
          <Select
            id={`${uid}-kind`}
            value={meta.kind}
            onChange={(e) => set("kind", e.target.value as DocumentKind | "")}
            aria-invalid={!!errors.kind}
          >
            <option value="">Choose a kind…</option>
            {DOCUMENT_KINDS.map((k) => (
              <option key={k} value={k}>
                {DOCUMENT_KIND_INFO[k].label}
              </option>
            ))}
          </Select>
        </Field>
        {files.length <= 1 && (
          <Field
            label="Title (optional)"
            htmlFor={`${uid}-title`}
            hint="Defaults to the file name."
          >
            <Input
              id={`${uid}-title`}
              value={meta.title}
              onChange={(e) => set("title", e.target.value)}
              placeholder="e.g. 2025 Annual Report"
            />
          </Field>
        )}
      </div>

      {isPast && (
        <fieldset className="space-y-4 rounded-md border border-neutral-200 p-4">
          <legend className="px-1 text-sm font-semibold text-neutral-800">
            About this past application
          </legend>
          <p className="text-sm text-neutral-500">
            Awarded applications become style references for new drafts; declined ones help us avoid
            repeating weak spots.
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Outcome" htmlFor={`${uid}-outcome`} error={errors.pastOutcome}>
              <Select
                id={`${uid}-outcome`}
                value={meta.pastOutcome}
                onChange={(e) => set("pastOutcome", e.target.value as PastOutcome | "")}
                aria-invalid={!!errors.pastOutcome}
              >
                <option value="">Choose…</option>
                {OUTCOME_OPTIONS.map((o) => (
                  <option key={o} value={o}>
                    {PAST_OUTCOME_LABELS[o]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Funder" htmlFor={`${uid}-funder`}>
              <Input
                id={`${uid}-funder`}
                value={meta.pastFunder}
                onChange={(e) => set("pastFunder", e.target.value)}
                placeholder="e.g. U.S. Department of Labor"
              />
            </Field>
            <Field label="Amount requested ($)" htmlFor={`${uid}-amount`} error={errors.pastAmount}>
              <Input
                id={`${uid}-amount`}
                inputMode="decimal"
                value={meta.pastAmount}
                onChange={(e) => set("pastAmount", e.target.value)}
                placeholder="25,000"
                aria-invalid={!!errors.pastAmount}
              />
            </Field>
            <Field label="Year" htmlFor={`${uid}-year`} error={errors.pastYear}>
              <Input
                id={`${uid}-year`}
                inputMode="numeric"
                value={meta.pastYear}
                onChange={(e) => set("pastYear", e.target.value)}
                placeholder="2024"
                aria-invalid={!!errors.pastYear}
              />
            </Field>
          </div>
        </fieldset>
      )}

      <div className="space-y-1">
        <div className="flex items-start gap-2">
          <input
            id={`${uid}-consent`}
            type="checkbox"
            checked={meta.consent}
            onChange={(e) => set("consent", e.target.checked)}
            aria-invalid={!!errors.consent}
            className="mt-0.5 h-4 w-4 rounded border-neutral-300 text-brand-600"
          />
          <label htmlFor={`${uid}-consent`} className="text-sm text-neutral-700">
            I have the right to share these documents, and I agree they may be processed (including
            by AI) to draft grant applications, as described in the{" "}
            <a
              href={appPath("/legal/data-use")}
              target="_blank"
              rel="noreferrer"
              className="font-medium text-brand-700 underline underline-offset-2"
            >
              data use policy
            </a>
            . Remove personal information about individual clients first.
          </label>
        </div>
        {errors.consent && (
          <p className="text-sm text-danger-600" role="alert">
            {errors.consent}
          </p>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" loading={busy}>
          {files.length > 1 ? `Upload ${files.length} files` : "Upload"}
        </Button>
        {summary && (
          <p className="text-sm text-neutral-600" role="status">
            {summary}
          </p>
        )}
      </div>
    </form>
  );
}
