// The contractor's sworn statement as a PDF (src/shared/sworn-statement.ts): a heading with the job and
// the pay application it goes with, one row per party in the columns Illinois and Michigan ask for,
// totals, our own affirmation, a signature line and (on by default) a generic jurat with a seal box.
// Not either statute's printed form: the footer says so on every page.
import {
  type ComputedSwornRow,
  type ComputedSwornStatement,
  SWORN_STATE_LABELS,
  SWORN_STATEMENT_NOTICE,
  swornAffirmation,
} from "@shared/sworn-statement";
import { NOTARY_LINES } from "./application-pdf";
import { fmtAmount } from "./model";
import { fitText, PdfDocument, type PdfPage, wrapText } from "./pdf";

// US Letter, landscape.
const W = 792;
const H = 612;
const M = 32;
const FOOTER_TOP = H - 44;
const SIZE = 7;

export const SAMPLE_SWORN_MARK = "SAMPLE DATA - NOT A REAL SWORN STATEMENT";

interface Col {
  head: [string, string];
  w: number;
  value: (r: ComputedSwornRow) => number;
  total: (s: ComputedSwornStatement) => number;
}

/** The money columns. Unpaid wages and fringe print on a Michigan statement or when any is entered. */
function columns(s: ComputedSwornStatement): Col[] {
  const t = s.totals;
  const cols: Col[] = [
    {
      head: ["Contract", "price"],
      w: 56,
      value: (r) => r.contractCents,
      total: () => t.contractCents,
    },
    {
      head: ["Change", "orders"],
      w: 50,
      value: (r) => r.changesCents,
      total: () => t.changesCents,
    },
    {
      head: ["Adjusted", "contract"],
      w: 56,
      value: (r) => r.adjustedCents,
      total: () => t.adjustedCents,
    },
    {
      head: ["Retainage", "held"],
      w: 50,
      value: (r) => r.retainageCents,
      total: () => t.retainageCents,
    },
    {
      head: ["Amount", "already paid"],
      w: 56,
      value: (r) => r.paidCents,
      total: () => t.paidCents,
    },
    { head: ["Amount", "owing now"], w: 56, value: (r) => r.owingCents, total: () => t.owingCents },
    {
      head: ["Balance to", "complete"],
      w: 56,
      value: (r) => r.balanceCents,
      total: () => t.balanceCents,
    },
  ];
  if (s.input.state === "MI" || t.wagesCents > 0 || t.fringeCents > 0) {
    cols.push(
      { head: ["Unpaid", "wages"], w: 46, value: (r) => r.wagesCents, total: () => t.wagesCents },
      {
        head: ["Unpaid fringe", "/ withholding"],
        w: 54,
        value: (r) => r.fringeCents,
        total: () => t.fringeCents,
      },
    );
  }
  return cols;
}

