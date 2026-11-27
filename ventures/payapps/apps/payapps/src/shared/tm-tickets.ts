// T&M tickets (time-and-material tickets, docs/TM-TICKETS.md): extra work done on a GC's direction,
// written up in the field the day it is done, signed by the GC's superintendent, priced in the office
// and billed through a change order. Pure functions shared by the Worker (rules, PDF, CSV) and the
// SPA (the page). Money is integer cents, markups basis points, dates YYYY-MM-DD.
//
// The rule that matters: the GC signs for the quantities (who worked, how long, what material and
// equipment went in), not the prices. So once a ticket is signed, its quantities are locked and the
// rates and markups can still be set; changing a quantity means taking the signature off first.

import { formatCents } from "./money";

/** Labor: a trade, how many workers, the hours each, and the rate per man-hour (null: priced later). */
export interface TmLaborLine {
  trade: string;
  workers: number;
  hoursEach: number;
  rateCents: number | null;
}

/** Material: what went in, how much, the unit, and the cost per unit (null: priced later). */
export interface TmMaterialLine {
  description: string;
  quantity: number;
  unit: string | null;
  unitCostCents: number | null;
}

/** Equipment: what ran, for how many hours, and the rate per hour (null: priced later). */
export interface TmEquipmentLine {
  description: string;
  hours: number;
  rateCents: number | null;
}

export interface TmLines {
  labor: TmLaborLine[];
  material: TmMaterialLine[];
  equipment: TmEquipmentLine[];
}

/** Overhead and profit added on each kind of cost, in basis points (1500 = 15%). */
export interface TmMarkups {
  laborMarkupBps: number;
  materialMarkupBps: number;
  equipmentMarkupBps: number;
}

export interface TmTicketFacts extends TmLines, TmMarkups {
  number: number;
  workDate: string;
  description: string;
}

export const MAX_TM_LINES = 40;
export const MAX_TM_WORKERS = 999;
export const MAX_TM_HOURS = 24;
export const MAX_TM_QUANTITY = 1_000_000;
/** $10,000 an hour or a unit: far above any real rate, low enough that totals stay exact. */
export const MAX_TM_RATE_CENTS = 1_000_000;
export const MAX_TM_MARKUP_BPS = 10_000;
export const MAX_TM_NUMBER = 999_999;
/** Tickets in one change order. */
export const MAX_TM_PER_CHANGE_ORDER = 50;

/** Printed under the log and on the PDF. */
export const TM_TICKETS_NOTE =
  "A signed T&M ticket records the labor, material and equipment the GC's representative saw go " +
  "into extra work. It is not an approved change order: the subcontract says how extra work is " +
  "authorized, priced and billed, and by when it must be submitted.";

const DATE = /^\d{4}-\d{2}-\d{2}$/;

