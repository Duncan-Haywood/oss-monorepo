// Mid-job start from the contractor's own continuation sheet: the last application made before the job moved here,
// read by the schedule-of-values reader, mapped onto the job's lines in PayApps. Out come the opening balance's
// "work completed to date" per line (columns D + E: stored materials are entered again on the next application),
// line 6 and line 5a where the sheet holds them, and everything that did not line up, by row. Pure: the browser fills
// the form with it and the contractor checks and saves; nothing here is sent anywhere.
import { describeSwap, MAX_SUSPECTS, misreadsInRow, rowGaps } from "./misread";
import type { ImportCheck, ImportedSovLine, SovImportOk } from "./schedule";

export interface OpeningTargetLine {
  id: string;
  itemNumber: string;
  description: string;
  /** Original + approved change orders, as this job has it now. */
  currentCents: number;
}

export interface OpeningMatch {
  sovLineId: string;
  /** Sheet row, e.g. "cell C9". */
  source: string;
  completedCents: number;
  by: "item" | "description";
}
export interface OpeningUnmatched {
  source: string;
  label: string;
  completedCents: number | null;
  reason: "no_match" | "ambiguous";
}

export interface OpeningFillOk {
  ok: true;
  /** sovLineId -> work completed to date (D + E), for every job line (0 where the sheet has nothing for it). */
  completed: Record<string, number>;
  matched: OpeningMatch[];
  /** Sheet rows with work on them that no job line took. Their work is not in `completed`. */
  unmatched: OpeningUnmatched[];
  /** Job lines the sheet has no row for (left at $0.00). */
  missing: { sovLineId: string; label: string }[];
  checks: ImportCheck[];
  notes: string[];
  /** Column D + E over every sheet row, matched or not. */
  sheetCompletedCents: number;
  /** Column F over every row: stored materials are not carried; they go on the next application again. */
  storedCents: number;
  /** Line 6 (G less retainage over every row), when the sheet has both. */
  line6Cents: number | null;
  /** Line 5a, retainage on completed work, when the sheet has a retainage column and nothing stored. */
  line5aCents: number | null;
  applicationNumber: number | null;
  periodTo: string | null;
}
export type OpeningFill = OpeningFillOk | { ok: false; error: string };

