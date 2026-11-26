// "Import a grant" menu -> dialog to import a private opportunity by URL or RFP upload.
import { Alert, Button, Field, Input } from "@client/components/ui";
import { cn } from "@client/lib/cn";
import { ChevronDown, FileUp, Link2, Lock, X } from "lucide-react";
import * as React from "react";
import { type ErrorMessages, friendlyError } from "./api-errors";
import { useImportOpportunity } from "./queries";

/** Minimal accessible modal (Escape / backdrop closes, focus moves into the dialog). */
export function Modal({
  open,
  onClose,
  title,
  description,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  const titleId = React.useId();
  const descId = React.useId();
  const panel = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    const first = panel.current?.querySelector<HTMLElement>(
      "input, textarea, select, button:not([data-close])",
    );
    first?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      prev?.focus?.();
    };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-4 sm:pt-24">
      <button
        type="button"
        aria-label="Close dialog"
        tabIndex={-1}
        className="fixed inset-0 bg-neutral-900/40"
        onClick={onClose}
      />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descId : undefined}
        className="relative w-full max-w-lg rounded-lg bg-white shadow-xl"
      >
        <div className="flex items-start justify-between gap-4 border-b border-neutral-100 px-5 py-4">
          <div>
            <h2 id={titleId} className="text-lg font-semibold text-neutral-900">
              {title}
            </h2>
            {description && (
              <p id={descId} className="mt-1 text-sm text-neutral-500">
                {description}
              </p>
            )}
          </div>
          <button
            type="button"
            data-close
            onClick={onClose}
            className="rounded p-1 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700"
            aria-label="Close"
          >
            <X className="h-5 w-5" aria-hidden />
          </button>
        </div>
        <div className="px-5 py-4">{children}</div>
      </div>
    </div>
  );
}

type Mode = "url" | "rfp";

export function ImportGrantMenu({ orgId }: { orgId: string }) {
  const [menuOpen, setMenuOpen] = React.useState(false);
  const [mode, setMode] = React.useState<Mode | null>(null);
  const menuId = React.useId();
  const wrapper = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!menuOpen) return;
    const onDown = (e: MouseEvent) => {
      if (!wrapper.current?.contains(e.target as Node)) setMenuOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setMenuOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  const choose = (m: Mode) => {
    setMenuOpen(false);
    setMode(m);
  };
  const close = React.useCallback(() => setMode(null), []);

  return (
    <div ref={wrapper} className="relative">
      <Button
        variant="secondary"
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        aria-controls={menuOpen ? menuId : undefined}
        onClick={() => setMenuOpen((v) => !v)}
      >
        Import a grant
        <ChevronDown className="h-4 w-4" aria-hidden />
      </Button>
      {menuOpen && (
        <div
          id={menuId}
          role="menu"
          aria-label="Import a grant"
          className="absolute right-0 z-20 mt-1 w-64 rounded-md border border-neutral-200 bg-white p-1 shadow-lg"
        >
          <MenuItem icon={<Link2 className="h-4 w-4" aria-hidden />} onSelect={() => choose("url")}>
            From a web page
            <span className="block text-xs font-normal text-neutral-500">
              Paste a funder's listing URL
            </span>
          </MenuItem>
          <MenuItem
            icon={<FileUp className="h-4 w-4" aria-hidden />}
            onSelect={() => choose("rfp")}
          >
            Upload an RFP
            <span className="block text-xs font-normal text-neutral-500">
              PDF, Word or text file
            </span>
          </MenuItem>
        </div>
      )}
      <Modal
        open={mode !== null}
        onClose={close}
        title={mode === "rfp" ? "Upload an RFP" : "Import from a web page"}
        description="We'll read the funder's requirements, deadline and award range, then score your fit."
      >
        {mode && <ImportForm key={mode} mode={mode} orgId={orgId} onCancel={close} />}
      </Modal>
    </div>
  );
}

function MenuItem({
  icon,
  children,
  onSelect,
}: {
  icon: React.ReactNode;
  children: React.ReactNode;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onSelect}
      className="flex w-full items-start gap-2 rounded px-3 py-2 text-left text-sm font-medium text-neutral-800 hover:bg-neutral-100 focus-visible:bg-neutral-100 focus-visible:outline-none"
    >
      <span className="mt-0.5 text-neutral-500">{icon}</span>
      <span>{children}</span>
    </button>
  );
}

