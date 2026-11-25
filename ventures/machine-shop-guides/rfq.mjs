/**
 * RFQ reader: the contract-review pass a job shop makes before it quotes.
 *
 * Paste the text of a request for quote (the buyer's email, or the PO / RFQ
 * terms copied out of a PDF) and this finds, by pattern, what an estimator
 * looks for first: part numbers and revisions, quantities and annual usage,
 * material, finish, tolerances, delivery and quote-due dates, and the FAR and
 * DFARS clauses, specs and quality requirements that add cost or decide
 * whether the shop can take the job at all. What it cannot find becomes a
 * question for the buyer.
 *
 * It is pattern matching, not reading: it misses things written in a way it
 * does not expect, and it can pick up a number that is not what it thinks.
 * Every finding carries the text it came from, so the estimator can check it.
 * Nothing is sent anywhere; the page runs this in the browser.
 *
 * Clause titles are copied from GSA's published FAR and DFARS source
 * (github.com/GSA/GSA-Acquisition-FAR and GSA-Acquisition-DFARS, the `.dita`
 * file for each clause, fetched 25 Nov 2026; hashes in SOURCES.md). The
 * "why it matters" lines are our plain-language summary, not the clause.
 */

export const CLAUSES = [
  { id: "52.204-21", title: "Basic Safeguarding of Covered Contractor Information Systems", why: "The 15 basic safeguarding requirements apply to systems that hold the buyer's federal contract information (FCI). Under CMMC this is Level 1.", guide: "cmmc-level-1-self-assessment.html" },
  { id: "252.204-7012", title: "Safeguarding Covered Defense Information and Cyber Incident Reporting", why: "Covered defense information (CUI) must be protected to NIST SP 800-171, and a cyber incident reported within 72 hours of discovery (the clause's definition of \"rapidly report\").", guide: "cmmc-level-1-vs-level-2.html" },
  { id: "252.204-7019", title: "Notice of NIST SP 800-171 DoD Assessment Requirements", why: "The offeror needs a current NIST SP 800-171 DoD Assessment summary score (not more than 3 years old unless the solicitation says less) posted in SPRS.", guide: "sprs-score-calculator.html" },
  { id: "252.204-7020", title: "NIST SP 800-171 DoD Assessment Requirements", why: "The assessment and SPRS posting requirement itself, flowed down to subcontractors that handle covered defense information.", guide: "sprs-score-calculator.html" },
  { id: "252.204-7021", title: "Contractor Compliance With the Cybersecurity Maturity Model Certification Level Requirements", why: "The contract names a CMMC level you must hold (status in SPRS) for the systems that process its information.", guide: "cmmc-level-1-vs-level-2.html" },
  { id: "252.225-7009", title: "Restriction on Acquisition of Certain Articles Containing Specialty Metals", why: "Specialty metals in delivered items must be melted or produced in the United States, its outlying areas or a qualifying country, with exceptions in the clause. Ask your supplier for certs that show melt origin before you quote the material.", guide: null },
  { id: "252.225-7048", title: "Export-Controlled Items", why: "Items or data may be subject to the EAR or the ITAR. Who in the shop may see the drawing, and where it is stored, can be restricted.", guide: null },
  { id: "252.246-7007", title: "Contractor Counterfeit Electronic Part Detection and Avoidance System", why: "Applies to electronic parts. Rare on a machined part, but it means the prime may ask about your purchasing system.", guide: null },
  { id: "252.246-7008", title: "Sources of Electronic Parts", why: "Electronic parts must come from the original manufacturer or authorized sources. Rare on a machined part.", guide: null },
  { id: "52.246-2", title: "Inspection of Supplies-Fixed-Price", why: "The government may inspect and test the supplies at all places and times, including during manufacture. Allow for an inspector's visit and hold.", guide: null },
  { id: "52.246-11", title: "Higher-Level Contract Quality Requirement", why: "You must comply with the higher-level quality standard(s) listed in the contract (for a machined part, often ISO 9001 or AS9100) and flow them down. Check you hold it, or can meet it, before you quote.", guide: null },
  { id: "52.246-15", title: "Certificate of Conformance", why: "Where the contract administration office authorizes it in writing, supplies that would otherwise be inspected at source ship with a certificate of conformance instead. Someone in the shop signs it, so own the paperwork.", guide: null },
  { id: "52.211-15", title: "Defense Priority and Allocation Requirements", why: "\"This is a rated order\": you must follow the Defense Priorities and Allocations System regulation (15 CFR 700), which has its own rules on accepting and scheduling rated orders. Read it before you promise a date.", guide: null },
];