export const isIsoDate = (s: string) => {
  if (!DATE.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
};

export function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

const round2 = (n: number) => Math.round(n * 100) / 100;
const isQuarter = (h: number) => Number.isFinite(h) && Math.abs(h * 4 - Math.round(h * 4)) < 1e-9;
/** Up to three decimals for material quantities (0.125 of a box, 2.5 cubic yards). */
const isThousandth = (n: number) =>
  Number.isFinite(n) && Math.abs(n * 1000 - Math.round(n * 1000)) < 1e-6;

/** "T&M 12" */
export const tmLabel = (n: number) => `T&M ${n}`;

/** "8", "7.5", "0.125": a quantity as typed, without trailing zeros. */
export const qtyText = (n: number) => String(Math.round(n * 1000) / 1000);

export const laborManHours = (l: Pick<TmLaborLine, "workers" | "hoursEach">) =>
  round2(l.workers * l.hoursEach);

/** Cents for a line, or null while its rate is not set. Rounded half up to the cent. */
export const laborCents = (l: TmLaborLine) =>
  l.rateCents === null ? null : Math.round(l.workers * l.hoursEach * l.rateCents);
export const materialCents = (l: TmMaterialLine) =>
  l.unitCostCents === null ? null : Math.round(l.quantity * l.unitCostCents);
export const equipmentCents = (l: TmEquipmentLine) =>
  l.rateCents === null ? null : Math.round(l.hours * l.rateCents);

export const markupCents = (subtotal: number, bps: number) => Math.round((subtotal * bps) / 10_000);

export interface TmSection {
  /** Sum of the priced lines. */
  subtotalCents: number;
  markupCents: number;
  /** Lines still without a rate or unit cost. */
  unpriced: number;
}

export interface TmPricing {
  labor: TmSection;
  material: TmSection;
  equipment: TmSection;
  manHours: number;
  /** Every line priced (a ticket with no lines at all is not priced). */
  priced: boolean;
  /** Subtotals plus markups; null until every line is priced. */
  totalCents: number | null;
  /** What is known so far, for a ticket still being priced. */
  pricedSoFarCents: number;
}

function section(cents: (number | null)[], bps: number): TmSection {
  let subtotal = 0;
  let unpriced = 0;
  for (const c of cents) {
    if (c === null) unpriced++;
    else subtotal += c;
  }
  return { subtotalCents: subtotal, markupCents: markupCents(subtotal, bps), unpriced };
}

/** The ticket's price, section by section: each section's markup is on that section's subtotal. */
export function priceTicket(t: TmLines & TmMarkups): TmPricing {
  const labor = section(t.labor.map(laborCents), t.laborMarkupBps);
  const material = section(t.material.map(materialCents), t.materialMarkupBps);
  const equipment = section(t.equipment.map(equipmentCents), t.equipmentMarkupBps);
  const lines = t.labor.length + t.material.length + t.equipment.length;
  const unpriced = labor.unpriced + material.unpriced + equipment.unpriced;
  const sum = [labor, material, equipment].reduce((s, x) => s + x.subtotalCents + x.markupCents, 0);
  const priced = lines > 0 && unpriced === 0;
  let manHours = 0;
  for (const l of t.labor) manHours += l.workers * l.hoursEach;
  return {
    labor,
    material,
    equipment,
    manHours: round2(manHours),
    priced,
    totalCents: priced ? sum : null,
    pricedSoFarCents: sum,
  };
}

const rateOk = (c: number | null) =>
  c === null || (Number.isInteger(c) && c >= 0 && c <= MAX_TM_RATE_CENTS);

/** The first problem with a ticket, in words, or null. `latest` is the last date a ticket may carry. */
export function tmTicketProblem(t: TmTicketFacts, latest: string): string | null {
  if (!Number.isInteger(t.number) || t.number < 1 || t.number > MAX_TM_NUMBER) {
    return `Ticket number: enter a whole number from 1 to ${MAX_TM_NUMBER}`;
  }
  if (!isIsoDate(t.workDate)) return "Enter the date the work was done as YYYY-MM-DD";
  if (t.workDate > latest) return "A T&M ticket cannot be dated after today";
  if (!t.description.trim()) return "Describe the extra work";
  const count = t.labor.length + t.material.length + t.equipment.length;
  if (count === 0) return "Add at least one labor, material or equipment line";
  for (const [k, list] of [
    ["labor", t.labor],
    ["material", t.material],
    ["equipment", t.equipment],
  ] as const) {
    if (list.length > MAX_TM_LINES) return `A ticket holds up to ${MAX_TM_LINES} ${k} lines`;
  }
  for (const [i, l] of t.labor.entries()) {
    const n = `Labor line ${i + 1}`;
    if (!l.trade.trim()) return `${n}: enter the trade`;
    if (!Number.isInteger(l.workers) || l.workers < 1 || l.workers > MAX_TM_WORKERS) {
      return `${n}: enter the number of workers (1 to ${MAX_TM_WORKERS})`;
    }
    if (l.hoursEach <= 0 || l.hoursEach > MAX_TM_HOURS || !isQuarter(l.hoursEach)) {
      return `${n}: enter the hours each worked, up to ${MAX_TM_HOURS} in quarter hours`;
    }
    if (!rateOk(l.rateCents)) return `${n}: enter the rate per hour in dollars and cents`;
  }
  for (const [i, l] of t.material.entries()) {
    const n = `Material line ${i + 1}`;
    if (!l.description.trim()) return `${n}: describe the material`;
    if (l.quantity <= 0 || l.quantity > MAX_TM_QUANTITY || !isThousandth(l.quantity)) {
      return `${n}: enter the quantity (more than 0, up to three decimals)`;
    }
    if (!rateOk(l.unitCostCents)) return `${n}: enter the cost per unit in dollars and cents`;
  }
  for (const [i, l] of t.equipment.entries()) {
    const n = `Equipment line ${i + 1}`;
    if (!l.description.trim()) return `${n}: describe the equipment`;
    if (l.hours <= 0 || l.hours > MAX_TM_HOURS || !isQuarter(l.hours)) {
      return `${n}: enter the hours it ran, up to ${MAX_TM_HOURS} in quarter hours`;
    }
    if (!rateOk(l.rateCents)) return `${n}: enter the rate per hour in dollars and cents`;
  }
  for (const [label, bps] of [
    ["Labor markup", t.laborMarkupBps],
    ["Material markup", t.materialMarkupBps],
    ["Equipment markup", t.equipmentMarkupBps],
  ] as const) {
    if (!Number.isInteger(bps) || bps < 0 || bps > MAX_TM_MARKUP_BPS) {
      return `${label}: enter 0% to 100%, to two decimals`;
    }
  }
  return null;
}

const norm = (s: string | null) => (s ?? "").trim().toLowerCase();

/**
 * The facts the GC's signature covers: the date, the work and every quantity (not rates or
 * markups). Two tickets with the same key read the same to the person who signed.
 */
export function signedFactsKey(
  t: Pick<TmTicketFacts, "workDate" | "description"> & TmLines & { location: string | null },
): string {
  return JSON.stringify([
    t.workDate,
    t.description.trim(),
    (t.location ?? "").trim(),
    t.labor.map((l) => [l.trade.trim(), l.workers, l.hoursEach]),
    t.material.map((l) => [l.description.trim(), l.quantity, (l.unit ?? "").trim()]),
    t.equipment.map((l) => [l.description.trim(), l.hours]),
  ]);
}

/**
 * Rates already used on the job, so a new ticket starts with them: the latest ticket's rate per
 * trade, material and equipment (matched without case or spaces at the ends). `tickets` newest first.
 */
export function ratesFromTickets(tickets: readonly (TmLines & { workDate: string })[]) {
  const labor: Record<string, number> = {};
  const material: Record<string, number> = {};
  const equipment: Record<string, number> = {};
  for (const t of tickets) {
    for (const l of t.labor) {
      const k = norm(l.trade);
      if (l.rateCents !== null && k && !(k in labor)) labor[k] = l.rateCents;
    }
    for (const l of t.material) {
      const k = norm(l.description);
      if (l.unitCostCents !== null && k && !(k in material)) material[k] = l.unitCostCents;
    }
    for (const l of t.equipment) {
      const k = norm(l.description);
      if (l.rateCents !== null && k && !(k in equipment)) equipment[k] = l.rateCents;
    }
  }
  return { labor, material, equipment };
}

export type TmRates = ReturnType<typeof ratesFromTickets>;

/** The rate on file for a line's name, or null. */
export const rateFor = (rates: Record<string, number>, name: string) => rates[norm(name)] ?? null;

/** Where a ticket stands, from what it holds (nothing about it is stored as a status). */
export type TmTicketStage = "unsigned" | "signed" | "on-change-order" | "approved" | "rejected";

export function ticketStage(t: {
  signed: boolean;
  changeOrderStatus: "pending" | "approved" | "rejected" | null;
}): TmTicketStage {
  if (t.changeOrderStatus === "approved") return "approved";
  if (t.changeOrderStatus === "rejected") return "rejected";
  if (t.changeOrderStatus === "pending") return "on-change-order";
  return t.signed ? "signed" : "unsigned";
}

export const STAGE_LABEL: Record<TmTicketStage, string> = {
  unsigned: "Not signed",
  signed: "Signed, not on a change order",
  "on-change-order": "On a pending change order",
  approved: "Change order approved",
  rejected: "Change order rejected",
};

export interface TmTicketSummary {
  tickets: number;
  unsigned: number;
  /** Signed tickets on no change order: work the GC saw that is not yet billed or requested. */
  signedNotOnChangeOrder: number;
  /** Their total; tickets among them still unpriced are counted, not added. */
  signedNotOnChangeOrderCents: number;
  signedNotOnChangeOrderUnpriced: number;
  /** The oldest of those, by the date of the work (the one most likely past a notice deadline). */
  oldestSignedNotOnChangeOrder: string | null;
  manHours: number;
}

export function summarizeTickets(
  items: readonly {
    workDate: string;
    stage: TmTicketStage;
    totalCents: number | null;
    manHours: number;
  }[],
): TmTicketSummary {
  let unsigned = 0;
  let open = 0;
  let openCents = 0;
  let openUnpriced = 0;
  let oldest: string | null = null;
  let manHours = 0;
  for (const t of items) {
    manHours += t.manHours;
    if (t.stage === "unsigned") unsigned++;
    if (t.stage === "signed") {
      open++;
      if (t.totalCents === null) openUnpriced++;
      else openCents += t.totalCents;
      if (oldest === null || t.workDate < oldest) oldest = t.workDate;
    }
  }
  return {
    tickets: items.length,
    unsigned,
    signedNotOnChangeOrder: open,
    signedNotOnChangeOrderCents: openCents,
    signedNotOnChangeOrderUnpriced: openUnpriced,
    oldestSignedNotOnChangeOrder: oldest,
    manHours: round2(manHours),
  };
}

/** The next free ticket number on the job (paper ticket books are numbered; a typed number wins). */
export const nextTicketNumber = (numbers: readonly number[]) =>
  numbers.length === 0 ? 1 : Math.max(...numbers) + 1;

/** The change order's description for the tickets it bills, held to the change order's 500 chars. */
export function changeOrderDescription(
  tickets: readonly Pick<TmTicketFacts, "number" | "description">[],
): string {
  const sorted = [...tickets].sort((a, b) => a.number - b.number);
  const first = sorted[0];
  if (!first) return "";
  const head =
    sorted.length === 1
      ? `${tmLabel(first.number)}: `
      : `T&M tickets ${sorted.map((t) => t.number).join(", ")}: `;
  const body = first.description.trim().replace(/\s+/g, " ");
  const more = sorted.length > 1 ? " and other extra work" : "";
  const text = `${head}${body}${more}`;
  return text.length <= 500 ? text : `${text.slice(0, 497)}...`;
}

/** Percent text ("15", "12.5") for basis points, and back; null when the text is not a percent. */
export const bpsText = (bps: number) => String(bps / 100);
export function parsePercentToBps(text: string): number | null {
  const t = text.trim().replace(/%$/, "").trim();
  if (t === "") return 0;
  if (!/^\d{1,3}(\.\d{1,2})?$/.test(t)) return null;
  const bps = Math.round(Number(t) * 100);
  return bps <= MAX_TM_MARKUP_BPS ? bps : null;
}

// ---------------------------------------------------------------------------------------------
// Signatures. The page draws the signature on a canvas and sends it as a baseline JPEG (base64);
// the PDF writer embeds JPEG as is (DCTDecode), so nothing is re-encoded on the server.

/** Base64 characters: about 110 KB of JPEG, many times what a signature pad produces. */
export const MAX_SIGNATURE_BASE64 = 150_000;
export const MAX_SIGNATURE_PX = 1600;

export interface JpegInfo {
  width: number;
  height: number;
  /** 1 grey, 3 colour (YCbCr); 4 (CMYK) is refused. */
  components: 1 | 3;
}

/**
 * Width, height and colour components from a JPEG's start-of-frame marker, or null when the bytes
 * are not a JPEG this writer can embed (baseline or progressive, grey or colour, 8 bits).
 */
export function jpegInfo(bytes: Uint8Array): JpegInfo | null {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
  let i = 2;
  while (i + 3 < bytes.length) {
    if (bytes[i] !== 0xff) return null;
    const marker = bytes[i + 1] as number;
    if (marker === 0xff) {
      i++;
      continue;
    }
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      i += 2;
      continue;
    }
    const len = ((bytes[i + 2] as number) << 8) | (bytes[i + 3] as number);
    if (len < 2) return null;
    // SOF0 (baseline), SOF1 (extended), SOF2 (progressive).
    if (marker === 0xc0 || marker === 0xc1 || marker === 0xc2) {
      if (i + 9 >= bytes.length) return null;
      const precision = bytes[i + 4];
      const height = ((bytes[i + 5] as number) << 8) | (bytes[i + 6] as number);
      const width = ((bytes[i + 7] as number) << 8) | (bytes[i + 8] as number);
      const components = bytes[i + 9];
      if (precision !== 8 || width < 1 || height < 1) return null;
      if (components !== 1 && components !== 3) return null;
      return { width, height, components };
    }
    if (marker === 0xda || marker === 0xd9) return null; // scan or end before any frame
    i += 2 + len;
  }
  return null;
}

