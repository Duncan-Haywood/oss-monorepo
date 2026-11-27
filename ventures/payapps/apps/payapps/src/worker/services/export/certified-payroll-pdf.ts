// Weekly certified payroll as a PDF in the layout of Form WH-347 (Rev. January 2025): page 1 (eight
// worker rows a page, more pages as needed, entries numbered on), then page 2, the statement of
// compliance in the form's own wording with the apprenticeship and fringe benefit tables, remarks
// and a blank signature line (the official signs it; PayApps never signs for anyone). US letter,
// landscape, like the form. Built from the pure model in @shared/certified-payroll.
import {
  CERTIFIED_PAYROLL_NOTICE,
  type ComputedPayroll,
  type ComputedRow,
  FALSIFICATION_WARNING,
  FORM_REVISION,
  FRINGE_TABLE_NOTE,
  formatHours,
  MAX_FRINGE_PLANS,
  ROWS_PER_PAGE,
  STATEMENT_INTRO,
  STATEMENT_OF_COMPLIANCE,
} from "@shared/certified-payroll";
import { fmtAmount } from "./model";
import { fitText, PdfDocument, type PdfPage, wrapText } from "./pdf";

const W = 792;
const H = 612;
const M = 22;
const WIDTH = W - 2 * M;

const money = (c: number) => fmtAmount(c);

interface Col {
  key: string;
  head: string;
  w: number;
  align?: "left" | "right" | "center";
}

// Relative widths, scaled to the page below.
const RAW: Col[] = [
  { key: "1A", head: "(1A) Entry no.", w: 18, align: "center" },
  { key: "1B", head: "(1B) Last name", w: 54 },
  { key: "1C", head: "(1C) First name", w: 46 },
  { key: "1D", head: "(1D) MI", w: 14, align: "center" },
  { key: "1E", head: "(1E) ID no.", w: 30 },
  { key: "2", head: "(2) J / RA", w: 30, align: "center" },
  { key: "3", head: "(3) Labor classification", w: 64 },
  { key: "stot", head: "", w: 12, align: "center" },
  { key: "d0", head: "", w: 19, align: "right" },
  { key: "d1", head: "", w: 19, align: "right" },
  { key: "d2", head: "", w: 19, align: "right" },
  { key: "d3", head: "", w: 19, align: "right" },
  { key: "d4", head: "", w: 19, align: "right" },
  { key: "d5", head: "", w: 19, align: "right" },
  { key: "d6", head: "", w: 19, align: "right" },
  { key: "5", head: "(5) Total hours", w: 26, align: "right" },
  { key: "6A", head: "(6A) Rate ST / OT", w: 32, align: "right" },
  { key: "6B", head: "(6B) Total fringe credit", w: 36, align: "right" },
  { key: "6C", head: "(6C) Cash in lieu of fringe", w: 36, align: "right" },
  { key: "7A", head: "(7A) Gross this project", w: 42, align: "right" },
  { key: "7B", head: "(7B) Gross all work", w: 42, align: "right" },
  { key: "tax", head: "(8) Tax with-holdings", w: 34, align: "right" },
  { key: "fica", head: "(8) FICA", w: 32, align: "right" },
  { key: "other", head: "(8) Other (see remarks)", w: 32, align: "right" },
  { key: "ded", head: "(8) Total deductions", w: 36, align: "right" },
  { key: "9", head: "(9) Net pay all work", w: 42, align: "right" },
];
const SCALE = WIDTH / RAW.reduce((a, c) => a + c.w, 0);
const COLS = (() => {
  let x = M;
  return RAW.map((c) => {
    const col = { ...c, x, w: c.w * SCALE };
    x += col.w;
    return col;
  });
})();
const col = (key: string) => COLS.find((c) => c.key === key) as Col & { x: number };

function cell(page: PdfPage, key: string, y: number, value: string, size = 6.5, bold = false) {
  const c = col(key);
  const font = bold ? "bold" : "regular";
  const t = fitText(value, c.w - 3, size, font);
  const align = c.align ?? "left";
  const x = align === "right" ? c.x + c.w - 1.5 : align === "center" ? c.x + c.w / 2 : c.x + 1.5;
  page.text(x, y, t, { size, font, align });
}

