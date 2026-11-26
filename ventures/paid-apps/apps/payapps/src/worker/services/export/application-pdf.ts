// PDF of a pay application: page 1 is the application summary with certificate blocks (the fields of
// a G702-style form), followed by the continuation sheet (G703-style columns) on landscape pages.
// Our own layout and wording: it does not reproduce AIA form text or layout, and says so on every page.
import { formatBps } from "@shared/money";
import { lineRatesNote } from "@shared/payapp-math";
import {
  type ApplicationDocumentData,
  attentionLine,
  fmtAmount,
  fmtPct,
  NOT_AIA_NOTICE,
  SAMPLE_APPLICATION_MARK,
} from "./model";
import { fitText, PdfDocument, type PdfPage, textWidth, wrapText } from "./pdf";

const M = 40; // page margin

/**
 * Vertical spacing of the summary page. With the notary block on, the rows and gaps are tighter so
 * the block fits on page 1 under the signatures, where a notary expects it (the worst case, with
 * the own-rate note, is checked in test/unit/notary-block.test.ts).
 */
const SPACING = {
  normal: { row: 20, coGap: 34, signGap: 36, box: 150, certified: 72, by: 100, name: 122 },
  notary: { row: 15, coGap: 26, signGap: 28, box: 128, certified: 62, by: 84, name: 106 },
} as const;

/** The notary block's wording: a generic jurat with blanks, our own words, no state's form. */
export const NOTARY_LINES = {
  title: "Notary (where the general contractor or owner requires a notarized application)",
  place: "State of: ______________________    County of: ______________________",
  sworn: "Subscribed and sworn to (or affirmed) before me on ______________ (date)",
  signer: "by ____________________________________ (name of the contractor's signer).",
  notary: "Notary public: _____________________________    My commission expires: ___________",
  note:
    "A notary whose state prescribes its own certificate wording may complete and attach that " +
    "certificate instead of this block.",
} as const;
export const NOTARY_BOX_HEIGHT = 92;
const SEAL_W = 96;

function footer(page: PdfPage, data: ApplicationDocumentData, label: string) {
  const y = page.height - 24;
  page.line(M, y - 12, page.width - M, y - 12, 0.3);
  const notice = wrapText(NOT_AIA_NOTICE, page.width - 2 * M - 120, 6.5);
  notice.forEach((l, i) => {
    page.text(M, y - 2 + i * 8, l, { size: 6.5 });
  });
  page.text(page.width - M, y - 2, `${label} - Application #${data.payApp.number}`, {
    size: 6.5,
    align: "right",
  });
}

function draftBanner(page: PdfPage, data: ApplicationDocumentData) {
  const marks = [
    data.project.sample ? SAMPLE_APPLICATION_MARK : null,
    data.payApp.status === "draft" ? "DRAFT - NOT SUBMITTED" : null,
  ].filter(Boolean);
  if (!marks.length) return;
  page.text(page.width - M, 30, marks.join("  |  "), { size: 9, font: "bold", align: "right" });
}

function labelValue(page: PdfPage, x: number, y: number, label: string, value: string, w: number) {
  page.text(x, y, label, { size: 7 });
  page.text(x, y + 11, fitText(value || "-", w, 9.5, "bold"), { size: 9.5, font: "bold" });
}