// Requirements that are not clause numbers. `why` is our summary.
export const REQUIREMENTS = [
  { id: "cui", label: "CUI marking or controlled technical data", re: /\b(CUI|controlled unclassified information|covered defense information|CDI)\b/i, why: "If the drawing is CUI, the systems that store it must meet NIST SP 800-171 (DFARS 252.204-7012). Ask before you open it on an ordinary laptop." },
  { id: "export", label: "Export control (ITAR / EAR)", re: /\b(ITAR|EAR99|export[- ]controlled|export control|22 CFR 12\d|USML|ECCN)\b/i, why: "Manufacturing ITAR defense articles generally requires DDTC registration (22 CFR part 122), and both ITAR and EAR limit who may see the drawing. Confirm before you accept the package." },
  { id: "fai", label: "First article inspection (AS9102 / FAI)", re: /\b(AS ?9102|first article|FAIR?\b)/i, why: "A full first article report adds inspection and paperwork hours to the first lot. Price it as its own line." },
  { id: "certs", label: "Material certs / mill test reports", re: /\b(material certs?|mill certs?|mill test reports?|MTRs?|certs? of (?:material|analysis)|chemical and physical|c of a)\b/i, why: "Buy stock from a supplier that ships certs with it, and check the cert shows what the buyer asked for (alloy, temper, spec, melt origin)." },
  { id: "coc", label: "Certificate of conformance (C of C)", re: /\b(C ?of ?C|CoC|certificate of conformance|certificate of compliance)\b/i, why: "A signed certificate with each shipment. Small cost, but someone has to own it." },
  { id: "ppap", label: "PPAP", re: /\bPPAP\b/i, why: "A production part approval package is a large paperwork job. Ask which level." },
  { id: "nadcap", label: "NADCAP or approved processor", re: /\b(NADCAP|approved (?:processors?|sources?|vendors?)|QPL|customer[- ]approved)\b/i, why: "Outside processes (heat treat, plating, NDT) may have to go to processors on the buyer's list. Get a quote from one before you price the finish." },
  { id: "source", label: "Source inspection / government inspection", re: /\b(source inspection|GSI|government source inspection|DCMA)\b/i, why: "An inspector visits before shipment. Allow for the schedule and the hold." },
  { id: "quality", label: "Quality system named (ISO 9001 / AS9100)", re: /\b(ISO ?9001|AS ?9100D?|AS ?9120)\b/i, why: "The buyer expects a certified or compliant quality system. If you are not registered, say so in the quote." },
  { id: "dpas", label: "Possible DPAS rating (DO / DX)", re: /\b(D[OX]-?[A-Z]\d)\b/, why: "A DO or DX code followed by a program symbol is how a rated order is usually marked. If it is one, it changes your scheduling duty." },
  { id: "nosub", label: "No substitution / no deviation", re: /\b(no substitutions?|no deviations?|no alternates?|must be as specified)\b/i, why: "You cannot swap the material or process without written approval. Price the material exactly as called out." },
  { id: "sample", label: "Samples, prototypes or a quote on a quote", re: /\b(prototypes?|samples?|budgetary|rough order|ROM)\b/i, why: "A budgetary or prototype quote is often not the real order. Ask whether the production quantity is the one to price." },
];

// Material callouts a machine shop sees most. Each match keeps its text.
const MATERIALS = [
  /\b(?:AL(?:UMINUM|UMINIUM)?\s*)?(?:2011|2024|5052|6061|6063|6082|7050|7075)(?:-T\d{1,4})?\b/i,
  /\b(?:303|304L?|316L?|321|410|416|420|430|440C|15-5\s?PH|17-4\s?PH|17-4|13-8)\s*(?:SS|stainless|CRES|H\d{3,4})?\b/i,
  /\b(?:1018|1020|1045|1144|12L14|4130|4140|4340|8620|A2|D2|O1|S7|A36)\s*(?:steel|CRS|HRS)?\b/i,
  /\b(?:C?360|C?260|C?932|C?954|C?110|C?145)\s*(?:brass|bronze|copper)\b/i,
  /\b(?:Ti[- ]?6Al[- ]?4V|titanium(?: grade \d)?|Gr(?:ade)?\.?\s?[25] ti)\b/i,
  /\b(?:Inconel\s?\d{3}|Hastelloy|Monel\s?\d{3}|Kovar|Invar)\b/i,
  /\b(?:Delrin|acetal|PEEK|UHMW|Ultem|nylon\s?\d*|PTFE|Teflon|polycarbonate|G-10|FR-?4|PVC|HDPE|acrylic)\b/i,
];

