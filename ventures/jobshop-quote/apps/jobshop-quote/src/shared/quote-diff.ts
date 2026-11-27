// What changed between two revisions of a quote ("Q-1001" → "Q-1001 Rev 2"): the customer and
// terms, and per line the part revision, material, blank, quantity breaks and unit prices,
// operations (setup and cycle minutes), finishing and extras. Pure, no I/O: the worker passes both
// quotes as stored and the names of the rate-card rows they use (services/quotes/changes.ts).
//
// Nothing here prices anything. Unit prices are the ones each revision stored (the deterministic
// engine's output at the time), compared as they are; a line that never priced shows "not priced".
import type { Blank, CostBreak, CostInputs } from "./costing";
import { partNumberKey, sameRevision } from "./repeat-parts";

export interface DiffLine {
  id: string;
  rfqPartId: string | null;
  partNumber: string;
  revision: string | null;
  description: string | null;
  inputs: CostInputs;
  breaks: CostBreak[] | null;
}

export interface DiffQuote {
  customerCompany: string;
  customerContact: string | null;
  customerEmail: string | null;
  leadTimeText: string | null;
  validUntil: string | null;
  notes: string | null;
  headlineTotalCents: number | null;
  lines: DiffLine[];
}

/** Names of the rate-card rows by id (machines, materials, finishing ops); unknown ids say so. */
export interface DiffNames {
  machines: Record<string, string>;
  materials: Record<string, string>;
  finishingOps: Record<string, string>;
}

/** One text field before and after; null is "not set". */
export interface FieldChange {
  field: string;
  label: string;
  from: string | null;
  to: string | null;
}

/** One quantity break in either revision. Null: that quantity was not quoted, or not priced. */
export interface PriceRow {
  quantity: number;
  fromUnitCents: number | null;
  toUnitCents: number | null;
  fromTotalCents: number | null;
  toTotalCents: number | null;
  /** "added" / "removed": the quantity is only in the new / old revision. */
  kind: "added" | "removed" | "changed" | "unchanged";
}

export interface OperationChange {
  kind: "added" | "removed" | "changed";
  machine: string;
  label: string;
  from: { setupMinutes: number; cycleMinutesPerPart: number | null } | null;
  to: { setupMinutes: number; cycleMinutesPerPart: number | null } | null;
}

export interface ExtraChange {
  kind: "added" | "removed" | "changed";
  label: string;
  from: { perPartCents: number; lotCents: number } | null;
  to: { perPartCents: number; lotCents: number } | null;
}

export interface LineChange {
  kind: "added" | "removed" | "changed" | "unchanged";
  fromLineId: string | null;
  toLineId: string | null;
  partNumber: string;
  /** Part revision on the newer side (the older one for a removed line). */
  revision: string | null;
  fields: FieldChange[];
  /** Every quantity in either revision, smallest first (unchanged rows included, for side by side). */
  prices: PriceRow[];
  operations: OperationChange[];
  finishing: { added: string[]; removed: string[] };
  extras: ExtraChange[];
}

export interface QuoteChanges {
  header: FieldChange[];
  headline: { fromCents: number | null; toCents: number | null };
  lines: LineChange[];
  /**
   * True when nothing differs but the valid-until date (every revision gets a fresh one): the
   * revision so far quotes exactly what the earlier one did.
   */
  identical: boolean;
}

const norm = (s: string | null | undefined) => {
  const t = (s ?? "").trim();
  return t.length > 0 ? t : null;
};

/** Inches and pounds as typed, without float noise: 2.5, 0.125, 12. */
const num = (n: number) => String(Number(n.toFixed(4)));

export function describeBlank(blank: Blank | null): string | null {
  if (!blank) return null;
  switch (blank.shape) {
    case "rect":
      return `${num(blank.lengthIn)} × ${num(blank.widthIn)} × ${num(blank.thicknessIn)} in`;
    case "round":
      return `Ø${num(blank.diameterIn)} × ${num(blank.lengthIn)} in`;
    case "weight":
      return `${num(blank.weightLb)} lb`;
  }
}

const nameOf = (map: Record<string, string>, id: string, kind: string) =>
  map[id] ?? `Unknown ${kind}`;

function materialText(inputs: CostInputs, names: DiffNames): string | null {
  if (inputs.material) return nameOf(names.materials, inputs.material.materialId, "material");
  return inputs.customerSuppliedMaterial ? "Customer-supplied" : null;
}

function field(
  out: FieldChange[],
  key: string,
  label: string,
  from: string | null,
  to: string | null,
) {
  if (norm(from) !== norm(to)) out.push({ field: key, label, from: norm(from), to: norm(to) });
}