function box(page: PdfPage, x: number, y: number, checked: boolean, size = 7) {
  page.rect(x, y - size + 1, size, size, { stroke: true });
  if (checked) {
    page.line(x + 1.2, y - size / 2 + 1, x + size / 2, y);
    page.line(x + size / 2, y, x + size - 1, y - size + 2);
  }
}

function headerBlock(page: PdfPage, p: ComputedPayroll, payrollLabel: string) {
  const i = p.input;
  page.text(M, 24, "Davis-Bacon and Related Acts Weekly Certified Payroll", {
    size: 11,
    font: "bold",
  });
  page.text(
    M,
    34,
    "In the format of Form WH-347 (U.S. Department of Labor, Wage and Hour Division)",
    {
      size: 6.5,
    },
  );
  page.text(W - M, 24, FORM_REVISION, { size: 6.5, align: "right" });
  page.text(
    W - M,
    34,
    "Unless otherwise noted, the information requested is specific to the named project below.",
    {
      size: 6,
      align: "right",
    },
  );
  let x = M;
  const y = 48;
  box(page, x, y, i.final);
  page.text(x + 10, y, "SUBMISSION OF FINAL DBRA CERTIFIED PAYROLL FORM", {
    size: 6.5,
    font: "bold",
  });
  x = M + 330;
  box(page, x, y, i.role === "prime");
  page.text(x + 10, y, "PRIME CONTRACTOR", { size: 6.5, font: "bold" });
  x += 110;
  box(page, x, y, i.role === "sub");
  page.text(x + 10, y, "SUBCONTRACTOR", { size: 6.5, font: "bold" });

  const fields: [string, string, number][][] = [
    [
      ["PROJECT NAME", i.projectName, 0.3],
      ["PROJECT NO. or CONTRACT NO.", i.projectNumber, 0.22],
      [payrollLabel, i.payrollNo, 0.14],
      ["PRIME CONTRACTOR'S/SUBCONTRACTOR'S BUSINESS NAME", i.businessName, 0.34],
    ],
    [
      ["PROJECT LOCATION", i.projectLocation, 0.3],
      ["WAGE DETERMINATION NO.", i.wageDeterminations, 0.22],
      ["WEEK ENDING DATE", usDate(i.weekEnding), 0.14],
      ["PRIME CONTRACTOR'S/SUBCONTRACTOR'S BUSINESS ADDRESS", i.businessAddress, 0.34],
    ],
  ];
  let top = 56;
  for (const row of fields) {
    let fx = M;
    for (const [label, value, frac] of row) {
      const w = WIDTH * frac;
      page.rect(fx, top, w, 22, { stroke: true });
      page.text(fx + 2, top + 7, label, { size: 5.5, font: "bold" });
      page.text(fx + 2, top + 17, fitText(value || "", w - 4, 7.5), { size: 7.5 });
      fx += w;
    }
    top += 22;
  }
  return top;
}

function usDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  return m ? `${m[2]}/${m[3]}/${m[1]}` : iso;
}

function footer(page: PdfPage, n: number, total: number, sample: boolean) {
  const lines = wrapText(CERTIFIED_PAYROLL_NOTICE, WIDTH - 60, 5.5);
  lines.forEach((l, k) => {
    page.text(M, H - 16 + k * 7 - (lines.length - 1) * 7, l, { size: 5.5 });
  });
  page.text(W - M, H - 16, `Page ${n} of ${total}`, { size: 6, align: "right" });
  if (sample)
    page.text(W / 2, 14, "SAMPLE JOB - NOT FOR SUBMISSION", {
      size: 8,
      font: "bold",
      align: "center",
    });
}