const usd = (c: number) =>
  `${c < 0 ? "-" : ""}$${(Math.abs(c) / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** Item numbers compare without case, spaces or leading zeros ("01" = "1", "CO 1" = "co-1"). */
export const itemKey = (s: string) => {
  const t = s
    .trim()
    .toLowerCase()
    .replace(/[\s.#_-]+/g, "");
  return /^\d+$/.test(t) ? String(Number(t)) : t;
};
/** Descriptions compare on letters and digits only. */
export const descKey = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

const label = (l: { itemNumber: string; description: string }) =>
  [l.itemNumber, l.description].filter(Boolean).join(" ");
const NO_RESULT = /formula with no saved result/;
// "cell G10 is a formula with no saved result (...). Open it ..." -> "cell G10 is a formula with no saved result".
const shortError = (e: string) => e.replace(/ \(.*$/, "");

/** Per-line retainage, ROUND(work x rate + stored x stored rate, 2) in cents, half away from zero (Excel's ROUND). */
export const lineRetainage = (work: number, stored: number, bps: number, storedBps: number) => {
  const x = work * bps + stored * storedBps; // ten-thousandths of a cent
  return Math.sign(x) * Math.floor((Math.abs(x) + 5000) / 10_000);
};

const list = (xs: string[], n = 5) =>
  `${xs.slice(0, n).join("; ")}${xs.length > n ? `; and ${xs.length - n} more` : ""}`;

/**
 * Maps a continuation sheet's rows (contract lines and change-order rows) onto a job's schedule of values: by item
 * number first, then by description, and only where exactly one row and one line share the key. Anything else is
 * listed for the contractor to enter by hand, never guessed.
 */
export function openingFromImport(sheet: SovImportOk, job: OpeningTargetLine[]): OpeningFill {
  if (!sheet.billingColumns.some((c) => c === "D" || c === "E" || c === "G"))
    return {
      ok: false,
      error:
        "This sheet has a schedule of values but no billing columns (work completed from previous application, this period, or total completed and stored to date). Choose the continuation sheet of the last application you sent.",
    };
  if (!job.length)
    return {
      ok: false,
      error: "Add the job's schedule of values first, then fill the opening balance.",
    };

  const rows: ImportedSovLine[] = [...sheet.lines, ...sheet.changeOrderLines];
  const checks: ImportCheck[] = [];
  const notes: string[] = [];

  // A cell that could not be read matters when it leaves the row's work completed unknown. A formula with no saved
  // result in G or the retainage column (a file written by a program that does not calculate, like the free
  // template before it is saved in Excel) does not, when D and E are there: one note, not a warning per cell.
  const blocking = rows.flatMap((r) =>
    r.billing && r.billing.completedCents === null ? r.billing.errors : [],
  );
  const aside = rows.flatMap((r) =>
    r.billing && r.billing.completedCents !== null ? r.billing.errors : [],
  );
  const uncalculated = aside.filter((e) => NO_RESULT.test(e)).map((e) => e.replace(/ is .*$/, ""));
  const otherAside = aside.filter((e) => !NO_RESULT.test(e));
  if (blocking.length)
    checks.push({
      severity: "high",
      message: `${blocking.length} billing cell${blocking.length === 1 ? " was" : "s were"} not read, so work completed on ${blocking.length === 1 ? "its line" : "those lines"} is left for you to enter: ${list(blocking.map(shortError), 3)}.`,
    });
  if (otherAside.length)
    checks.push({
      severity: "medium",
      message: `${otherAside.length} billing cell${otherAside.length === 1 ? " was" : "s were"} not read: ${list(otherAside.map(shortError), 3)}. Work completed still came from columns D and E.`,
    });
  if (uncalculated.length)
    notes.push(
      `${uncalculated.length} formula cell${uncalculated.length === 1 ? " has" : "s have"} no saved result (${list(uncalculated, 4)}): the file was written by a program that does not calculate. Work completed came from columns D and E; to read the sheet's own totals too, open the file in Excel, LibreOffice or Google Sheets, save it and choose it again.`,
    );

  const taken = new Map<number, OpeningMatch>(); // row index -> match
  const used = new Set<string>();
  const pass = (
    by: OpeningMatch["by"],
    key: (l: { itemNumber: string; description: string }) => string,
  ) => {
    const rowKeys = new Map<string, number[]>();
    rows.forEach((r, i) => {
      if (taken.has(i)) return;
      const k = key(r);
      if (k) rowKeys.set(k, [...(rowKeys.get(k) ?? []), i]);
    });
    const jobKeys = new Map<string, OpeningTargetLine[]>();
    for (const l of job) {
      if (used.has(l.id)) continue;
      const k = key(l);
      if (k) jobKeys.set(k, [...(jobKeys.get(k) ?? []), l]);
    }
    const ambiguous = new Set<number>();
    for (const [k, idx] of rowKeys) {
      const ls = jobKeys.get(k) ?? [];
      if (idx.length === 1 && ls.length === 1) {
        const i = idx[0] as number;
        const l = ls[0] as OpeningTargetLine;
        const row = rows[i] as ImportedSovLine;
        taken.set(i, {
          sovLineId: l.id,
          source: row.source,
          completedCents: row.billing?.completedCents ?? 0,
          by,
        });
        used.add(l.id);
      } else if (ls.length) for (const i of idx) ambiguous.add(i);
    }
    return ambiguous;
  };
  pass("item", (l) => itemKey(l.itemNumber));
  const ambiguous = pass("description", (l) => descKey(l.description));

  // A row whose billing cells could not be read is listed, not matched with $0.00.
  for (const [i, m] of [...taken]) {
    const row = rows[i] as ImportedSovLine;
    if (row.billing?.completedCents === null || row.billing === undefined) {
      taken.delete(i);
      used.delete(m.sovLineId);
    }
  }

  const matched = [...taken.entries()].sort(([a], [b]) => a - b).map(([, m]) => m);
  const completed: Record<string, number> = Object.fromEntries(job.map((l) => [l.id, 0]));
  for (const m of matched) completed[m.sovLineId] = m.completedCents;

  const unmatched: OpeningUnmatched[] = [];
  rows.forEach((r, i) => {
    if (taken.has(i)) return;
    const c = r.billing?.completedCents ?? null;
    if (c === 0 && !ambiguous.has(i)) return; // nothing billed on it: nothing lost by leaving it out
    unmatched.push({
      source: r.source,
      label: label(r),
      completedCents: c,
      reason: ambiguous.has(i) ? "ambiguous" : "no_match",
    });
  });
  const missing = job
    .filter((l) => !used.has(l.id))
    .map((l) => ({ sovLineId: l.id, label: label(l) }));

  const byId = new Map(job.map((l) => [l.id, l]));
  const rowBySource = new Map(rows.map((r) => [r.source, r]));
  const over: string[] = [];
  const valueDiffers: string[] = [];
  const renamed: string[] = [];
  for (const m of matched) {
    const l = byId.get(m.sovLineId) as OpeningTargetLine;
    const r = rowBySource.get(m.source) as ImportedSovLine;
    if (m.completedCents > l.currentCents)
      over.push(`${label(l)}: ${usd(m.completedCents)} completed of ${usd(l.currentCents)}`);
    if (r.originalCents !== l.currentCents)
      valueDiffers.push(
        `${label(l)}: ${usd(r.originalCents)} on the sheet, ${usd(l.currentCents)} here`,
      );
    if (m.by === "item" && descKey(r.description) !== descKey(l.description))
      renamed.push(
        `item ${l.itemNumber} is "${r.description}" on the sheet and "${l.description}" here`,
      );
  }
  if (over.length)
    checks.push({
      severity: "high",
      message: `More work completed than the line's scheduled value: ${list(over)}. Add the change order that covers it, or correct the line.`,
    });
  if (renamed.length)
    checks.push({
      severity: "medium",
      message: `Matched by item number, but the descriptions differ: ${list(renamed)}. Check these are the same work.`,
    });
  if (valueDiffers.length)
    checks.push({
      severity: "medium",
      message: `Scheduled values differ: ${list(valueDiffers)}. A change order approved after that application, or a line split differently, explains it; the work completed is still taken from the sheet.`,
    });
  if (unmatched.length) {
    const amb = unmatched.filter((u) => u.reason === "ambiguous").length;
    checks.push({
      severity: "high",
      message: `${unmatched.length} row${unmatched.length === 1 ? "" : "s"} with work on ${unmatched.length === 1 ? "it" : "them"} did not match one line here${amb ? ` (${amb} because more than one line shares the item number or description)` : ""}: ${list(unmatched.map((u) => `${u.label} (${u.source}${u.completedCents === null ? "" : `, ${usd(u.completedCents)}`})`))}. Choose the line each one belongs on below the list, or enter that work by hand${sheet.changeOrderLines.length ? "; a change order that added to an existing line goes on that line" : ""}.`,
    });
  }
  if (missing.length && matched.length)
    notes.push(
      `${missing.length} line${missing.length === 1 ? "" : "s"} here ${missing.length === 1 ? "has" : "have"} no row on the sheet and ${missing.length === 1 ? "is" : "are"} left at $0.00: ${list(missing.map((x) => x.label))}.`,
    );

  const sum = (f: (r: ImportedSovLine) => number | null | undefined) => {
    let total = 0;
    for (const r of rows) {
      const v = f(r);
      if (v === null || v === undefined) return null;
      total += v;
    }
    return total;
  };
  const sheetCompletedCents = sum((r) => r.billing?.completedCents ?? 0) ?? 0;
  const storedCents = sum((r) => r.billing?.storedCents ?? 0) ?? 0;
  const hasRet = sheet.billingColumns.includes("retainage");
  const toDate = sum(
    (r) =>
      r.billing?.toDateCents ?? (r.billing?.completedCents ?? 0) + (r.billing?.storedCents ?? 0),
  );
  let retainage = hasRet ? sum((r) => r.billing?.retainageCents) : null;
  // No usable retainage column, but the title block states the rates (the free template does): work it out the way
  // the template's own formula does, per line, ROUND((D + E) x rate + F x stored rate, 2), and say so.
  let fromRates = false;
  const workBps = sheet.retainageWorkBps;
  const storedBps = sheet.retainageStoredBps ?? (storedCents === 0 ? 0 : null);
  if (retainage === null && workBps !== null && storedBps !== null) {
    retainage = sum((r) =>
      r.billing?.completedCents === null
        ? null
        : lineRetainage(
            r.billing?.completedCents ?? 0,
            r.billing?.storedCents ?? 0,
            workBps,
            storedBps,
          ),
    );
    fromRates = retainage !== null;
  }
  const line4 = fromRates
    ? sum((r) => (r.billing?.completedCents ?? 0) + (r.billing?.storedCents ?? 0))
    : toDate;
  let line6Cents = retainage !== null && line4 !== null ? line4 - retainage : null;
  let line5aCents = retainage !== null && storedCents === 0 ? retainage : null;
  if (fromRates && retainage !== null)
    notes.push(
      `Retainage (line 5, ${usd(retainage)}) was worked out from the rates in the sheet's title block (${(workBps ?? 0) / 100}% on work${storedCents > 0 ? `, ${(storedBps ?? 0) / 100}% on stored materials` : ""}), rounded per line; check line 6 against the application you sent.`,
    );

  // The workbook's summary sheet (G702), when it has one: line 6 and line 5a as the application stated them, which
  // the continuation sheet alone cannot give when materials are stored. Taken only when it is the same application.
  let applicationNumber = sheet.applicationNumber;
  let periodTo = sheet.periodTo;
  const s = sheet.summary ?? null;
  if (s) {
    const which = (n: number | null, p: string | null) =>
      [n !== null ? `application ${n}` : "", p !== null ? `the period to ${p}` : ""]
        .filter(Boolean)
        .join(", ");
    const otherApp =
      s.applicationNumber !== null &&
      sheet.applicationNumber !== null &&
      s.applicationNumber !== sheet.applicationNumber;
    const otherPeriod =
      s.periodTo !== null && sheet.periodTo !== null && s.periodTo !== sheet.periodTo;
    if (otherApp || otherPeriod)
      checks.push({
        severity: "high",
        message: `The summary sheet "${s.sheet}" is for ${which(s.applicationNumber, s.periodTo)}, but the continuation sheet is for ${which(sheet.applicationNumber, sheet.periodTo)}, so nothing was taken from the summary sheet. Check this is the workbook of the last application you sent.`,
      });
    else {
      const a = s.amounts;
      const at = (k: keyof typeof s.sources) => s.sources[k] ?? "";
      const s6 = a.line6 ?? (a.line4 !== null && a.line5 !== null ? a.line4 - a.line5 : null);
      const s6From =
        a.line6 !== null ? at("line6") : `line 4 less line 5, ${at("line4")} less ${at("line5")}`;
      // Line 5 less 5b when 5a is not stated on its own; with nothing stored, 5b is $0.00.
      const s5b = a.line5b ?? (storedCents === 0 ? 0 : null);
      const s5a = a.line5a ?? (a.line5 !== null && s5b !== null ? a.line5 - s5b : null);
      const s5aFrom =
        a.line5a !== null
          ? at("line5a")
          : a.line5b !== null
            ? `line 5 less 5b, ${at("line5")} less ${at("line5b")}`
            : `line 5, ${at("line5")}, nothing stored`;
      if (
        a.line5a !== null &&
        a.line5b !== null &&
        a.line5 !== null &&
        Math.abs(a.line5a + a.line5b - a.line5) > 1
      )
        checks.push({
          severity: "medium",
          message: `On the summary sheet, line 5a (${usd(a.line5a)}) plus 5b (${usd(a.line5b)}) is not line 5 (${usd(a.line5)}). Line 5a was taken as stated; check it against the application you sent.`,
        });
      if (
        a.line4 !== null &&
        a.line5 !== null &&
        a.line6 !== null &&
        Math.abs(a.line4 - a.line5 - a.line6) > 1
      )
        checks.push({
          severity: "medium",
          message: `On the summary sheet, line 4 (${usd(a.line4)}) less line 5 (${usd(a.line5)}) is not line 6 (${usd(a.line6)}). Line 6 was taken as stated; check it against the application you sent.`,
        });
      if (s6 !== null && line6Cents !== null && Math.abs(s6 - line6Cents) > 1)
        checks.push({
          severity: "medium",
          message: `The summary sheet "${s.sheet}" gives line 6 as ${usd(s6)}; the continuation sheet's columns give ${usd(line6Cents)}. Line 6 was filled from the summary sheet; check which one the application said.`,
        });
      if (s5a !== null && line5aCents !== null && Math.abs(s5a - line5aCents) > 1)
        checks.push({
          severity: "medium",
          message: `The summary sheet "${s.sheet}" gives line 5a as ${usd(s5a)}; the continuation sheet's retainage column gives ${usd(line5aCents)}. Line 5a was filled from the summary sheet; check which one the application said.`,
        });
      const taken: string[] = [];
      if (s6 !== null) {
        line6Cents = s6;
        taken.push(`line 6 (${usd(s6)}, ${s6From})`);
      }
      if (s5a !== null) {
        line5aCents = s5a;
        taken.push(`line 5a (${usd(s5a)}, ${s5aFrom})`);
      }
      if (applicationNumber === null && s.applicationNumber !== null) {
        applicationNumber = s.applicationNumber;
        taken.push(`the application number (${s.applicationNumber})`);
      }
      if (periodTo === null && s.periodTo !== null) {
        periodTo = s.periodTo;
        taken.push(`the period end (${s.periodTo})`);
      }
      if (taken.length) notes.push(`From the summary sheet "${s.sheet}": ${taken.join("; ")}.`);
      if (s.errors.length)
        notes.push(
          `On the summary sheet "${s.sheet}", ${list(s.errors, 3)}: open the file in Excel, LibreOffice or Google Sheets, save it and choose it again to read ${s.errors.length === 1 ? "it" : "them"}.`,
        );
    }
  }

  // D + E + F should be G, and C - G should be H, on every row the sheet has the columns for.
  const gaps = rows.flatMap((r) => {
    const b = r.billing;
    if (!b) return [];
    const fig = { ...b, scheduledCents: r.originalCents };
    const fails = rowGaps(fig);
    if (!fails.length) return [];
    const said: string[] = [];
    if (fails.includes("sum")) {
      const g = (b.previousCents ?? 0) + (b.thisPeriodCents ?? 0) + (b.storedCents ?? 0);
      said.push(`D + E + F = ${usd(g)}, G = ${usd(b.toDateCents ?? 0)}`);
    }
    if (fails.includes("balance"))
      said.push(
        `C - G = ${usd(r.originalCents - (b.toDateCents ?? 0))}, H = ${usd(b.balanceCents ?? 0)}`,
      );
    // From a scan, the cell one look-alike digit would put right is the likely misread: named, never changed.
    const suspects = sheet.scanned ? misreadsInRow(fig) : [];
    const hint =
      suspects.length && suspects.length <= MAX_SUSPECTS
        ? ` (${suspects.map((m) => describeSwap(`column ${m.cell}`, m.readCents, m.swap)).join(", or ")})`
        : "";
    return [`${label(r)} (${r.source}): ${said.join("; ")}${hint}`];
  });
  if (gaps.length)
    checks.push({
      severity: "high",
      message: `The sheet's own columns disagree: ${list(gaps)}. Work completed was taken from D + E; check which is right${sheet.scanned ? " on the paper: the scan's OCR can read a digit as a look-alike" : ""}.`,
    });

  if (storedCents > 0)
    notes.push(
      `${usd(storedCents)} of materials presently stored (column F) is not carried over: enter it again as stored materials on your first application here.${(hasRet || fromRates) && line5aCents === null ? " Line 5a is left blank because the retainage covers stored materials too; copy 5a from the application's summary page." : ""}`,
    );
  if (!hasRet && !fromRates && line6Cents === null)
    notes.push(
      "The sheet has no retainage column, so line 6 (and 5a) are not filled: copy them from the application's summary page.",
    );
  else if (!hasRet && !fromRates && line5aCents === null)
    notes.push(
      "Line 5a is not filled: the summary sheet does not split retainage on work from retainage on stored materials. Copy 5a from the application's summary page.",
    );
  if (applicationNumber === null || periodTo === null)
    notes.push(
      `The ${[applicationNumber === null ? "application number" : "", periodTo === null ? "period end" : ""].filter(Boolean).join(" and ")} ${applicationNumber === null && periodTo === null ? "were" : "was"} not found ${s ? "on either sheet" : "above the table"}: enter ${applicationNumber === null && periodTo === null ? "them" : "it"} from the application.`,
    );

  return {
    ok: true,
    completed,
    matched,
    unmatched,
    missing,
    checks,
    notes,
    sheetCompletedCents,
    storedCents,
    line6Cents,
    line5aCents,
    applicationNumber,
    periodTo,
  };
}

/**
 * Puts a row the matcher could not place (`unmatched`) on a job line the contractor chose, or moves or takes it off
 * again. The row's work is added to what the line already shows, since a change-order row that added to an existing
 * line belongs on top of that line's own row; moving it takes the same amount back off the line it was on (never
 * below $0.00, in case the figure was typed over since), so hand edits to other lines survive. Returns a new map.
 */
export function placeUnmatched(
  completed: Record<string, number>,
  cents: number,
  from: string | null,
  to: string | null,
): Record<string, number> {
  const next = { ...completed };
  if (from === to || cents <= 0) return next;
  if (from !== null && from in next) next[from] = Math.max(0, (next[from] ?? 0) - cents);
  if (to !== null && to in next) next[to] = (next[to] ?? 0) + cents;
  return next;
}

/** Job lines whose work completed is now above their scheduled value, as sentences, for the fill report. */
export function overScheduled(
  completed: Record<string, number>,
  job: OpeningTargetLine[],
): string[] {
  return job
    .filter((l) => (completed[l.id] ?? 0) > l.currentCents)
    .map((l) => `${label(l)}: ${usd(completed[l.id] ?? 0)} completed of ${usd(l.currentCents)}`);
}
