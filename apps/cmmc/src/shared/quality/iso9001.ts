// ISO 9001:2015 clause checklist: the clause numbers and headings of the standard's requirement
// clauses (4 to 10), each with a plain-language note of what a small machine shop usually keeps to
// show it, and the CMMC Level 2 requirements whose documents often serve both.
//
// What this is and is not (docs/SOURCES.md, "ISO 9001"):
// - The requirement text of ISO 9001 is copyrighted by ISO and is NOT reproduced here. Only the
//   clause numbers and headings (the standard's table of contents) appear, and every `prompt` is
//   this app's own wording, written as a reminder of what to gather, never as the requirement.
//   A shop needs its own copy of the standard (iso.org or a national body such as ANSI).
// - The numbers and headings were written from the published 2015 edition's structure (the Annex SL
//   high-level structure) and were NOT checked against a copy of the standard on 2026-11-25: the
//   session that wrote them could not reach iso.org. `ISO9001_VERIFICATION` says so in the UI.
// - `relatedControls` is this app's judgement of where one document commonly answers both (a
//   training record for 7.2 and AT.L2-3.2.2, an internal audit for 9.2 and CA.L2-3.12.1). It is a
//   pointer to reuse evidence, not an equivalence: meeting one never means meeting the other.
// - AS9100D adds aerospace requirements inside these clauses (SAE copyright); not covered yet.

export const ISO9001_SECTIONS = {
  "4": "Context of the organization",
  "5": "Leadership",
  "6": "Planning",
  "7": "Support",
  "8": "Operation",
  "9": "Performance evaluation",
  "10": "Improvement",
} as const;
export type Iso9001Section = keyof typeof ISO9001_SECTIONS;

export interface QualityClause {
  /** Stable id used in the database and URLs, e.g. "iso9001-7.5.3". */
  id: string;
  /** Clause number as printed in the standard, e.g. "7.5.3". */
  number: string;
  section: Iso9001Section;
  /** The clause heading (from the table of contents). */
  title: string;
  /** This app's own reminder of what records a small shop usually keeps for the clause. */
  prompt: string;
  /** CMMC requirement ids whose evidence often serves this clause too. */
  relatedControls: readonly string[];
  /**
   * True where a small shop commonly claims the clause does not apply, with a reason, under the
   * scope statement (most often 8.3 design for build-to-print shops).
   */
  oftenExcluded?: boolean;
}

type Row = [number: string, title: string, prompt: string, related?: string[], excl?: true];

