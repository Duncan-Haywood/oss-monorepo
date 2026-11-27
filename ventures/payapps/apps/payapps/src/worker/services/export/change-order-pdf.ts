// PDF of a change order request to send the GC: parties, the scope in the contractor's words, the
// price by schedule-of-values line, the contract sum before and after, and blocks for both
// signatures. Our own layout and wording (not an AIA G701 or any other published form). A pending
// change order prints as a request; an approved one prints with its approval date; a rejected one
// carries a banner. Built from the pure model in @shared/change-order-request.
import { pmAttentionLine } from "@shared/change-order-email";
import { type ChangeOrderRequestData, scheduleText } from "@shared/change-order-request";
import { fmtAmount, SAMPLE_CHANGE_ORDER_MARK } from "./model";
import { fitText, PdfDocument, type PdfPage, wrapText } from "./pdf";

const W = 612;
const H = 792;
const M = 40;
const FOOTER_TOP = H - 48;

export const CHANGE_ORDER_NOTICE =
  "Prepared with PayApps from the change order as entered. Not an AIA document. Check the scope " +
  "and every amount against the subcontract before sending; this form changes nothing until both " +
  "parties sign it.";

/** "$1,234.56", or "($1,234.56)" for a deduction. */
const usd = (cents: number) => (cents < 0 ? `($${fmtAmount(-cents)})` : `$${fmtAmount(cents)}`);

function labelValue(page: PdfPage, x: number, y: number, label: string, value: string, w: number) {
  page.text(x, y, label, { size: 7 });
  page.text(x, y + 11, fitText(value || "-", w, 9.5, "bold"), { size: 9.5, font: "bold" });
}

