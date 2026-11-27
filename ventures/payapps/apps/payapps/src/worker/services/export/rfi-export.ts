// The RFI as a PDF to send the GC (parties, the question, the proposed solution, cost and time
// impact, and the response: printed when answered, else a blank box for the GC to fill in), and the
// job's RFI log as CSV. Our own layout and wording, not any published RFI form. Nothing is added
// that was not entered: an unstated impact prints as "not stated".

import type { RfiLogDto } from "@shared/api/types";
import { pmAttentionLine } from "@shared/change-order-email";
import { impactText, RFI_IMPACT_LABELS, RFI_STATUS_LABELS, rfiLabel } from "@shared/rfi";
import type { RfiDocument } from "../payapps/rfis";
import { csvCell } from "./csv";
import { SAMPLE_RFI_MARK } from "./model";
import { fitText, PdfDocument, type PdfPage, wrapText } from "./pdf";

const W = 612;
const H = 792;
const M = 40;
const FOOTER_TOP = H - 48;

export const RFI_NOTICE =
  "Prepared with PayApps from the RFI as entered. A response on this form does not by itself " +
  "change the contract sum or the contract time; a change in either needs a change order.";

function labelValue(page: PdfPage, x: number, y: number, label: string, value: string, w: number) {
  page.text(x, y, label, { size: 7 });
  page.text(x, y + 11, fitText(value || "-", w, 9.5, "bold"), { size: 9.5, font: "bold" });
}

const slugOf = (name: string) =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
const withSlug = (base: string, name: string, ext: string) => {
  const slug = slugOf(name);
  return `${base}${slug ? `-${slug}` : ""}.${ext}`;
};

/** "rfi-003-riverside-clinic.pdf" */
export function rfiFileName(doc: Pick<RfiDocument, "project" | "rfi">): string {
  return withSlug(`rfi-${String(doc.rfi.number).padStart(3, "0")}`, doc.project.name, "pdf");
}

/** "rfi-log-riverside-clinic.csv" */
export function rfiLogFileName(project: { name: string }): string {
  return withSlug("rfi-log", project.name, "csv");
}