function summaryPage(doc: PdfDocument, data: ApplicationDocumentData) {
  const page = doc.addPage(612, 792);
  const { project, payApp, contractor } = data;
  const s = data.computed.summary;
  const sp = project.notaryBlock ? SPACING.notary : SPACING.normal;
  draftBanner(page, data);
  page.text(M, 46, "Contractor's Application for Payment", { size: 16, font: "bold" });
  page.text(M, 62, "Summary of contract, change orders, work to date and retainage", { size: 8.5 });

  // Parties and period.
  const colW = (612 - 2 * M) / 3;
  let y = 84;
  page.rect(M, y - 8, 612 - 2 * M, 96, { stroke: true });
  labelValue(page, M + 8, y, "To (general contractor)", project.gcName, colW - 16);
  const attn = attentionLine(project);
  if (attn) page.text(M + 8, y + 21, fitText(attn, colW - 16, 7), { size: 7 });
  labelValue(page, M + 8 + colW, y, "From (contractor)", contractor.name, colW - 16);
  labelValue(page, M + 8 + 2 * colW, y, "Application no.", String(payApp.number), colW - 16);
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
  labelValue(
    page,
    M + 8 + 2 * colW,
    y,
    "Period",
    `${payApp.periodFrom} to ${payApp.periodTo}`,
    colW - 16,
  );
  y += 30;
  labelValue(page, M + 8, y, "Architect / engineer", project.architectName ?? "", colW - 16);
  labelValue(page, M + 8 + colW, y, "Contract date", project.contractDate ?? "", colW - 16);
  labelValue(page, M + 8 + 2 * colW, y, "Application date", payApp.applicationDate, colW - 16);

  // Summary lines.
  y = 200;
  page.text(M, y, "Application summary", { size: 11, font: "bold" });
  y += 8;
  const amountX = 612 - M - 8;
  const rows: [string, string, number, boolean?][] = [
    ["1", "Original contract sum", s.originalContractSumCents],
    ["2", "Net change by change orders", s.netChangeByChangeOrdersCents],
    ["3", "Contract sum to date (line 1 + 2)", s.contractSumToDateCents, true],
    [
      "4",
      "Total completed and stored to date (continuation sheet, column G)",
      s.totalCompletedAndStoredCents,
    ],
    [
      "5a",
      `Retainage: ${formatBps(s.retainagePctBps)} of completed work (columns D + E)`,
      s.retainageOnCompletedWorkCents,
    ],
    [
      "5b",
      `Retainage: ${formatBps(s.storedRetainagePctBps)} of stored materials (column F)`,
      s.retainageOnStoredMaterialsCents,
    ],
    ["5", "Total retainage (continuation sheet, column I)", s.totalRetainageCents],
    ["6", "Total earned less retainage (line 4 - 5)", s.totalEarnedLessRetainageCents, true],
    [
      "7",
      "Less previous certificates for payment (line 6 of prior application)",
      s.lessPreviousCertificatesCents,
    ],
    ["8", "CURRENT PAYMENT DUE (line 6 - 7)", s.currentPaymentDueCents, true],
    [
      "9",
      "Balance to finish, including retainage (line 3 - 6)",
      s.balanceToFinishIncludingRetainageCents,
    ],
  ];
  for (const [no, label, cents, bold] of rows) {
    y += sp.row;
    if (no === "8")
      page.rect(M, y - sp.row + 7, 612 - 2 * M, sp.row - 1, { fill: 0.92, stroke: false });
    const font = bold ? "bold" : "regular";
    page.text(M + 6, y, no, { size: 9.5, font });
    page.text(M + 34, y, label, { size: 9.5, font });
    page.text(amountX, y, `$${fmtAmount(cents)}`, { size: 9.5, font, align: "right" });
    page.line(M, y + 6, 612 - M, y + 6, 0.2);
  }
  const own = lineRatesNote(s.lineRates);
  if (own) {
    y += 3; // clear of line 9's rule
    for (const l of wrapText(
      `Lines 5a and 5b: these lines are held at their own retainage rate instead: ${own}.`,
      612 - 2 * M - 12,
      7.5,
    ).slice(0, 2)) {
      y += 11;
      page.text(M + 6, y, l, { size: 7.5 });
    }
  }

  // Change order summary.
  y += sp.coGap;
  page.text(M, y, "Change order summary", { size: 11, font: "bold" });
  const co = s.changeOrders;
  const cx = [M + 6, M + 300, 612 - M - 8];
  y += 18;
  page.text(cx[1] ?? 0, y, "Additions", { size: 8, font: "bold", align: "right" });
  page.text(cx[2] ?? 0, y, "Deductions", { size: 8, font: "bold", align: "right" });
  for (const [label, add, ded] of [
    ["Approved in previous applications", co.previousAdditionsCents, co.previousDeductionsCents],
    ["Approved this period", co.thisPeriodAdditionsCents, co.thisPeriodDeductionsCents],
    [
      "Totals",
      co.previousAdditionsCents + co.thisPeriodAdditionsCents,
      co.previousDeductionsCents + co.thisPeriodDeductionsCents,
    ],
  ] as const) {
    y += 15;
    page.text(cx[0] ?? 0, y, label, { size: 9 });
    page.text(cx[1] ?? 0, y, fmtAmount(add), { size: 9, align: "right" });
    page.text(cx[2] ?? 0, y, fmtAmount(ded), { size: 9, align: "right" });
  }
  y += 15;
  page.text(cx[0] ?? 0, y, "Net change by change orders", { size: 9, font: "bold" });
  page.text(cx[2] ?? 0, y, fmtAmount(co.netChangeCents), { size: 9, font: "bold", align: "right" });

  // Signature blocks (our wording).
  y += sp.signGap;
  const half = (612 - 2 * M - 16) / 2;
  for (const [i, title, body] of [
    [
      0,
      "Contractor",
      "We submit this application for the work and stored materials listed on the attached " +
        "continuation sheet. The amount due is calculated from the contract sum, approved change " +
        "orders and retainage shown above.",
    ],
    [
      1,
      "Amount certified (general contractor or owner's rep.)",
      "Amount certified for payment. If it differs from line 8, attach an explanation and mark " +
        "the changed figures on the continuation sheet.",
    ],
  ] as const) {
    const x = M + i * (half + 16);
    page.rect(x, y - 12, half, sp.box, { stroke: true });
    page.text(x + 8, y + 2, title, { size: 9, font: "bold" });
    wrapText(body, half - 16, 7.5).forEach((l, j) => {
      page.text(x + 8, y + 16 + j * 9.5, l, { size: 7.5 });
    });
    if (i === 1)
      page.text(x + 8, y + sp.certified, "Amount certified: $____________________", { size: 9 });
    page.text(x + 8, y + sp.by, "By: _________________________________", { size: 9 });
    page.text(x + 8, y + sp.name, "Name/title: __________________  Date: ________", { size: 9 });
  }
  if (project.notaryBlock) notaryBlock(page, y - 12 + sp.box + 8);
  footer(page, data, "Application summary");
}