const FINISHES = [
  { re: /\banodiz\w*|\banodis\w*|\bMIL-(?:A|PRF)-8625\b/i, label: "anodize", done: /\btype\s*(?:IC|IIB|III|II|I|[123])\b/i, ask: "Which anodize type and class, and what color (MIL-PRF-8625 Type II or III, Class 1 or 2)? Any masking?" },
  { re: /\b(?:chem(?:ical)? film|alodine|chromate conversion|iridite|MIL-DTL-5541)\b/i, label: "chem film", ask: "Which chem film spec, type and class (MIL-DTL-5541)?" },
  { re: /\bpassivat\w*|\bAMS ?2700\b|\bASTM ?A967\b/i, label: "passivation", ask: "Which passivation spec and method (AMS 2700 or ASTM A967)?" },
  { re: /\bblack oxide\b/i, label: "black oxide", ask: null },
  { re: /\b(?:zinc|nickel|electroless nickel|chrome|cadmium|tin|silver|gold)\s*plat\w*|\bEN\b plat\w*|\bplat(?:e|ed|ing)\b/i, label: "plating", ask: "Which plating spec, thickness and any post-treatment?" },
  { re: /\bpowder coat\w*|\bpaint(?:ed)?\b|\bprimer\b/i, label: "coating / paint", ask: "Which coating spec and color?" },
  { re: /\bheat treat\w*|\bharden\w*|\bHRC\s?\d|\bRc\s?\d|\bcase depth\b/i, label: "heat treat", ask: "What hardness and spec for the heat treat, and is a cert needed?" },
  { re: /\b(?:bead|grit|sand)\s?blast\w*|\btumbl\w*|\bvibratory\b/i, label: "blast / tumble", ask: null },
  { re: /\blaser (?:mark|etch)\w*|\bengrav\w*|\bpart mark\w*|\bUID\b|\bIUID\b/i, label: "part marking", ask: "What marking content, method and location? IUID needs a 2D code to MIL-STD-130." },
];

const SPEC_RE = /\b(?:MIL-(?:STD|DTL|PRF|SPEC|[A-Z])-\d{2,6}[A-Z]?|AMS[- ](?:QQ-[A-Z]-)?\d{3,5}[A-Z]?|AMS\d{4}[A-Z]?|ASTM ?[A-Z]\d{1,4}|ASME Y14\.\d+M?|AS ?\d{4,5}[A-Z]?|ISO ?\d{4,5}(?:-\d)?|QQ-[A-Z]-\d{2,4})\b/gi;

const MONTH = "(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)[a-z]*\\.?";
const DATE = `(?:\\d{4}-\\d{1,2}-\\d{1,2}|\\d{1,2}\\/\\d{1,2}(?:\\/\\d{2,4})?|${MONTH}\\s+\\d{1,2}(?:st|nd|rd|th)?(?:,?\\s+\\d{4})?|\\d{1,2}\\s+${MONTH}(?:\\s+\\d{4})?|\\d{1,3}\\s*(?:-\\s*\\d{1,3}\\s*)?(?:weeks?|wks?|days?|business days)(?:\\s+ARO)?|ASAP|end of (?:the )?(?:month|week|quarter))`;
const DELIVERY_RE = new RegExp(`\\b(?:deliver(?:y|ed)?(?: date)?|need(?:ed)?(?: (?:it|them|parts))? (?:by|in)|required (?:by|date)|due date|ship(?: date| by)?|lead ?time|dock date|in house by)\\s*(?:is|of|:|-|=|by|no later than)?\\s*(${DATE})`, "i");
const QUOTE_DUE_RE = new RegExp(`\\b(?:quotes?|bids?|pricing|proposals?|responses?)\\s+(?:are |is )?(?:due|needed|required|back)(?:\\s+(?:by|on|no later than))?\\s*:?\\s*(${DATE})`, "i");