export function base64ToBytes(b64: string): Uint8Array | null {
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(b64) || b64.length % 4 !== 0) return null;
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** The first problem with a signature image, in words, or null. */
export function signatureProblem(b64: string): string | null {
  if (b64.length > MAX_SIGNATURE_BASE64) return "The signature image is too large";
  const bytes = base64ToBytes(b64);
  const info = bytes ? jpegInfo(bytes) : null;
  if (!info) return "The signature must be a JPEG image";
  if (info.width > MAX_SIGNATURE_PX || info.height > MAX_SIGNATURE_PX) {
    return "The signature image is too large";
  }
  return null;
}

/**
 * A change order number not used on the job yet: the highest trailing number among the existing
 * ones plus one, with that one's prefix ("CO-3" -> "CO-4", "7" -> "8"); "1" on a job with none.
 */
export function nextChangeOrderNumber(existing: readonly string[]): string {
  const taken = new Set(existing.map((n) => n.trim()));
  let best: { prefix: string; n: number; width: number } | null = null;
  for (const raw of taken) {
    const m = /^(.*?)(\d+)$/.exec(raw);
    if (!m) continue;
    const n = Number(m[2]);
    if (!best || n > best.n) best = { prefix: m[1] ?? "", n, width: (m[2] ?? "").length };
  }
  let n = best ? best.n + 1 : 1;
  const fmt = (k: number) =>
    best ? `${best.prefix}${String(k).padStart(best.width, "0")}` : String(k);
  while (taken.has(fmt(n))) n++;
  return fmt(n);
}