/** The notary's jurat under the signatures, full width, with a box for the seal on the right. */
function notaryBlock(page: PdfPage, top: number) {
  const w = page.width - 2 * M;
  page.rect(M, top, w, NOTARY_BOX_HEIGHT, { stroke: true });
  const sealX = M + w - 8 - SEAL_W;
  page.rect(sealX, top + 8, SEAL_W, NOTARY_BOX_HEIGHT - 16, { stroke: true });
  page.text(sealX + SEAL_W / 2, top + NOTARY_BOX_HEIGHT / 2 + 3, "Seal", {
    size: 7,
    align: "center",
  });
  const x = M + 8;
  const textW = sealX - 8 - x;
  page.text(x, top + 14, fitText(NOTARY_LINES.title, textW, 9, "bold"), { size: 9, font: "bold" });
  const body = [NOTARY_LINES.place, NOTARY_LINES.sworn, NOTARY_LINES.signer, NOTARY_LINES.notary];
  body.forEach((l, i) => {
    page.text(x, top + 30 + i * 12, l, { size: textW >= textWidth(l, 8.5) ? 8.5 : 8 });
  });
  wrapText(NOTARY_LINES.note, textW, 6.5).forEach((l, i) => {
    page.text(x, top + 30 + body.length * 12 + 1 + i * 7.5, l, { size: 6.5 });
  });
}

interface Col {
  key: string;
  title: string;
  w: number;
  align: "left" | "right";
}

const COLS: Col[] = [
  { key: "A", title: "Item", w: 38, align: "left" },
  { key: "B", title: "Description of work", w: 164, align: "left" },
  { key: "C", title: "Scheduled value", w: 66, align: "right" },
  { key: "D", title: "From previous application (D+E)", w: 66, align: "right" },
  { key: "E", title: "Work completed this period", w: 66, align: "right" },
  { key: "F", title: "Materials presently stored (not in D or E)", w: 66, align: "right" },
  { key: "G", title: "Completed and stored to date (D+E+F)", w: 70, align: "right" },
  { key: "%", title: "% (G / C)", w: 40, align: "right" },
  { key: "H", title: "Balance to finish (C - G)", w: 66, align: "right" },
  { key: "I", title: "Retainage", w: 60, align: "right" },
];