const PART_RE = /\b(?:P\/N|PN|Part\s*(?:No\.?|Number|#)|Item\s*(?:No\.?|#)|Drawing\s*(?:No\.?|#)|DWG\s*(?:No\.?|#)?)\s*[:#.]?\s*([A-Z0-9][A-Z0-9\-_./]{2,30}[A-Z0-9])/gi;
const REV_RE = /\bRev(?:ision)?\.?\s*(?:level\s*)?[:#-]?\s*([A-Z]{1,2}\d?|\d{1,3}|-)(?![a-z])/i;
const DRAWING_RE = /\b(drawings?|dwgs?|prints?|blueprints?|\.pdf|pdf|step|\.stp|\.step|\.dxf|dxf|\.igs|iges|solid ?model|3d model|cad (?:file|model)|parasolid|\.x_t|\.sldprt)\b/i;

const MAX_QTY = 10_000_000;

function snippet(text, index, len) {
  const start = Math.max(0, index - 30);
  const end = Math.min(text.length, index + len + 30);
  return (start > 0 ? "…" : "") + text.slice(start, end).replace(/\s+/g, " ").trim() + (end < text.length ? "…" : "");
}

function numbersIn(s) {
  return [...s.matchAll(/\d[\d,]*/g)]
    .map((m) => Number(m[0].replace(/,/g, "")))
    .filter((n) => Number.isInteger(n) && n >= 1 && n <= MAX_QTY);
}

/** Quantities and annual usage in one block of text. */
export function findQuantities(text) {
  const qty = new Set();
  const evidence = [];
  const add = (nums, m) => { for (const n of nums) qty.add(n); if (nums.length) evidence.push(snippet(text, m.index, m[0].length)); };
  // "Qty: 10, 25, 50", "QTY 10/25/50", "quantities of 5, 10 and 25"
  for (const m of text.matchAll(/\b(?:qty|qtys|quantit(?:y|ies))\.?\s*(?:of|:|=|-|breaks?:?)?\s*((?:\(?\d[\d,]*\)?\s*(?:pcs|pieces|ea|each|units|parts|off)?\s*(?:,|\/|&|\band\b|\bor\b|\s)\s*){0,8}\(?\d[\d,]*\)?)/gi)) {
    add(numbersIn(m[1]), m);
  }
  // "50 pcs", "(25) pieces", "100 ea", "10-off"
  for (const m of text.matchAll(/\(?\b(\d[\d,]*)\)?\s*(?:pcs|pieces|pc|ea|each|units|parts|off)\b/gi)) {
    add(numbersIn(m[1]), m);
  }
  // "price on 100 of the attached", "need 40 of these"
  for (const m of text.matchAll(/\b(\d[\d,]*)\s+of\s+(?:the|these|this|those|each|part|item)\b/gi)) {
    add(numbersIn(m[1]), m);
  }
  let annual = null;
  const a = text.match(/\b(?:EAU|annual (?:usage|volume|quantity|demand)|per year|\/\s?yr|a year)\b\s*(?:of|:|=|-|is)?\s*(\d[\d,]*)|(\d[\d,]*)\s*(?:pcs|pieces|parts|units)?\s*(?:per year|\/\s?yr|a year|annually)\b/i);
  if (a) {
    const n = Number((a[1] || a[2]).replace(/,/g, ""));
    if (Number.isInteger(n) && n >= 1 && n <= MAX_QTY) annual = { quantity: n, evidence: snippet(text, a.index, a[0].length) };
    // An annual figure is not a lot size: don't also count it as a break.
    if (annual) qty.delete(annual.quantity);
  }
  return { quantities: [...qty].sort((x, y) => x - y), annual, evidence };
}

/** Tolerances in inches (mm converted) and surface finish callouts. */
export function findTolerances(text, tightInches = 0.001) {
  const out = [];
  const re = /(?:±|\+\/-|\+-|\+\s?\/\s?-|plus or minus)\s*(\d*\.\d+|\d+(?:\.\d+)?)\s*(mm|millimet(?:er|re)s?|"|in(?:ch(?:es)?)?\b|thou\b)?/gi;
  for (const m of text.matchAll(re)) {
    let v = Number(m[1]);
    const unit = (m[2] || "").toLowerCase();
    if (!Number.isFinite(v) || v <= 0) continue;
    let inches = unit.startsWith("mm") || unit.startsWith("milli") ? v / 25.4 : unit === "thou" ? v / 1000 : v;
    out.push({ text: m[0].trim(), inches, tight: inches < tightInches - 1e-12, evidence: snippet(text, m.index, m[0].length) });
  }
  const finishes = [];
  for (const m of text.matchAll(/\b(\d{1,3}(?:\.\d+)?)\s*(?:Ra|RMS|µin|uin|micro ?inch(?:es)?|microinch(?:es)?)\b|\bRa\s*(\d{1,3}(?:\.\d+)?)/gi)) {
    finishes.push({ text: m[0].trim(), evidence: snippet(text, m.index, m[0].length) });
  }
  return { tolerances: out, tightest: out.length ? Math.min(...out.map((t) => t.inches)) : null, surface: finishes };
}

function findMaterial(text) {
  const generic = text.match(/\b(?:material|matl|mat'l)\s*[:=-]\s*([^\n;]{2,60})/i);
  const found = [];
  for (const re of MATERIALS) {
    const m = text.match(re);
    if (m && !found.some((f) => f.text.toLowerCase() === m[0].trim().toLowerCase())) found.push({ text: m[0].trim(), evidence: snippet(text, m.index, m[0].length) });
  }
  if (generic) return { text: generic[1].trim(), evidence: snippet(text, generic.index, generic[0].length), others: found };
  return found.length ? { ...found[0], others: found.slice(1) } : null;
}

function findFinishes(text) {
  const out = [];
  for (const f of FINISHES) {
    const m = text.match(f.re);
    if (m) out.push({ label: f.label, text: m[0].trim(), ask: f.ask, done: f.done, evidence: snippet(text, m.index, m[0].length) });
  }
  return out;
}

function findSpecs(text) {
  const seen = new Map();
  for (const m of text.matchAll(SPEC_RE)) {
    const key = m[0].toUpperCase().replace(/\s+/g, " ");
    if (!seen.has(key)) seen.set(key, snippet(text, m.index, m[0].length));
  }
  return [...seen].map(([spec, evidence]) => ({ spec, evidence }));
}

function findClauses(text) {
  const out = [];
  for (const c of CLAUSES) {
    // Clause numbers are written "252.204-7012", "DFARS 7012", "252.204.7012"
    const [part, num] = c.id.split("-");
    const tail = num.length === 4 && c.id.startsWith("252") ? `|\\bDFARS\\s*(?:clause\\s*)?${num}\\b` : "";
    const re = new RegExp(`(?<![\\d.])${part.replace(/\./g, "\\.")}[-.\\s]?${num}(?!\\d)${tail}`, "i");
    const m = text.match(re);
    if (m) out.push({ ...c, evidence: snippet(text, m.index, m[0].length) });
  }
  // Any other FAR/DFARS clause number, listed so the reader can look it up.
  const known = new Set(CLAUSES.map((c) => c.id));
  const other = new Map();
  for (const m of text.matchAll(/(?<![\d.])((?:252|52)\.\d{3}-\d{1,4})(?!\d)/g)) {
    if (!known.has(m[1]) && !other.has(m[1])) other.set(m[1], snippet(text, m.index, m[0].length));
  }
  return { matched: out, other: [...other].map(([id, evidence]) => ({ id, evidence })) };
}

function findRequirements(text) {
  const out = [];
  for (const r of REQUIREMENTS) {
    const m = text.match(r.re);
    if (m) out.push({ id: r.id, label: r.label, why: r.why, evidence: snippet(text, m.index, m[0].length) });
  }
  return out;
}

function splitLines(text) {
  const hits = [];
  for (const m of text.matchAll(PART_RE)) {
    const pn = m[1].replace(/[.,]+$/, "");
    // A revision or a bare word is not a part number.
    if (!/\d/.test(pn)) continue;
    if (hits.some((h) => h.partNumber.toUpperCase() === pn.toUpperCase())) continue;
    hits.push({ partNumber: pn, index: m.index });
  }
  if (!hits.length) return { header: text, blocks: [{ partNumber: null, text }] };
  const header = text.slice(0, hits[0].index);
  const blocks = hits.map((h, i) => ({ partNumber: h.partNumber, text: text.slice(h.index, i + 1 < hits.length ? hits[i + 1].index : text.length) }));
  return { header, blocks };
}

/**
 * Read an RFQ. Options: { tightInches } (a tolerance tighter than this is
 * flagged; default 0.001 in, change it to your shop's own line).
 */
export function readRfq(text, { tightInches = 0.001 } = {}) {
  const src = String(text ?? "").replace(/\r\n?/g, "\n").slice(0, 200_000);
  const tight = Number.isFinite(Number(tightInches)) && Number(tightInches) > 0 ? Number(tightInches) : 0.001;
  const { header, blocks } = splitLines(src);
  const headerQty = findQuantities(header);
  const headerMaterial = findMaterial(header);
  const headerFinishes = findFinishes(header);
  const lines = blocks.map((b) => {
    const q = findQuantities(b.text);
    const rev = b.partNumber ? b.text.match(REV_RE) : null;
    const material = findMaterial(b.text) || (blocks.length === 1 ? headerMaterial : null) || headerMaterial;
    const finishes = findFinishes(b.text);
    const tol = findTolerances(b.text, tight);
    return {
      partNumber: b.partNumber,
      revision: rev ? { text: rev[1], evidence: snippet(b.text, rev.index, rev[0].length) } : null,
      quantities: q.quantities.length ? q.quantities : blocks.length === 1 ? headerQty.quantities : [],
      annual: q.annual || (blocks.length === 1 ? headerQty.annual : null),
      quantityEvidence: q.evidence.length ? q.evidence : blocks.length === 1 ? headerQty.evidence : [],
      material,
      finishes: finishes.length ? finishes : headerFinishes,
      tolerances: tol.tolerances,
      tightest: tol.tightest,
      surface: tol.surface,
    };
  });
  const all = findTolerances(src, tight);
  const delivery = src.match(DELIVERY_RE);
  const quoteDue = src.match(QUOTE_DUE_RE);
  const clauses = findClauses(src);
  const result = {
    lines,
    delivery: delivery ? { text: delivery[1].trim(), evidence: snippet(src, delivery.index, delivery[0].length) } : null,
    quoteDue: quoteDue ? { text: quoteDue[1].trim(), evidence: snippet(src, quoteDue.index, quoteDue[0].length) } : null,
    drawing: DRAWING_RE.test(src),
    clauses: clauses.matched,
    otherClauses: clauses.other,
    requirements: findRequirements(src),
    specs: findSpecs(src),
    tightInches: tight,
    tightCount: all.tolerances.filter((t) => t.tight).length,
  };
  result.questions = questionsFor(result);
  return result;
}

function inches(v) {
  return `${Number(v.toFixed(5))}"`;
}

/** The questions to send the buyer before quoting, from what was not found. */
export function questionsFor(r) {
  const q = [];
  const many = r.lines.length > 1;
  for (const l of r.lines) {
    const who = l.partNumber ? `P/N ${l.partNumber}` : "the part";
    if (!l.partNumber) q.push("Which part number(s) is this for?");
    if (l.partNumber && !l.revision) q.push(`Which drawing revision should we quote for ${who}?`);
    if (!l.quantities.length) q.push(`What quantity (or quantity breaks) should we price for ${who}?`);
    if (!l.material) q.push(`What material and temper or condition is ${who}${many ? "" : ""}? Is a specific spec required?`);
    for (const f of l.finishes) if (f.ask && !(f.done || /\b(type|class|MIL-|AMS|ASTM|spec)\b/i).test(f.evidence)) q.push(`${who}, ${f.label}: ${f.ask}`);
    if (l.quantities.length === 1 && !l.annual) q.push(`For ${who}: is ${l.quantities[0]} a one-time buy, or is there an annual usage we can price breaks against?`);
  }
  if (!r.drawing) q.push("Can you send the drawing (PDF) and, if you have one, the 3D model (STEP)?");
  if (!r.delivery) q.push("When do you need the parts delivered?");
  if (!r.quoteDue) q.push("When do you need the quote back?");
  const has = (id) => r.requirements.some((x) => x.id === id);
  const clause = (id) => r.clauses.some((x) => x.id === id);
  if (clause("252.204-7012") || has("cui")) q.push("Is any of the technical data marked CUI? If so, how will you send it (we need to keep it on systems that meet NIST SP 800-171)?");
  if (clause("252.225-7048") || has("export")) q.push("Is the drawing ITAR- or EAR-controlled? If so, what is the classification?");
  if (clause("252.225-7009")) q.push("Do you need specialty-metals compliant (DFARS 252.225-7009) material with melt origin on the certs?");
  if (has("fai")) q.push("Is a full AS9102 first article report required, and on which lot (first lot only, or after any change)?");
  if (has("certs") && !has("coc")) q.push("Besides material certs, do you need a certificate of conformance with each shipment?");
  if (has("ppap")) q.push("Which PPAP level do you need?");
  if (has("nadcap")) q.push("Do outside processes have to go to an approved or NADCAP-accredited processor? Please send the approved list.");
  if (has("dpas") || clause("52.211-15")) q.push("Is this a DPAS-rated order (DO or DX)? If so, what is the rating?");
  if (r.tightCount) {
    const t = Math.min(...r.lines.map((l) => l.tightest ?? Infinity));
    if (Number.isFinite(t)) q.push(`The tightest tolerance we found is ±${inches(t)}. Is it needed on every feature it is called out on, or only the functional ones?`);
  }
  return [...new Set(q)];
}

/** A plain-text email to the buyer with the questions. */
export function draftEmail(r, { shop = "", buyer = "" } = {}) {
  const parts = r.lines.map((l) => l.partNumber).filter(Boolean);
  const subject = `Questions before we quote${parts.length ? `: ${parts.slice(0, 3).join(", ")}${parts.length > 3 ? " and others" : ""}` : ""}`;
  const lines = [
    `Subject: ${subject}`,
    "",
    `${buyer ? `Hi ${buyer},` : "Hi,"}`,
    "",
    "Thanks for the RFQ. So we can quote it accurately, could you confirm the following?",
    "",
    ...r.questions.map((x, i) => `${i + 1}. ${x}`),
    "",
    "Thanks,",
    shop || "",
  ];
  return lines.join("\n").replace(/\n+$/, "\n");
}

function csvCell(v) {
  let s = String(v ?? "");
  // Keep a spreadsheet from running a cell as a formula.
  if (/^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s)) s = "'" + s;
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** The review as CSV: one row per finding, with the text it came from. */
export function reviewCsv(r) {
  const rows = [["section", "part", "item", "value", "evidence"]];
  for (const l of r.lines) {
    const p = l.partNumber || "";
    rows.push(["line", p, "revision", l.revision?.text ?? "NOT FOUND", l.revision?.evidence ?? ""]);
    rows.push(["line", p, "quantities", l.quantities.join(" / ") || "NOT FOUND", l.quantityEvidence.join(" | ")]);
    if (l.annual) rows.push(["line", p, "annual usage", l.annual.quantity, l.annual.evidence]);
    rows.push(["line", p, "material", l.material?.text ?? "NOT FOUND", l.material?.evidence ?? ""]);
    for (const f of l.finishes) rows.push(["line", p, "finish", f.label, f.evidence]);
    for (const t of l.tolerances) rows.push(["line", p, t.tight ? "tight tolerance" : "tolerance", t.text, t.evidence]);
    for (const s of l.surface) rows.push(["line", p, "surface finish", s.text, s.evidence]);
  }
  rows.push(["dates", "", "delivery", r.delivery?.text ?? "NOT FOUND", r.delivery?.evidence ?? ""]);
  rows.push(["dates", "", "quote due", r.quoteDue?.text ?? "NOT FOUND", r.quoteDue?.evidence ?? ""]);
  for (const c of r.clauses) rows.push(["clause", "", `${c.id.startsWith("252") ? "DFARS" : "FAR"} ${c.id}`, c.title, c.evidence]);
  for (const c of r.otherClauses) rows.push(["clause", "", c.id, "not in our list: look it up", c.evidence]);
  for (const x of r.requirements) rows.push(["requirement", "", x.label, "", x.evidence]);
  for (const s of r.specs) rows.push(["spec", "", s.spec, "", s.evidence]);
  for (const q of r.questions) rows.push(["question", "", q, "", ""]);
  return rows.map((row) => row.map(csvCell).join(",")).join("\n") + "\n";
}

/** Quantity breaks for the quote calculator: every quantity found, sorted. */
export function breaksFor(r) {
  return [...new Set(r.lines.flatMap((l) => l.quantities))].sort((a, b) => a - b);
}