// ---------------------------------------------------------------------------------------------
// The job's rate sheet: the labor, equipment and material rates the subcontract (or its T&M
// exhibit) fixes, and its markups. A new ticket's markups start from it, and "Fill blank rates"
// takes its rates before any rate carried from an earlier ticket. Nothing on a ticket changes by
// itself when the sheet changes: a priced ticket is what the office priced, and the page points out
// a rate that differs from the sheet so a person decides.

/** One rate on the sheet: a trade (labor, per man-hour), equipment (per hour) or material (per unit). */
export interface TmRateLine {
  name: string;
  rateCents: number;
  /** Material only: the unit the cost is per ("sheet", "cy"); null for labor and equipment. */
  unit: string | null;
}

export interface TmRateSheet {
  labor: TmRateLine[];
  material: TmRateLine[];
  equipment: TmRateLine[];
  /** The subcontract's markups; null where the sheet sets none (the latest ticket's is used). */
  laborMarkupBps: number | null;
  materialMarkupBps: number | null;
  equipmentMarkupBps: number | null;
  /** Where the rates come from, as typed ("Subcontract Exhibit D, through 2027-06-30"). */
  source: string | null;
}

/** Rates per kind on one sheet: a long exhibit, well past any real one. */
export const MAX_RATE_SHEET_LINES = 150;

