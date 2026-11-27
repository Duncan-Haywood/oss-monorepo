// Where an OCR misread probably sits, when a scanned schedule of values does not add up. A scan's text layer can read
// one digit as another that looks like it (an 8 as a 3, a 6 as a 5), and the figure still reads as a dollar amount, so
// nothing else catches it. A sheet carries its own redundancy: the totals row (the lines should add up to it), and on
// a continuation sheet each row's columns (D + E + F = G, C - G = H, G / C = %). When the arithmetic is off, every amount involved is tried
// with one digit swapped for a look-alike; an amount whose swap makes the arithmetic come right is named as the likely
// misread. Pure, and only a pointer: nothing is changed, the contractor checks the paper and corrects the figure.

import type { PrintedPercent } from "./schedule";

/**
 * Digits a scanner's OCR mixes up, both ways round. Our own list from how the glyphs look in the usual table fonts
 * (closed and open loops, a bar or a hook): not a measured confusion matrix. A pair missing here only means a misread
 * goes unnamed; the sheet-total check still reports it.
 */
const LOOK_ALIKE: Record<string, string> = {
  "0": "689",
  "1": "47",
  "2": "7",
  "3": "58",
  "4": "19",
  "5": "368",
  "6": "058",
  "7": "12",
  "8": "03569",
  "9": "048",
};

export interface DigitSwap {
  /** The amount with the one digit swapped, in cents. */
  cents: number;
  /** The digit as read, and the look-alike it may be on the paper. */
  read: string;
  paper: string;
}

/** Every amount `cents` could be on the paper with one digit read as a look-alike (same number of digits). */
export function lookAlikes(cents: number): DigitSwap[] {
  if (!Number.isSafeInteger(cents) || cents < 0) return [];
  const s = String(cents);
  const out: DigitSwap[] = [];
  for (let i = 0; i < s.length; i++) {
    const d = s[i] as string;
    for (const p of LOOK_ALIKE[d] ?? "") {
      if (i === 0 && p === "0" && s.length > 1) continue; // a leading zero is not printed
      out.push({ cents: Number(`${s.slice(0, i)}${p}${s.slice(i + 1)}`), read: d, paper: p });
    }
  }
  return out;
}

export interface Misread {
  /** What was read: the line's label, or "the totals row". */
  label: string;
  /** Where: "page 1, line 7". */
  source: string;
  readCents: number;
  swap: DigitSwap;
}

/**
 * The lines (or the totals row) that one look-alike digit would bring into agreement with the sheet's own total,
 * within `slack` cents (the total check's rounding allowance). Empty when the lines already agree, or when no
 * single swap explains the gap.
 */
export function misreadsAgainstTotal(
  lines: { label: string; source: string; cents: number }[],
  total: { source: string; cents: number },
  slack: number,
): Misread[] {
  const sum = lines.reduce((a, l) => a + l.cents, 0);
  if (Math.abs(sum - total.cents) <= slack) return [];
  const out: Misread[] = [];
  for (const l of lines)
    for (const swap of lookAlikes(l.cents))
      if (Math.abs(sum - l.cents + swap.cents - total.cents) <= slack)
        out.push({ label: l.label, source: l.source, readCents: l.cents, swap });
  for (const swap of lookAlikes(total.cents))
    if (Math.abs(sum - swap.cents) <= slack)
      out.push({ label: "the totals row", source: total.source, readCents: total.cents, swap });
  return out;
}

export type RowCell = "C" | "D" | "E" | "F" | "G" | "H";

/** One continuation-sheet row's figures as read; null where a cell was not read (or the sheet has no such column). */
export interface RowFigures {
  /** C, the scheduled value. */
  scheduledCents?: number | null;
  previousCents: number | null;
  thisPeriodCents: number | null;
  storedCents: number | null;
  toDateCents: number | null;
  /** H, balance to finish. */
  balanceCents?: number | null;
  /** The % (G / C) column as printed. */
  percent?: PrintedPercent | null;
}

type Cells = {
  c: number | null;
  d: number | null;
  e: number | null;
  f: number;
  g: number | null;
  h: number | null;
};

const cellsOf = (b: RowFigures): Cells => ({
  c: b.scheduledCents ?? null,
  d: b.previousCents,
  e: b.thisPeriodCents,
  f: b.storedCents ?? 0,
  g: b.toDateCents,
  h: b.balanceCents ?? null,
});