function continuationPages(doc: PdfDocument, data: ApplicationDocumentData) {
  const W = 792;
  const H = 612;
  const rowH = 15;
  const { computed } = data;
  const rows: string[][] = computed.lines.map((l) => [
    l.itemNumber,
    l.description,
    fmtAmount(l.scheduledValueCents),
    fmtAmount(l.fromPreviousCents),
    fmtAmount(l.thisPeriodCents),
    fmtAmount(l.storedMaterialsCents),
    fmtAmount(l.completedAndStoredCents),
    fmtPct(l.percentCompleteBps),
    fmtAmount(l.balanceToFinishCents),
    fmtAmount(l.retainageCents),
  ]);
  const t = computed.totals;
  const totalRow = [
    "",
    "TOTALS",
    fmtAmount(t.scheduledValueCents),
    fmtAmount(t.fromPreviousCents),
    fmtAmount(t.thisPeriodCents),
    fmtAmount(t.storedMaterialsCents),
    fmtAmount(t.completedAndStoredCents),
    t.scheduledValueCents === 0
      ? ""
      : fmtPct(Math.round((t.completedAndStoredCents * 10_000) / t.scheduledValueCents)),
    fmtAmount(t.balanceToFinishCents),
    fmtAmount(t.retainageCents),
  ];
  const headerTop = 92;
  const headerH = 42;
  const bodyTop = headerTop + headerH;
  const perPage = Math.floor((H - bodyTop - 70) / rowH);
  const chunks: string[][][] = [];
  for (let i = 0; i < Math.max(rows.length, 1); i += perPage)
    chunks.push(rows.slice(i, i + perPage));
  const pageCount = chunks.length;

  chunks.forEach((chunk, pageIndex) => {
    const page = doc.addPage(W, H);
    draftBanner(page, data);
    page.text(M, 46, "Continuation Sheet", { size: 14, font: "bold" });
    page.text(
      M,
      62,
      `${data.project.name}${data.project.number ? ` (${data.project.number})` : ""} - Application #${data.payApp.number} - Period ${data.payApp.periodFrom} to ${data.payApp.periodTo}`,
      { size: 8.5 },
    );
    page.text(W - M, 62, `Page ${pageIndex + 1} of ${pageCount}`, { size: 8.5, align: "right" });
    page.text(
      M,
      76,
      "Amounts in US dollars. Lines 4, 5 and 6 of the summary come from columns G and I.",
      {
        size: 7,
      },
    );

    // Header.
    let x = M;
    const tableW = COLS.reduce((s, c) => s + c.w, 0);
    page.rect(M, headerTop, tableW, headerH, { fill: 0.92 });
    for (const c of COLS) {
      page.text(x + c.w / 2, headerTop + 9, c.key, { size: 7.5, font: "bold", align: "center" });
      wrapText(c.title, c.w - 4, 6.5, "bold")
        .slice(0, 3)
        .forEach((l, i) => {
          page.text(x + c.w / 2, headerTop + 19 + i * 7.5, l, {
            size: 6.5,
            font: "bold",
            align: "center",
          });
        });
      page.line(x, headerTop, x, headerTop + headerH, 0.3);
      x += c.w;
    }
    page.line(x, headerTop, x, headerTop + headerH, 0.3);

    const isLast = pageIndex === pageCount - 1;
    const body = isLast ? [...chunk, totalRow] : chunk;
    body.forEach((cells, r) => {
      const y = bodyTop + r * rowH;
      const bold = isLast && r === body.length - 1;
      if (bold) page.rect(M, y, tableW, rowH, { fill: 0.95, stroke: false });
      let cx = M;
      COLS.forEach((c, i) => {
        const value = fitText(cells[i] ?? "", c.w - 6, 7.5, bold ? "bold" : "regular");
        page.text(c.align === "right" ? cx + c.w - 3 : cx + 3, y + 10.5, value, {
          size: 7.5,
          font: bold ? "bold" : "regular",
          align: c.align,
        });
        cx += c.w;
      });
      page.line(M, y + rowH, M + tableW, y + rowH, 0.2);
    });
    const bottom = bodyTop + body.length * rowH;
    let vx = M;
    for (const c of COLS) {
      page.line(vx, bodyTop, vx, bottom, 0.2);
      vx += c.w;
    }
    page.line(vx, bodyTop, vx, bottom, 0.2);
    footer(page, data, "Continuation sheet");
  });
}

export function applicationPdf(data: ApplicationDocumentData): Uint8Array {
  const doc = new PdfDocument({
    title: `Application for Payment #${data.payApp.number} - ${data.project.name}`,
    producer: "PayApps",
  });
  summaryPage(doc, data);
  continuationPages(doc, data);
  return doc.toBytes();
}
