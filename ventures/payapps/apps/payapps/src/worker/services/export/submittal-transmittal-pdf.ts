// The transmittal cover sheet that goes on top of a submittal to the GC (docs/SUBMITTALS.md): to and
// from, the job, what is enclosed, the action requested, when it is wanted back and why (the
// needed-on-site date and lead time), the revision it replaces, and a box for the reviewer's stamp.
// The files attached to the submittal (all but the stamped copy returned) are listed as enclosed.
// Our own layout and wording, not any published transmittal form. Nothing is printed that was not
// entered, apart from the date (the sent date, else the day it is printed) and the action requested
// (picked when printing; the type's default otherwise).

import { pmAttentionLine } from "@shared/change-order-email";
import {
  SUBMITTAL_ACTION_LABELS,
  SUBMITTAL_ACTIONS,
  SUBMITTAL_TYPE_LABELS,
  submittalLabel,
  TRANSMITTAL_REQUEST_LABELS,
  TRANSMITTAL_REQUESTS,
  type TransmittalRequest,
  transmittalReturnBy,
} from "@shared/submittals";
import type { SubmittalTransmittal } from "../payapps/submittals";
import { SAMPLE_SUBMITTAL_MARK } from "./model";
import { fitText, PdfDocument, type PdfPage, wrapText } from "./pdf";

const W = 612;
const H = 792;
const M = 40;
const FOOTER_TOP = H - 48;

export const TRANSMITTAL_NOTICE =
  "Prepared with PayApps from the submittal log as entered. Review of a submittal does not change " +
  "the contract documents; the reviewer's stamp and the contract govern what was approved.";

function labelValue(page: PdfPage, x: number, y: number, label: string, value: string, w: number) {
  page.text(x, y, label, { size: 7 });
  page.text(x, y + 11, fitText(value || "-", w, 9.5, "bold"), { size: 9.5, font: "bold" });
}

const box = (on: boolean) => (on ? "[X]" : "[ ]");

/** "transmittal-007-r1-mesa-clinic-ti.pdf" */
export function transmittalFileName(doc: Pick<SubmittalTransmittal, "project" | "submittal">) {
  const { number, revision } = doc.submittal;
  const slug = doc.project.name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  const base = `transmittal-${String(number).padStart(3, "0")}${revision > 0 ? `-r${revision}` : ""}`;
  return `${base}${slug ? `-${slug}` : ""}.pdf`;
}