const KIND_LABEL = { labor: "Labor", material: "Material", equipment: "Equipment" } as const;

/** The first problem with a rate sheet, in words, or null. */
export function rateSheetProblem(s: TmRateSheet): string | null {
  for (const kind of ["labor", "material", "equipment"] as const) {
    const list = s[kind];
    const label = KIND_LABEL[kind];
    if (list.length > MAX_RATE_SHEET_LINES) {
      return `${label}: a rate sheet holds up to ${MAX_RATE_SHEET_LINES} rates`;
    }
    const seen = new Set<string>();
    for (const [i, l] of list.entries()) {
      const n = `${label} rate ${i + 1}`;
      const key = norm(l.name);
      if (!key) return `${n}: enter the ${kind === "labor" ? "trade" : kind}`;
      if (seen.has(key)) return `${label}: "${l.name.trim()}" is on the sheet twice`;
      seen.add(key);
      if (!Number.isInteger(l.rateCents) || l.rateCents < 0 || l.rateCents > MAX_TM_RATE_CENTS) {
        return `${n}: enter the rate in dollars and cents`;
      }
    }
  }
  for (const [label, bps] of [
    ["Labor markup", s.laborMarkupBps],
    ["Material markup", s.materialMarkupBps],
    ["Equipment markup", s.equipmentMarkupBps],
  ] as const) {
    if (bps !== null && (!Number.isInteger(bps) || bps < 0 || bps > MAX_TM_MARKUP_BPS)) {
      return `${label}: enter 0% to 100%, to two decimals`;
    }
  }
  return null;
}