/** Matches services/imports rfpMimeType (pdf, docx, txt, md) and MAX_RFP_BYTES. */
export const RFP_ACCEPT = ".pdf,.docx,.txt,.md";
export const MAX_RFP_BYTES = 20 * 1024 * 1024;

/** 400/413/422 codes from POST /imports/opportunity-url and /imports/rfp. */
export const IMPORT_ERRORS: ErrorMessages = {
  robots_disallowed:
    "This site doesn't allow automated access to that page. Download the RFP from it and use “Upload an RFP” instead.",
  not_an_opportunity:
    "That page doesn't look like a grant opportunity. Link to the funder's page for the specific program, or upload the RFP.",
  fetch_failed:
    "We couldn't load that page (it may be down or require a login). Check the address, or download the RFP and upload it.",
  unsupported_content:
    "That link isn't a web page or PDF. Download the file and upload it instead.",
  too_large: "That page is too large to import (over 3 MB). Upload the RFP file instead.",
  no_text:
    "We couldn't read enough text. If it's a scanned PDF, try a text-based copy or the funder's web page.",
  file_too_large:
    "RFP files must be 20 MB or smaller. Try a compressed PDF, or import the web page.",
};

function ImportForm({
  mode,
  orgId,
  onCancel,
}: {
  mode: Mode;
  orgId: string;
  onCancel: () => void;
}) {
  const importer = useImportOpportunity(orgId);
  const [url, setUrl] = React.useState("");
  const [file, setFile] = React.useState<File | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const inputId = React.useId();

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (mode === "url") {
      let parsed: URL;
      try {
        parsed = new URL(url.trim());
      } catch {
        return setError("Enter a full web address, starting with https://");
      }
      if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
        return setError("Only http(s) links can be imported.");
      }
      importer.mutate({ kind: "url", url: parsed.toString() });
    } else {
      if (!file) return setError("Choose a file to upload.");
      if (!/\.(pdf|docx|txt|md)$/i.test(file.name))
        return setError("Upload a PDF, Word (.docx), text or Markdown file.");
      if (file.size > MAX_RFP_BYTES) return setError("RFP files must be 20 MB or smaller.");
      importer.mutate({ kind: "rfp", file });
    }
  };

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      {mode === "url" ? (
        <Field
          label="Grant listing URL"
          htmlFor={inputId}
          error={error ?? undefined}
          hint="The page announcing the grant (funder site, foundation directory, or RFP page)."
        >
          <Input
            id={inputId}
            type="url"
            inputMode="url"
            placeholder="https://www.example.org/grants/workforce-2027"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            required
          />
        </Field>
      ) : (
        <Field
          label="RFP document"
          htmlFor={inputId}
          error={error ?? undefined}
          hint="The funder's request for proposals or guidelines (PDF, DOCX, TXT)."
        >
          <input
            id={inputId}
            type="file"
            accept={RFP_ACCEPT}
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className={cn(
              "block w-full text-sm text-neutral-700 file:mr-3 file:rounded-md file:border-0 file:bg-brand-50 file:px-3 file:py-2 file:text-sm file:font-medium file:text-brand-700 hover:file:bg-brand-100",
            )}
          />
        </Field>
      )}
      <p className="flex items-start gap-2 rounded-md bg-neutral-50 px-3 py-2 text-sm text-neutral-600">
        <Lock className="mt-0.5 h-4 w-4 shrink-0 text-neutral-500" aria-hidden />
        Imported grants are private to your organization. They are not added to the shared catalog
        or shown to anyone else.
      </p>
      {importer.error && (
        <Alert tone="danger" title="Import failed">
          {friendlyError(importer.error, IMPORT_ERRORS)}
        </Alert>
      )}
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onCancel} disabled={importer.isPending}>
          Cancel
        </Button>
        <Button type="submit" loading={importer.isPending}>
          {importer.isPending ? "Importing…" : "Import grant"}
        </Button>
      </div>
    </form>
  );
}