export function rfiPdf(doc: RfiDocument): Uint8Array {
  const { rfi, project, contractor } = doc;
  const title = `Request for Information ${rfiLabel(rfi.number).replace("RFI ", "No. ")}`;
  const pdf = new PdfDocument({ title: `${rfiLabel(rfi.number)}: ${rfi.subject}` });
  let page = pdf.addPage(W, H);
  const width = W - 2 * M;
  const heading = (p: PdfPage) => {
    if (project.isSample)
      p.text(W - M, 30, SAMPLE_RFI_MARK, { size: 9, font: "bold", align: "right" });
  };
  heading(page);
  page.text(M, 46, title, { size: 16, font: "bold" });
  page.text(M, 62, fitText(rfi.subject, width, 10, "bold"), { size: 10, font: "bold" });

  const colW = width / 3;
  let y = 86;
  page.rect(M, y - 8, width, 96, { stroke: true });
  labelValue(page, M + 8, y, "To (general contractor)", project.gcName, colW - 16);
  const attn = pmAttentionLine(project);
  if (attn) page.text(M + 8, y + 21, fitText(attn, colW - 16, 7), { size: 7 });
  labelValue(page, M + 8 + colW, y, "From (contractor)", contractor.name, colW - 16);
  labelValue(page, M + 8 + 2 * colW, y, "RFI no.", String(rfi.number), colW - 16);
  y += 30;
  labelValue(
    page,
    M + 8,
    y,
    "Project",
    project.number ? `${project.name} (${project.number})` : project.name,
    colW - 16,
  );
  labelValue(page, M + 8 + colW, y, "Date sent", rfi.sentOn ?? "", colW - 16);
  labelValue(
    page,
    M + 8 + 2 * colW,
    y,
    "Response requested by",
    rfi.responseDueOn ?? "",
    colW - 16,
  );
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
  const block = (head: string, body: string) => {
    y += 26;
    ensure(32);
    page.text(M, y, head, { size: 11, font: "bold" });
    y += 2;
    for (const para of body.split(/\r?\n/)) {
      const lines = para.trim() ? wrapText(para, width, 9.5) : [""];
      for (const l of lines) {
        ensure(14);
        y += 13;
        page.text(M, y, l, { size: 9.5 });
      }
    }
  };

  y = 204;
  if (rfi.reference) {
    page.text(M, y, `Reference: ${fitText(rfi.reference, width - 60, 9.5)}`, { size: 9.5 });
    y += 4;
  } else {
    y -= 10;
  }
  block("Question", rfi.question);
  if (rfi.suggestion) block("Proposed solution", rfi.suggestion);

  // Files sent with it (marked-up sheets, photos): the names, so the GC can tell whether all came.
  const { attached } = doc;
  if (attached.length > 0) {
    y += 26;
    ensure(30);
    page.text(M, y, "Attached", { size: 11, font: "bold" });
    y += 2;
    attached.forEach((f, i) => {
      ensure(14);
      y += 13;
      page.text(M + 6, y, `${i + 1}.`, { size: 9 });
      page.text(M + 24, y, fitText(f.fileName, width - 200, 9), { size: 9 });
      page.text(W - M - 8, y, f.kind, { size: 8, align: "right" });
    });
  }

  y += 26;
  ensure(44);
  page.text(M, y, "Impact", { size: 11, font: "bold" });
  y += 15;
  page.text(M + 6, y, impactText("Cost", rfi.costImpact), { size: 9.5 });
  y += 13;
  page.text(M + 6, y, impactText("Time", rfi.timeImpact), { size: 9.5 });

  if (rfi.answeredOn) {
    block("Response", rfi.answer ?? "(answer not entered here)");
    y += 18;
    ensure(16);
    const by = [rfi.answeredBy, rfi.answeredOn].filter(Boolean).join(", ");
    page.text(M, y, `Answered: ${by}`, { size: 9.5, font: "bold" });
    if (rfi.changeOrderNumber) {
      y += 14;
      ensure(14);
      page.text(M, y, `Priced by change order ${rfi.changeOrderNumber}`, { size: 9.5 });
    }
  } else {
    // A box for the GC's (or design team's) response, and who gave it.
    y += 26;
    ensure(190);
    page.text(M, y, "Response (general contractor or design team)", { size: 11, font: "bold" });
    y += 8;
    page.rect(M, y, width, 120, { stroke: true });
    for (let i = 1; i < 6; i++) page.line(M + 8, y + i * 20, W - M - 8, y + i * 20, 0.2);
    y += 140;
    page.text(M, y, "Responded by: _____________________________   Date: ____________", {
      size: 9.5,
    });
    y += 18;
    page.text(M, y, "Cost impact:  [ ] none   [ ] yes        Time impact:  [ ] none   [ ] yes", {
      size: 9.5,
    });
  }

  pdf.pages.forEach((p, i) => {
    const fy = H - 24;
    p.line(M, fy - 12, W - M, fy - 12, 0.3);
    wrapText(RFI_NOTICE, width - 120, 6.5).forEach((l, j) => {
      p.text(M, fy - 2 + j * 8, l, { size: 6.5 });
    });
    p.text(W - M, fy - 2, `${rfiLabel(rfi.number)} - page ${i + 1}/${pdf.pages.length}`, {
      size: 6.5,
      align: "right",
    });
  });
  return pdf.toBytes();
}

const RFI_CSV_HEADER = [
  "RFI",
  "Subject",
  "Status",
  "Reference",
  "Date sent",
  "Response due",
  "Date answered",
  "Days outstanding",
  "Days overdue",
  "Answered by",
  "Cost impact",
  "Time impact",
  "Change order",
  "Needs a change order",
  "Question",
  "Proposed solution",
  "Answer",
];

/** One row per RFI, in number order; a spreadsheet formula in any text cell is neutralised. */
export function rfiLogCsv(log: RfiLogDto): string {
  const rows = [RFI_CSV_HEADER.map(csvCell).join(",")];
  for (const r of log.items) {
    rows.push(
      [
        r.number,
        r.subject,
        RFI_STATUS_LABELS[r.status],
        r.reference,
        r.sentOn,
        r.responseDueOn,
        r.answeredOn,
        r.daysOutstanding,
        r.daysOverdue || null,
        r.answeredBy,
        r.costImpact ? RFI_IMPACT_LABELS[r.costImpact] : null,
        r.timeImpact ? RFI_IMPACT_LABELS[r.timeImpact] : null,
        r.changeOrderNumber,
        r.needsChangeOrder ? "Yes" : null,
        r.question,
        r.suggestion,
        r.answer,
      ]
        .map(csvCell)
        .join(","),
    );
  }
  return `${rows.join("\r\n")}\r\n`;
}