/** The sheet's rates by name (case and edge spaces ignored), in the shape tickets use. */
export function ratesFromSheet(s: Pick<TmRateSheet, "labor" | "material" | "equipment">): TmRates {
  const map = (list: TmRateLine[]) => {
    const out: Record<string, number> = {};
    for (const l of list) {
      const k = norm(l.name);
      if (k && !(k in out)) out[k] = l.rateCents;
    }
    return out;
  };
  return { labor: map(s.labor), material: map(s.material), equipment: map(s.equipment) };
}

/** The rates a blank line is filled from: the sheet's first, then the latest ticket's for the rest. */
export function jobRates(sheet: TmRateSheet | null, fromTickets: TmRates): TmRates {
  if (!sheet) return fromTickets;
  const s = ratesFromSheet(sheet);
  return {
    labor: { ...fromTickets.labor, ...s.labor },
    material: { ...fromTickets.material, ...s.material },
    equipment: { ...fromTickets.equipment, ...s.equipment },
  };
}

/** A new ticket's markups: the sheet's where it sets one, else the latest ticket's, else 0. */
export function startingMarkups(
  sheet: Pick<TmRateSheet, "laborMarkupBps" | "materialMarkupBps" | "equipmentMarkupBps"> | null,
  latest: TmMarkups | null | undefined,
): TmMarkups {
  return {
    laborMarkupBps: sheet?.laborMarkupBps ?? latest?.laborMarkupBps ?? 0,
    materialMarkupBps: sheet?.materialMarkupBps ?? latest?.materialMarkupBps ?? 0,
    equipmentMarkupBps: sheet?.equipmentMarkupBps ?? latest?.equipmentMarkupBps ?? 0,
  };
}

