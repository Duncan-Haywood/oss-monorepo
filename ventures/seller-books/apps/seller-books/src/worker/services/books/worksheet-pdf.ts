// The Schedule C worksheet as a PDF, for a preparer who reads paper or attaches files to a client folder. The
// same lines, notes and warnings as the JSON and the CSV (routes/org/reports.ts), laid out by Schedule C part
// on US Letter pages. Our own layout, not the IRS form: the title, the disclaimer at the top and the footer on
// every page say so. No timestamp in the file, so the copy in the year-end ZIP is byte for byte this one.
import { PdfDocument, type PdfPage, wrapText } from "../../lib/pdf";
import type { ScLine, ScWorksheet } from "./schedule-c";

export interface WorksheetPdfInput {
  worksheet: ScWorksheet & { businessMiles: number };
  /** The shop's name, printed under the title. */
  shopName: string;
  /** Cents per mile the seller chose; null when line 9 uses the IRS rate on each trip's date. */
  mileageRate: number | null;
}

/** Line 44a's note, shared with the CSV. */
export function mileageNote(mileageRate: number | null): string {
  return mileageRate == null
    ? "Line 9 at the IRS rate in force on each trip's date"
    : `Line 9 at ${mileageRate} cents/mile, the rate you chose`;
}

/** Dollars with thousands separators; a negative amount in parentheses, as tax forms show a loss. */
export function pdfAmount(cents: number | null): string {
  if (cents == null) return "";
  const abs = Math.abs(cents);
  const s = `$${Math.floor(abs / 100).toLocaleString("en-US")}.${String(abs % 100).padStart(2, "0")}`;
  return cents < 0 ? `(${s})` : s;
}

const W = 612;
const H = 792;
const LEFT = 48;
const RIGHT = W - 48;
const LABEL_X = LEFT + 44;
const AMOUNT_RIGHT = RIGHT;
const LABEL_WIDTH = AMOUNT_RIGHT - 110 - LABEL_X;
const TOP = 56;
const BOTTOM = H - 56;

/** Lines 1 to 7 are Part I (income); the rest of the main list is Part II (expenses) and line 29 to 31. */
const isPartI = (line: string) => {
  const n = Number.parseInt(line, 10);
  return Number.isFinite(n) && n <= 7;
};

export function scheduleCPdf(input: WorksheetPdfInput): Uint8Array<ArrayBuffer> {
  const ws = input.worksheet;
  const doc = new PdfDocument({ title: `Schedule C worksheet ${ws.year}` });
  let page: PdfPage = doc.addPage(W, H);
  let y = TOP;

  const newPage = () => {
    page = doc.addPage(W, H);
    y = TOP;
  };
  const ensure = (h: number) => {
    if (y + h > BOTTOM) newPage();
  };

  // Title block.
  page.text(LEFT, y, `Schedule C worksheet, tax year ${ws.year}`, { size: 16, font: "bold" });
  y += 18;
  page.text(LEFT, y, input.shopName, { size: 10 });
  y += 10;
  const disclaimer = wrapText(
    `${ws.disclaimer} This page is our own layout of your books by Schedule C line; it is not the IRS form.`,
    RIGHT - LEFT - 16,
    8.5,
  );
  const boxH = disclaimer.length * 11 + 10;
  page.rect(LEFT, y, RIGHT - LEFT, boxH, { fill: 0.93 });
  let dy = y + 15;
  for (const l of disclaimer) {
    page.text(LEFT + 8, dy, l, { size: 8.5 });
    dy += 11;
  }
  y += boxH + 18;

  const section = (title: string) => {
    ensure(40);
    page.text(LEFT, y, title, { size: 11, font: "bold" });
    y += 6;
    page.line(LEFT, y, RIGHT, y, 0.75);
    y += 13;
  };

  const row = (l: { line: string; label: string; amount: string; note?: string }, bold = false) => {
    const label = wrapText(l.label, LABEL_WIDTH, 9, bold ? "bold" : "regular");
    const note = l.note ? wrapText(l.note, LABEL_WIDTH, 7.5) : [];
    ensure(label.length * 11 + note.length * 9.5 + 6);
    const font = bold ? "bold" : "regular";
    page.text(LEFT, y, l.line, { size: 9, font });
    page.text(AMOUNT_RIGHT, y, l.amount, { size: 9, font, align: "right" });
    for (const t of label) {
      page.text(LABEL_X, y, t, { size: 9, font });
      y += 11;
    }
    for (const t of note) {
      page.text(LABEL_X, y - 1, t, { size: 7.5, gray: 0.35 });
      y += 9.5;
    }
    page.line(LEFT, y - 7, RIGHT, y - 7, 0.25);
    y += 4;
  };

  const TOTALS = new Set(["5", "7", "28", "29", "31", "42"]);
  const lineRow = (l: ScLine) =>
    row(
      { line: l.line, label: l.label, amount: pdfAmount(l.amountCents), note: l.note },
      TOTALS.has(l.line),
    );

  section("Part I  Income");
  for (const l of ws.lines.filter((l) => isPartI(l.line))) lineRow(l);
  y += 8;
  section("Part II  Expenses");
  for (const l of ws.lines.filter((l) => !isPartI(l.line))) lineRow(l);
  y += 8;
  section("Part III  Cost of goods sold");
  for (const l of ws.partIII) lineRow(l);
  y += 8;
  section("Part IV  Information on your vehicle");
  row({
    line: "44a",
    label: "Business miles",
    amount: ws.businessMiles.toFixed(1),
    note: mileageNote(input.mileageRate),
  });
  if (ws.otherExpenses.length > 0) {
    y += 8;
    section("Part V  Other expenses");
    for (const l of ws.otherExpenses) lineRow(l);
  }
  if (ws.warnings.length > 0) {
    y += 8;
    section("Check these before you file");
    for (const w of ws.warnings) {
      const lines = wrapText(w, RIGHT - LEFT - 14, 8.5);
      ensure(lines.length * 10.5 + 4);
      page.text(LEFT, y, "-", { size: 8.5 });
      for (const t of lines) {
        page.text(LEFT + 12, y, t, { size: 8.5 });
        y += 10.5;
      }
      y += 4;
    }
  }

  const total = doc.pages.length;
  doc.pages.forEach((p, i) => {
    p.line(LEFT, H - 40, RIGHT, H - 40, 0.25);
    p.text(
      LEFT,
      H - 28,
      `Seller Books - Schedule C worksheet ${ws.year} - a worksheet, not a tax return`,
      { size: 7.5, gray: 0.35 },
    );
    p.text(RIGHT, H - 28, `Page ${i + 1} of ${total}`, { size: 7.5, gray: 0.35, align: "right" });
  });
  return doc.toBytes();
}