export function swornStatementPdf(
  s: ComputedSwornStatement,
  opts: { sample?: boolean } = {},
): Uint8Array {
  const input = s.input;
  const pdf = new PdfDocument({ title: `Contractor's sworn statement - ${input.projectName}` });
  const cols = columns(s);
  const moneyW = cols.reduce((a, c) => a + c.w, 0);
  const left = W - 2 * M - moneyW;
  const nameW = Math.round(left * 0.6);
  const workW = left - nameW;
  const colRight = (i: number) => M + left + cols.slice(0, i + 1).reduce((a, c) => a + c.w, 0) - 3;
  let page: PdfPage = pdf.addPage(W, H);
  let y = 0;

  const tableHead = () => {
    page.rect(M, y, W - 2 * M, 22, { fill: 0.92, stroke: false });
    page.text(M + 3, y + 9, "Name, address and phone", { size: SIZE, font: "bold" });
    page.text(M + 3, y + 18, "of each party", { size: SIZE, font: "bold" });
    page.text(M + nameW + 3, y + 9, "Type of improvement", { size: SIZE, font: "bold" });
    page.text(M + nameW + 3, y + 18, "or work furnished", { size: SIZE, font: "bold" });
    cols.forEach((c, i) => {
      page.text(colRight(i), y + 9, c.head[0], { size: SIZE, font: "bold", align: "right" });
      page.text(colRight(i), y + 18, c.head[1], { size: SIZE, font: "bold", align: "right" });
    });
    y += 24;
  };

  const newPage = (first: boolean) => {
    if (!first) page = pdf.addPage(W, H);
    page.text(M, 34, "Contractor's sworn statement", { size: first ? 14 : 10, font: "bold" });
    page.text(W - M, 34, fitText(input.projectName, 360, first ? 11 : 9, "bold"), {
      size: first ? 11 : 9,
      font: "bold",
      align: "right",
    });
    y = 46;
    if (first) {
      const facts: [string, string][] = [
        ["From", [input.contractorName, input.contractorAddress].filter(Boolean).join(", ")],
        ["To", input.givenTo],
        ["Owner", input.ownerName],
        ["Project", [input.projectName, input.projectLocation].filter(Boolean).join(", ")],
        ["With pay application", input.payApp],
        ["Date", input.statementDate],
        ["Statement for", SWORN_STATE_LABELS[input.state]],
      ];
      const half = (W - 2 * M) / 2;
      facts
        .filter(([, v]) => v)
        .forEach(([k, v], i) => {
          const x = M + (i % 2) * half;
          const yy = y + Math.floor(i / 2) * 11;
          page.text(x, yy, `${k}:`, { size: 8, font: "bold" });
          page.text(x + 92, yy, fitText(v, half - 100, 8), { size: 8 });
        });
      y += Math.ceil(facts.filter(([, v]) => v).length / 2) * 11 + 4;
    }
    if (opts.sample) {
      page.text(W / 2, y + 2, SAMPLE_SWORN_MARK, { size: 10, font: "bold", align: "center" });
      y += 12;
    }
    tableHead();
  };
  newPage(true);

  for (const r of s.rows) {
    const contact = [r.address, r.phone].filter(Boolean).join(" - ");
    const work = wrapText(r.work, workW - 6, SIZE).slice(0, 2);
    const rowH = contact || work.length > 1 ? 20 : 13;
    if (y + rowH > FOOTER_TOP - 20) newPage(false);
    page.text(M + 3, y + 8, fitText(r.name, nameW - 6, SIZE + 0.5, "bold"), {
      size: SIZE + 0.5,
      font: "bold",
    });
    if (contact)
      page.text(M + 3, y + 16, fitText(contact, nameW - 6, SIZE - 0.5), { size: SIZE - 0.5 });
    work.forEach((l, k) => {
      page.text(M + nameW + 3, y + 8 + k * 8, l, { size: SIZE });
    });
    cols.forEach((c, i) => {
      page.text(colRight(i), y + 8, fmtAmount(c.value(r)), { size: SIZE, align: "right" });
    });
    y += rowH;
    page.line(M, y, W - M, y, 0.2);
  }

  // Totals.
  page.line(M, y + 1, W - M, y + 1, 0.8);
  page.text(M + 3, y + 12, "Totals", { size: SIZE + 0.5, font: "bold" });
  cols.forEach((c, i) => {
    page.text(colRight(i), y + 12, fmtAmount(c.total(s)), {
      size: SIZE,
      font: "bold",
      align: "right",
    });
  });
  y += 20;
  const checks: string[] = [];
  if (input.contractSumCents !== null)
    checks.push(`Contract sum to date: ${fmtAmount(input.contractSumCents)}`);
  if (input.requestedCents !== null)
    checks.push(`Requested on the pay application: ${fmtAmount(input.requestedCents)}`);
  if (checks.length) {
    page.text(M + 3, y + 4, checks.join("     "), { size: 7.5 });
    y += 12;
  }

  // Affirmation, signature and the notary block, kept together.
  const affirm = wrapText(swornAffirmation(input), W - 2 * M - 8, 8);
  const blockH = 14 + affirm.length * 10 + 36 + (input.notary ? 96 : 0);
  if (y + blockH > FOOTER_TOP - 4) newPage(false);
  y += 6;
  affirm.forEach((l, i) => {
    page.text(M + 3, y + 8 + i * 10, l, { size: 8 });
  });
  y += 8 + affirm.length * 10 + 18;
  const quarter = (W - 2 * M) / 4;
  [
    ["Signature", ""],
    ["Name", input.affiantName],
    ["Title", input.affiantTitle],
    ["Date", ""],
  ].forEach(([label, value], i) => {
    const x = M + quarter * i;
    if (value) page.text(x + 4, y + 10, fitText(value as string, quarter - 16, 8.5), { size: 8.5 });
    page.line(x + 4, y + 14, x + quarter - 12, y + 14, 0.4);
    page.text(x + 4, y + 23, label as string, { size: 7 });
  });
  y += 32;
  if (input.notary) {
    const h = 86;
    page.rect(M, y, W - 2 * M, h, { stroke: true });
    const sealW = 96;
    const sealX = W - M - 8 - sealW;
    page.rect(sealX, y + 8, sealW, h - 16, { stroke: true });
    page.text(sealX + sealW / 2, y + h / 2 + 3, "Seal", { size: 7, align: "center" });
    page.text(M + 8, y + 14, "Notary", { size: 9, font: "bold" });
    [
      NOTARY_LINES.place,
      NOTARY_LINES.sworn,
      "by ____________________________________ (name of the signer above).",
      NOTARY_LINES.notary,
    ].forEach((l, i) => {
      page.text(M + 8, y + 30 + i * 12, l, { size: 8.5 });
    });
    page.text(M + 8, y + 30 + 4 * 12, fitText(NOTARY_LINES.note, sealX - M - 16, 6.5), {
      size: 6.5,
    });
  }

  const notice = wrapText(SWORN_STATEMENT_NOTICE, W - 2 * M - 80, 6.5);
  pdf.pages.forEach((p, i) => {
    notice.forEach((l, k) => {
      p.text(M, FOOTER_TOP + 10 + k * 8, l, { size: 6.5 });
    });
    p.text(W - M, FOOTER_TOP + 10, `Page ${i + 1} of ${pdf.pages.length}`, {
      size: 6.5,
      align: "right",
    });
  });
  return pdf.toBytes();
}
