// Job traveler PDF for a won quote: one sheet (or more) per part for the shop floor, built from
// shared/traveler.ts. Shows quantities, material, operations and the estimate's times; never a
// price, rate or markup.
import type { ShopSettingsDto } from "@shared/api";
import { quoteLabel } from "@shared/quote-label";
import { minutesText, type TravelerLine } from "@shared/traveler";
import { buildPdf, PAGE_HEIGHT, PAGE_WIDTH, type PdfOp, textWidth, wrapText } from "../../lib/pdf";

const M = 54;

export interface TravelerHeader {
  quoteNumber: number;
  revNumber: number;
  customerCompany: string;
  poNumber: string | null;
  dueDate: string | null;
  printedOn: string;
}

/** Cut a cell's text to its width, ending in "..." when it does not fit. */
function clip(text: string, width: number, size: number): string {
  if (textWidth(text, size) <= width) return text;
  let t = text;
  while (t.length > 1 && textWidth(`${t}...`, size) > width) t = t.slice(0, -1);
  return `${t}...`;
}

const num = (n: number) => String(Number(n.toFixed(2)));

export function renderTravelerPdf(
  shop: ShopSettingsDto,
  header: TravelerHeader,
  lines: TravelerLine[],
): Uint8Array<ArrayBuffer> {
  const label = quoteLabel(header.quoteNumber, header.revNumber);
  const right = PAGE_WIDTH - M;
  const pages: PdfOp[][] = [];
  let ops: PdfOp[] = [];
  let y = PAGE_HEIGHT - M;
  const text = (x: number, t: string, size = 10, bold = false, alignRight = false) =>
    ops.push({ kind: "text", x, y, text: t, size, bold, alignRight });
  const rule = (x1 = M, x2 = right) => ops.push({ kind: "line", x1, y1: y, x2, y2: y });

  // Columns of the operations table.
  const cOp = M;
  const cCenter = M + 30;
  const cDesc = M + 150;
  const cSetup = M + 330;
  const cCycle = M + 380;
  const cRun = M + 435;
  const cSign = M + 445;

  lines.forEach((line, index) => {
    let continued = false;
    const top = () => {
      y = PAGE_HEIGHT - M;
      text(right, "JOB TRAVELER", 16, true, true);
      text(M, shop.displayName, 14, true);
      y -= 18;
      const part = `${line.partNumber}${line.revision ? ` Rev ${line.revision}` : ""}`;
      text(M, `${part}${continued ? " (continued)" : ""}`, 12, true);
      text(right, `Part ${index + 1} of ${lines.length}`, 9, false, true);
      y -= 20;
    };
    const newPage = () => {
      pages.push(ops);
      ops = [];
      continued = true;
      top();
    };
    const need = (h: number) => {
      if (y - h < M + 30) newPage();
    };
    top();

    // Order block: left the job, right the dates.
    const left = [
      `Customer: ${header.customerCompany}`,
      `Quote: ${label}`,
      ...(header.poNumber ? [`PO: ${header.poNumber}`] : []),
    ];
    const rightCol = [
      `Printed ${header.printedOn}`,
      header.dueDate ? `Due ${header.dueDate}` : "Due: ________________",
    ];
    for (let i = 0; i < Math.max(left.length, rightCol.length); i++) {
      const l = left[i];
      const r = rightCol[i];
      if (l) text(M, l, 10);
      if (r) text(right, r, 10, i === 1 && !!header.dueDate, true);
      y -= 13;
    }
    if (line.description) {
      for (const l of wrapText(line.description, PAGE_WIDTH - 2 * M, 10).slice(0, 3)) {
        text(M, l, 10);
        y -= 13;
      }
    }
    y -= 6;

    // Quantities.
    const startNote =
      line.starts > line.quantity
        ? `Start ${line.starts} (${num(line.falloutPercent ?? 0)}% expected fallout)`
        : `Start ${line.starts}`;
    text(M, `Quantity ordered: ${line.quantity}`, 11, true);
    text(M + 220, startNote, 11, true);
    y -= 18;

    // Material.
    text(M, "Material", 9, true);
    y -= 13;
    const m = line.material;
    const matLines: string[] = [];
    if (m.customerSupplied) matLines.push("Customer-supplied material");
    if (m.name) matLines.push(m.name);
    if (m.stockDescription) matLines.push(`Stock: ${m.stockDescription}`);
    if (m.blank) matLines.push(`Blank: ${m.blank}`);
    if (m.cutList) matLines.push(m.cutList);
    if (m.partsPerStock) {
      const unit = m.stockUnit;
      matLines.push(
        `${m.partsPerStock} part${m.partsPerStock === 1 ? "" : "s"} per ${unit}: pull ${m.stockPieces} ${unit}${m.stockPieces === 1 ? "" : "s"}`,
      );
    }
    if (matLines.length === 0) matLines.push("None on the estimate");
    for (const l of matLines) {
      text(M + 8, clip(l, PAGE_WIDTH - 2 * M - 8, 10), 10);
      y -= 13;
    }
    text(M + 8, "Heat / lot no.: ____________________", 10);
    y -= 20;

    // Operations.
    const tableHeader = () => {
      text(cOp, "Op", 9, true);
      text(cCenter, "Work center", 9, true);
      text(cDesc, "Operation", 9, true);
      text(cSetup, "Setup", 9, true, true);
      text(cCycle, "Cycle/pc", 9, true, true);
      text(cRun, "Run", 9, true, true);
      text(cSign, "Sign-off", 9, true);
      y -= 6;
      rule();
      y -= 14;
    };
    tableHeader();
    const needRow = () => {
      if (y - 20 < M + 30) {
        newPage();
        tableHeader();
      }
    };
    for (const op of line.operations) {
      needRow();
      text(cOp, String(op.sequence), 10, true);
      text(cCenter, clip(op.machine, cDesc - cCenter - 6, 9), 9);
      text(cDesc, clip(op.label || "-", cSetup - 34 - cDesc, 9), 9);
      text(cSetup, minutesText(op.setupMinutes), 9, false, true);
      text(
        cCycle,
        op.cycleMinutesPerPart === null ? "not set" : `${num(op.cycleMinutesPerPart)} min`,
        9,
        false,
        true,
      );
      text(cRun, op.runMinutes === null ? "-" : minutesText(op.runMinutes), 9, false, true);
      y -= 4;
      rule(cSign, right);
      y -= 16;
    }
    for (const f of line.finishing) {
      needRow();
      text(cOp, String(f.sequence), 10, true);
      text(cCenter, f.outsideService ? "Outside service" : "Finishing", 9);
      text(cDesc, clip(f.name, cRun - cDesc, 9), 9);
      y -= 4;
      rule(cSign, right);
      y -= 16;
    }
    needRow();
    text(cOp, "Final inspection", 10, true);
    y -= 4;
    rule(cSign, right);
    y -= 20;

    if (line.totalMinutes !== null) {
      text(
        M,
        `Planned time: ${minutesText(line.totalMinutes)} (setup and run, from the estimate)`,
        9,
      );
      y -= 13;
    }
    for (const n of line.notes) {
      need(13);
      text(M, n, 9, true);
      y -= 13;
    }
    need(13);
    text(
      M,
      `Times are the estimate's on quote ${label}, not a standard. Ship ${line.quantity} good.`,
      8,
    );
    pages.push(ops);
    ops = [];
  });

  return buildPdf(pages, `${shop.displayName} traveler ${label}`, []);
}