export function transmittalPdf(
  doc: SubmittalTransmittal,
  opts: { today: string; requested: TransmittalRequest },
): Uint8Array {
  const { submittal: s, project, contractor, previous } = doc;
  const label = submittalLabel(s);
  const pdf = new PdfDocument({ title: `Transmittal: submittal ${label}, ${s.title}` });
  let page = pdf.addPage(W, H);
  const width = W - 2 * M;
  const heading = (p: PdfPage) => {
    if (project.isSample)
      p.text(W - M, 30, SAMPLE_SUBMITTAL_MARK, { size: 9, font: "bold", align: "right" });
  };
  heading(page);
  page.text(M, 46, "Submittal Transmittal", { size: 16, font: "bold" });
  page.text(M, 62, fitText(`Submittal ${label}: ${s.title}`, width, 10, "bold"), {
    size: 10,
    font: "bold",
  });

  const colW = width / 3;
  let y = 86;
  page.rect(M, y - 8, width, 96, { stroke: true });
  labelValue(page, M + 8, y, "To (general contractor)", project.gcName, colW - 16);
  const attn = pmAttentionLine(project);
  if (attn) page.text(M + 8, y + 21, fitText(attn, colW - 16, 7), { size: 7 });
  labelValue(page, M + 8 + colW, y, "From (contractor)", contractor.name, colW - 16);
  labelValue(page, M + 8 + 2 * colW, y, "Date", s.submittedOn ?? opts.today, colW - 16);
  y += 30;
  labelValue(
    page,
    M + 8,
    y,
    "Project",
    project.number ? `${project.name} (${project.number})` : project.name,
    colW - 16,
  );
  labelValue(page, M + 8 + colW, y, "Submittal no.", label, colW - 16);
  labelValue(page, M + 8 + 2 * colW, y, "GC's reference", s.gcReference ?? "", colW - 16);
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
  const para = (text: string, size = 9.5, font: "regular" | "bold" = "regular") => {
    for (const l of wrapText(text, width, size, font)) {
      ensure(14);
      y += 13;
      page.text(M, y, l, { size, font });
    }
  };

  // What is enclosed: this submittal, with its spec section, type and revision, then the files
  // attached to it, one line each.
  y = 204;
  page.text(M, y, "Enclosed", { size: 11, font: "bold" });
  y += 16;
  const [c0, c1, c2, c3] = [M + 4, M + 70, M + 180, M + 470] as const;
  page.rect(M, y - 10, width, 14, { fill: 0.92 });
  page.text(c0, y, "Spec section", { size: 7.5, font: "bold" });
  page.text(c1, y, "Type", { size: 7.5, font: "bold" });
  page.text(c2, y, "Description", { size: 7.5, font: "bold" });
  page.text(c3, y, "Revision", { size: 7.5, font: "bold" });
  y += 16;
  page.text(c0, y, fitText(s.specSection ?? "-", 66, 9.5), { size: 9.5 });
  page.text(c1, y, SUBMITTAL_TYPE_LABELS[s.type], { size: 9.5 });
  page.text(c2, y, fitText(s.title, c3 - c2 - 8, 9.5), { size: 9.5 });
  page.text(c3, y, s.revision > 0 ? `Rev ${s.revision}` : "Original", { size: 9.5 });
  page.line(M, y + 6, W - M, y + 6, 0.3);
  if (doc.enclosures.length) {
    y += 20;
    page.text(c0, y, `Files enclosed (${doc.enclosures.length})`, { size: 7.5, font: "bold" });
    doc.enclosures.forEach((f, i) => {
      ensure(13);
      y += 13;
      page.text(c0, y, `${i + 1}.`, { size: 9 });
      page.text(c0 + 18, y, fitText(f.kind, c2 - c0 - 26, 9), { size: 9 });
      page.text(c2, y, fitText(f.fileName, W - M - c2, 9), { size: 9 });
    });
  }

  y += 30;
  ensure(40);
  page.text(M, y, "Action requested", { size: 11, font: "bold" });
  y += 16;
  page.text(
    M + 6,
    y,
    TRANSMITTAL_REQUESTS.map(
      (r) => `${box(r === opts.requested)} ${TRANSMITTAL_REQUEST_LABELS[r]}`,
    ).join("     "),
    { size: 9.5 },
  );

  const returnBy = transmittalReturnBy(s);
  const schedule: string[] = [];
  if (returnBy) schedule.push(`Please return by ${returnBy}.`);
  if (s.neededOnSite) {
    schedule.push(
      s.leadTimeDays !== null
        ? `Material is needed on site by ${s.neededOnSite}; fabrication and delivery take ${s.leadTimeDays} calendar days after approval.`
        : `Material is needed on site by ${s.neededOnSite}.`,
    );
  } else if (s.leadTimeDays !== null) {
    schedule.push(`Fabrication and delivery take ${s.leadTimeDays} calendar days after approval.`);
  }
  if (schedule.length) {
    y += 14;
    for (const line of schedule) para(line, 9.5, "bold");
  }

  if (previous) {
    y += 26;
    ensure(32);
    page.text(M, y, "Resubmittal", { size: 11, font: "bold" });
    y += 2;
    const back = previous.action
      ? `, returned ${SUBMITTAL_ACTION_LABELS[previous.action].toLowerCase()}${previous.returnedOn ? ` on ${previous.returnedOn}` : ""}`
      : "";
    para(`This revision replaces ${submittalLabel(previous)}${back}.`);
  }

  if (s.notes?.trim()) {
    y += 26;
    ensure(32);
    page.text(M, y, "Remarks", { size: 11, font: "bold" });
    y += 2;
    for (const p of s.notes.split(/\r?\n/)) {
      if (p.trim()) para(p);
      else y += 13;
    }
  }

  // The reviewer's stamp: what came back when it is on the log, else boxes to tick.
  y += 26;
  ensure(150);
  page.text(M, y, "Review (general contractor or design team)", { size: 11, font: "bold" });
  y += 8;
  if (s.returnedOn && s.action) {
    y += 13;
    page.text(M + 6, y, `Returned ${s.returnedOn}: ${SUBMITTAL_ACTION_LABELS[s.action]}`, {
      size: 9.5,
      font: "bold",
    });
  } else {
    page.rect(M, y, width, 100, { stroke: true });
    let ty = y + 18;
    const half = SUBMITTAL_ACTIONS.length / 2;
    SUBMITTAL_ACTIONS.forEach((a, i) => {
      const col = i < half ? 0 : 1;
      if (i === Math.ceil(half)) ty = y + 18;
      page.text(M + 12 + col * (width / 2), ty, `[ ] ${SUBMITTAL_ACTION_LABELS[a]}`, {
        size: 9.5,
      });
      ty += 16;
    });
    y += 120;
    page.text(M, y, "Reviewed by: _____________________________   Date: ____________", {
      size: 9.5,
    });
  }

  y += 30;
  ensure(30);
  page.text(M, y, "Sent by: _____________________________   Date: ____________", {
    size: 9.5,
  });

  pdf.pages.forEach((p, i) => {
    const fy = H - 24;
    p.line(M, fy - 12, W - M, fy - 12, 0.3);
    wrapText(TRANSMITTAL_NOTICE, width - 120, 6.5).forEach((l, j) => {
      p.text(M, fy - 2 + j * 8, l, { size: 6.5 });
    });
    p.text(W - M, fy - 2, `Transmittal ${label} - page ${i + 1}/${pdf.pages.length}`, {
      size: 6.5,
      align: "right",
    });
  });
  return pdf.toBytes();
}
