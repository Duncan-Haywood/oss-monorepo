// Removal rates and drill feeds by material from the shop's own sheet: a CSV, a paste from Excel or
// Google Sheets, or one worksheet of an .xlsx. The same two pure steps as the cut-chart import
// (./cut-speed-import), in the browser for the preview and in the Worker for the final check.
// 1. readMaterialRateSheet(kind, grid): find the header (machine, material and value columns), read
//    each row.
// 2. planMaterialRateImport(kind, rows, card): match the machine and material by name to this shop's
//    rows, merge with the value already set for that pair, validate with the editor's own schema.
//
// No rate is guessed (docs/ARCHITECTURE.md, "No invented prices"): only the sheet's own numbers,
// converted only by exact factors (2.54 cm to the inch, so 16.387064 cm³ to the in³; 25.4 mm to the
// inch). A feed per revolution or per tooth is refused, never turned into in/min at an assumed rpm.
// A row naming a machine or material the card does not have is an error, never a new rate.
import {
  type DrillFeedDto,
  type DrillFeedInput,
  drillFeedInputSchema,
  MAX_RATE_IMPORT_ROWS,
  type MachineDto,
  type MaterialDto,
  type RemovalRateDto,
  type RemovalRateInput,
  removalRateInputSchema,
} from "./api";
import { isDrillingMachine, ROUGHING_MACHINE_KINDS } from "./enums";
import { clean, csvField, type Grid, nameKey, normHeader, readNumber } from "./rate-card-import";

export type MaterialRateKind = "removal-rates" | "drill-feeds";

export interface MaterialRateImportValues {
  machine: string;
  material: string;
  /** In³/min for a removal rate, in/min for a drill feed; absent when the cell is blank. */
  value?: number;
}
export interface MaterialRateRow {
  row: number;
  values: MaterialRateImportValues;
  warnings: string[];
}
export interface MaterialRateProblem {
  row: number;
  message: string;
}
export interface MaterialRateSheet {
  kind: MaterialRateKind;
  headerRow: number | null;
  columns: { header: string; field: string; label: string }[];
  ignored: { header: string; reason: string }[];
  rows: MaterialRateRow[];
  errors: MaterialRateProblem[];
  skipped: MaterialRateProblem[];
  fatal: string | null;
}

/** A machine roughs a solid from a blank: a mill or lathe kind, or one with a removal rate. */
export const isRoughingMachine = (m: Pick<MachineDto, "kind" | "removalRateIn3PerMin">) =>
  ROUGHING_MACHINE_KINDS.has(m.kind) || (m.removalRateIn3PerMin ?? 0) > 0;
/** A machine drills: a mill or lathe kind, or one with a time per hole or a default feed. */
export const isDrillMachine = (
  m: Pick<MachineDto, "kind" | "secondsPerHole" | "drillFeedInPerMin">,
) => isDrillingMachine(m.kind, m.secondsPerHole, m.drillFeedInPerMin);

const CM3_PER_IN3 = 2.54 ** 3; // 16.387064, exact by the definition of the inch
const MM_PER_IN = 25.4;

interface KindSpec {
  /** The value column's label in the template and export. */
  header: string;
  unit: string;
  /** "removal rate" / "drill feed", for messages. */
  noun: string;
  plural: string;
  /** What the machine must be, for the error: "a roughing machine (mill or lathe)". */
  machineNeed: string;
  isMachine: (m: MachineDto) => boolean;
  /** Is this header the value column? */
  isValueHeader: (h: string) => boolean;
  /** The value column's reading for a matched header: a factor to the stored unit, or a refusal. */
  valueColumn: (h: string) => Column | { refuse: string };
  /** The machine's own default, shown in the export so the sheet reads against it. */
  machineDefault: (m: MachineDto) => number | null;
}

type Field = "machine" | "material" | "value";
interface Column {
  field: Field;
  label: string;
  /** Multiplies the cell to reach the stored unit (in³/min, in/min); exact factors only. */
  factor: number;
}