export function changeOrderPdf(data: ChangeOrderRequestData): Uint8Array {
  const { changeOrder: co, project, contractor } = data;
  const title =
    co.status === "approved" ? `Change Order ${co.number}` : `Change Order Request ${co.number}`;
  const pdf = new PdfDocument({ title });
  let page = pdf.addPage(W, H);
  const width = W - 2 * M;

  const heading = (p: PdfPage) => {
    const marks = [
      project.sample ? SAMPLE_CHANGE_ORDER_MARK : null,
      co.status === "rejected" ? "REJECTED BY THE GC - FOR RECORDS ONLY" : null,
    ].filter(Boolean);
    if (!marks.length) return;
    p.text(W - M, 30, marks.join("  |  "), { size: 9, font: "bold", align: "right" });
  };
  heading(page);
  page.text(M, 46, title, { size: 16, font: "bold" });
  page.text(
    M,
    62,
    co.status === "approved"
      ? `Approved ${co.approvedOn ?? ""}`.trim()
      : "A request to change the contract sum for the work described below",
    { size: 8.5 },
  );

  // Parties, job and dates.
  const colW = width / 3;
  let y = 84;
  page.rect(M, y - 8, width, 96, { stroke: true });
  labelValue(page, M + 8, y, "To (general contractor)", project.gcName, colW - 16);
  // A change order request goes to the GC's project manager, not the billing contact.
  const attn = pmAttentionLine(project);
  if (attn) page.text(M + 8, y + 21, fitText(attn, colW - 16, 7), { size: 7 });
  labelValue(page, M + 8 + colW, y, "From (contractor)", contractor.name, colW - 16);
  labelValue(page, M + 8 + 2 * colW, y, "Change order no.", co.number, colW - 16);
  y += 30;
  labelValue(
    page,
    M + 8,
    y,
    "Project",
    project.number ? `${project.name} (${project.number})` : project.name,
    colW - 16,
  );
  labelValue(page, M + 8 + colW, y, "Owner", project.ownerName ?? "", colW - 16);
  labelValue(page, M + 8 + 2 * colW, y, "Date", data.date, colW - 16);
  y += 30;
  labelValue(page, M + 8, y, "Location", project.location ?? "", colW - 16);
  labelValue(page, M + 8 + colW, y, "GC address", project.gcAddress ?? "", colW - 16);
  labelValue(page, M + 8 + 2 * colW, y, "Contract date", project.contractDate ?? "", colW - 16);

  const newPage = () => {
    page = pdf.addPage(W, H);
    heading(page);
    y = 54;
  };
  const ensure = (h: number) => {
    if (y + h > FOOTER_TOP - 10) newPage();
  };

  // Scope, in the contractor's words.
  y = 202;
  page.text(M, y, "Description of the change", { size: 11, font: "bold" });
  y += 6;
  for (const l of wrapText(co.description, width, 9.5)) {
    ensure(14);
    y += 13;
    page.text(M, y, l, { size: 9.5 });
  }

  // Price by line.
  y += 26;
  ensure(40);
  page.text(M, y, "Price by schedule of values line", { size: 11, font: "bold" });
  const cols = { item: M + 6, desc: M + 60, kind: M + 380, amount: W - M - 8 };
  const tableHead = () => {
    y += 18;
    page.rect(M, y - 11, width, 16, { fill: 0.92, stroke: false });
    page.text(cols.item, y, "Item", { size: 8, font: "bold" });
    page.text(cols.desc, y, "Description of work", { size: 8, font: "bold" });
    page.text(cols.kind, y, "Change", { size: 8, font: "bold" });
    page.text(cols.amount, y, "Add (deduct)", { size: 8, font: "bold", align: "right" });
  };
  tableHead();
  for (const line of data.lines) {
    if (y + 15 > FOOTER_TOP - 10) {
      newPage();
      tableHead();
    }
    y += 15;
    page.text(cols.item, y, fitText(line.itemNumber, 50, 9), { size: 9 });
    page.text(cols.desc, y, fitText(line.description, cols.kind - cols.desc - 10, 9), { size: 9 });
    page.text(cols.kind, y, line.newLine ? "New line" : "Existing line", { size: 9 });
    page.text(cols.amount, y, fmtAmount(line.amountCents), { size: 9, align: "right" });
    page.line(M, y + 5, W - M, y + 5, 0.2);
  }
  y += 17;
  page.text(cols.desc, y, "Total of this change order", { size: 9.5, font: "bold" });
  page.text(cols.amount, y, usd(data.totalCents), { size: 9.5, font: "bold", align: "right" });

  // Contract sum before and after.
  y += 30;
  ensure(110);
  page.text(M, y, "Contract sum", { size: 11, font: "bold" });
  const c = data.contract;
  const after =
    co.status === "approved"
      ? "Contract sum including this change order"
      : "Contract sum if this change order is approved";
  const rows: [string, number, boolean][] = [
    ["Original contract sum", c.originalCents, false],
    ["Net change by previously approved change orders", c.approvedChangesCents, false],
    ["Contract sum before this change order", c.beforeCents, true],
    [`This change order (${co.number})`, data.totalCents, false],
    [after, c.afterCents, true],
  ];
  y += 4;
  for (const [label, cents, bold] of rows) {
    y += 16;
    const font = bold ? "bold" : "regular";
    page.text(M + 6, y, label, { size: 9.5, font });
    page.text(cols.amount, y, usd(cents), { size: 9.5, font, align: "right" });
    page.line(M, y + 5, W - M, y + 5, 0.2);
  }
  if (c.otherPendingCount > 0) {
    y += 15;
    page.text(
      M + 6,
      y,
      `Not included: ${c.otherPendingCount} other change order${c.otherPendingCount === 1 ? "" : "s"} ` +
        `awaiting approval, net ${usd(c.otherPendingCents)}.`,
      { size: 8 },
    );
  }

  // Contract time: stated either way, since many subcontracts treat silence as no time asked for.
  y += 26;
  ensure(30);
  page.text(M, y, "Contract time", { size: 11, font: "bold" });
  y += 16;
  page.text(M + 6, y, scheduleText(co.scheduleDays), { size: 9.5 });

  // Backup sent with it: the file names, so the GC can tell whether everything arrived.
  if (data.backup.length > 0) {
    y += 30;
    ensure(34);
    page.text(M, y, "Backup attached", { size: 11, font: "bold" });
    y += 3;
    data.backup.forEach((f, i) => {
      ensure(14);
      y += 13;
      page.text(M + 6, y, `${i + 1}.`, { size: 9 });
      page.text(M + 24, y, fitText(f.fileName, width - 200, 9), { size: 9 });
      page.text(W - M - 8, y, f.kind, { size: 8, align: "right" });
    });
  }

  // Signatures (our wording).
  y += 30;
  ensure(130);
  const half = (width - 16) / 2;
  for (const [i, who, body] of [
    [
      0,
      "Submitted by (contractor)",
      "We will perform the change described above for the amount shown, added to or deducted " +
        "from the contract sum.",
    ],
    [
      1,
      "Accepted by (general contractor)",
      "The change is accepted for the amount shown and may be billed on the next pay application " +
        "dated on or after the date signed.",
    ],
  ] as const) {
    const x = M + i * (half + 16);
    page.rect(x, y - 12, half, 118, { stroke: true });
    page.text(x + 8, y + 2, who, { size: 9, font: "bold" });
    wrapText(body, half - 16, 7.5).forEach((l, j) => {
      page.text(x + 8, y + 16 + j * 9.5, l, { size: 7.5 });
    });
    page.text(x + 8, y + 68, "By: _________________________________", { size: 9 });
    page.text(x + 8, y + 90, "Name/title: __________________  Date: ________", { size: 9 });
  }

  // Footer on every page.
  pdf.pages.forEach((p, i) => {
    const fy = H - 24;
    p.line(M, fy - 12, W - M, fy - 12, 0.3);
    wrapText(CHANGE_ORDER_NOTICE, width - 120, 6.5).forEach((l, j) => {
      p.text(M, fy - 2 + j * 8, l, { size: 6.5 });
    });
    p.text(W - M, fy - 2, `CO ${co.number} - page ${i + 1}/${pdf.pages.length}`, {
      size: 6.5,
      align: "right",
    });
  });
  return pdf.toBytes();
}
