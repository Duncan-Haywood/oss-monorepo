// "Export" menu for an application: Word (.docx download), Print / Save as PDF (printable HTML in a
// hidden iframe) and plain text for funder portals (copied to the clipboard). The citations toggle
// adds [n] markers + a citations appendix; it is off by default because funders should not see it.
// Backed by GET /api/orgs/:orgId/applications/:id/export?format=docx|html|txt&citations=0|1.
import { ChevronDown, ClipboardCopy, Download, FileText, Printer, Quote } from "lucide-react";
import * as React from "react";
import { ApiError, orgApi } from "../../lib/api";
import { Button, Menu, toast } from "../ui";

export type ExportFormat = "docx" | "html" | "txt";

export function exportUrl(
  orgId: string,
  applicationId: string,
  opts: { format: ExportFormat; citations: boolean; versionId?: string | null },
): string {
  const q = new URLSearchParams({ format: opts.format, citations: opts.citations ? "1" : "0" });
  if (opts.versionId) q.set("versionId", opts.versionId);
  return orgApi(orgId, `/applications/${encodeURIComponent(applicationId)}/export?${q}`);
}

/** The filename from `Content-Disposition: attachment; filename="x.docx"`, or `fallback`. */
export function filenameFromDisposition(header: string | null, fallback: string): string {
  const m = /filename="([^"]+)"/.exec(header ?? "");
  return m?.[1] ?? fallback;
}

async function fetchExport(url: string): Promise<Response> {
  const res = await fetch(url, { credentials: "include" });
  if (res.ok) return res;
  let code = "http_error";
  let message = res.statusText || "Export failed";
  try {
    const body = (await res.json()) as { error?: { code?: string; message?: string } };
    code = body.error?.code ?? code;
    message = body.error?.message ?? message;
  } catch {
    // not JSON
  }
  throw new ApiError(res.status, code, message);
}

function downloadBlob(blob: Blob, filename: string) {
  const href = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = href;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(href), 10_000);
}

/** Prints a standalone HTML document without navigating away (the export has no scripts). */
function printHtml(html: string) {
  const frame = document.createElement("iframe");
  // allow-same-origin so we can call print() on it; no allow-scripts, so nothing in it can run.
  frame.setAttribute("sandbox", "allow-same-origin allow-modals");
  frame.setAttribute("aria-hidden", "true");
  frame.tabIndex = -1;
  Object.assign(frame.style, {
    position: "fixed",
    right: "0",
    bottom: "0",
    width: "0",
    height: "0",
    border: "0",
  });
  frame.onload = () => {
    frame.contentWindow?.focus();
    frame.contentWindow?.print();
    setTimeout(() => frame.remove(), 60_000);
  };
  frame.srcdoc = html;
  document.body.appendChild(frame);
}

/**
 * Copies the fetched text. ClipboardItem with a promise keeps the click's user activation across
 * the fetch (Safari requires it); otherwise fetch first and use writeText.
 */
async function copyFromUrl(url: string): Promise<void> {
  const clip = navigator.clipboard;
  if (!clip) throw new Error("Clipboard is not available in this browser");
  if (typeof ClipboardItem !== "undefined" && typeof clip.write === "function") {
    const blob = fetchExport(url)
      .then((r) => r.text())
      .then((t) => new Blob([t], { type: "text/plain" }));
    await clip.write([new ClipboardItem({ "text/plain": blob })]);
    return;
  }
  await clip.writeText(await (await fetchExport(url)).text());
}

export function ExportMenu({
  orgId,
  applicationId,
  versionId,
  className,
}: {
  orgId: string;
  applicationId: string;
  /** Export this version instead of the current one. */
  versionId?: string | null;
  className?: string;
}) {
  const [citations, setCitations] = React.useState(false);
  const [busy, setBusy] = React.useState<ExportFormat | null>(null);
  const url = (format: ExportFormat) =>
    exportUrl(orgId, applicationId, { format, citations, versionId });

  const run = (format: ExportFormat, action: () => Promise<void>) => {
    setBusy(format);
    action()
      .catch((e: unknown) => toast.error("Export failed", e))
      .finally(() => setBusy(null));
  };

  const word = () =>
    run("docx", async () => {
      const res = await fetchExport(url("docx"));
      const name = filenameFromDisposition(
        res.headers.get("Content-Disposition"),
        "application.docx",
      );
      downloadBlob(await res.blob(), name);
    });
  const print = () =>
    run("html", async () => {
      printHtml(await (await fetchExport(url("html"))).text());
    });
  const copy = () =>
    run("txt", async () => {
      try {
        await copyFromUrl(url("txt"));
        toast.success(
          "Copied for the funder portal",
          "Paste each section into the matching field.",
        );
      } catch (e) {
        if (e instanceof ApiError) throw e;
        // Clipboard blocked (permissions, insecure context): download the text instead.
        const res = await fetchExport(url("txt"));
        const name = filenameFromDisposition(
          res.headers.get("Content-Disposition"),
          "application.txt",
        );
        downloadBlob(await res.blob(), name);
        toast.info("Downloaded as a text file", "Your browser blocked clipboard access.");
      }
    });

  return (
    <Menu
      label="Export application"
      className={className}
      trigger={
        <Button variant="secondary" size="sm" loading={busy !== null}>
          {busy === null && <Download className="h-4 w-4" aria-hidden />}
          Export
          <ChevronDown className="h-4 w-4" aria-hidden />
        </Button>
      }
      items={[
        {
          label: "Word document (.docx)",
          icon: <FileText />,
          onSelect: word,
          disabled: busy !== null,
        },
        {
          label: "Print / Save as PDF",
          icon: <Printer />,
          onSelect: print,
          disabled: busy !== null,
        },
        {
          label: "Copy plain text for portal",
          icon: <ClipboardCopy />,
          onSelect: copy,
          disabled: busy !== null,
        },
        "separator",
        {
          label: citations ? "Citations included" : "Include citations",
          icon: <Quote />,
          selected: citations,
          onSelect: () => setCitations((v) => !v),
        },
      ]}
    />
  );
}
