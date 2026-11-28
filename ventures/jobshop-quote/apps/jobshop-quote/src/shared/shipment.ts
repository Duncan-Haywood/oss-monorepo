// Packing slip and certificate of conformance (CoC) for a won quote: what goes in the box with the
// parts. The quantity shipped per line is the one the shop types (a partial shipment is fine), else
// the quantity ordered by the traveler's rules (the saved job's quantity, else the break the
// customer accepted online, else the line's only break). A line quoted at several breaks with none
// of these is refused by part number, never guessed.
//
// Nothing is claimed for the shop. The certificate prints the shop's own statement over a blank
// signature line, the heat or lot numbers the shop typed (a blank box when it typed none), and the
// material and outside processes from the estimate; a revision the quote never had prints as "not
// given" rather than being left out. No price, rate or markup appears on either page.
import type { CostInputs } from "./costing";
import { GONE, isValidOrderQuantity, planQuantities, type TravelerNames } from "./traveler";

/** The longest heat or lot number, signer and ship-to line the form takes. */
export const MAX_LOT_LENGTH = 60;
export const MAX_SIGNER_LENGTH = 80;
export const MAX_SHIP_TO_LINES = 5;
export const MAX_SHIP_TO_LINE_LENGTH = 70;

/** The statement printed above the signature line. The shop signs it; the service does not. */
export const CONFORMANCE_STATEMENT =
  "We certify that the parts listed above were manufactured and inspected in accordance with the " +
  "purchase order and the drawings and specifications at the revisions shown, and that they " +
  "conform to those requirements.";

export interface ShipmentQuery {
  /** Ship date, YYYY-MM-DD. */
  ship?: string;
  /** Quantity in this shipment per line id. */
  quantities: Record<string, number>;
  /** Heat or lot number per line id, as typed. */
  lots: Record<string, string>;
  /** "Name, title" of the person signing the certificate. */
  signer?: string;
  /** Ship-to address lines; the customer's company name when empty. */
  shipTo: string[];
  /** False prints the packing slip alone. */
  certificate: boolean;
}

export interface ShipmentLineInput {
  id: string;
  partNumber: string;
  revision: string | null;
  description: string | null;
  inputs: CostInputs;
}

export interface ShipmentLine {
  lineId: string;
  partNumber: string;
  revision: string | null;
  description: string | null;
  /** Null when the order quantity is unknown (a multi-break line shipped by a typed quantity). */
  ordered: number | null;
  shipped: number;
  /** Shipped fewer than ordered. */
  partial: boolean;
  /** "303 Stainless bar", "Customer-supplied", or null when the estimate has none. */
  material: string | null;
  lot: string | null;
  /** Finishing done by an outside processor, by name. */
  outsideProcesses: string[];
}

export interface ShipmentPlan {
  lines: ShipmentLine[];
  /** Accepted online without this part, and no quantity typed for it. */
  leftOff: string[];
  /** Quoted at several breaks with no quantity ordered or shipped. */
  missing: string[];
}

/** Printable text only: control characters become spaces, runs of space collapse, ends trimmed. */
export function cleanText(v: string): string {
  let out = "";
  for (const ch of v) {
    const code = ch.charCodeAt(0);
    out += code < 32 || code === 127 ? " " : ch;
  }
  return out.replace(/\s+/g, " ").trim();
}

/**
 * Plan what ships. `ordered` is the saved job's quantity per line (from the PO), `accepted` the
 * customer's online choice, `shipped` the quantities typed for this shipment.
 */
