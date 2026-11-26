// Drag-and-drop + click-to-browse file picker with accept / maxSize validation.
import { UploadCloud } from "lucide-react";
import * as React from "react";
import { cn } from "../../lib/cn";

export interface FileRejection {
  file: File;
  reason: "too_large" | "wrong_type" | "too_many";
  message: string;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB"];
  let v = bytes / 1024;
  let u = 0;
  while (v >= 1024 && u < units.length - 1) {
    v /= 1024;
    u++;
  }
  return `${v >= 10 || Number.isInteger(v) ? Math.round(v) : v.toFixed(1)} ${units[u]}`;
}

/** Same semantics as <input accept>: ".pdf", "image/*", "application/pdf", comma-separated. */
export function fileMatchesAccept(file: File, accept?: string): boolean {
  if (!accept?.trim()) return true;
  const name = file.name.toLowerCase();
  const type = (file.type || "").toLowerCase();
  return accept
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)
    .some((token) => {
      if (token.startsWith(".")) return name.endsWith(token);
      if (token.endsWith("/*")) return type.startsWith(token.slice(0, -1));
      return type === token;
    });
}

export function validateFiles(
  files: File[],
  { accept, maxSize, multiple = true }: { accept?: string; maxSize?: number; multiple?: boolean },
): { accepted: File[]; rejected: FileRejection[] } {
  const accepted: File[] = [];
  const rejected: FileRejection[] = [];
  for (const file of files) {
    if (!multiple && accepted.length >= 1) {
      rejected.push({ file, reason: "too_many", message: `${file.name}: only one file at a time` });
    } else if (!fileMatchesAccept(file, accept)) {
      rejected.push({
        file,
        reason: "wrong_type",
        message: `${file.name}: this file type isn't supported`,
      });
    } else if (maxSize !== undefined && file.size > maxSize) {
      rejected.push({
        file,
        reason: "too_large",
        message: `${file.name} is ${formatBytes(file.size)} — the limit is ${formatBytes(maxSize)}`,
      });
    } else accepted.push(file);
  }
  return { accepted, rejected };
}

export function FileDrop({
  onFiles,
  onReject,
  accept,
  maxSize,
  multiple = false,
  disabled = false,
  label = "Drop files here or click to browse",
  description,
  id,
  className,
}: {
  /** Called with files that passed validation (never with an empty array). */
  onFiles: (files: File[]) => void;
  onReject?: (rejections: FileRejection[]) => void;
  accept?: string;
  /** Max bytes per file. */
  maxSize?: number;
  multiple?: boolean;
  disabled?: boolean;
  label?: string;
  /** Helper line, e.g. "PDF, DOCX or TXT". Size limit is appended automatically. */
  description?: string;
  id?: string;
  className?: string;
}) {
  const autoId = React.useId();
  const inputId = id ?? autoId;
  const hintId = `${inputId}-hint`;
  const [dragging, setDragging] = React.useState(false);
  const [errors, setErrors] = React.useState<FileRejection[]>([]);
  const depth = React.useRef(0);

  const handle = (list: FileList | null | undefined) => {
    const files = Array.from(list ?? []);
    if (!files.length) return;
    const { accepted, rejected } = validateFiles(files, { accept, maxSize, multiple });
    setErrors(rejected);
    if (rejected.length) onReject?.(rejected);
    if (accepted.length) onFiles(accepted);
  };

  const hint = [
    description,
    maxSize ? `Up to ${formatBytes(maxSize)}${multiple ? " each" : ""}` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className={className}>
      <label
        htmlFor={inputId}
        onDragEnter={(e) => {
          e.preventDefault();
          if (disabled) return;
          depth.current++;
          setDragging(true);
        }}
        onDragOver={(e) => {
          e.preventDefault();
          if (!disabled) e.dataTransfer.dropEffect = "copy";
        }}
        onDragLeave={(e) => {
          e.preventDefault();
          depth.current = Math.max(0, depth.current - 1);
          if (depth.current === 0) setDragging(false);
        }}
        onDrop={(e) => {
          e.preventDefault();
          depth.current = 0;
          setDragging(false);
          if (!disabled) handle(e.dataTransfer?.files);
        }}
        className={cn(
          "flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-6 py-10 text-center transition-colors has-[input:focus-visible]:border-brand-500 has-[input:focus-visible]:ring-3 has-[input:focus-visible]:ring-brand-100",
          dragging
            ? "border-brand-500 bg-brand-50"
            : "border-line-strong bg-surface hover:border-brand-400 hover:bg-subtle",
          disabled && "cursor-not-allowed opacity-60 hover:border-line-strong hover:bg-surface",
        )}
      >
        <span className="flex h-11 w-11 items-center justify-center rounded-full bg-brand-50 text-brand-700">
          <UploadCloud className="h-5 w-5" aria-hidden />
        </span>
        <span className="text-sm font-medium text-strong">{label}</span>
        {hint && (
          <span id={hintId} className="text-xs text-subtle">
            {hint}
          </span>
        )}
        <input
          id={inputId}
          type="file"
          className="sr-only"
          accept={accept}
          multiple={multiple}
          disabled={disabled}
          aria-describedby={hint ? hintId : undefined}
          aria-invalid={errors.length > 0 || undefined}
          onChange={(e) => {
            handle(e.target.files);
            e.target.value = ""; // allow re-selecting the same file
          }}
        />
      </label>
      {errors.length > 0 && (
        <ul className="mt-2 space-y-1 text-sm text-danger-700" role="alert">
          {errors.map((r) => (
            <li key={`${r.file.name}-${r.reason}`}>{r.message}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
