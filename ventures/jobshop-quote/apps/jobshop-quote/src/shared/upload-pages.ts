// How many drawing pages a set of files about to be uploaded comes to, and how many RFQs of the
// month's allowance reading them will use (docs/BILLING.md, "What a page is"). The worker counts the
// stored files with `filePages` after upload; the New RFQ form runs the same rule on the files the
// estimator picked, in the browser, so it can say before submit that a package is bigger than what
// is left (ROADMAP item 4). The worker's count stays the one that is charged.
import { isCadFile } from "./geometry";
import { countPdfPages, filePages, rfqUnitsForPages } from "./pdf-pages";

/** The stored media type of an upload: the browser's type, else from the name (.pdf, .txt). */
export function uploadMimeType(name: string, type: string): string {
  const mime = type.split(";")[0]?.trim().toLowerCase() ?? "";
  if (mime && mime !== "application/octet-stream") return mime;
  const lower = name.toLowerCase();
  if (lower.endsWith(".pdf")) return "application/pdf";
  if (lower.endsWith(".txt")) return "text/plain";
  return mime || "application/octet-stream";
}

export interface PendingUpload {
  name: string;
  type: string;
  /** Read only for PDFs; an image, text or CAD file is counted from its name and type alone. */
  bytes: () => Promise<ArrayBuffer>;
}

export interface PackageCount {
  /** Drawing pages: each PDF's page tree (one when unreadable), images one each, others none. */
  pages: number;
  /** RFQs of the allowance the first read uses: one per 10 pages, at least one. */
  units: number;
}

/** The page count and allowance units of files not yet uploaded, by the worker's own rule. */
export async function countPackage(files: PendingUpload[]): Promise<PackageCount> {
  let pages = 0;
  for (const f of files) {
    const mimeType = uploadMimeType(f.name, f.type);
    const isCad = isCadFile(f.name);
    let pageCount: number | null = null;
    if (!isCad && mimeType === "application/pdf") {
      try {
        pageCount = await countPdfPages(new Uint8Array(await f.bytes()));
      } catch {
        pageCount = null; // unreadable here: counted as one page, as the worker does
      }
    }
    pages += filePages({ mimeType, pageCount, isCad });
  }
  return { pages, units: rfqUnitsForPages(pages) };
}
