// Procore's Subcontractor Schedule of Values (SSOV) CSV: the GC downloads a template from the commitment
// ("Edit SSOV" → "Import CSV" → "Download CSV Template") with one row per SOV position, and the
// subcontractor adds detail rows under each position. This fills that template from the job's own SOV.
//
// The format is read from the GC's own file, never assumed: we keep its header row, its columns and their
// order, its delimiter (comma or semicolon) and the GC's cells on every row, and write only the two
// subcontractor columns. Rules followed, from Procore's help page "Import a Subcontractor Schedule of
// Values from a CSV" (read 2026-11-25): do not add, move or rename columns; every row needs the SOV
// Position Number and the SOV Amount; the Subcontractor SOV Amount is a plain number such as 15000, with
// no commas or dollar signs, and 0.00 rather than a blank cell. Runs in the browser; nothing is uploaded.
import { centsToDecimal } from "../money";
import { detectDelimiter, parseCsv } from "../sov-import/csv";
import { readMoney } from "../sov-import/schedule";

export const PROCORE_SSOV_HELP_URL =
  "https://v2.support.procore.com/product-manuals/commitments-project/tutorials/import-a-subcontractor-schedule-of-values-from-a-csv";

export interface SsovPosition {
  /** The SOV Position Number cell, as written. */
  position: string;
  /** The GC's SOV Description, or "" when the template has no such column. */
  description: string;
  /** The GC's SOV Amount in cents, or null when the column is missing or the cell is not a number. */
  amountCents: number | null;
  /** The position's first row in the template, every cell kept for the rows we write. */
  row: string[];
}

export interface SsovTemplate {
  delimiter: string;
  /** Rows above the header (titles, notes), written back unchanged. */
  preamble: string[][];
  header: string[];
  col: { position: number; subDescription: number | null; subAmount: number };
  positions: SsovPosition[];
}

export type SsovTemplateResult =
  | { ok: true; template: SsovTemplate }
  | { ok: false; error: string };

/** One of the job's own SOV lines, as the subcontractor's detail under a GC position. */
export interface SsovLine {
  id: string;
  description: string;
  cents: number;
}

const norm = (s: string) =>
  s
    .replace(/^\uFEFF/, "")
    .trim()
    .toLowerCase()
    .replace(/[_\s]+/g, " ");

