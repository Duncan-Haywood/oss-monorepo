// The transmittal on top of the close-out binder (docs/CLOSEOUT.md): to and from, the job, and every
// document on the checklist with its kind, where it is required, and the dates due, sent and
// accepted, or "not required" with the reason; then the files enclosed behind it, grouped by
// document. Our own layout and wording, not any published transmittal form. Nothing is printed that
// was not entered, apart from the date (the day it is printed). It lists what is enclosed; it never
// says the subcontract's close-out conditions are met.
import { pmAttentionLine } from "@shared/change-order-email";
import { CLOSEOUT_KIND_LABELS, CLOSEOUT_STATUS_LABELS } from "@shared/closeout";
import type { CloseoutBinder } from "../payapps/closeout";
import { SAMPLE_CLOSEOUT_MARK } from "./model";
import { fitText, PdfDocument, type PdfPage, wrapText } from "./pdf";

const W = 612;
const H = 792;
const M = 40;
const FOOTER_TOP = H - 48;

export const CLOSEOUT_TRANSMITTAL_NOTICE =
  "Prepared with PayApps from the close-out checklist as entered. It lists the documents enclosed " +
  "and their dates; the subcontract and the GC's acceptance govern whether close-out is complete.";

function labelValue(page: PdfPage, x: number, y: number, label: string, value: string, w: number) {
  page.text(x, y, label, { size: 7 });
  page.text(x, y + 11, fitText(value || "-", w, 9.5, "bold"), { size: 9.5, font: "bold" });
}

const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);

/** "closeout-mesa-clinic-ti.pdf" */
export function closeoutTransmittalFileName(doc: Pick<CloseoutBinder, "project">) {
  const s = slug(doc.project.name);
  return `closeout${s ? `-${s}` : ""}.pdf`;
}

/** The dates column for one document: what was entered, in order. */
export function closeoutDates(it: CloseoutBinder["items"][number]): string {
  if (it.waivedNote) return `Not required: ${it.waivedNote}`;
  const parts: string[] = [];
  if (it.dueOn) parts.push(`due ${it.dueOn}`);
  if (it.sentOn) parts.push(`sent ${it.sentOn}`);
  if (it.acceptedOn)
    parts.push(`accepted ${it.acceptedOn}${it.acceptedBy ? ` (${it.acceptedBy})` : ""}`);
  return parts.join(", ") || "-";
}

