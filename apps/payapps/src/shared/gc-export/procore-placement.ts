// Where a job's own SOV lines sit under the GC's Procore SOV positions, saved with the job, and the
// Procore invoice sheet totalled by those positions.
//
// A GC's Procore commitment has its own schedule of values (the "SOV positions"); the subcontractor's
// detailed SOV hangs under them (procore-ssov.ts fills that template). When the GC has not turned on
// the subcontractor SOV, or their invoice form lists the positions rather than the detail, the
// subcontractor types one amount per position. The person placed each line under a position once,
// when filling the SSOV template; saving that placement lets every later pay application be totalled
// the same way, instead of adding up lines by hand each month.
//
// Change order lines are never placed (Procore keeps commitment change orders apart from the SOV
// positions, and lists approved ones as their own invoice lines), so they are listed one by one.
import { centsToDecimal } from "../money";
import type { ProcoreInvoiceRow, ProcoreInvoiceSheet } from "./procore-invoice";

export interface ProcoreSsovPosition {
  /** The GC's SOV Position Number, as written in their template. */
  position: string;
  /** The GC's SOV description, or "". */
  description: string;
  /** The GC's amount for the position in cents, or null when it could not be read. */
  amountCents: number | null;
}

export interface ProcoreSsovPlacement {
  positions: ProcoreSsovPosition[];
  /** SOV line id → position number. Lines not in here were left out. */
  placed: Record<string, string>;
  /** ISO date the placement was saved. */
  savedOn: string;
}

/** Limits for a saved placement (a Procore commitment rarely has more than a few dozen positions). */
export const MAX_PROCORE_POSITIONS = 1000;
export const MAX_PROCORE_POSITION_LENGTH = 100;
export const MAX_PROCORE_DESCRIPTION_LENGTH = 500;

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

/** Reads the stored JSON; anything malformed reads as "never saved" rather than throwing. */
export function parsePlacement(json: string | null | undefined): ProcoreSsovPlacement | null {
  if (!json) return null;
  let v: unknown;
  try {
    v = JSON.parse(json);
  } catch {
    return null;
  }
  if (!isObj(v) || !Array.isArray(v.positions) || !isObj(v.placed)) return null;
  const positions: ProcoreSsovPosition[] = [];
  for (const p of v.positions) {
    if (!isObj(p) || typeof p.position !== "string") return null;
    positions.push({
      position: p.position,
      description: typeof p.description === "string" ? p.description : "",
      amountCents:
        typeof p.amountCents === "number" && Number.isInteger(p.amountCents) ? p.amountCents : null,
    });
  }
  const placed: Record<string, string> = {};
  for (const [k, pos] of Object.entries(v.placed)) if (typeof pos === "string") placed[k] = pos;
  return { positions, placed, savedOn: typeof v.savedOn === "string" ? v.savedOn : "" };
}

/**
 * Problems with a placement about to be saved, or [] when it can be saved: positions must be unique,
 * every placed line must be one of the job's base-contract lines, and every position it names must be
 * one of the positions sent.
 */
export function placementProblems(
  p: Pick<ProcoreSsovPlacement, "positions" | "placed">,
  baseLineIds: ReadonlySet<string>,
): string[] {
  const out: string[] = [];
  const known = new Set<string>();
  for (const pos of p.positions) {
    if (known.has(pos.position)) out.push(`Position ${pos.position} is listed twice.`);
    known.add(pos.position);
  }
  for (const [lineId, pos] of Object.entries(p.placed)) {
    if (!baseLineIds.has(lineId))
      out.push(
        `Line ${lineId} is not a base-contract line of this job (change order lines are not placed).`,
      );
    else if (!known.has(pos)) out.push(`Position ${pos} is not one of the GC's positions.`);
  }
  return out;
}

export interface ProcorePositionRow {
  position: string;
  description: string;
  /** The GC's amount for the position, when the template had one. */
  gcAmountCents: number | null;
  /** Sum of this job's scheduled values under the position (base lines, current values). */
  scheduledValueCents: number;
  workThisPeriodCents: number;
  storedNowCents: number;
  /** null when any line under the position has an unknown new stored amount. */
  newStoredCents: number | null;
  /** Completed and stored to date under the position / its scheduled value, two decimals. */
  percentComplete: string | null;
  lines: ProcoreInvoiceRow[];
}