const isPosition = (h: string) => /^(sov )?position( number| no\.?| #)?$/.test(norm(h));
const isSubAmount = (h: string) => /^(subcontractor|sub) (sov )?amount$/.test(norm(h));
const isSubDescription = (h: string) => /^(subcontractor|sub) (sov )?description$/.test(norm(h));
const isGcAmount = (h: string) => /^(sov )?amount$/.test(norm(h));
const isGcDescription = (h: string) => /^(sov )?description$/.test(norm(h));

/** Reads the CSV template the GC's Procore commitment produced. Never throws. */
export function readSsovTemplate(text: string): SsovTemplateResult {
  const src = text.replace(/^\uFEFF/, "");
  if (src.trim() === "") return { ok: false, error: "The file is empty." };
  const grid = parseCsv(src);
  const at = grid.findIndex((r) => r.some(isPosition) && r.some(isSubAmount));
  if (at < 0)
    return {
      ok: false,
      error:
        "This is not Procore's Subcontractor SOV template: no row has both a “SOV Position Number” and a “Subcontractor SOV Amount” column. In Procore, open the commitment's Subcontractor Schedule of Values tab, click Edit SSOV, then Import CSV → Download CSV Template, and choose that file.",
    };
  const header = grid[at] ?? [];
  const position = header.findIndex(isPosition);
  const subAmount = header.findIndex(isSubAmount);
  const subDescription = header.findIndex(isSubDescription);
  const gcAmount = header.findIndex(isGcAmount);
  const gcDescription = header.findIndex(isGcDescription);
  const firstLine = src.replace(/\r\n?/g, "\n").split("\n")[at] ?? "";
  const positions: SsovPosition[] = [];
  const seen = new Set<string>();
  for (const row of grid.slice(at + 1)) {
    const pos = (row[position] ?? "").trim();
    if (pos === "" || seen.has(pos)) continue;
    seen.add(pos);
    const money = gcAmount >= 0 ? readMoney(row[gcAmount] ?? "") : null;
    positions.push({
      position: pos,
      description: gcDescription >= 0 ? (row[gcDescription] ?? "").trim() : "",
      amountCents: money && "cents" in money ? money.cents : null,
      row: header.map((_, i) => row[i] ?? ""),
    });
  }
  if (positions.length === 0)
    return {
      ok: false,
      error:
        "The template has no SOV positions under its header. The GC's commitment needs its schedule of values entered in Procore before the template lists them.",
    };
  return {
    ok: true,
    template: {
      delimiter: detectDelimiter(firstLine),
      preamble: grid.slice(0, at),
      header,
      col: { position, subDescription: subDescription >= 0 ? subDescription : null, subAmount },
      positions,
    },
  };
}

const words = (s: string) =>
  new Set(
    s
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((w) => w.length > 2),
  );

/**
 * A first guess at which GC position each line sits under: all of them when the commitment has one
 * position (the usual case for a small subcontract); otherwise a line whose amount equals exactly one
 * position's amount, else the position whose description shares the most words with it. Lines with no
 * reasonable guess are left out for the user to place.
 */
export function suggestPositions(t: SsovTemplate, lines: SsovLine[]): Record<string, string> {
  const out: Record<string, string> = {};
  const only = t.positions.length === 1 ? t.positions[0] : undefined;
  for (const line of lines) {
    if (only) {
      out[line.id] = only.position;
      continue;
    }
    const byAmount = t.positions.filter((p) => p.amountCents === line.cents);
    if (byAmount.length === 1 && byAmount[0]) {
      out[line.id] = byAmount[0].position;
      continue;
    }
    const lw = words(line.description);
    let best: { pos: string; score: number } | null = null;
    for (const p of t.positions) {
      const pw = words(p.description);
      let shared = 0;
      for (const w of lw) if (pw.has(w)) shared++;
      const score = shared / Math.max(1, Math.min(lw.size, pw.size));
      if (shared > 0 && score >= 0.5 && (!best || score > best.score))
        best = { pos: p.position, score };
    }
    if (best) out[line.id] = best.pos;
  }
  return out;
}

export interface SsovPositionCheck {
  position: string;
  description: string;
  gcCents: number | null;
  subCents: number;
  lines: number;
}

export interface SsovFill {
  csv: string;
  checks: SsovPositionCheck[];
  /** Lines not placed under any position, so not in the file. */
  unplaced: SsovLine[];
}

function cell(v: string, delim: string): string {
  return v.includes(delim) || /["\r\n]/.test(v) || v !== v.trim()
    ? `"${v.replace(/"/g, '""')}"`
    : v;
}

/**
 * Writes the filled template: for each GC position, one row per job line placed under it (the GC's cells
 * copied, the two subcontractor cells filled), or the position's own row with 0.00 when nothing is placed
 * under it. Positions keep the template's order; lines keep the job's order.
 */
export function fillSsov(
  t: SsovTemplate,
  lines: SsovLine[],
  placed: Record<string, string>,
): SsovFill {
  const known = new Set(t.positions.map((p) => p.position));
  const rows: string[][] = [...t.preamble, t.header];
  const checks: SsovPositionCheck[] = [];
  for (const p of t.positions) {
    const mine = lines.filter((l) => placed[l.id] === p.position);
    const write = (description: string | null, cents: number) => {
      const r = [...p.row];
      r[t.col.subAmount] = centsToDecimal(cents);
      if (t.col.subDescription !== null && description !== null)
        r[t.col.subDescription] = description;
      rows.push(r);
    };
    if (mine.length === 0) write(null, 0);
    for (const l of mine) write(l.description, l.cents);
    checks.push({
      position: p.position,
      description: p.description,
      gcCents: p.amountCents,
      subCents: mine.reduce((s, l) => s + l.cents, 0),
      lines: mine.length,
    });
  }
  const csv = `${rows.map((r) => r.map((v) => cell(v, t.delimiter)).join(t.delimiter)).join("\r\n")}\r\n`;
  return {
    csv,
    checks,
    unplaced: lines.filter((l) => !known.has(placed[l.id] ?? "")),
  };
}
