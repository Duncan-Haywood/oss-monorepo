// A packet: one PDF that starts with a document PayApps made (the pay application, or a change
// order request), then an index page, then the backup files as uploaded: PDFs page for page and
// photos one to a page, every page stamped "<label> - page x of N". Files that cannot go in (a
// spreadsheet, an iPhone HEIC photo, a PDF that needs a password to open) are listed on the index with the reason, so
// the GC knows what is coming separately. Pure apart from the files' loaders.
import { formatBytes, packetTypeProblem } from "@shared/attachments";
import { concatBytes } from "@shared/pdf/filters";
import { PdfReader, PdfUnreadable } from "@shared/pdf/reader";
import { fitText, PdfDocument, wrapText } from "../pdf";
import { ImageUnreadable, type PdfImage, readJpeg, readPng } from "./images";
import { PacketWriter } from "./writer";

/** Most file bytes one packet reads, to stay well inside a Worker's memory. */
export const MAX_PACKET_INPUT_BYTES = 40 * 1024 * 1024;

export interface PacketFile {
  id: string;
  name: string;
  /** "Backup", "Job photo" and so on, printed on the index. */
  kind: string;
  contentType: string;
  sizeBytes: number;
  /** The file's bytes, or null when the stored object is missing. */
  load: () => Promise<Uint8Array | null>;
}

export interface PacketInput {
  /** The document PayApps made, as PDF bytes; it comes first. */
  lead: Uint8Array;
  files: PacketFile[];
  /** Stamped on every page, e.g. "Application #7". */
  label: string;
  title: string;
  /** What the lead document is, for the index: "the application", "the change order request". */
  leadName: string;
  /** Index heading and the lines under it (job, GC, period). */
  heading: string;
  details: string[];
}

export interface PacketEntry {
  id: string;
  name: string;
  kind: string;
  firstPage: number;
  pages: number;
}

export interface PacketSkip {
  id: string;
  name: string;
  kind: string;
  reason: string;
}

export interface PacketResult {
  chunks: Uint8Array[];
  length: number;
  pages: number;
  included: PacketEntry[];
  skipped: PacketSkip[];
}

type Prepared =
  | { file: PacketFile; kind: "pdf"; reader: PdfReader; pages: number }
  | { file: PacketFile; kind: "image"; image: PdfImage; pages: 1 };

async function prepare(file: PacketFile): Promise<Prepared | string> {
  const bytes = await file.load();
  if (!bytes) return "The stored file is missing. Upload it again.";
  try {
    if (file.contentType === "application/pdf") {
      const reader = await PdfReader.open(bytes);
      return { file, kind: "pdf", reader, pages: reader.pages().length };
    }
    const image = file.contentType === "image/png" ? await readPng(bytes) : readJpeg(bytes);
    return { file, kind: "image", image, pages: 1 };
  } catch (e) {
    if (e instanceof PdfUnreadable) {
      const advice = /password|encrypt/.test(e.message)
        ? " Open it (with its password, if it asks for one) and print it to a new PDF (Microsoft Print to PDF, or Save as PDF on a Mac), then attach that copy."
        : " Send it separately, or print it to a new PDF and attach that.";
      const subject = e.message.startsWith("is not a PDF") ? "This file" : "This PDF";
      return `${subject} ${e.message}.${advice}`;
    }
    if (e instanceof ImageUnreadable) return `This image ${e.message}.`;
    return "The file could not be read. Send it separately, or save it again as PDF and attach that.";
  }
}

const pageRange = (first: number, n: number) =>
  n === 1 ? `${first}` : `${first}-${first + n - 1}`;