/**
 * Pair the lines of two revisions: first by the RFQ part they came from, then by part number and
 * a matching (or missing) part revision, then by part number alone (a part revision B → C shows as
 * a change on the same line). Each line is used once; order follows the newer revision.
 */
export function matchLines(
  from: DiffLine[],
  to: DiffLine[],
): { pairs: [DiffLine | null, DiffLine | null][] } {
  const used = new Set<string>();
  const partner = new Map<string, DiffLine>();
  const passes: ((a: DiffLine, b: DiffLine) => boolean)[] = [
    (a, b) => a.rfqPartId !== null && a.rfqPartId === b.rfqPartId,
    (a, b) =>
      partNumberKey(a.partNumber) === partNumberKey(b.partNumber) &&
      sameRevision(a.revision, b.revision) !== false,
    (a, b) => partNumberKey(a.partNumber) === partNumberKey(b.partNumber),
  ];
  for (const pass of passes) {
    for (const b of to) {
      if (partner.has(b.id)) continue;
      const a = from.find((x) => !used.has(x.id) && pass(x, b));
      if (a) {
        used.add(a.id);
        partner.set(b.id, a);
      }
    }
  }
  const pairs: [DiffLine | null, DiffLine | null][] = to.map((b) => [partner.get(b.id) ?? null, b]);
  for (const a of from) if (!used.has(a.id)) pairs.push([a, null]);
  return { pairs };
}

function priceRows(a: DiffLine | null, b: DiffLine | null): PriceRow[] {
  const qa = a?.inputs.quantities ?? [];
  const qb = b?.inputs.quantities ?? [];
  const brk = (l: DiffLine | null, q: number) => l?.breaks?.find((x) => x.quantity === q) ?? null;
  return [...new Set([...qa, ...qb])]
    .sort((x, y) => x - y)
    .map((quantity) => {
      const ba = brk(a, quantity);
      const bb = brk(b, quantity);
      const inA = qa.includes(quantity);
      const inB = qb.includes(quantity);
      const row: PriceRow = {
        quantity,
        fromUnitCents: ba?.unitPriceCents ?? null,
        toUnitCents: bb?.unitPriceCents ?? null,
        fromTotalCents: ba?.totalCents ?? null,
        toTotalCents: bb?.totalCents ?? null,
        kind: !inA ? "added" : !inB ? "removed" : "unchanged",
      };
      if (row.kind === "unchanged" && row.fromUnitCents !== row.toUnitCents) row.kind = "changed";
      return row;
    });
}

type Op = CostInputs["operations"][number];

function operationChanges(a: Op[], b: Op[], names: DiffNames): OperationChange[] {
  const label = (o: Op) => o.label.trim().toUpperCase();
  const used = new Set<number>();
  const pairOf = new Map<number, number>();
  // Same machine and same label first (OP10 mill ↔ OP10 mill), then same machine in order.
  for (const same of [true, false]) {
    b.forEach((ob, j) => {
      if (pairOf.has(j)) return;
      const i = a.findIndex(
        (oa, k) =>
          !used.has(k) && oa.machineId === ob.machineId && (!same || label(oa) === label(ob)),
      );
      if (i >= 0) {
        used.add(i);
        pairOf.set(j, i);
      }
    });
  }
  const mins = (o: Op) => ({
    setupMinutes: o.setupMinutes,
    cycleMinutesPerPart: o.cycleMinutesPerPart,
  });
  const out: OperationChange[] = [];
  b.forEach((ob, j) => {
    const i = pairOf.get(j);
    const machine = nameOf(names.machines, ob.machineId, "machine");
    if (i === undefined) {
      out.push({ kind: "added", machine, label: ob.label, from: null, to: mins(ob) });
      return;
    }
    const oa = a[i] as Op;
    if (
      oa.setupMinutes !== ob.setupMinutes ||
      oa.cycleMinutesPerPart !== ob.cycleMinutesPerPart ||
      oa.label.trim() !== ob.label.trim()
    ) {
      out.push({ kind: "changed", machine, label: ob.label, from: mins(oa), to: mins(ob) });
    }
  });
  a.forEach((oa, i) => {
    if (used.has(i)) return;
    const machine = nameOf(names.machines, oa.machineId, "machine");
    out.push({ kind: "removed", machine, label: oa.label, from: mins(oa), to: null });
  });
  return out;
}

type Extra = CostInputs["extras"][number];

