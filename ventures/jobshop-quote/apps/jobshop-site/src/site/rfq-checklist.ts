// The /rfq-review-checklist guide: what a machine or fabrication shop checks on an RFQ before it
// prices it, and the same list as a CSV a visitor downloads and fills in per RFQ.
//
// Aimed at the searches estimators and quality managers make ("RFQ review checklist", "contract
// review checklist machine shop", "what to check before quoting a machining job"). ISO 9001:2015 and
// AS9100D both call this step "review of the requirements for products and services" (clause 8.2.3);
// the page names the clause and never claims that using the list meets it. Every check is common
// practice written as a question, not legal advice; the export-control and defense rows say to ask
// someone qualified.
//
// `inApp` says what Job Shop Quote does about a check today (ROADMAP "Done" list in
// apps/jobshop-quote); a check the app does not help with has none, and the page prints no claim.

import { csvCell } from "./quote-template";

export interface RfqCheck {
  /** Short name of the check, as the table's row header. */
  check: string;
  /** The question the estimator answers before quoting. */
  question: string;
  /** What goes wrong when it is skipped. */
  why: string;
  /** What Job Shop Quote does about it today, if anything (only what the hosted app does). */
  inApp?: string;
}

export interface RfqSection {
  id: string;
  title: string;
  checks: readonly RfqCheck[];
}