export function closeoutTransmittalPdf(doc: CloseoutBinder): Uint8Array {
  const { project, contractor } = doc;
  const jobName = project.number ? `${project.name} (${project.number})` : project.name;
  const pdf = new PdfDocument({ title: `Close-out transmittal: ${project.name}` });
  let page = pdf.addPage(W, H);
  const width = W - 2 * M;
  const heading = (p: PdfPage) => {
    if (project.isSample)
      p.text(W - M, 30, SAMPLE_CLOSEOUT_MARK, { size: 9, font: "bold", align: "right" });
  };
  heading(page);
  page.text(M, 46, "Close-out Transmittal", { size: 16, font: "bold" });
  page.text(M, 62, fitText(jobName, width, 10, "bold"), { size: 10, font: "bold" });

  const colW = width / 3;
  let y = 86;
  page.rect(M, y - 8, width, 66, { stroke: true });
  labelValue(page, M + 8, y, "To (general contractor)", project.gcName, colW - 16);
  const attn = pmAttentionLine(project);
  if (attn) page.text(M + 8, y + 21, fitText(attn, colW - 16, 7), { size: 7 });
  labelValue(page, M + 8 + colW, y, "From (contractor)", contractor.name, colW - 16);
  labelValue(page, M + 8 + 2 * colW, y, "Date", doc.today, colW - 16);
  y += 30;
  labelValue(page, M + 8, y, "Location", project.location ?? "", colW - 16);
  labelValue(page, M + 8 + colW, y, "Owner", project.ownerName ?? "", colW - 16);
  labelValue(page, M + 8 + 2 * colW, y, "Architect", project.architectName ?? "", colW - 16);

  const newPage = () => {
    page = pdf.addPage(W, H);
    heading(page);
    y = 54;
  };
  const ensure = (h: number) => {
    if (y + h > FOOTER_TOP - 10) newPage();
  };

  // The checklist: one row per document, numbered so the files below can point back to it.
  y = 176;
  page.text(M, y, "Close-out documents", { size: 11, font: "bold" });
  y += 16;
  const [c0, c1, c2, c3, c4] = [M + 4, M + 24, M + 214, M + 318, W - M - 4] as const;
  const header = () => {
    page.rect(M, y - 10, width, 14, { fill: 0.92 });
    page.text(c0, y, "#", { size: 7.5, font: "bold" });
    page.text(c1, y, "Document", { size: 7.5, font: "bold" });
    page.text(c2, y, "Required by", { size: 7.5, font: "bold" });
    page.text(c3, y, "Status and dates", { size: 7.5, font: "bold" });
    page.text(c4, y, "Files", { size: 7.5, font: "bold", align: "right" });
  };
  header();
  if (doc.items.length === 0) {
    y += 16;
    page.text(c1, y, "No close-out documents are on the checklist.", { size: 9.5 });
  }
  const enclosed = new Map<string, number>();
  for (const f of doc.files) enclosed.set(f.itemId, (enclosed.get(f.itemId) ?? 0) + 1);
  doc.items.forEach((it, i) => {
    // A document not required says so with its reason; the others give their status, then dates.
    const line = it.waivedNote
      ? closeoutDates(it)
      : `${CLOSEOUT_STATUS_LABELS[it.status]}. ${closeoutDates(it)}`;
    const dates = wrapText(line, c4 - c3 - 30, 8.5);
    const h = 13 + Math.max(dates.length, 2) * 10;
    if (y + h > FOOTER_TOP - 10) {
      newPage();
      header();
    }
    y += 14;
    page.text(c0, y, `${i + 1}.`, { size: 9 });
    page.text(c1, y, fitText(it.title, c2 - c1 - 8, 9, "bold"), { size: 9, font: "bold" });
    page.text(c1, y + 10, fitText(CLOSEOUT_KIND_LABELS[it.kind], c2 - c1 - 8, 7.5), { size: 7.5 });
    page.text(c2, y, fitText(it.requiredBy ?? "-", c3 - c2 - 8, 8.5), { size: 8.5 });
    dates.forEach((l, j) => {
      page.text(c3, y + j * 10, l, { size: 8.5 });
    });
    page.text(c4, y, String(enclosed.get(it.id) ?? 0), { size: 9, align: "right" });
    y += Math.max(dates.length, 2) * 10 - 4;
    page.line(M, y, W - M, y, 0.3);
  });

  // The files behind this sheet, in the order they follow it.
  if (doc.files.length) {
    y += 26;
    ensure(40);
    page.text(M, y, `Enclosed (${doc.files.length} file${doc.files.length === 1 ? "" : "s"})`, {
      size: 11,
      font: "bold",
    });
    const number = new Map(doc.items.map((it, i) => [it.id, i + 1]));
    doc.files.forEach((f, i) => {
      ensure(13);
      y += 13;
      page.text(c0, y, `${i + 1}.`, { size: 9 });
      page.text(
        c1,
        y,
        fitText(`Document ${number.get(f.itemId) ?? "?"} - ${f.kind}`, c3 - c1 - 8, 9),
        {
          size: 9,
        },
      );
      page.text(c3, y, fitText(f.fileName, W - M - c3, 9), { size: 9 });
    });
  } else {
    y += 26;
    ensure(30);
    page.text(M, y, "No files are kept with these documents yet; they are sent separately.", {
      size: 9.5,
    });
  }

  y += 36;
  ensure(60);
  page.text(M, y, "Received by: _____________________________   Date: ____________", {
    size: 9.5,
  });
  y += 24;
  page.text(M, y, "Sent by: _____________________________   Date: ____________", { size: 9.5 });

  pdf.pages.forEach((p, i) => {
    const fy = H - 24;
    p.line(M, fy - 12, W - M, fy - 12, 0.3);
    wrapText(CLOSEOUT_TRANSMITTAL_NOTICE, width - 120, 6.5).forEach((l, j) => {
      p.text(M, fy - 2 + j * 8, l, { size: 6.5 });
    });
    p.text(W - M, fy - 2, `Close-out transmittal - page ${i + 1}/${pdf.pages.length}`, {
      size: 6.5,
      align: "right",
    });
  });
  return pdf.toBytes();
}