function extraChanges(a: Extra[], b: Extra[]): ExtraChange[] {
  const key = (e: Extra) => e.label.trim().toUpperCase();
  const used = new Set<number>();
  const money = (e: Extra) => ({ perPartCents: e.perPartCents, lotCents: e.lotCents });
  const out: ExtraChange[] = [];
  for (const eb of b) {
    const i = a.findIndex((ea, k) => !used.has(k) && key(ea) === key(eb));
    if (i < 0) {
      out.push({ kind: "added", label: eb.label, from: null, to: money(eb) });
      continue;
    }
    used.add(i);
    const ea = a[i] as Extra;
    if (ea.perPartCents !== eb.perPartCents || ea.lotCents !== eb.lotCents) {
      out.push({ kind: "changed", label: eb.label, from: money(ea), to: money(eb) });
    }
  }
  a.forEach((ea, i) => {
    if (!used.has(i)) out.push({ kind: "removed", label: ea.label, from: money(ea), to: null });
  });
  return out;
}

/** Multiset difference of finishing op names: anodize twice → once is one removed. */
function finishingChanges(
  a: CostInputs["finishing"],
  b: CostInputs["finishing"],
  names: DiffNames,
) {
  const count = (xs: CostInputs["finishing"]) => {
    const m = new Map<string, number>();
    for (const x of xs) m.set(x.opId, (m.get(x.opId) ?? 0) + 1);
    return m;
  };
  const ca = count(a);
  const cb = count(b);
  const added: string[] = [];
  const removed: string[] = [];
  for (const id of new Set([...ca.keys(), ...cb.keys()])) {
    const d = (cb.get(id) ?? 0) - (ca.get(id) ?? 0);
    const name = nameOf(names.finishingOps, id, "finishing");
    for (let k = 0; k < Math.abs(d); k++) (d > 0 ? added : removed).push(name);
  }
  return { added, removed };
}

const EMPTY: CostInputs = {
  quantities: [],
  customerSuppliedMaterial: false,
  material: null,
  operations: [],
  finishing: [],
  extras: [],
};

function lineChange(a: DiffLine | null, b: DiffLine | null, names: DiffNames): LineChange {
  const ia = a?.inputs ?? EMPTY;
  const ib = b?.inputs ?? EMPTY;
  const fields: FieldChange[] = [];
  if (a && b) {
    field(fields, "partNumber", "Part number", a.partNumber, b.partNumber);
    field(fields, "revision", "Part revision", a.revision, b.revision);
    field(fields, "description", "Description", a.description, b.description);
    field(fields, "material", "Material", materialText(ia, names), materialText(ib, names));
    field(
      fields,
      "blank",
      "Blank",
      describeBlank(ia.material?.blank ?? null),
      describeBlank(ib.material?.blank ?? null),
    );
    field(
      fields,
      "partsPerStock",
      "Parts per stock piece",
      ia.material?.partsPerStock != null ? String(ia.material.partsPerStock) : null,
      ib.material?.partsPerStock != null ? String(ib.material.partsPerStock) : null,
    );
  }
  const prices = priceRows(a, b);
  const operations = operationChanges(ia.operations, ib.operations, names);
  const finishing = finishingChanges(ia.finishing, ib.finishing, names);
  const extras = extraChanges(ia.extras, ib.extras);
  const differs =
    fields.length > 0 ||
    prices.some((p) => p.kind !== "unchanged") ||
    operations.length > 0 ||
    finishing.added.length + finishing.removed.length > 0 ||
    extras.length > 0;
  const side = (b ?? a) as DiffLine;
  return {
    kind: !a ? "added" : !b ? "removed" : differs ? "changed" : "unchanged",
    fromLineId: a?.id ?? null,
    toLineId: b?.id ?? null,
    partNumber: side.partNumber,
    revision: side.revision,
    fields,
    prices,
    operations,
    finishing,
    extras,
  };
}

/** What changed from `from` (the earlier revision) to `to` (the later one). */
export function diffQuotes(from: DiffQuote, to: DiffQuote, names: DiffNames): QuoteChanges {
  const header: FieldChange[] = [];
  field(header, "customerCompany", "Customer", from.customerCompany, to.customerCompany);
  field(header, "customerContact", "Contact", from.customerContact, to.customerContact);
  field(header, "customerEmail", "Email", from.customerEmail, to.customerEmail);
  field(header, "leadTimeText", "Lead time", from.leadTimeText, to.leadTimeText);
  field(header, "validUntil", "Valid until", from.validUntil, to.validUntil);
  field(header, "notes", "Notes", from.notes, to.notes);
  const lines = matchLines(from.lines, to.lines).pairs.map(([a, b]) => lineChange(a, b, names));
  const headline = { fromCents: from.headlineTotalCents, toCents: to.headlineTotalCents };
  return {
    header,
    headline,
    lines,
    identical:
      header.every((h) => h.field === "validUntil") &&
      headline.fromCents === headline.toCents &&
      lines.every((l) => l.kind === "unchanged"),
  };
}