/** D + E + F = G, to the cent; null when D, E or G was not read. */
const sumHolds = ({ d, e, f, g }: Cells) =>
  d === null || e === null || g === null ? null : Math.abs(d + e + f - g) <= 1;

/** C - G = H, to the cent; null when C, G or H was not read. */
const balanceHolds = ({ c, g, h }: Cells) =>
  c === null || g === null || h === null ? null : Math.abs(c - g - h) <= 1;

/**
 * G / C against the printed %, allowing for the printed rounding (or truncation) to its last digit; null when C, G
 * or the % was not read, or C is zero. A bare figure of 1 or less ("0.45") may be a fraction: either reading fits.
 */
function percentHolds({ c, g }: Cells, p: PrintedPercent | null | undefined): boolean | null {
  if (!p || c === null || g === null || c === 0) return null;
  const actual = (g / c) * 100;
  const unit = 10 ** -p.decimals;
  const v = p.scaled * unit;
  // Within one unit of the last printed digit either way: covers rounding (45.5% shows as 46%) and truncation (45.9% as 45%).
  const near = (x: number, u: number) => Math.abs(actual - x) < u - 1e-9;
  return near(v, unit) || (!p.sign && v <= 1 && near(v * 100, unit * 100));
}

/** Which of the row's own relations fail as read: "sum" (D + E + F = G) and "balance" (C - G = H). */
export function rowGaps(b: RowFigures): ("sum" | "balance")[] {
  const x = cellsOf(b);
  return [
    ...(sumHolds(x) === false ? (["sum"] as const) : []),
    ...(balanceHolds(x) === false ? (["balance"] as const) : []),
  ];
}

/**
 * The cells of one continuation-sheet row that one look-alike digit would make agree with itself: D + E + F = G, and,
 * where the sheet has the columns, C - G = H and G / C = the printed %. Every relation the row has must hold after
 * the swap, so a G that would mend the sum but break the balance is not named: the more columns, the fewer suspects.
 * A cell that was not read is not tried. Empty when the row agrees with itself (a % that alone disagrees is ignored:
 * it is never imported, and a cell of D to H misread would break the sum or the balance too).
 */
export function misreadsInRow(
  b: RowFigures,
): { cell: RowCell; readCents: number; swap: DigitSwap }[] {
  const x = cellsOf(b);
  if (!rowGaps(b).length) return [];
  const agrees = (y: Cells) =>
    sumHolds(y) !== false && balanceHolds(y) !== false && percentHolds(y, b.percent) !== false;
  const out: { cell: RowCell; readCents: number; swap: DigitSwap }[] = [];
  const keys: [RowCell, keyof Cells][] = [
    ["C", "c"],
    ["D", "d"],
    ["E", "e"],
    ["F", "f"],
    ["G", "g"],
    ["H", "h"],
  ];
  for (const [cell, k] of keys) {
    const v = x[k];
    if (v === null || (cell === "F" && b.storedCents == null)) continue;
    for (const swap of lookAlikes(v))
      if (agrees({ ...x, [k]: swap.cents })) out.push({ cell, readCents: v, swap });
  }
  return out;
}

/**
 * Whether `cents` as the row's scheduled value (C) agrees with the rest of the row: C - G = H and G / C = the printed
 * %, where the sheet has those columns. True when it has neither, so a sheet without them names suspects as before.
 */
export function scheduledAgrees(b: RowFigures, cents: number): boolean {
  const y = { ...cellsOf(b), c: cents };
  return balanceHolds(y) !== false && percentHolds(y, b.percent) !== false;
}

const usd = (c: number) =>
  `${c < 0 ? "-" : ""}$${(Math.abs(c) / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const a = (d: string) => (d === "8" ? "an 8" : `a ${d}`);

/** "page 1, line 7 (Electrical rough-in) reads $18,450.00; $13,450.00 if its 8 is a 3 on the paper" */
export const describeSwap = (where: string, readCents: number, swap: DigitSwap) =>
  `${where} reads ${usd(readCents)}; ${usd(swap.cents)} if ${a(swap.read)} there is ${a(swap.paper)} on the paper`;

/** At most this many suspects are named; more than that and the pointer says nothing useful. */
export const MAX_SUSPECTS = 3;