export function planShipment(
  lines: readonly ShipmentLineInput[],
  ordered: Readonly<Record<string, number>>,
  accepted: ReadonlyArray<{ lineId: string; quantity: number }> | null,
  query: Pick<ShipmentQuery, "quantities" | "lots">,
  names: (line: ShipmentLineInput) => TravelerNames,
): ShipmentPlan {
  const order = planQuantities(lines, ordered, accepted);
  const orderedQty = new Map(order.plan.map((p) => [p.line.id, p.quantity]));
  const out: ShipmentLine[] = [];
  const leftOff: string[] = [];
  const missing: string[] = [];
  for (const line of lines) {
    const typed = query.quantities[line.id];
    const own = orderedQty.get(line.id) ?? null;
    const shipped = typed ?? own;
    if (shipped === null) {
      if (order.leftOff.includes(line.partNumber)) leftOff.push(line.partNumber);
      else missing.push(line.partNumber);
      continue;
    }
    const n = names(line);
    const mat = line.inputs.material;
    const material = line.inputs.customerSuppliedMaterial
      ? "Customer-supplied"
      : mat
        ? (n.materials.find((m) => m.id === mat.materialId)?.name ?? GONE)
        : null;
    const outsideProcesses = line.inputs.finishing
      .map((f) => n.finishingOps.find((o) => o.id === f.opId))
      .filter((o): o is NonNullable<typeof o> => !!o && o.outsideService)
      .map((o) => o.name);
    const lot = query.lots[line.id];
    out.push({
      lineId: line.id,
      partNumber: line.partNumber,
      revision: line.revision,
      description: line.description,
      ordered: own,
      shipped,
      partial: own !== null && shipped < own,
      material,
      lot: lot ? lot : null,
      outsideProcesses,
    });
  }
  return { lines: out, leftOff, missing };
}

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

/** A real YYYY-MM-DD day: 2026-02-30 is refused, not rolled over to March. */
export function isCalendarDay(v: string): boolean {
  if (!ISO_DAY.test(v)) return false;
  const y = Number(v.slice(0, 4));
  const m = Number(v.slice(5, 7));
  const d = Number(v.slice(8, 10));
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}

/** The query-string error, said the way the form's field would say it. */
export class ShipmentQueryError extends Error {}

/**
 * Read `ship`, `qty.<lineId>`, `lot.<lineId>`, `signer`, `to` (newline-separated) and `coc=0` from a
 * query string. A bad value is an error, never a default.
 */
export function parseShipmentQuery(query: Readonly<Record<string, string>>): ShipmentQuery {
  const out: ShipmentQuery = { quantities: {}, lots: {}, shipTo: [], certificate: true };
  for (const [k, raw] of Object.entries(query)) {
    if (k === "ship") {
      if (raw === "") continue;
      if (!isCalendarDay(raw)) throw new ShipmentQueryError("The ship date must be YYYY-MM-DD");
      out.ship = raw;
    } else if (k.startsWith("qty.")) {
      if (raw === "") continue;
      const n = Number(raw);
      if (!/^\d+$/.test(raw) || !isValidOrderQuantity(n))
        throw new ShipmentQueryError(
          "Each quantity shipped must be a whole number from 1 to 1,000,000",
        );
      out.quantities[k.slice(4)] = n;
    } else if (k.startsWith("lot.")) {
      const v = cleanText(raw);
      if (v === "") continue;
      if (v.length > MAX_LOT_LENGTH)
        throw new ShipmentQueryError(
          `A heat or lot number is at most ${MAX_LOT_LENGTH} characters`,
        );
      out.lots[k.slice(4)] = v;
    } else if (k === "signer") {
      const v = cleanText(raw);
      if (v === "") continue;
      if (v.length > MAX_SIGNER_LENGTH)
        throw new ShipmentQueryError(`The signer is at most ${MAX_SIGNER_LENGTH} characters`);
      out.signer = v;
    } else if (k === "to") {
      const lines = raw.split(/\r?\n/).map(cleanText).filter(Boolean);
      if (lines.length > MAX_SHIP_TO_LINES)
        throw new ShipmentQueryError(`The ship-to address is at most ${MAX_SHIP_TO_LINES} lines`);
      if (lines.some((l) => l.length > MAX_SHIP_TO_LINE_LENGTH))
        throw new ShipmentQueryError(
          `Each ship-to line is at most ${MAX_SHIP_TO_LINE_LENGTH} characters`,
        );
      out.shipTo = lines;
    } else if (k === "coc") {
      if (raw !== "0" && raw !== "1") throw new ShipmentQueryError("coc is 0 or 1");
      out.certificate = raw === "1";
    }
  }
  return out;
}

/** The line ids a query names (quantities and lots), to check they are on the quote. */
export function namedLineIds(query: Pick<ShipmentQuery, "quantities" | "lots">): string[] {
  return [...new Set([...Object.keys(query.quantities), ...Object.keys(query.lots)])];
}