export interface ProcoreInvoiceByPosition {
  positions: ProcorePositionRow[];
  /** Change order lines, one by one: Procore lists commitment change orders apart from positions. */
  changeOrders: ProcoreInvoiceRow[];
  /** Base-contract lines on this application with no saved position (added since, or left out). */
  unplaced: ProcoreInvoiceRow[];
  /** Positions whose GC amount differs from the sum of the scheduled values placed under them. */
  amountMismatches: ProcorePositionRow[];
  csv: string;
}

const pctOf = (done: number, of: number) =>
  of === 0 ? null : (Math.round((done * 10_000) / of) / 100).toFixed(2);

function csvCell(v: string): string {
  return /[",\r\n]/.test(v) || v !== v.trim() ? `"${v.replace(/"/g, '""')}"` : v;
}

/**
 * Totals the per-line invoice sheet by the saved Procore positions. Every position is kept, with zeros
 * when nothing is placed under it, since the GC's invoice lists each one.
 */
export function invoiceByPosition(
  sheet: ProcoreInvoiceSheet,
  placement: Pick<ProcoreSsovPlacement, "positions" | "placed">,
): ProcoreInvoiceByPosition {
  const known = new Set(placement.positions.map((p) => p.position));
  const changeOrders = sheet.rows.filter((r) => r.changeOrder);
  const base = sheet.rows.filter((r) => !r.changeOrder);
  const unplaced = base.filter((r) => !known.has(placement.placed[r.sovLineId] ?? ""));
  const positions: ProcorePositionRow[] = placement.positions.map((p) => {
    const lines = base.filter((r) => placement.placed[r.sovLineId] === p.position);
    const sum = (f: (r: ProcoreInvoiceRow) => number) => lines.reduce((s, r) => s + f(r), 0);
    const scheduled = sum((r) => r.scheduledValueCents);
    return {
      position: p.position,
      description: p.description,
      gcAmountCents: p.amountCents,
      scheduledValueCents: scheduled,
      workThisPeriodCents: sum((r) => r.workThisPeriodCents),
      storedNowCents: sum((r) => r.storedNowCents),
      newStoredCents: lines.some((r) => r.newStoredCents === null)
        ? null
        : sum((r) => r.newStoredCents ?? 0),
      percentComplete: pctOf(
        sum((r) => r.completedAndStoredCents),
        scheduled,
      ),
      lines,
    };
  });
  const amountMismatches = positions.filter(
    (p) => p.gcAmountCents !== null && p.gcAmountCents !== p.scheduledValueCents,
  );

  const header = [
    "SOV Position",
    "Description",
    "Scheduled Value",
    "Work Completed This Period",
    "Materials Presently Stored",
    "New Materials Stored",
    "% Complete",
  ];
  const money = (c: number | null) => (c === null ? "check" : centsToDecimal(c));
  const body = [
    ...positions.map((p) => [
      p.position,
      p.description,
      centsToDecimal(p.scheduledValueCents),
      centsToDecimal(p.workThisPeriodCents),
      centsToDecimal(p.storedNowCents),
      money(p.newStoredCents),
      p.percentComplete ?? "",
    ]),
    ...[...changeOrders, ...unplaced].map((r) => [
      r.changeOrder ? "Change order" : "Not placed",
      r.description,
      centsToDecimal(r.scheduledValueCents),
      centsToDecimal(r.workThisPeriodCents),
      centsToDecimal(r.storedNowCents),
      money(r.newStoredCents),
      r.percentComplete ?? "",
    ]),
  ];
  const total = [
    "Total",
    "",
    centsToDecimal(sheet.rows.reduce((s, r) => s + r.scheduledValueCents, 0)),
    centsToDecimal(sheet.totals.workThisPeriodCents),
    centsToDecimal(sheet.totals.storedNowCents),
    money(sheet.totals.newStoredCents),
    "",
  ];
  const csv = `${[header, ...body, total].map((r) => r.map(csvCell).join(",")).join("\r\n")}\r\n`;
  return { positions, changeOrders, unplaced, amountMismatches, csv };
}