function tableHeader(page: PdfPage, p: ComputedPayroll, top: number): number {
  const h = 40;
  for (const c of COLS) {
    // The seven day columns share one "(4)" heading cell across their top.
    if (/^d\d$/.test(c.key)) page.rect(c.x, top + 11, c.w, h - 11, { stroke: true });
    else page.rect(c.x, top, c.w, h, { stroke: true });
  }
  {
    const a = col("d0");
    const b = col("d6");
    page.rect(a.x, top, b.x + b.w - a.x, 11, { stroke: true });
  }
  for (const c of COLS) {
    if (!c.head) continue;
    const lines = wrapText(c.head, c.w - 2, 5);
    lines.slice(0, 5).forEach((l, k) => {
      page.text(c.x + c.w / 2, top + 7 + k * 6, l, { size: 5, font: "bold", align: "center" });
    });
  }
  const s = col("stot");
  page.text(s.x + s.w / 2, top + 13, "ST", { size: 5, font: "bold", align: "center" });
  page.text(s.x + s.w / 2, top + 21, "OT", { size: 5, font: "bold", align: "center" });
  const d0 = col("d0");
  const d6 = col("d6");
  page.text((d0.x + d6.x + d6.w) / 2, top + 7, "(4) HOURS WORKED EACH DAY", {
    size: 5,
    font: "bold",
    align: "center",
  });
  p.days.forEach((d, k) => {
    const c = col(`d${k}`);
    page.text(c.x + c.w / 2, top + 22, d.letter, { size: 6, font: "bold", align: "center" });
    page.text(c.x + c.w / 2, top + 32, d.label, { size: 5.5, align: "center" });
  });
  return top + h;
}

const ROW_H = 24;

function drawRow(page: PdfPage, p: ComputedPayroll, r: ComputedRow, top: number) {
  for (const c of COLS) page.rect(c.x, top, c.w, ROW_H, { stroke: true });
  // ST / OT halves across the hours and rate columns.
  const s = col("stot");
  const rate = col("6A");
  page.line(s.x, top + ROW_H / 2, rate.x + rate.w, top + ROW_H / 2, 0.3);
  const yTop = top + 9;
  const yBot = top + 21;
  const yMid = top + 15;
  const w = p.workers[r.entryNo - 1];
  cell(page, "1A", yMid, String(r.entryNo));
  cell(page, "1B", yMid, r.worker.lastName);
  cell(page, "1C", yMid, r.worker.firstName);
  cell(page, "1D", yMid, r.worker.middleInitial);
  cell(page, "1E", yMid, r.worker.idNo);
  if (r.row.status === "RA" && r.row.apprenticeLevel) {
    cell(page, "2", yTop, "RA");
    cell(page, "2", yBot, r.row.apprenticeLevel, 5);
  } else cell(page, "2", yMid, r.row.status);
  const cls = wrapText(r.row.classification, col("3").w - 3, 6);
  if (cls.length > 1) {
    cell(page, "3", yTop, cls[0] ?? "", 6);
    cell(page, "3", yBot, cls.slice(1).join(" "), 6);
  } else cell(page, "3", yMid, r.row.classification);
  cell(page, "stot", yTop, "ST", 5.5, true);
  cell(page, "stot", yBot, "OT", 5.5, true);
  for (let d = 0; d < 7; d++) {
    const st = r.row.st[d] ?? 0;
    const ot = r.row.ot[d] ?? 0;
    if (st) cell(page, `d${d}`, yTop, formatHours(st));
    if (ot) cell(page, `d${d}`, yBot, formatHours(ot));
  }
  cell(page, "5", yTop, formatHours(r.stTotal));
  cell(page, "5", yBot, formatHours(r.otTotal));
  cell(page, "6A", yTop, money(r.row.stRateCents));
  if (r.otTotal || r.row.otRateCents) cell(page, "6A", yBot, money(r.row.otRateCents));
  cell(page, "6B", yMid, money(r.fringeCreditCents));
  cell(page, "6C", yMid, money(r.cashInLieuCents));
  cell(page, "7A", yMid, money(r.grossProjectCents));
  if (r.first && w) {
    cell(page, "7B", yMid, money(w.grossAllWorkCents));
    cell(page, "tax", yMid, money(w.worker.taxCents));
    cell(page, "fica", yMid, money(w.worker.ficaCents));
    cell(page, "other", yMid, money(w.worker.otherCents));
    cell(page, "ded", yMid, money(w.totalDeductionsCents));
    cell(page, "9", yMid, money(w.netCents), 6.5, true);
  } else if (w) {
    cell(page, "7B", yMid, "(row above)", 5);
  }
}

