// Cut speeds by material from the shop's own cut chart: a CSV, a paste from Excel or Google
// Sheets, or one worksheet of an .xlsx, read by the same two pure steps as the rate-card import
// (./rate-card-import), in the browser for the preview and in the Worker for the final check.
// 1. readCutSpeedSheet(grid): find the header (machine, material and speed columns), read each row.
// 2. planCutSpeedImport(rows, card): match the machine and material by name to this shop's rows,
//    merge with the speed already set for that pair, validate with the editor's own schema.
//
// No speed is guessed (docs/ARCHITECTURE.md, "No invented prices"): only the chart's own numbers,
// converted only by exact factors (mm/min and m/min by 25.4 mm to the inch, ft/min by 12, pierce
// milliseconds by 1000). A row naming a machine or material the card does not have is an error, never
// a new rate: speeds hang off rates the shop has already priced.
import {
  type CutSpeedDto,
  type CutSpeedInput,
  cutSpeedInputSchema,
  MAX_RATE_IMPORT_ROWS,
  type MachineDto,
  type MaterialDto,
} from "./api";
import { clean, csvField, type Grid, nameKey, normHeader, readNumber } from "./rate-card-import";

export interface CutSpeedImportValues {
  machine: string;
  material: string;
  cutSpeedInPerMin?: number;
  pierceSeconds?: number;
}
export interface CutSpeedRow {
  row: number;
  values: CutSpeedImportValues;
  warnings: string[];
}
export interface CutSpeedProblem {
  row: number;
  message: string;
}
export interface CutSpeedSheet {
  headerRow: number | null;
  columns: { header: string; field: string; label: string }[];
  ignored: { header: string; reason: string }[];
  rows: CutSpeedRow[];
  errors: CutSpeedProblem[];
  skipped: CutSpeedProblem[];
  fatal: string | null;
}

/** Machine kinds that cut sheet from a flat pattern (the Worker's CUTTING_KINDS). */
export const CUTTING_MACHINE_KINDS: ReadonlySet<string> = new Set(["laser", "waterjet", "plasma"]);
/** A machine takes speeds by material when it cuts: a laser, waterjet or plasma, or has a cut speed. */
export const isCuttingMachine = (m: Pick<MachineDto, "kind" | "cutSpeedInPerMin">) =>
  CUTTING_MACHINE_KINDS.has(m.kind) || (m.cutSpeedInPerMin ?? 0) > 0;

export const CUT_SPEED_TEMPLATE_HEADERS = [
  "Machine",
  "Material",
  "Cut speed (in/min)",
  "Pierce (s)",
];
/** The export adds the material row's thickness so the sheet reads like a cut chart. */
export const CUT_SPEED_EXPORT_HEADERS = [
  "Machine",
  "Material",
  "Thickness (in)",
  "Cut speed (in/min)",
  "Pierce (s)",
];

// ---------------------------------------------------------------------------------------------
// Columns

type Field = "machine" | "material" | "cutSpeedInPerMin" | "pierceSeconds";
interface Column {
  field: Field;
  label: string;
  /** Multiplies the cell to reach the stored unit (in/min, seconds); exact factors only. */
  factor: number;
}
type Mapped = { cols: Map<number, Column>; ignored: { header: string; reason: string }[] };

const MM_PER_IN = 25.4;

function speedColumn(h: string): Column | { refuse: string } {
  if (/\bmm\b|millimet/.test(h))
    return {
      field: "cutSpeedInPerMin",
      label: "Cut speed (mm/min, as in/min)",
      factor: 1 / MM_PER_IN,
    };
  if (/\bm per min|\bm per minute|\bmpm\b|\bmet(er|re)s? per min/.test(h))
    return {
      field: "cutSpeedInPerMin",
      label: "Cut speed (m/min, as in/min)",
      factor: 1000 / MM_PER_IN,
    };
  if (/\bft\b|\bfeet\b|\bfoot\b|\bfpm\b/.test(h))
    return { field: "cutSpeedInPerMin", label: "Cut speed (ft/min, as in/min)", factor: 12 };
  if (/per (sec|s\b)|per second|per hr|per hour/.test(h))
    return { refuse: "the card stores cut speed per minute; give the column in in/min" };
  return { field: "cutSpeedInPerMin", label: "Cut speed (in/min)", factor: 1 };
}