/**
 * A first draft of the sheet from the rates already used on the job's tickets (newest first): the
 * latest rate per name, spelled as on that ticket, sorted by name; markups from the latest ticket.
 */
export function rateSheetFromTickets(tickets: readonly (TmLines & TmMarkups)[]): TmRateSheet {
  const pick = <L>(
    get: (t: TmLines) => L[],
    name: (l: L) => string,
    rate: (l: L) => number | null,
    unit: (l: L) => string | null,
  ) => {
    const out = new Map<string, TmRateLine>();
    for (const t of tickets) {
      for (const l of get(t)) {
        const k = norm(name(l));
        const r = rate(l);
        if (!k || r === null || out.has(k)) continue;
        out.set(k, { name: name(l).trim(), rateCents: r, unit: unit(l) });
      }
    }
    return [...out.values()]
      .sort((a, b) => a.name.localeCompare(b.name))
      .slice(0, MAX_RATE_SHEET_LINES);
  };
  const first = tickets[0];
  return {
    labor: pick(
      (t) => t.labor,
      (l) => l.trade,
      (l) => l.rateCents,
      () => null,
    ),
    material: pick(
      (t) => t.material,
      (l) => l.description,
      (l) => l.unitCostCents,
      (l) => l.unit?.trim() || null,
    ),
    equipment: pick(
      (t) => t.equipment,
      (l) => l.description,
      (l) => l.rateCents,
      () => null,
    ),
    laborMarkupBps: first ? first.laborMarkupBps : null,
    materialMarkupBps: first ? first.materialMarkupBps : null,
    equipmentMarkupBps: first ? first.equipmentMarkupBps : null,
    source: null,
  };
}

/** A priced line or markup on a ticket that is not what the job's rate sheet says. */
export interface TmSheetDifference {
  /** "Labor: Electrician $95.00 an hour; the rate sheet says $88.00." */
  text: string;
}

/**
 * Where a ticket's rates or markups differ from the rate sheet. Lines with no rate, and names not
 * on the sheet, are left alone (the sheet does not cover them). GCs check T&M pricing against the
 * subcontract's rates, so a difference is worth a look before the ticket goes on a change order.
 */
