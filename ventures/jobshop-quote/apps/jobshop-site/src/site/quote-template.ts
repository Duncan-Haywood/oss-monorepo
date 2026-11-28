// The /machine-shop-quote-template guide: a filled-in example quote and the CSV template a visitor
// downloads. The example's prices come from the CNC quoting guide's worked example (./quote-example,
// checked to the cent against Job Shop Quote's costing engine by
// apps/jobshop-quote/test/unit/site-quote-example.test.ts), so the two guides quote the same bracket
// at the same prices. The shop, customer, part number and dates are made up and labelled so.
//
// What the customer sees follows the app's own quote PDF (apps/jobshop-quote/src/worker/services/
// quotes/pdf.ts): parts, quantity breaks, unit and extended prices, lead time, validity, notes and
// terms, and never the cost basis, rates or markup.

import { priceExample, EXAMPLE as QUOTE_EXAMPLE, usdCents } from "./quote-example";

export interface TemplateLineBreak {
  quantity: number;
  unitPriceCents: number;
  totalCents: number;
}

export interface TemplateLine {
  partNumber: string;
  revision: string;
  description: string;
  material: string;
  finish: string;
  breaks: TemplateLineBreak[];
}

export interface ExampleQuote {
  shopName: string;
  quoteLabel: string;
  issuedOn: string;
  validUntil: string;
  customerCompany: string;
  customerContact: string;
  customerRfq: string;
  leadTime: string;
  lines: TemplateLine[];
  notes: string[];
}

/** The made-up quote the page prints: the CNC guide's bracket, priced by that guide's arithmetic. */
export function exampleQuote(): ExampleQuote {
  const r = priceExample(QUOTE_EXAMPLE);
  return {
    shopName: "Example Precision Machining",
    quoteLabel: "Q-1001",
    issuedOn: "2026-11-27",
    validUntil: "2026-12-27",
    customerCompany: "Example Customer Co.",
    customerContact: "A. Buyer, purchasing",
    customerRfq: "RFQ 2291",
    leadTime: "3 weeks after receipt of order",
    lines: [
      {
        partNumber: "BRK-1001",
        revision: "B",
        description: `Mounting bracket, per drawing BRK-1001 Rev B`,
        material: QUOTE_EXAMPLE.materialName.replace(/ plate$/, ""),
        finish: "Clear anodize (outside vendor)",
        breaks: r.breaks.map((b) => ({
          quantity: b.quantity,
          unitPriceCents: b.unitPriceCents,
          totalCents: b.totalCents,
        })),
      },
    ],
    notes: [
      "Quoted to drawing BRK-1001 Rev B dated 2026-11-20. A later revision is a new quote.",
      "Material certifications included. First-article inspection report included on the first lot.",
      "Customer RFQ 2291.",
    ],
  };
}

/**
 * Terms a shop decides once and prints on every quote, each as the question it answers. The page
 * says these are prompts to decide on, not wording to copy, and not legal advice.
 */
export const TERMS_CHECKLIST: readonly { term: string; question: string }[] = [
  {
    term: "Validity",
    question:
      "How many days the prices hold, and what happens after: a re-quote, or prices adjusted for material.",
  },
  {
    term: "Payment",
    question:
      "Net 30 or another term, a deposit on large or first orders, and whether you take cards.",
  },
  {
    term: "Drawing revision",
    question:
      "That the price is for the revision quoted, and a change to the drawing is a new quote or a change order.",
  },
  {
    term: "Overruns and underruns",
    question:
      "Whether you may ship a few parts over or under the order quantity, and how those are billed.",
  },
  {
    term: "Inspection and paperwork",
    question:
      "Which certifications, first-article or CMM reports are included, and which are charged extra.",
  },
  {
    term: "Shipping",
    question:
      "Where ownership and risk pass (FOB your dock or theirs, or an Incoterm), and who pays freight.",
  },
  {
    term: "Customer-supplied material",
    question:
      "Who carries the cost when material or parts the customer supplied scrap through no fault of yours.",
  },
  {
    term: "Changes and cancellation",
    question:
      "What the customer owes for material bought and work done when an order is changed or cancelled.",
  },
  {
    term: "Export-controlled drawings",
    question:
      "Whether you accept ITAR or EAR technical data, and how the customer must mark and send it.",
  },
];

/** Columns of the downloadable template, in order. */
export const CSV_COLUMNS = [
  "Line",
  "Part number",
  "Drawing revision",
  "Description",
  "Material",
  "Finish",
  "Quantity",
  "Unit price",
  "Extended price",
  "Lead time",
  "Notes",
] as const;

export const CSV_FILE = "machine-shop-quote-template.csv";

/**
 * A cell for the CSV. Quoted when it holds a comma, quote or newline. A cell starting with = + - @
 * (or a tab or carriage return) would run as a formula in a spreadsheet, so it is refused: every
 * cell here is a constant written in this file or a price, and none should start that way.
 */
export function csvCell(v: string): string {
  if (/^[=+\-@\t\r]/.test(v)) throw new Error(`CSV cell would read as a formula: ${v}`);
  return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

const plainUsd = (cents: number) => usdCents(cents).replace(/^\$/, "").replace(/,/g, "");

/**
 * The template file: a header row, the example quote's rows (one per quantity break, marked as the
 * example), then blank numbered lines to fill in. Plain values only, no formulas.
 */
export function templateCsv(blankLines = 10): string {
  const q = exampleQuote();
  const rows: string[][] = [[...CSV_COLUMNS]];
  let n = 0;
  for (const line of q.lines) {
    n += 1;
    for (const b of line.breaks) {
      rows.push([
        String(n),
        line.partNumber,
        line.revision,
        `EXAMPLE (made up, delete this row): ${line.description}`,
        line.material,
        line.finish,
        String(b.quantity),
        plainUsd(b.unitPriceCents),
        plainUsd(b.totalCents),
        q.leadTime,
        "",
      ]);
    }
  }
  for (let i = 1; i <= blankLines; i++)
    rows.push([String(n + i), ...CSV_COLUMNS.slice(1).map(() => "")]);
  return `${rows.map((r) => r.map(csvCell).join(",")).join("\r\n")}\r\n`;
}