const ROWS: Row[] = [
  [
    "4.1",
    "Understanding the organization and its context",
    "A short list of the internal and external issues that affect the shop's results (customers, workforce, machines, regulation such as DFARS), reviewed at management review.",
  ],
  [
    "4.2",
    "Understanding the needs and expectations of interested parties",
    "Who has a stake in the quality system (customers, primes, regulators, owners) and what each needs from it.",
  ],
  [
    "4.3",
    "Determining the scope of the quality management system",
    "A written scope: sites, products and processes covered, and the reason for any clause the shop says does not apply.",
    ["CA.L2-3.12.4"],
  ],
  [
    "4.4",
    "Quality management system and its processes",
    "A process map or list (quote, order review, purchasing, production, inspection, shipping) with owners, inputs, outputs and how each is measured.",
  ],
  [
    "5.1",
    "Leadership and commitment",
    "Evidence that the owner or top manager takes part: management review minutes, objectives set, resources approved, customer focus kept (on-time delivery, complaints).",
  ],
  [
    "5.2",
    "Policy",
    "A signed quality policy, posted or otherwise communicated, and kept as documented information.",
  ],
  [
    "5.3",
    "Organizational roles, responsibilities and authorities",
    "An org chart or responsibility matrix naming who owns the quality system and who may release product.",
  ],
  [
    "6.1",
    "Actions to address risks and opportunities",
    "A risk and opportunity register with the actions taken and how their effect is checked.",
    ["RA.L2-3.11.1"],
  ],
  [
    "6.2",
    "Quality objectives and planning to achieve them",
    "Measurable objectives (on-time delivery, scrap rate, customer returns) with owners, targets, dates and the current figure.",
  ],
  [
    "6.3",
    "Planning of changes",
    "How changes to the quality system are planned: purpose, consequences, resources and who is responsible.",
    ["CM.L2-3.4.3"],
  ],
  [
    "7.1.1",
    "Resources: general",
    "What people, machines and money the system needs, and what is bought in.",
  ],
  ["7.1.2", "People", "Enough people to run the processes and the quality system."],
  [
    "7.1.3",
    "Infrastructure",
    "An equipment list with maintenance records (machines, inspection equipment, IT and software).",
    ["CM.L2-3.4.1"],
  ],
  [
    "7.1.4",
    "Environment for the operation of processes",
    "Conditions the work needs (temperature for inspection, cleanliness, safety) and how they are kept.",
  ],
  [
    "7.1.5",
    "Monitoring and measuring resources",
    "A gauge and instrument list with calibration status, due dates, certificates traceable to national standards, and what is done when one is found out of tolerance.",
  ],
  [
    "7.1.6",
    "Organizational knowledge",
    "Where know-how lives (setup sheets, work instructions, lessons learned) and how it is kept when people leave.",
  ],
  [
    "7.2",
    "Competence",
    "A training matrix and records: required skills per job, training given, and how its effectiveness was checked.",
    ["AT.L2-3.2.2"],
  ],
  [
    "7.3",
    "Awareness",
    "How staff know the quality policy, the objectives that touch them, and what happens when work does not conform.",
    ["AT.L2-3.2.1"],
  ],
  [
    "7.4",
    "Communication",
    "What is communicated internally and externally about quality, when, to whom and by whom.",
  ],
  [
    "7.5.1",
    "Documented information: general",
    "The list of documents and records the system keeps (a master document list).",
  ],
  [
    "7.5.2",
    "Creating and updating",
    "Documents carry a title, revision and approval; a template or procedure shows how.",
  ],
  [
    "7.5.3",
    "Control of documented information",
    "Who may read and change documents, how revisions are controlled, how records are stored, kept and disposed of, and how external documents (customer drawings, specs) are controlled.",
    ["AC.L2-3.1.1"],
  ],
  [
    "8.1",
    "Operational planning and control",
    "How each job is planned: router or traveler, acceptance criteria, resources, and the records kept.",
  ],
  [
    "8.2.1",
    "Customer communication",
    "How quotes, order changes, customer property and complaints are communicated.",
  ],
  [
    "8.2.2",
    "Determining the requirements for products and services",
    "How the shop works out what the customer and the law require before quoting.",
  ],
  [
    "8.2.3",
    "Review of the requirements for products and services",
    "Contract or order review records: requirements confirmed before accepting the order, differences resolved.",
  ],
  [
    "8.2.4",
    "Changes to requirements for products and services",
    "How changed orders or drawing revisions are reviewed and passed to the floor.",
  ],
  [
    "8.3",
    "Design and development of products and services",
    "If the shop designs: plans, inputs, reviews, verification, validation, outputs and changes. Build-to-print shops often state in the scope why it does not apply.",
    [],
    true,
  ],
  [
    "8.4.1",
    "Control of externally provided processes, products and services: general",
    "An approved supplier list with the criteria used to select, evaluate and re-evaluate suppliers, and the evaluations.",
  ],
  [
    "8.4.2",
    "Type and extent of control",
    "How purchased material and outside processes (plating, heat treat) are checked: certs, receiving inspection.",
  ],
  [
    "8.4.3",
    "Information for external providers",
    "Purchase orders that state the requirements (material, specs, approvals, flow-downs) before they are sent.",
  ],
  [
    "8.5.1",
    "Control of production and service provision",
    "Travelers, work instructions, setup and first-article checks, and validated special processes.",
  ],
  [
    "8.5.2",
    "Identification and traceability",
    "How parts and material are identified through production, with inspection status, and traced where required (heat lot, serial).",
  ],
  [
    "8.5.3",
    "Property belonging to customers or external providers",
    "How customer-supplied material, tooling, drawings and data are identified, protected and reported if lost or damaged.",
    ["MP.L2-3.8.1", "AC.L2-3.1.3"],
  ],
  [
    "8.5.4",
    "Preservation",
    "Handling, packaging, storage and protection of parts through delivery.",
  ],
  [
    "8.5.5",
    "Post-delivery activities",
    "Warranty, returns and service after delivery, as the contract requires.",
  ],
  [
    "8.5.6",
    "Control of changes",
    "Records of production changes: reviewed, approved, and who authorised them.",
    ["CM.L2-3.4.3"],
  ],
  [
    "8.6",
    "Release of products and services",
    "Final inspection records showing acceptance criteria met and who released the product.",
  ],
  [
    "8.7",
    "Control of nonconforming outputs",
    "Nonconformance reports: how bad parts are identified and held, the disposition (rework, scrap, use-as-is with concession) and who decided.",
  ],
  [
    "9.1.1",
    "Monitoring, measurement, analysis and evaluation: general",
    "What is measured, how, when, and when the results are analysed.",
    ["CA.L2-3.12.3"],
  ],
  [
    "9.1.2",
    "Customer satisfaction",
    "How the shop learns what customers think: scorecards from primes, surveys, complaints, on-time figures.",
  ],
  [
    "9.1.3",
    "Analysis and evaluation",
    "The data analysed (conformity, satisfaction, supplier performance, objectives) and the conclusions.",
  ],
  [
    "9.2",
    "Internal audit",
    "An audit programme and the audit reports, by auditors who do not audit their own work, with findings followed up.",
    ["CA.L2-3.12.1"],
  ],
  [
    "9.3",
    "Management review",
    "Management review minutes covering the inputs the standard lists and the decisions and actions that came out of it.",
  ],
  [
    "10.1",
    "Improvement: general",
    "Improvements chosen and made to products, processes and the system.",
  ],
  [
    "10.2",
    "Nonconformity and corrective action",
    "Corrective action records: the problem, root cause, the action, and the check that it worked.",
    ["CA.L2-3.12.2", "IR.L2-3.6.1"],
  ],
  [
    "10.3",
    "Continual improvement",
    "Evidence that results from analysis and management review lead to improvement.",
  ],
];

const sectionOf = (n: string) => n.split(".")[0] as Iso9001Section;

export const ISO9001_CLAUSES: readonly QualityClause[] = ROWS.map(
  ([number, title, prompt, related, excl]) => ({
    id: `iso9001-${number}`,
    number,
    section: sectionOf(number),
    title,
    prompt,
    relatedControls: related ?? [],
    ...(excl ? { oftenExcluded: true } : {}),
  }),
);

const BY_ID = new Map(ISO9001_CLAUSES.map((c) => [c.id, c]));
export const qualityClauseById = (id: string) => BY_ID.get(id);

export const ISO9001_VERIFICATION = {
  standard: "ISO 9001:2015",
  checkedAgainstCopy: false,
  note: "Clause numbers and headings only; requirement text is not reproduced (ISO copyright). Check each clause against your own copy of ISO 9001:2015. Prompts are this app's wording, not the standard's.",
} as const;