function indexPdf(
  input: PacketInput,
  leadPages: number,
  indexPages: number,
  prepared: Prepared[],
  skipped: PacketSkip[],
): { bytes: Uint8Array; entries: PacketEntry[] } {
  const doc = new PdfDocument({ title: `${input.title} - index` });
  const M = 48;
  const W = 612;
  let page = doc.addPage();
  let y = 60;
  const ensure = (h: number) => {
    if (y + h > 792 - 50) {
      page = doc.addPage();
      y = 60;
    }
  };
  page.text(M, y, input.heading, { size: 15, font: "bold" });
  y += 20;
  for (const d of input.details) {
    page.text(M, y, fitText(d, W - 2 * M, 9.5), { size: 9.5 });
    y += 13;
  }
  const filePages = prepared.reduce((s, p) => s + p.pages, 0);
  const total = leadPages + indexPages + filePages;
  y += 6;
  const summary =
    `This PDF holds ${input.leadName} ` +
    `(page${leadPages === 1 ? "" : "s"} ${pageRange(1, leadPages)}), this index and ` +
    `${prepared.length} backup file${prepared.length === 1 ? "" : "s"}: ${total} pages in all. ` +
    "Each file is reproduced as it was uploaded.";
  for (const l of wrapText(summary, W - 2 * M, 9.5)) {
    page.text(M, y, l, { size: 9.5 });
    y += 13;
  }
  y += 10;
  const entries: PacketEntry[] = [];
  let next = leadPages + indexPages + 1;
  const cols = { n: M, name: M + 24, kind: M + 330, pages: W - M };
  const header = () => {
    page.rect(M, y - 10, W - 2 * M, 16, { fill: 0.92, stroke: false });
    page.text(cols.n, y + 2, "#", { size: 8, font: "bold" });
    page.text(cols.name, y + 2, "File", { size: 8, font: "bold" });
    page.text(cols.kind, y + 2, "Kind", { size: 8, font: "bold" });
    page.text(cols.pages, y + 2, "Pages", { size: 8, font: "bold", align: "right" });
    y += 18;
  };
  if (prepared.length) {
    header();
    prepared.forEach((p, i) => {
      if (y + 14 > 792 - 50) {
        page = doc.addPage();
        y = 60;
        header();
      }
      entries.push({
        id: p.file.id,
        name: p.file.name,
        kind: p.file.kind,
        firstPage: next,
        pages: p.pages,
      });
      page.text(cols.n, y, String(i + 1), { size: 9 });
      page.text(cols.name, y, fitText(p.file.name, cols.kind - cols.name - 10, 9), { size: 9 });
      page.text(cols.kind, y, fitText(p.file.kind, cols.pages - cols.kind - 60, 9), { size: 9 });
      page.text(cols.pages, y, pageRange(next, p.pages), { size: 9, align: "right" });
      page.line(M, y + 4, W - M, y + 4, 0.2);
      y += 14;
      next += p.pages;
    });
  } else {
    page.text(M, y, "No backup files are included in this PDF.", { size: 9.5 });
    y += 14;
  }
  if (skipped.length) {
    y += 14;
    ensure(30);
    page.text(M, y, "Not in this PDF (sent separately)", { size: 11, font: "bold" });
    y += 16;
    for (const s of skipped) {
      const lines = wrapText(s.reason, W - 2 * M - 12, 8.5);
      ensure(14 + lines.length * 11);
      page.text(M, y, fitText(`${s.name} (${s.kind})`, W - 2 * M, 9.5, "bold"), {
        size: 9.5,
        font: "bold",
      });
      y += 12;
      for (const l of lines) {
        page.text(M + 12, y, l, { size: 8.5 });
        y += 11;
      }
      y += 4;
    }
  }
  return { bytes: doc.toBytes(), entries };
}

/** Builds the packet. Throws only if PayApps' own lead document cannot be read. */
export async function assemblePacket(input: PacketInput): Promise<PacketResult> {
  const skipped: PacketSkip[] = [];
  const prepared: Prepared[] = [];
  let budget = MAX_PACKET_INPUT_BYTES;
  for (const file of input.files) {
    const skip = (reason: string) =>
      skipped.push({ id: file.id, name: file.name, kind: file.kind, reason });
    const typeProblem = packetTypeProblem(file.contentType);
    if (typeProblem) {
      skip(typeProblem);
      continue;
    }
    if (file.sizeBytes > budget) {
      skip(
        `The packet reads at most ${formatBytes(MAX_PACKET_INPUT_BYTES)} of files and this one would pass that. Send it separately or leave out larger files.`,
      );
      continue;
    }
    const p = await prepare(file);
    if (typeof p === "string") skip(p);
    else {
      prepared.push(p);
      budget -= file.sizeBytes;
    }
  }

  const lead = await PdfReader.open(input.lead);
  const leadPages = lead.pages().length;
  // The index lists page numbers that depend on its own length: settle it in a pass or two.
  let indexPages = 1;
  let index = indexPdf(input, leadPages, indexPages, prepared, skipped);
  let indexReader = await PdfReader.open(index.bytes);
  for (let tries = 0; tries < 3 && indexReader.pages().length !== indexPages; tries++) {
    indexPages = indexReader.pages().length;
    index = indexPdf(input, leadPages, indexPages, prepared, skipped);
    indexReader = await PdfReader.open(index.bytes);
  }

  const w = new PacketWriter();
  w.addPdf(lead);
  w.addPdf(indexReader);
  for (const p of prepared) {
    if (p.kind === "pdf") w.addPdf(p.reader);
    else w.addImagePage(p.image, `${p.file.kind}: ${p.file.name}`);
  }
  const pages = w.pageCount;
  const out = w.finish({ title: input.title, label: input.label });
  return { ...out, pages, included: index.entries, skipped };
}

/** The whole packet as one byte array (tests and small callers). */
export const packetBytes = (r: PacketResult) => concatBytes(r.chunks);