const SPECS: Record<MaterialRateKind, KindSpec> = {
  "removal-rates": {
    header: "Removal rate (in3/min)",
    unit: "in³/min",
    noun: "removal rate",
    plural: "removal rates",
    machineNeed: "a roughing machine (mill or lathe)",
    isMachine: isRoughingMachine,
    isValueHeader: (h) => /removal|\bmrr\b|cubic|in3|in\^3|cm3|cc per min|mm3/.test(h),
    valueColumn: (h) => {
      if (/per (sec|s\b)|per second|per hr|per hour/.test(h))
        return { refuse: "the card stores removal rates per minute; give the column in in³/min" };
      if (/mm3|mm\^3|cubic mm|cubic millimet/.test(h))
        return {
          field: "value",
          label: "Removal rate (mm³/min, as in³/min)",
          factor: 1 / (CM3_PER_IN3 * 1000),
        };
      if (/cm3|cm\^3|\bcc\b|cubic cent/.test(h))
        return {
          field: "value",
          label: "Removal rate (cm³/min, as in³/min)",
          factor: 1 / CM3_PER_IN3,
        };
      return { field: "value", label: "Removal rate (in³/min)", factor: 1 };
    },
    machineDefault: (m) => m.removalRateIn3PerMin,
  },
  "drill-feeds": {
    header: "Drill feed (in/min)",
    unit: "in/min",
    noun: "drill feed",
    plural: "drill feeds",
    machineNeed: "a machine that drills (a mill, a lathe, or one with a time per hole)",
    isMachine: isDrillMachine,
    isValueHeader: (h) =>
      /feed|penetration|\bipm\b|\bipr\b|in per min|inch(es)? per min|mm per min|mm per rev/.test(h),
    valueColumn: (h) => {
      if (/per rev|\bipr\b|\bmmpr\b|per tooth|\bipt\b|chip ?load/.test(h))
        return {
          refuse:
            "a feed per revolution or per tooth needs the spindle speed; give the feed in in/min",
        };
      if (/per (sec|s\b)|per second|per hr|per hour/.test(h))
        return { refuse: "the card stores drill feeds per minute; give the column in in/min" };
      if (/\bmm\b|millimet/.test(h))
        return { field: "value", label: "Drill feed (mm/min, as in/min)", factor: 1 / MM_PER_IN };
      return { field: "value", label: "Drill feed (in/min)", factor: 1 };
    },
    machineDefault: (m) => m.drillFeedInPerMin,
  },
};

export const materialRateTemplateHeaders = (kind: MaterialRateKind) => [
  "Machine",
  "Material",
  SPECS[kind].header,
];
/** The export adds the machine's own default so the sheet shows what each row overrides. */
export const materialRateExportHeaders = (kind: MaterialRateKind) => [
  ...materialRateTemplateHeaders(kind),
  `Machine default ${SPECS[kind].unit.replace("³", "3")} (not imported)`,
];

// ---------------------------------------------------------------------------------------------
// Columns

function columnFor(spec: KindSpec, raw: string): Column | { refuse: string } | null {
  const h = normHeader(raw);
  if (!h) return null;
  if (/not imported|machine default|\bdefault\b/.test(h))
    return { refuse: "the machine's default is changed under Machines" };
  if (/\bmachine\b|work ?cent(er|re)|\bspindle\b|\bmill\b|\blathe\b/.test(h) && !/material/.test(h))
    return { field: "machine", label: "Machine", factor: 1 };
  // "Material removal rate" is the value column, not the material's name.
  if (/material|\balloy\b|\bgrade\b/.test(h) && !/removal|\brate\b|feed|\bmrr\b/.test(h))
    return { field: "material", label: "Material", factor: 1 };
  if (spec.isValueHeader(h)) return spec.valueColumn(h);
  return {
    refuse: `not a ${spec.noun} column (machine, material, ${spec.noun})`,
  };
}