export const RFQ_SECTIONS: readonly RfqSection[] = [
  {
    id: "documents",
    title: "The documents",
    checks: [
      {
        check: "Every part has a drawing or model",
        question:
          "Does each line on the RFQ have a drawing, a model or both, and do the part numbers on them match the RFQ?",
        why: "A line quoted from a description alone is a guess; a drawing that carries another part number means one part was never sent.",
        inApp:
          "The rule reader matches a drawing to the part whose number it carries and fills that part's blanks from it.",
      },
      {
        check: "Drawing revision",
        question:
          "Which revision is each drawing, does it match the revision the RFQ asks for, and is the model the same revision as the drawing?",
        why: "The price is for the revision quoted. A model at Rev C with a drawing at Rev B is two different parts until the buyer says which one governs.",
        inApp:
          "Revision is a field on every part and prints on the quote line, so the quote says which revision was priced.",
      },
      {
        check: "Drawing or model governs",
        question:
          "If the drawing and the model disagree, which one does the customer say governs, and are there dimensions only on the drawing?",
        why: "Many shops program from the model and inspect to the drawing; a note saying which governs settles the argument before the first article, not after.",
      },
      {
        check: "Referenced specs on hand",
        question:
          "Do you have every specification the drawing calls out (material, finish, heat treat, welding, inspection), at the revision it names?",
        why: "A callout you have not read can add a process, a test or a certification you did not price.",
      },
    ],
  },
  {
    id: "part",
    title: "The part",
    checks: [
      {
        check: "Material",
        question:
          "Is the material fully specified (alloy, temper or condition, form), can you buy it at the size you need, and is a substitute allowed?",
        why: "“Aluminum” is not a material; 6061-T6 plate and 7075-T651 bar price and machine differently, and an unavailable size changes the blank.",
        inApp:
          "The reader takes the material line and suggests the matching material from your rate card; a material stated above a parts list applies to every part.",
      },
      {
        check: "Tightest tolerances",
        question:
          "Which features carry the tightest tolerances or GD&T callouts, and can your machines hold and your gauges measure them?",
        why: "One tight bore can decide the machine, the setup count and the inspection time for the whole part.",
        inApp:
          "The reader picks up labelled tolerance lines so the estimator sees them on the review.",
      },
      {
        check: "Surface finish and edges",
        question:
          "What surface roughness is called out, where, and what edge break or deburr note applies?",
        why: "A fine finish on a sealing face may need a finishing pass or a grind; “break all edges” on a part with many edges is real minutes.",
      },
      {
        check: "Threads and holes",
        question:
          "Which threads, thread classes and hole depths are called out, and do any need special tools or gauges?",
        why: "Deep holes, small taps and thread gauges you do not own add time and tooling cost.",
        inApp:
          "From a STEP model the app finds the holes and their depths and pre-fills drilling; the estimator ticks which sizes are tapped.",
      },
      {
        check: "Finish, plating and heat treat",
        question:
          "Which outside processes are called out (anodize, plating, passivation, paint, heat treat), to which specification, and who supplies them?",
        why: "Outside processes have lot minimums and lead times of their own, and a masking note can cost more than the coating.",
        inApp:
          "Finishing and outside services are on the rate card with their per-part price and lot minimum.",
      },
      {
        check: "Marking and packaging",
        question:
          "Does the part need part marking, serial numbers, bagging, special packaging or labels?",
        why: "Small per-part steps add up over a lot and are easy to forget at the quoting stage.",
      },
    ],
  },
  {
    id: "quantity",
    title: "Quantity and timing",
    checks: [
      {
        check: "Quantities asked for",
        question:
          "Which quantities does the buyer want prices for, is it a one-off, a blanket order or scheduled releases, and is there a prototype lot first?",
        why: "Setup and lot minimums spread differently at each quantity; a blanket order with releases is priced and stocked differently from one lot.",
        inApp:
          "The reader takes the quantity lines; every quantity break is priced from the same rate card, with setup and minimums spread at each.",
      },
      {
        check: "Due date against your load",
        question:
          "When does the buyer need the parts, when must the quote be in, and can you deliver with what is already on the floor?",
        why: "A price you cannot deliver on loses the customer more surely than a high price.",
        inApp:
          "The reader takes due dates that carry a year; the Shop load page puts your open jobs on your machines and plans a draft quote's lead time behind them.",
      },
      {
        check: "Repeat part",
        question:
          "Have you quoted or made this part number before, at which revision and price, and did that quote win?",
        why: "Last time's price, time and problems are the best estimate you have, and a buyer notices when the same part is priced differently.",
        inApp:
          "The RFQ review shows “Quoted before: N, M won” for each part before a quote exists, from your own quote history.",
      },
    ],
  },
  {
    id: "quality",
    title: "Quality and paperwork",
    checks: [
      {
        check: "Certifications",
        question:
          "Does the buyer want material certifications, a certificate of conformance or process certs from your finishers?",
        why: "Certs have to be ordered with the material and kept; a mill cert requested after the material arrives may not be available.",
      },
      {
        check: "First-article and inspection reports",
        question:
          "Is a first-article inspection required (for aerospace work, often to AS9102), a CMM report, a sampling plan or 100% inspection?",
        why: "A full first-article report on a complex part can take longer than machining the first part, and it is often unpriced.",
      },
      {
        check: "Quality system requirements",
        question:
          "Does the purchase order or the buyer's supplier manual require a quality system registered to ISO 9001 or AS9100, or other quality clauses?",
        why: "Quality clauses on the PO bind you once you accept it; read them at the quote, not when the order arrives.",
      },
    ],
  },
  {
    id: "terms",
    title: "Commercial terms and restrictions",
    checks: [
      {
        check: "Export-controlled technical data",
        question:
          "Is the drawing marked ITAR or EAR, or as Controlled Unclassified Information (CUI), and can your shop lawfully receive and store it?",
        why: "Export-controlled and CUI drawings have handling rules of their own; ask someone qualified before you open them, not after.",
        inApp:
          "Job Shop Quote's early access is not set up for CUI or export-controlled drawings; use it only for commercial RFQs.",
      },
      {
        check: "Defense and government flowdowns",
        question:
          "Is it a defense or government job, and which clauses flow down to you (for example DFARS 252.204-7012 on safeguarding covered defense information, or 252.225-7009 on specialty metals)?",
        why: "Flowdowns can restrict where material comes from and how you store the drawings; a clause you cannot meet means no-quote.",
      },
      {
        check: "Customer-supplied material",
        question: "Does the customer supply the material or parts, and who pays when one scraps?",
        why: "Free-issue material changes the price and the risk; settle the scrap terms on the quote.",
      },
      {
        check: "Payment and shipping",
        question:
          "Are the buyer's payment terms and shipping terms (FOB point, who pays freight) ones you accept?",
        why: "Net 90 on a large material buy is a loan to the customer; know it before you price.",
      },
      {
        check: "Quote or no-quote",
        question:
          "After all of the above: do you want this job at a price the buyer is likely to pay, and if not, have you told them so?",
        why: "A prompt no-quote keeps the buyer's goodwill and your estimator's time for the work you want.",
        inApp:
          "Quotes you send are logged as won, lost or expired with the reason, so win rate by customer shows where quoting pays.",
      },
    ],
  },
];

export const RFQ_CHECKS: readonly RfqCheck[] = RFQ_SECTIONS.flatMap((s) => s.checks);

/** Columns of the downloadable checklist, in order. */
export const RFQ_CSV_COLUMNS = [
  "Section",
  "Check",
  "Question",
  "Why it matters",
  "Answer (yes / no / n/a)",
  "Notes",
] as const;

export const RFQ_CSV_FILE = "rfq-review-checklist.csv";

/**
 * The checklist file: a line for the RFQ it is used on, a header row, then one row per check with
 * the answer and notes left blank. Plain values only, no formulas (csvCell refuses a cell that would
 * read as one).
 */
export function rfqChecklistCsv(): string {
  const rows: string[][] = [
    ["RFQ / customer", "", "Reviewed by", "", "Date", ""],
    [...RFQ_CSV_COLUMNS],
  ];
  for (const s of RFQ_SECTIONS)
    for (const c of s.checks) rows.push([s.title, c.check, c.question, c.why, "", ""]);
  return `${rows.map((r) => r.map(csvCell).join(",")).join("\r\n")}\r\n`;
}