function pageTwo(page: PdfPage, p: ComputedPayroll) {
  const i = p.input;
  page.text(M, 24, "Statement of Compliance (page 2 of Form WH-347, its wording)", {
    size: 10,
    font: "bold",
  });
  // Header block of page 2.
  const fields: [string, string, number][][] = [
    [
      ["PROJECT NAME", i.projectName, 0.3],
      ["PROJECT NO. or CONTRACT NO.", i.projectNumber, 0.22],
      ["PAYROLL NO.", i.payrollNo, 0.14],
      ["PRIME CONTRACTOR'S/SUBCONTRACTOR'S BUSINESS NAME", i.businessName, 0.34],
    ],
    [
      ["PROJECT LOCATION", i.projectLocation, 0.52],
      ["WEEK ENDING DATE", usDate(i.weekEnding), 0.14],
      [
        "CERTIFYING OFFICIAL'S NAME AND TITLE",
        [i.certifierName, i.certifierTitle].filter(Boolean).join(", "),
        0.34,
      ],
    ],
  ];
  let top = 32;
  for (const row of fields) {
    let fx = M;
    for (const [label, value, frac] of row) {
      const w = WIDTH * frac;
      page.rect(fx, top, w, 20, { stroke: true });
      page.text(fx + 2, top + 7, label, { size: 5.5, font: "bold" });
      page.text(fx + 2, top + 16, fitText(value || "", w - 4, 7.5), { size: 7.5 });
      fx += w;
    }
    top += 20;
  }
  let y = top + 11;
  for (const l of wrapText(STATEMENT_INTRO, WIDTH, 6.5)) {
    page.text(M, y, l, { size: 6.5 });
    y += 8;
  }
  const para = (k: number) => {
    box(page, M + 2, y + 1, p.boxes[k] ?? false, 6.5);
    for (const l of wrapText(STATEMENT_OF_COMPLIANCE[k] ?? "", WIDTH - 14, 6.2)) {
      page.text(M + 12, y, l, { size: 6.2 });
      y += 7.4;
    }
    y += 1.5;
  };
  para(0);
  para(1);
  para(2);
  para(3);
  // Apprenticeship programs (three rows on the form).
  const aw = [0.45, 0.15, 0.4].map((f) => f * (WIDTH - 12));
  const ax = [M + 12, M + 12 + (aw[0] ?? 0), M + 12 + (aw[0] ?? 0) + (aw[1] ?? 0)];
  const heads = ["APPRENTICESHIP PROGRAM NAME", "REGISTERED", "NAME OF LABOR CLASSIFICATION"];
  heads.forEach((h, k) => {
    page.rect(ax[k] ?? 0, y - 6, aw[k] ?? 0, 9, { stroke: true });
    page.text((ax[k] ?? 0) + 2, y, h, { size: 5.5, font: "bold" });
  });
  y += 9;
  for (let k = 0; k < 3; k++) {
    const a = i.apprenticeships[k];
    aw.forEach((w, c) => {
      page.rect(ax[c] ?? 0, y - 6, w, 9, { stroke: true });
    });
    const program = a ? a.program : k === 0 && !p.boxes[3] ? "N/A" : "";
    page.text((ax[0] ?? 0) + 2, y, fitText(program, (aw[0] ?? 0) - 4, 6.5), { size: 6.5 });
    box(page, (ax[1] ?? 0) + 4, y + 1, a?.registeredWith === "OA", 5.5);
    page.text((ax[1] ?? 0) + 11, y, "OA", { size: 6 });
    box(page, (ax[1] ?? 0) + 30, y + 1, a?.registeredWith === "SAA", 5.5);
    page.text((ax[1] ?? 0) + 37, y, "SAA", { size: 6 });
    page.text((ax[2] ?? 0) + 2, y, fitText(a?.classification ?? "", (aw[2] ?? 0) - 4, 6.5), {
      size: 6.5,
    });
    y += 9;
  }
  y += 5;
  para(4);
  // Hourly credit for fringe benefits.
  page.text(M + 12, y, "HOURLY CREDIT FOR FRINGE BENEFITS", { size: 6, font: "bold" });
  y += 7;
  for (const l of wrapText(FRINGE_TABLE_NOTE, WIDTH - 14, 5.5)) {
    page.text(M + 12, y, l, { size: 5.5 });
    y += 6.5;
  }
  y += 3;
  const plans = i.fringePlans;
  const nameW = 150;
  const totW = 50;
  const planW = (WIDTH - 12 - nameW - totW) / MAX_FRINGE_PLANS;
  const fx0 = M + 12;
  const planHead = (label: string, get: (k: number) => string, total = "") => {
    page.rect(fx0, y - 6, nameW, 8, { stroke: true });
    page.text(fx0 + 2, y, label, { size: 5.5, font: "bold" });
    for (let k = 0; k < MAX_FRINGE_PLANS; k++) {
      const x = fx0 + nameW + k * planW;
      page.rect(x, y - 6, planW, 8, { stroke: true });
      page.text(x + 2, y, fitText(get(k), planW - 4, 5.5), { size: 5.5 });
    }
    const tx = fx0 + nameW + MAX_FRINGE_PLANS * planW;
    page.rect(tx, y - 6, totW, 8, { stroke: true });
    if (total) page.text(tx + totW / 2, y, total, { size: 5.5, font: "bold", align: "center" });
    y += 8;
  };
  planHead("FB NAME", (k) => plans[k]?.name ?? "", "TOTAL");
  planHead("FB TYPE", (k) => plans[k]?.type ?? "", "HOURLY");
  planHead("PLAN NO.", (k) => plans[k]?.planNo ?? "", "CREDIT");
  planHead("FUNDED / UNFUNDED", (k) =>
    plans[k] ? (plans[k].funded ? "[X] Funded  [ ] Unfunded" : "[ ] Funded  [X] Unfunded") : "",
  );
  const credited = p.workers.filter((w) => w.hourlyFringeCreditCents > 0);
  const shown = credited.slice(0, 8);
  for (const w of shown) {
    page.rect(fx0, y - 6, nameW, 8, { stroke: true });
    page.text(
      fx0 + 2,
      y,
      fitText(`${w.entryNo}. ${w.worker.lastName}, ${w.worker.firstName}`, nameW - 4, 6),
      { size: 6 },
    );
    for (let k = 0; k < MAX_FRINGE_PLANS; k++) {
      const x = fx0 + nameW + k * planW;
      page.rect(x, y - 6, planW, 8, { stroke: true });
      const c = w.worker.fringeCreditsCents[k];
      if (plans[k] && c) page.text(x + planW - 2, y, `$${money(c)}`, { size: 6, align: "right" });
    }
    const tx = fx0 + nameW + MAX_FRINGE_PLANS * planW;
    page.rect(tx, y - 6, totW, 8, { stroke: true });
    page.text(tx + totW - 2, y, `$${money(w.hourlyFringeCreditCents)}`, {
      size: 6,
      align: "right",
    });
    y += 8;
  }
  if (credited.length > shown.length) {
    page.text(fx0, y, `${credited.length - shown.length} more worker(s) on the addendum page.`, {
      size: 6,
      font: "bold",
    });
    y += 8;
  }
  y += 4;
  para(5);
  // Additional remarks: the user's text plus each "other" deduction named.
  const remarks = remarksText(p);
  page.text(M, y, "ADDITIONAL REMARKS", { size: 6, font: "bold" });
  y += 7;
  const remarkLines = wrapText(remarks, WIDTH, 6);
  const room = Math.max(1, Math.floor((H - 96 - y) / 7));
  remarkLines.slice(0, room).forEach((l) => {
    page.text(M, y, l, { size: 6 });
    y += 7;
  });
  if (remarkLines.length > room) page.text(M, y, "(continued on the addendum page)", { size: 6 });
  // Signature row.
  const sy = H - 82;
  const sw = [0.4, 0.15, 0.2, 0.25].map((f) => f * WIDTH);
  const labels = ["SIGNATURE OF CERTIFYING OFFICIAL", "DATE", "TELEPHONE NUMBER", "EMAIL ADDRESS"];
  const values = ["", "", i.certifierPhone, i.certifierEmail];
  let sx = M;
  labels.forEach((l, k) => {
    page.rect(sx, sy, sw[k] ?? 0, 20, { stroke: true });
    page.text(sx + 2, sy + 7, l, { size: 5.5, font: "bold" });
    page.text(sx + 2, sy + 16, fitText(values[k] ?? "", (sw[k] ?? 0) - 4, 7), { size: 7 });
    sx += sw[k] ?? 0;
  });
  wrapText(FALSIFICATION_WARNING, WIDTH, 5.3).forEach((l, k) => {
    page.text(M, sy + 28 + k * 6.3, l, { size: 5.3, font: "bold" });
  });
  return { credited, remarkLines, room };
}