function mapHeader(spec: KindSpec, cells: string[]) {
  const cols = new Map<number, Column>();
  const ignored: { header: string; reason: string }[] = [];
  const taken = new Set<Field>();
  cells.forEach((cell, i) => {
    const c = columnFor(spec, cell);
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
  const need: Field[] = ["machine", "material", "value"];
  return { cols, ignored, hits: need.every((f) => taken.has(f)) ? cols.size : 0 };
}

// ---------------------------------------------------------------------------------------------
// Sheet

const TOTAL_ROW = /^(sub-?)?totals?\b|^grand total/i;
const BLANK = new Set(["", "-", "–"]);
const UNIT_TAIL =
  /\s*(in3\/min|in³\/min|cm3\/min|cm³\/min|cc\/min|mm3\/min|mm³\/min|ipm|in\/min|mm\/min)\.?$/i;

/** Reads removal rates or drill feeds from a grid of cell text (a CSV, a paste, a worksheet). */
export function readMaterialRateSheet(kind: MaterialRateKind, grid: Grid): MaterialRateSheet {
  const spec = SPECS[kind];
  const empty: MaterialRateSheet = {
    kind,
    headerRow: null,
    columns: [],
    ignored: [],
    rows: [],
    errors: [],
    skipped: [],
    fatal: null,
  };
  let best: { r: number; m: ReturnType<typeof mapHeader> } | null = null;
  for (let r = 0; r < Math.min(grid.length, 30); r++) {
    const m = mapHeader(spec, grid[r] ?? []);
    if (m.hits > (best?.m.hits ?? 0)) best = { r, m };
  }
  if (!best) {
    return {
      ...empty,
      fatal: `No header row found. The sheet needs a machine, a material and a ${spec.noun} column, for example "${materialRateTemplateHeaders(kind).join('", "')}".`,
    };
  }
  const { r: hr, m } = best;
  const headerCells = grid[hr] ?? [];
  const out: MaterialRateSheet = {
    ...empty,
    headerRow: hr + 1,
    columns: [...m.cols.entries()].map(([i, c]) => ({
      header: (headerCells[i] ?? "").trim(),
      field: c.field,
      label: c.label,
    })),
    ignored: m.ignored,
  };
  const colOf = (f: Field) => [...m.cols.entries()].find(([, c]) => c.field === f);
  const machineCol = colOf("machine")?.[0] ?? -1;
  const materialCol = colOf("material")?.[0] ?? -1;
  const [valueCol, value] = colOf("value") as [number, Column];
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
    const values: MaterialRateImportValues = {
      machine: machine.slice(0, 120),
      material: material.slice(0, 120),
    };
    const warnings: string[] = [];
    const cell = clean(cells[valueCol] ?? "");
    if (!BLANK.has(cell)) {
      const n = readNumber(cell.replace(UNIT_TAIL, ""));
      if (n === null) errs.push(`${value.label}: "${cell.slice(0, 30)}" is not a number`);
      else if (n === 0) errs.push(`${value.label}: 0 is not a ${spec.noun}`);
      else {
        // Rounded to 4 decimals so 100 cm³/min stores as 6.1024, not 6.102374409473229.
        const v = value.factor === 1 ? n : Math.round(n * value.factor * 10_000) / 10_000;
        values.value = v;
        if (value.factor !== 1)
          warnings.push(`${value.label.split(" (")[0]} ${n} read as ${v} ${spec.unit}`);
      }
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

export interface MaterialRateCard {
  machines: readonly MachineDto[];
  materials: readonly MaterialDto[];
  removalRates: readonly RemovalRateDto[];
  drillFeeds: readonly DrillFeedDto[];
}
type Values<K extends MaterialRateKind> = K extends "removal-rates"
  ? RemovalRateInput
  : DrillFeedInput;
export interface PlannedMaterialRate<K extends MaterialRateKind = MaterialRateKind> {
  row: number;
  /** "Machine · Material", for the preview. */
  name: string;
  action: "create" | "update";
  /** The existing row this one replaces (update). */
  id?: string;
  changes: string[];
  /** The full row to write, validated by the editor's own schema. */
  values: Values<K>;
  warnings: string[];
}
export interface MaterialRatePlan<K extends MaterialRateKind = MaterialRateKind> {
  kind: K;
  rows: PlannedMaterialRate<K>[];
  errors: MaterialRateProblem[];
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

const existingRows = (kind: MaterialRateKind, card: MaterialRateCard) =>
  kind === "removal-rates"
    ? card.removalRates.map((r) => ({ ...r, value: r.removalRateIn3PerMin }))
    : card.drillFeeds.map((r) => ({ ...r, value: r.drillFeedInPerMin }));

/**
 * Matches each row to this shop's machine and material by name (case and spacing ignored) and to the
 * value already set for that pair. Errors name the row: an unknown, ambiguous or retired machine or
 * material, a machine of the wrong sort (a laser in a removal-rate sheet), a pair listed twice, a new
 * pair without a value. A retired pair the sheet leaves as it is passes as "no change", so an
 * exported sheet always imports back.
 */
export function planMaterialRateImport<K extends MaterialRateKind>(
  kind: K,
  rows: readonly { row: number; values: MaterialRateImportValues }[],
  card: MaterialRateCard,
): MaterialRatePlan<K> {
  const spec = SPECS[kind];
  const plan: MaterialRatePlan<K> = { kind, rows: [], errors: [] };
  const existing = existingRows(kind, card);
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
    if (!spec.isMachine(machine)) {
      fail(`"${machine.name}" is not ${spec.machineNeed}`);
      continue;
    }
    const key = `${machine.id}\u0000${material.id}`;
    const first = seen.get(key);
    if (first !== undefined) {
      fail(`"${machine.name}" in "${material.name}" is already on row ${first}`);
      continue;
    }
    seen.set(key, row);
    const prior = existing.find((s) => s.machineId === machine.id && s.materialId === material.id);
    const value = values.value ?? prior?.value;
    if (value === undefined) {
      fail(`a new ${spec.noun} for "${machine.name}" in "${material.name}" needs a value`);
      continue;
    }
    const changes = prior && prior.value !== value ? [spec.noun] : [];
    const retired = !machine.active || !material.active;
    if (retired && (!prior || changes.length > 0)) {
      fail(
        `"${!machine.active ? machine.name : material.name}" is retired: retired machines and materials take no new ${spec.plural}`,
      );
      continue;
    }
    const parsed =
      kind === "removal-rates"
        ? removalRateInputSchema.safeParse({
            machineId: machine.id,
            materialId: material.id,
            removalRateIn3PerMin: value,
          })
        : drillFeedInputSchema.safeParse({
            machineId: machine.id,
            materialId: material.id,
            drillFeedInPerMin: value,
          });
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      fail(
        `${spec.noun[0]?.toUpperCase()}${spec.noun.slice(1)}: ${issue?.code === "too_big" ? "too large to be right" : (issue?.message ?? "invalid")}`,
      );
      continue;
    }
    plan.rows.push({
      row,
      name: `${machine.name} · ${material.name}`,
      action: prior ? "update" : "create",
      ...(prior ? { id: prior.id } : {}),
      changes,
      values: parsed.data as Values<K>,
      warnings: [],
    });
  }
  return plan;
}

// ---------------------------------------------------------------------------------------------
// Template and export

/** A CSV with the template's header and no rows, for "Download a blank sheet". */
export function materialRateTemplateCsv(kind: MaterialRateKind): string {
  return `${materialRateTemplateHeaders(kind).join(",")}\r\n`;
}

const real = (n: number | null | undefined) =>
  n == null ? "" : /e/i.test(String(n)) ? n.toFixed(12).replace(/\.?0+$/, "") : String(n);

/** How many rows of this kind the card has now. */
export const materialRateCount = (kind: MaterialRateKind, card: MaterialRateCard) =>
  kind === "removal-rates" ? card.removalRates.length : card.drillFeeds.length;

/**
 * The shop's removal rates or drill feeds as a CSV (UTF-8 with a byte-order mark), sorted by machine
 * then material, that readMaterialRateSheet and planMaterialRateImport read back as "no change". The
 * last column is the machine's own default, for reading only: the import leaves it out.
 */
export function exportMaterialRateCsv(kind: MaterialRateKind, card: MaterialRateCard): string {
  const spec = SPECS[kind];
  const machine = new Map(card.machines.map((m) => [m.id, m]));
  const materialName = new Map(card.materials.map((m) => [m.id, m.name]));
  const rows = existingRows(kind, card)
    .map((s) => ({ s, m: machine.get(s.machineId), mat: materialName.get(s.materialId) }))
    .filter((r) => r.m !== undefined && r.mat !== undefined)
    .sort(
      (a, b) =>
        (a.m?.name ?? "").localeCompare(b.m?.name ?? "") ||
        (a.mat ?? "").localeCompare(b.mat ?? ""),
    )
    .map(({ s, m, mat }) => [
      m?.name ?? "",
      mat ?? "",
      real(s.value),
      real(m ? spec.machineDefault(m) : null),
    ]);
  const lines = [materialRateExportHeaders(kind), ...rows];
  return `﻿${lines.map((l) => l.map(csvField).join(",")).join("\r\n")}\r\n`;
}