function pierceColumn(h: string): Column | { refuse: string } {
  if (/\bms\b|millisec|msec/.test(h))
    return { field: "pierceSeconds", label: "Pierce (ms, as seconds)", factor: 1 / 1000 };
  if (/\bmin\b|minute/.test(h)) return { refuse: "pierce times are read in seconds" };
  if (/count|qty|number|#|\bper part\b/.test(h))
    return { refuse: "a pierce count comes from the DXF, not the chart" };
  return { field: "pierceSeconds", label: "Pierce (s)", factor: 1 };
}

function columnFor(raw: string): Column | { refuse: string } | null {
  const h = normHeader(raw);
  if (!h) return null;
  if (/\bmachine\b|\bcutter\b|work ?cent(er|re)|\btable\b/.test(h) && !/material/.test(h))
    return { field: "machine", label: "Machine", factor: 1 };
  if (/material|\balloy\b|\bgrade\b/.test(h) && !/thick/.test(h))
    return { field: "material", label: "Material", factor: 1 };
  if (/thick|gauge|\bgage\b/.test(h))
    return {
      refuse: "thickness is read from the material row (change it under Materials)",
    };
  if (/pierce/.test(h)) return pierceColumn(h);
  if (/speed|feed( ?rate)?\b|\bipm\b|in per min|inch(es)? per min|mm per min|\bm per min/.test(h))
    return speedColumn(h);
  return { refuse: "not a cut-speed column (machine, material, cut speed, pierce)" };
}

function mapHeader(cells: string[]): Mapped & { hits: number } {
  const cols = new Map<number, Column>();
  const ignored: { header: string; reason: string }[] = [];
  const taken = new Set<Field>();
  cells.forEach((cell, i) => {
    const c = columnFor(cell);
    if (!c) return;
    if ("refuse" in c) {
      ignored.push({ header: cell.trim(), reason: c.refuse });
      return;
    }
    if (taken.has(c.field)) {
      ignored.push({
        header: cell.trim(),
        reason: `a second ${c.label} column (the first is used)`,
      });
      return;
    }
    taken.add(c.field);
    cols.set(i, c);
  });
  const need: Field[] = ["machine", "material", "cutSpeedInPerMin"];
  return { cols, ignored, hits: need.every((f) => taken.has(f)) ? cols.size : 0 };
}

// ---------------------------------------------------------------------------------------------
// Sheet

const TOTAL_ROW = /^(sub-?)?totals?\b|^grand total/i;
const BLANK = new Set(["", "-", "–"]);

/** Reads a cut chart from a grid of cell text (a CSV, a paste, or one worksheet). Never throws. */
export function readCutSpeedSheet(grid: Grid): CutSpeedSheet {
  const empty: CutSpeedSheet = {
    headerRow: null,
    columns: [],
    ignored: [],
    rows: [],
    errors: [],
    skipped: [],
    fatal: null,
  };
  let best: { r: number; m: Mapped & { hits: number } } | null = null;
  for (let r = 0; r < Math.min(grid.length, 30); r++) {
    const m = mapHeader(grid[r] ?? []);
    if (m.hits > (best?.m.hits ?? 0)) best = { r, m };
  }
  if (!best) {
    return {
      ...empty,
      fatal: `No header row found. The sheet needs a machine, a material and a cut speed column, for example "${CUT_SPEED_TEMPLATE_HEADERS.slice(0, 3).join('", "')}".`,
    };
  }
  const { r: hr, m } = best;
  const headerCells = grid[hr] ?? [];
  const out: CutSpeedSheet = {
    ...empty,
    headerRow: hr + 1,
    columns: [...m.cols.entries()].map(([i, c]) => ({
      header: (headerCells[i] ?? "").trim(),
      field: c.field,
      label: c.label,
    })),
    ignored: m.ignored,
  };
  const colOf = (f: Field) => [...m.cols.entries()].find(([, c]) => c.field === f)?.[0] ?? -1;
  const machineCol = colOf("machine");
  const materialCol = colOf("material");
  for (let r = hr + 1; r < grid.length; r++) {
    const cells = grid[r] ?? [];
    const rowNo = r + 1;
    if (cells.every((c) => clean(c) === "")) continue;
    const machine = clean(cells[machineCol] ?? "");
    const material = clean(cells[materialCol] ?? "");
    if (TOTAL_ROW.test(machine) || TOTAL_ROW.test(material)) {
      out.skipped.push({ row: rowNo, message: "looks like a total row" });
      continue;
    }
    const errs: string[] = [];
    if (!machine) errs.push("no machine name (each row names its machine, even under a heading)");
    if (!material) errs.push("no material name");
    const values: CutSpeedImportValues = {
      machine: machine.slice(0, 120),
      material: material.slice(0, 120),
    };
    const warnings: string[] = [];
    for (const [i, col] of m.cols) {
      if (col.field === "machine" || col.field === "material") continue;
      const cell = clean(cells[i] ?? "");
      if (BLANK.has(cell)) continue;
      const n = readNumber(cell.replace(/\s*(ipm|in\/min|mm\/min|m\/min|s|sec|ms)\.?$/i, ""));
      if (n === null) {
        errs.push(`${col.label}: "${cell.slice(0, 30)}" is not a number`);
        continue;
      }
      if (n === 0) {
        errs.push(
          col.field === "pierceSeconds"
            ? `${col.label}: 0 is not a pierce time (leave it blank to use the machine's)`
            : `${col.label}: 0 is not a cut speed`,
        );
        continue;
      }
      // Rounded to 4 decimals so 1000 mm/min stores as 39.3701, not 39.37007874015748.
      const v = col.factor === 1 ? n : Math.round(n * col.factor * 10_000) / 10_000;
      values[col.field] = v;
      if (col.factor !== 1)
        warnings.push(
          `${col.label.split(" (")[0]} ${n} read as ${v} ${col.field === "pierceSeconds" ? "s" : "in/min"}`,
        );
    }
    if (errs.length) {
      for (const e of errs) out.errors.push({ row: rowNo, message: e });
      continue;
    }
    out.rows.push({ row: rowNo, values, warnings });
  }
  if (out.rows.length + out.errors.length > MAX_RATE_IMPORT_ROWS) {
    out.fatal = `More than ${MAX_RATE_IMPORT_ROWS} rows. Split the sheet and import it in parts.`;
  } else if (out.rows.length === 0 && out.errors.length === 0) {
    out.fatal = "The header was found but no rows under it name a machine and a material.";
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// Plan: match to the card, merge, validate

export interface CutSpeedCard {
  machines: readonly MachineDto[];
  materials: readonly MaterialDto[];
  cutSpeeds: readonly CutSpeedDto[];
}
export interface PlannedCutSpeed {
  row: number;
  /** "Machine · Material", for the preview. */
  name: string;
  action: "create" | "update";
  /** The existing speed this row replaces (update). */
  id?: string;
  changes: string[];
  /** The full row to write, validated by the editor's own schema. */
  values: CutSpeedInput;
  warnings: string[];
}
export interface CutSpeedPlan {
  rows: PlannedCutSpeed[];
  errors: CutSpeedProblem[];
}

/** One row by name, preferring an active one; a name two active rows share is ambiguous. */
function byName<T extends { name: string; active: boolean }>(
  rows: readonly T[],
  name: string,
): T | "ambiguous" | null {
  const hits = rows.filter((r) => nameKey(r.name) === nameKey(name));
  const active = hits.filter((r) => r.active);
  if (active.length > 1 || (active.length === 0 && hits.length > 1)) return "ambiguous";
  return active[0] ?? hits[0] ?? null;
}

/**
 * Matches each row to this shop's machine and material by name (case and spacing ignored) and to the
 * speed already set for that pair. Errors name the row: an unknown or retired machine or material, a
 * machine that does not cut, a pair listed twice, a new pair without a speed. A retired pair whose
 * speed the sheet leaves as it is passes as "no change", so an exported sheet always imports back.
 */
export function planCutSpeedImport(
  rows: readonly { row: number; values: CutSpeedImportValues }[],
  card: CutSpeedCard,
): CutSpeedPlan {
  const plan: CutSpeedPlan = { rows: [], errors: [] };
  const seen = new Map<string, number>();
  for (const { row, values } of rows) {
    const fail = (message: string) => plan.errors.push({ row, message });
    const machine = byName(card.machines, values.machine);
    const material = byName(card.materials, values.material);
    if (machine === null) {
      fail(`no machine named "${values.machine}" on the card (add it under Machines first)`);
      continue;
    }
    if (machine === "ambiguous") {
      fail(`more than one machine is named "${values.machine}": rename one on the card`);
      continue;
    }
    if (material === null) {
      fail(`no material named "${values.material}" on the card (add it under Materials first)`);
      continue;
    }
    if (material === "ambiguous") {
      fail(`more than one material is named "${values.material}": rename one on the card`);
      continue;
    }
    if (!isCuttingMachine(machine)) {
      fail(`"${machine.name}" is not a cutting machine (laser, waterjet, plasma)`);
      continue;
    }
    const key = `${machine.id}\u0000${material.id}`;
    const first = seen.get(key);
    if (first !== undefined) {
      fail(`"${machine.name}" on "${material.name}" is already on row ${first}`);
      continue;
    }
    seen.set(key, row);
    const existing = card.cutSpeeds.find(
      (s) => s.machineId === machine.id && s.materialId === material.id,
    );
    const speed = values.cutSpeedInPerMin ?? existing?.cutSpeedInPerMin;
    if (speed === undefined) {
      fail(`a new speed for "${machine.name}" on "${material.name}" needs a cut speed`);
      continue;
    }
    const pierce =
      values.pierceSeconds !== undefined ? values.pierceSeconds : (existing?.pierceSeconds ?? null);
    const changes: string[] = [];
    if (existing) {
      if (existing.cutSpeedInPerMin !== speed) changes.push("cut speed");
      if (existing.pierceSeconds !== pierce) changes.push("pierce");
    }
    const retired = !machine.active || !material.active;
    if (retired && (!existing || changes.length > 0)) {
      fail(
        `"${!machine.active ? machine.name : material.name}" is retired: retired machines and materials take no new cut speeds`,
      );
      continue;
    }
    const parsed = cutSpeedInputSchema.safeParse({
      machineId: machine.id,
      materialId: material.id,
      cutSpeedInPerMin: speed,
      pierceSeconds: pierce,
    });
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      const field = issue?.path[0] === "pierceSeconds" ? "Pierce" : "Cut speed";
      fail(
        `${field}: ${issue?.code === "too_big" ? "too large to be right" : (issue?.message ?? "invalid")}`,
      );
      continue;
    }
    plan.rows.push({
      row,
      name: `${machine.name} · ${material.name}`,
      action: existing ? "update" : "create",
      ...(existing ? { id: existing.id } : {}),
      changes,
      values: parsed.data,
      warnings: [],
    });
  }
  return plan;
}

// ---------------------------------------------------------------------------------------------
// Template and export

/** A CSV with the template's header and no rows, for "Download a blank sheet". */
export function cutSpeedTemplateCsv(): string {
  return `${CUT_SPEED_TEMPLATE_HEADERS.join(",")}\r\n`;
}

const real = (n: number | null) =>
  n === null ? "" : /e/i.test(String(n)) ? n.toFixed(12).replace(/\.?0+$/, "") : String(n);

/**
 * The shop's cut speeds as a CSV (UTF-8 with a byte-order mark), sorted by machine then material,
 * that readCutSpeedSheet and planCutSpeedImport read back as "no change". A blank pierce means
 * "the machine's pierce time" and, like every blank cell on import, leaves that value as it is.
 */
export function exportCutSpeedCsv(card: CutSpeedCard): string {
  const machineName = new Map(card.machines.map((m) => [m.id, m.name]));
  const material = new Map(card.materials.map((m) => [m.id, m]));
  const rows = card.cutSpeeds
    .map((s) => ({ s, machine: machineName.get(s.machineId), mat: material.get(s.materialId) }))
    .filter((r) => r.machine !== undefined && r.mat !== undefined)
    .sort(
      (a, b) =>
        (a.machine as string).localeCompare(b.machine as string) ||
        (a.mat?.sheetThicknessIn ?? 0) - (b.mat?.sheetThicknessIn ?? 0) ||
        (a.mat?.name ?? "").localeCompare(b.mat?.name ?? ""),
    )
    .map(({ s, machine, mat }) => [
      machine as string,
      mat?.name ?? "",
      real(mat?.sheetThicknessIn ?? null),
      real(s.cutSpeedInPerMin),
      real(s.pierceSeconds),
    ]);
  const lines = [CUT_SPEED_EXPORT_HEADERS, ...rows];
  return `\uFEFF${lines.map((l) => l.map(csvField).join(",")).join("\r\n")}\r\n`;
}
