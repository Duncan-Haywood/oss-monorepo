// GCPay: the subcontractor enters the breakdown of a "constrained" schedule of values (the GC has entered
// the contract amount) by hand or with the Line Items section's Upload button. From GCPay's Subcontractor
// Training Guide (Rev. 12/19, "Creating a Schedule of Values" and "Uploading a Schedule of Values via
// Excel Upload", as published by a GC for its subs; read 2026-11-26):
//
// - "A standard Schedule of Values will be 3 columns: Item Number, Description, Value while a Unit Price
//   Schedule of Values will be 5 Columns: Item Number, Description, Units, Unit Description, Unit Value".
// - "Please use the provide GCPay Excel Template as the system will not upload a document saved as any
//   other file format. If you have your information entered on your own Excel document, please remove any
//   and all information outside of the following: item number, description, & value."
// - "The sum of values entered should equal your Original Contract Value. You will not be able to submit
//   if you contract totals do not match the amount entered by your General Contractor."
// - "Change orders will be added by your General Contractor AFTER your base contract value has been
//   approved in GCPay."
//
// So this writes an .xlsx with exactly those three columns, the base contract's lines only, and checks
// their sum against the job's original contract sum before the person uploads it. Billing itself is typed
// into GCPay's "$ This Period" (or "% Work to Date") column; the guide describes no billing upload.
// Runs in the browser; nothing is uploaded.
import { centsToDecimal } from "../money";
import { quantityDecimal, unitPriceDecimal } from "../unit-price";
import { writeXlsx, type XlsxCell } from "./xlsx-write";

export const GCPAY_GUIDE_URL =
  "https://chambersconstruction.com/uploads/1/3/4/9/134926541/gcpay_subcontractor_guide.pdf";

export const GCPAY_SOV_HEADER = ["Item Number", "Description", "Value"] as const;
/**
 * The guide's unit-price layout. It names the five columns and nothing more; we read "Units" as the
 * contract quantity, "Unit Description" as its unit (CY, LF) and "Unit Value" as the price of one
 * unit, so Units × Unit Value is the line's value. A lump-sum line in this layout is written as 1 LS
 * at its value, the usual way a unit-price schedule carries one. The panel says to check this
 * against the GC's own template.
 */
export const GCPAY_UNIT_PRICE_SOV_HEADER = [
  "Item Number",
  "Description",
  "Units",
  "Unit Description",
  "Unit Value",
] as const;

export interface GcpaySovLine {
  itemNumber: string;
  description: string;
  cents: number;
  /** A unit-price line's pricing (src/shared/unit-price.ts); absent on a lump-sum line. */
  unitPrice?: { quantityMilli: number | null; unit: string; unitPriceMicros: number };
}

export interface GcpaySovCheck {
  lines: number;
  totalCents: number;
  contractCents: number;
  /** total minus the original contract sum: 0 when GCPay will accept the totals. */
  diffCents: number;
  /** Lines with no item number (GCPay's Auto Number can fill them after the upload). */
  unnumbered: number;
  /** Item numbers used by more than one line. */
  duplicateNumbers: string[];
  /** Unit-price lines in the base contract. */
  unitPriceLines: number;
  /** Unit-price lines with no contract quantity (the unit-price layout cannot carry them). */
  unitPriceWithoutQuantity: string[];
}

export function checkGcpaySov(lines: GcpaySovLine[], contractCents: number): GcpaySovCheck {
  const totalCents = lines.reduce((s, l) => s + l.cents, 0);
  const seen = new Map<string, number>();
  for (const l of lines) {
    const n = l.itemNumber.trim();
    if (n) seen.set(n, (seen.get(n) ?? 0) + 1);
  }
  return {
    lines: lines.length,
    totalCents,
    contractCents,
    diffCents: totalCents - contractCents,
    unnumbered: lines.filter((l) => l.itemNumber.trim() === "").length,
    duplicateNumbers: [...seen].filter(([, c]) => c > 1).map(([n]) => n),
    unitPriceLines: lines.filter((l) => l.unitPrice).length,
    unitPriceWithoutQuantity: lines
      .filter((l) => l.unitPrice && l.unitPrice.quantityMilli === null)
      .map((l) => l.itemNumber.trim() || l.description.trim()),
  };
}

/** The rows of the unit-price upload: quantity, unit and unit price; a lump-sum line is 1 LS. */
export function gcpayUnitPriceSovRows(lines: GcpaySovLine[]): XlsxCell[][] {
  return [
    [...GCPAY_UNIT_PRICE_SOV_HEADER],
    ...lines.map((l): XlsxCell[] => {
      const u = l.unitPrice;
      const priced = u && u.quantityMilli !== null;
      return [
        l.itemNumber.trim() || null,
        l.description.trim(),
        { number: priced ? Number(quantityDecimal(u.quantityMilli as number)) : 1 },
        priced ? u.unit : "LS",
        { number: Number(priced ? unitPriceDecimal(u.unitPriceMicros) : centsToDecimal(l.cents)) },
      ];
    }),
  ];
}

/** The unit-price .xlsx (five columns) for the same Upload button. */
export function gcpayUnitPriceSovWorkbook(lines: GcpaySovLine[]): Uint8Array {
  return writeXlsx("Schedule of Values", gcpayUnitPriceSovRows(lines), [14, 60, 12, 16, 16]);
}

/** The rows of the upload: the header, then one row per line in the job's order. */
export function gcpaySovRows(lines: GcpaySovLine[]): XlsxCell[][] {
  return [
    [...GCPAY_SOV_HEADER],
    ...lines.map((l): XlsxCell[] => [
      l.itemNumber.trim() || null,
      l.description.trim(),
      { number: Number(centsToDecimal(l.cents)) },
    ]),
  ];
}

/** The .xlsx to upload with GCPay's Line Items "Upload" button. */
export function gcpaySovWorkbook(lines: GcpaySovLine[]): Uint8Array {
  return writeXlsx("Schedule of Values", gcpaySovRows(lines), [14, 60, 16]);
}

/** A file name for the download: the job's number or name, made safe. */
export function gcpaySovFileName(job: { number: string | null; name: string }): string {
  const base = (job.number?.trim() || job.name.trim() || "job")
    .replace(/[^A-Za-z0-9._ -]+/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .slice(0, 60);
  return `${base || "job"}-gcpay-sov.xlsx`;
}