export function rateSheetDifferences(
  t: TmLines & TmMarkups,
  sheet: TmRateSheet | null,
): TmSheetDifference[] {
  if (!sheet) return [];
  const s = ratesFromSheet(sheet);
  const out: TmSheetDifference[] = [];
  const money = formatCents;
  const check = (
    kind: string,
    name: string,
    rate: number | null,
    sheetRate: number | undefined,
    per: string,
  ) => {
    if (rate === null || sheetRate === undefined || rate === sheetRate) return;
    out.push({
      text: `${kind}: ${name.trim()} ${money(rate)} ${per}; the rate sheet says ${money(sheetRate)}.`,
    });
  };
  for (const l of t.labor)
    check("Labor", l.trade, l.rateCents, s.labor[norm(l.trade)], "a man-hour");
  for (const l of t.material) {
    check("Material", l.description, l.unitCostCents, s.material[norm(l.description)], "a unit");
  }
  for (const l of t.equipment) {
    check("Equipment", l.description, l.rateCents, s.equipment[norm(l.description)], "an hour");
  }
  for (const [label, have, want] of [
    ["Labor markup", t.laborMarkupBps, sheet.laborMarkupBps],
    ["Material markup", t.materialMarkupBps, sheet.materialMarkupBps],
    ["Equipment markup", t.equipmentMarkupBps, sheet.equipmentMarkupBps],
  ] as const) {
    if (want !== null && have !== want) {
      out.push({ text: `${label}: ${bpsText(have)}%; the rate sheet says ${bpsText(want)}%.` });
    }
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// The weekly email's T&M line: signed tickets on no change order, per job. Work the GC's
// representative signed for is money the subcontractor has not asked for yet, and subcontracts
// set deadlines for submitting extra work, so it belongs on the week's list.

/** One ticket as the weekly email reads it (active jobs only, chosen by the Worker). */
export interface CompanyTmTicketInput extends TmLines, TmMarkups {
  projectId: string;
  projectName: string;
  projectNumber: string | null;
  gcName: string;
  number: number;
  workDate: string;
  signed: boolean;
  onChangeOrder: boolean;
}

/** One job's signed tickets with no change order yet. */
export interface TmJobToBill {
  projectId: string;
  projectName: string;
  projectNumber: string | null;
  gcName: string;
  /** Ticket numbers, lowest first. */
  tickets: number[];
  /** The priced ones' total, cents. */
  pricedCents: number;
  /** Tickets among them with a line still unpriced. */
  unpriced: number;
  /** The oldest one's work date, and how many days before `today` it was. */
  oldestWorkDate: string;
  daysOld: number;
}

const daysBetween = (from: string, to: string) =>
  Math.round(
    (new Date(`${to}T00:00:00Z`).getTime() - new Date(`${from}T00:00:00Z`).getTime()) / 86_400_000,
  );

/** Jobs with signed tickets not on a change order, the oldest work first (nearest a deadline). */
export function ticketsToBill(
  inputs: readonly CompanyTmTicketInput[],
  today: string,
): TmJobToBill[] {
  const jobs = new Map<string, TmJobToBill>();
  for (const t of inputs) {
    if (!t.signed || t.onChangeOrder) continue;
    let j = jobs.get(t.projectId);
    if (!j) {
      j = {
        projectId: t.projectId,
        projectName: t.projectName,
        projectNumber: t.projectNumber,
        gcName: t.gcName,
        tickets: [],
        pricedCents: 0,
        unpriced: 0,
        oldestWorkDate: t.workDate,
        daysOld: 0,
      };
      jobs.set(t.projectId, j);
    }
    j.tickets.push(t.number);
    const total = priceTicket(t).totalCents;
    if (total === null) j.unpriced++;
    else j.pricedCents += total;
    if (t.workDate < j.oldestWorkDate) j.oldestWorkDate = t.workDate;
  }
  return [...jobs.values()]
    .map((j) => ({
      ...j,
      tickets: [...j.tickets].sort((a, b) => a - b),
      daysOld: Math.max(0, daysBetween(j.oldestWorkDate, today)),
    }))
    .sort(
      (a, b) =>
        a.oldestWorkDate.localeCompare(b.oldestWorkDate) ||
        a.projectName.localeCompare(b.projectName),
    );
}

const listNumbers = (ns: number[]) =>
  ns.length === 1
    ? tmLabel(ns[0] as number)
    : ns.length === 2
      ? `T&M ${ns[0]} and ${ns[1]}`
      : `T&M ${ns.slice(0, -1).join(", ")} and ${ns.at(-1)}`;

/**
 * "Riverside Clinic (#2207, Acme Builders): T&M 3 and 7 signed, not on a change order: $4,210.00
 * priced, 1 not priced yet. Oldest work 2026-11-02, 24 days ago."
 */
export function tmToBillText(j: TmJobToBill): string {
  const job = `${j.projectName.trim()} (${j.projectNumber?.trim() ? `#${j.projectNumber.trim()}, ` : ""}${j.gcName.trim()})`;
  const money = formatCents(j.pricedCents);
  const priced = j.tickets.length - j.unpriced;
  const amounts =
    j.unpriced === 0
      ? `${money} priced`
      : priced === 0
        ? `${j.unpriced === 1 ? "not" : "none"} priced yet`
        : `${money} priced, ${j.unpriced} not priced yet`;
  const age = j.daysOld === 0 ? "today" : j.daysOld === 1 ? "yesterday" : `${j.daysOld} days ago`;
  return `${job}: ${listNumbers(j.tickets)} signed, not on a change order: ${amounts}. Oldest work ${j.oldestWorkDate}, ${age}.`;
}