export function remarksText(p: ComputedPayroll): string {
  const parts: string[] = [];
  if (p.input.remarks) parts.push(p.input.remarks);
  for (const w of p.workers) {
    if (w.worker.otherCents > 0) {
      parts.push(
        `Other deduction, entry ${w.entryNo} (${w.worker.lastName}): $${money(w.worker.otherCents)}${w.worker.otherNote ? `, ${w.worker.otherNote}` : ""}.`,
      );
    }
  }
  return parts.join(" ");
}

export function certifiedPayrollPdf(
  p: ComputedPayroll,
  opts: { sample?: boolean } = {},
): Uint8Array {
  const pdf = new PdfDocument({
    title: `Certified payroll ${p.input.payrollNo}, week ending ${p.input.weekEnding}`,
  });
  const pageCount1 = Math.max(1, Math.ceil(p.rows.length / ROWS_PER_PAGE));
  const pages: PdfPage[] = [];
  for (let n = 0; n < pageCount1; n++) {
    const page = pdf.addPage(W, H);
    pages.push(page);
    const top = headerBlock(page, p, "CERTIFIED PAYROLL NO.");
    let y = tableHeader(page, p, top + 6);
    const slice = p.rows.slice(n * ROWS_PER_PAGE, (n + 1) * ROWS_PER_PAGE);
    for (const r of slice) {
      drawRow(page, p, r, y);
      y += ROW_H;
    }
    // Blank rows keep the form's eight-row grid.
    for (let k = slice.length; k < ROWS_PER_PAGE; k++) {
      for (const c of COLS) page.rect(c.x, y, c.w, ROW_H, { stroke: true });
      y += ROW_H;
    }
    if (n === pageCount1 - 1) {
      page.text(
        M,
        y + 10,
        `Totals this payroll: ${formatHours(p.totals.hours)} hours; gross this project $${money(p.totals.grossProjectCents)}; net pay $${money(p.totals.netCents)}.`,
        {
          size: 6.5,
          font: "bold",
        },
      );
    }
  }
  const p2 = pdf.addPage(W, H);
  pages.push(p2);
  const { credited, remarkLines, room } = pageTwo(p2, p);
  // An addendum when page 2's tables overflow (more than eight workers with a credit, long remarks).
  if (credited.length > 8 || remarkLines.length > room) {
    const add = pdf.addPage(W, H);
    pages.push(add);
    add.text(M, 24, "Addendum to the statement of compliance", { size: 10, font: "bold" });
    add.text(
      M,
      36,
      fitText(
        `${p.input.projectName} | ${p.input.projectNumber} | Payroll ${p.input.payrollNo} | Week ending ${usDate(p.input.weekEnding)} | ${p.input.businessName}`,
        WIDTH,
        7,
      ),
      { size: 7 },
    );
    let y = 52;
    if (credited.length > 8) {
      add.text(M, y, "Hourly credit for fringe benefits (continued)", { size: 7, font: "bold" });
      y += 10;
      for (const w of credited.slice(8)) {
        const parts = p.input.fringePlans.map(
          (pl, k) => `${pl.name}: $${money(w.worker.fringeCreditsCents[k] ?? 0)}`,
        );
        add.text(
          M,
          y,
          fitText(
            `${w.entryNo}. ${w.worker.lastName}, ${w.worker.firstName} - ${parts.join("; ")} - total $${money(w.hourlyFringeCreditCents)}`,
            WIDTH,
            6.5,
          ),
          { size: 6.5 },
        );
        y += 8;
        if (y > H - 40) break;
      }
      y += 6;
    }
    if (remarkLines.length > room) {
      add.text(M, y, "Additional remarks (continued)", { size: 7, font: "bold" });
      y += 10;
      for (const l of remarkLines.slice(room)) {
        add.text(M, y, l, { size: 6 });
        y += 7;
        if (y > H - 40) break;
      }
    }
  }
  pages.forEach((pg, k) => {
    footer(pg, k + 1, pages.length, opts.sample ?? false);
  });
  return pdf.toBytes();
}
