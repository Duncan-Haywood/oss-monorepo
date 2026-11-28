// CUI marking reader for a small shop: paste the text of a drawing, RFQ, purchase order or email
// (or open a PDF with a text layer) and see which Controlled Unclassified Information markings it
// carries, what each one means, and what to ask the customer. Pure functions, no DOM, no network.
//
// Every meaning below is a verbatim quote from one of these, read on 28 Nov 2026 (SOURCES.md,
// "CUI markings"): 32 CFR 2002.20 and 2002.4 and DFARS 252.204-7012 from the eCFR versioner API,
// and the NARA CUI Registry's pages for Controlled Technical Information, Export Controlled,
// General Proprietary Business Information and the limited dissemination controls.
// cui.test.mjs pins the quotes' hash; the page test checks every <q> on the page is one of them.
//
// What this does not do: decide that a document is or is not CUI. The designating agency does
// that (32 CFR 2002.20(a)(4)), and the contract can identify CUI with no marking on the file at
// all (DFARS 252.204-7012(a), "covered defense information"). The reader finds markings in text
// and says which question to ask; a scan with no text layer reads as "nothing found".

export const SRC = {
  "2002.20": "https://www.ecfr.gov/current/title-32/subtitle-B/chapter-XX/part-2002/subpart-C/section-2002.20",
  "2002.4": "https://www.ecfr.gov/current/title-32/subtitle-B/chapter-XX/part-2002/subpart-A/section-2002.4",
  "7012": "https://www.ecfr.gov/current/title-48/chapter-2/subchapter-H/part-252/subpart-252.2/section-252.204-7012",
  cti: "https://www.archives.gov/cui/registry/category-detail/controlled-technical-info.html",
  expt: "https://www.archives.gov/cui/registry/category-detail/export-control.html",
  propin: "https://www.archives.gov/cui/registry/category-detail/proprietary-business-info.html",
  ldc: "https://www.archives.gov/cui/registry/limited-dissemination",
  registry: "https://www.archives.gov/cui/registry/category-list",
};

/** Verbatim quotes, each a substring of the source file named by its key (cui.test.mjs pins them). */
export const QUOTES = {
  controlMarking: ["2002.20", "The CUI control marking may consist of either the word “CONTROLLED” or the acronym “CUI,” at the designator's discretion."],
  samePage: ["2002.20", "must be the same on each page of the document that includes CUI"],
  designation: ["2002.20", "All documents containing CUI must carry an indicator of who designated the CUI within it."],
  designationForm: ["2002.20", "may take any form that identifies the designating agency, including letterhead or other standard agency indicators, or adding a “Controlled by” line"],
  firstPage: ["2002.20", "may appear only on the first page or cover"],
  legacyVoid: ["2002.20", "If legacy markings remain on information, the legacy markings are void and no longer indicate that the information is protected or that it is or qualifies as CUI."],
  noMarkingNoExemption: ["2002.20", "The lack of a CUI marking on information that qualifies as CUI does not exempt the authorized holder from abiding by applicable handling requirements"],
  askForMarked: ["2002.20", "An agency receiving an incorrectly marked document should notify either the disseminating entity or the designating agency, and request a properly marked document."],
  designatorDecides: ["2002.20", "The designating agency determines that the information qualifies for CUI status"],
  portion: ["2002.20", "Agencies are permitted and encouraged to portion mark all CUI"],
  specifiedBanner: ["2002.20", "authorized holders must include in the CUI banner marking all CUI Specified category or subcategory markings that pertain to the information in the document"],
  decontrol: ["2002.20", "Authorized holders may consider specific items of CUI as decontrolled as of the date indicated, requiring no further review by, or communication with, the designator."],
  specified: ["2002.4", "CUI Specified is the subset of CUI in which the authorizing law, regulation, or Government-wide policy contains specific handling controls that it requires or permits agencies to use that differ from those for CUI Basic."],
  legacyDef: ["2002.4", "Legacy material is unclassified information that an agency marked as restricted from access or dissemination in some way, or otherwise controlled, prior to the CUI Program."],
  cdi: ["7012", "Marked or otherwise identified in the contract, task order, or delivery order and provided to the contractor by or on behalf of DoD in support of the performance of the contract"],
  ctiDist: ["7012", "Controlled technical information would meet the criteria, if disseminated, for distribution statements B through F"],
  nist: ["7012", "the covered contractor information system shall be subject to the security requirements in National Institute of Standards and Technology (NIST) Special Publication (SP) 800-171"],
  ctiDef: ["cti", "Controlled Technical Information means technical information with military or space application that is subject to controls on the access, use, reproduction, modification, performance, display, release, disclosure, or dissemination."],
  ctiExamples: ["cti", "engineering drawings, and associated lists, specifications, standards, process sheets, manuals, technical reports, technical orders"],
  exptDef: ["expt", "Unclassified information concerning certain items, commodities, technology, software, or other information whose export could reasonably be expected to adversely affect the United States national security and nonproliferation objectives."],
  propinDef: ["propin", "Material and information relating to, or associated with, a company's products, business, or activities, including but not limited to financial information; data or statements; trade secrets; product research and development; existing and future product designs and performance specifications."],
  noforn: ["ldc", "Information may not be disseminated in any form to foreign governments, foreign nationals, foreign or international organizations, or non-US citizens."],
  fedcon: ["ldc", "so long as dissemination is in furtherance of that contractual purpose"],
  nocon: ["ldc", "No dissemination authorized to individuals or employers who enter into a contract with the United States (any department or agency) to perform a specific job, supply labor and materials, or for the sale of products and services."],
  dlOnly: ["ldc", "Dissemination authorized only to those individuals, organizations, or entities included on an accompanying dissemination list."],
  relTo: ["ldc", "Information has been predetermined by the designating agency to be releasable or has been released only to the specific foreign country(ies)/international organization(s) indicated"],
  displayOnly: ["ldc", "Information is authorized for disclosure to a foreign recipient but without providing the foreign recipient with a physical copy for retention"],
  onlyDesignator: ["ldc", "Only the designating agency may apply limited dissemination controls to CUI."],
};

const q = (k) => QUOTES[k][1];

/** Category markings a shop is likely to meet. Others are reported as "look it up in the Registry". */
export const CATEGORIES = {
  CTI: { name: "Controlled Technical Information", quote: "ctiDef", src: "cti" },
  EXPT: { name: "Export Controlled", quote: "exptDef", src: "expt" },
  PROPIN: { name: "General Proprietary Business Information", quote: "propinDef", src: "propin" },
};

/** Limited dissemination controls (NARA's table), with what each asks of a shop. */
export const LDCS = {
  NOFORN: { name: "No foreign dissemination", quote: "noforn", ask: "Check who in the shop and at your outside processors can see it: no foreign nationals, including employees who are not US citizens." },
  "FED ONLY": { name: "Federal employees only", quote: null, ask: "Contractors are not on the list. Ask the sender why a contractor received it, and whether you may keep it." },
  FEDCON: { name: "Federal employees and contractors only", quote: "fedcon", ask: "Contractors may hold it for the contract. Pass it to a supplier only for work on that contract." },
  NOCON: { name: "No dissemination to contractors", quote: "nocon", ask: "Contractors may not receive it. Ask the sender before you store or use it." },
  "DL ONLY": { name: "Dissemination list controlled", quote: "dlOnly", ask: "Only the people on the list may receive it. Ask for the list if it did not come with the file." },
  RELIDO: { name: "Releasable by information disclosure official", quote: null, ask: "An intelligence-community release marking; unusual on a shop's drawings. Ask the sender what it means for you." },
  "REL TO": { name: "Authorized for release to certain nationals only", quote: "relTo", ask: "Only the countries listed may receive it. Treat everyone else as not authorized." },
  "DISPLAY ONLY": { name: "Display only", quote: "displayOnly", ask: "Listed foreign recipients may see it but not be given a copy." },
};

const LDC_RE = /^(NOFORN|NF|FED ONLY|FEDCON|NOCON|DL ONLY|RELIDO|REL TO\b.*|DISPLAY ONLY\b.*)$/;
const LDC_ALIAS = { NF: "NOFORN" };

const LEGACY = [
  { code: "FOUO", re: /\bFOUO\b|\bFOR OFFICIAL USE ONLY\b/i },
  { code: "SBU", re: /\bSBU\b|\bSENSITIVE BUT UNCLASSIFIED\b/ },
  { code: "LES", re: /\bLAW ENFORCEMENT SENSITIVE\b/i },
  { code: "LIMDIS", re: /\bLIMDIS\b|\bLIMITED DISTRIBUTION\b/ },
];

const DIST_RE = /\bDISTRIBUTION\s+STATEMENT\s+([A-F])\b/i;
const EXPORT_RE = /\bITAR\b|INTERNATIONAL TRAFFIC IN ARMS|22 CFR 12\d|\bEXPORT ADMINISTRATION REGULATIONS\b|\bEAR99\b|\bECCN\b|\bEXPORT[- ]CONTROLLED\b/i;
// A banner: CUI or CONTROLLED, then optional //-separated segments of /-separated markings.
// Upper case only: a banner is printed in capitals; "cui" in running text is a mention.
// Spaces only inside the multi-word controls, so "CUI//SP-CTI   PAGE 1" stops at CTI.
const TOKEN = String.raw`(?:FED ONLY|DL ONLY|(?:REL TO|DISPLAY ONLY) \[?USA(?:, ?[A-Z]{3,4})*\]?|[A-Z][A-Z0-9-]*)`;
const BANNER_RE = new RegExp(String.raw`(?<![A-Za-z0-9/(])(CUI|CONTROLLED)((?://${TOKEN}(?:/${TOKEN})*)*)(?![A-Za-z0-9)/])`, "g");
const PORTION_RE = /\((CUI(?:\/\/?[A-Z0-9 \-]+)*|U)\)/g;
const MENTION_RE = /\bCUI\b|\b[Cc]ontrolled [Uu]nclassified [Ii]nformation\b|\bCONTROLLED UNCLASSIFIED INFORMATION\b|\b[Cc]overed [Dd]efense [Ii]nformation\b|\bCOVERED DEFENSE INFORMATION\b/;

const clean = (s) => s.replace(/\s+/g, " ").trim();

function parseBanner(control, rest) {
  const categories = [], ldcs = [];
  const segs = rest ? rest.split("//").slice(1) : [];
  for (const seg of segs) {
    for (const raw of seg.split("/")) {
      const t = clean(raw);
      if (!t) continue;
      if (LDC_RE.test(t)) {
        const code = LDC_ALIAS[t] ?? (t.startsWith("REL TO") ? "REL TO" : t.startsWith("DISPLAY ONLY") ? "DISPLAY ONLY" : t);
        ldcs.push({ code, text: t });
      } else {
        const specified = t.startsWith("SP-");
        const code = specified ? t.slice(3) : t;
        categories.push({ code, specified, text: t, known: Object.hasOwn(CATEGORIES, code) });
      }
    }
  }
  return { control, categories, ldcs };
}

/**
 * Read the markings in a document's text. Lines matter (a bare "CUI" on its own line is a banner,
 * inside a sentence it is a mention), so pass the text with its line breaks.
 */
export function readCui(text) {
  const lines = String(text ?? "").split(/\r?\n/);
  const banners = [];
  const portions = { cui: 0, u: 0 };
  const legacy = new Map();
  let designation = null, categoryLine = null, decontrol = null, poc = null, distribution = null, exportWarning = null, mention = null;
  lines.forEach((line, i) => {
    const n = i + 1;
    const t = clean(line);
    if (!t) return;
    for (const m of t.matchAll(PORTION_RE)) { if (m[1] === "U") portions.u++; else portions.cui++; }
    const noPortions = t.replace(PORTION_RE, " ");
    let remaining = noPortions;
    for (const m of noPortions.matchAll(BANNER_RE)) {
      const rest = m[2] ?? "";
      // A bare control word counts only when it stands alone on its line (a header or footer):
      // "CONTROLLED" and "CUI" also appear in sentences.
      if (!rest && clean(noPortions) !== m[1]) continue;
      banners.push({ text: clean(m[0]), line: n, ...parseBanner(m[1], rest) });
      remaining = remaining.replace(m[0], " ");
    }
    let mm;
    if (!designation && (mm = t.match(/^Controlled\s+by\s*:\s*(.+)$/i))) designation = { text: clean(mm[1]), line: n };
    if (!categoryLine && (mm = t.match(/^CUI\s+Categor(?:y|ies)\s*:\s*(.+)$/i))) categoryLine = { text: clean(mm[1]), line: n };
    if (!decontrol && (mm = t.match(/^Decontrol(?:\s+on)?\s*:?\s+(.+)$/i))) decontrol = { text: clean(mm[1]), line: n };
    if (!poc && (mm = t.match(/^POC\s*:\s*(.+)$/i))) poc = { text: clean(mm[1]), line: n };
    if (!distribution && (mm = t.match(DIST_RE))) distribution = { statement: mm[1].toUpperCase(), line: n, text: t.slice(0, 200) };
    if (!exportWarning && (mm = t.match(EXPORT_RE))) exportWarning = { text: t.slice(0, 200), line: n };
    for (const l of LEGACY) if (!legacy.has(l.code) && l.re.test(t)) legacy.set(l.code, { code: l.code, line: n, text: t.slice(0, 200) });
    if (!mention && MENTION_RE.test(remaining)) mention = { text: t.slice(0, 200), line: n };
  });
  return { banners, portions, designation, categoryLine, decontrol, poc, distribution, exportWarning, legacy: [...legacy.values()], mention, lineCount: lines.length };
}

const cite = (k) => ({ quote: q(k), src: SRC[QUOTES[k][0]], key: k });

/**
 * Turn what was read into findings. kind: "cui" (marked or treated as CUI), "ask" (a question for
 * the sender), "note" (what a marking means). verdict: "marked", "treat" (no banner, but the text
 * says controlled technical information), "unclear" (signals but no banner), "none".
 */
export function assess(r) {
  const out = [];
  const add = (kind, message, k) => out.push({ kind, message, ...(k ? { cite: cite(k) } : {}) });
  const marked = r.banners.length > 0 || r.portions.cui > 0;
  const limitedDist = r.distribution && r.distribution.statement !== "A";
  let verdict = "none";

  if (marked) {
    verdict = "marked";
    const b = r.banners[0];
    add("cui", b ? `Marked CUI: banner "${b.text}" (line ${b.line}).` : `Marked CUI: ${r.portions.cui} portion marking${r.portions.cui > 1 ? "s" : ""} such as "(CUI)", but no banner found.`, "controlMarking");
    add("cui", "The systems that store, process or send this file are in scope for NIST SP 800-171 under DFARS 252.204-7012, which is CMMC Level 2 work. That includes email, the CAM workstation, the shared drive and any cloud folder it lands in.", "nist");
    const distinct = [...new Set(r.banners.map((x) => x.text))];
    if (distinct.length > 1) add("ask", `The banner is not the same on every page (${distinct.map((x) => `"${x}"`).join(", ")}). Treat the whole document as the strictest one, and ask the sender for a corrected copy.`, "samePage");
    if (!b && r.portions.cui) add("ask", "Portion markings with no banner: ask the sender for a properly marked copy.", "askForMarked");
    const cats = new Map(), ldcs = new Map();
    for (const x of r.banners) { for (const c of x.categories) cats.set(c.text, c); for (const l of x.ldcs) ldcs.set(l.code, l); }
    for (const c of cats.values()) {
      const info = Object.hasOwn(CATEGORIES, c.code) ? CATEGORIES[c.code] : null;
      if (info) add("note", `${c.text}: ${info.name}.${c.specified ? " SP- means CUI Specified: the law behind it sets its own handling rules on top of the basic ones." : ""}`, info.quote);
      else add("note", `${c.text}: a category marking this page does not list${c.specified ? " (CUI Specified)" : ""}. Look it up in the CUI Registry's category list.`, c.specified ? "specified" : null);
    }
    for (const l of ldcs.values()) {
      const d = Object.hasOwn(LDCS, l.code) ? LDCS[l.code] : null;
      if (!d) continue;
      add(l.code === "NOCON" || l.code === "FED ONLY" ? "ask" : "note", `${l.text}: ${d.name}. ${d.ask}`, d.quote);
    }
    if (!r.designation) add("ask", "No \"Controlled by:\" line found. Letterhead can serve instead, and the indicator may be on the first page only; if you cannot tell which agency designated it, ask the sender.", "designation");
    if (limitedDist) add("note", `Distribution statement ${r.distribution.statement} (line ${r.distribution.line}) also limits who may receive it: read the statement's own words before you send the file to a processor.`, "ctiDist");
    if (r.decontrol) add("note", `Decontrol: "${r.decontrol.text}" (line ${r.decontrol.line}). After that date it needs no further review.`, "decontrol");
    if (r.legacy.length) add("note", `Also carries ${r.legacy.map((x) => x.code).join(", ")}, a marking from before the CUI Program. The CUI banner is the one that counts.`, "legacyVoid");
  } else if (limitedDist) {
    verdict = "treat";
    add("cui", `Distribution statement ${r.distribution.statement} (line ${r.distribution.line}) with no CUI banner. DFARS 252.204-7012 ties controlled technical information to statements B through F, so treat the file as CUI and ask the sender to confirm.`, "ctiDist");
    add("cui", "Treated as CUI, the systems that hold it are in scope for NIST SP 800-171 (CMMC Level 2).", "nist");
  }

  if (!marked) {
    if (r.legacy.length) {
      if (verdict === "none") verdict = "unclear";
      add("ask", `Marked ${r.legacy.map((x) => x.code).join(", ")} (line ${r.legacy[0].line}) but not CUI. That is a marking from before the CUI Program, and on its own it no longer says the file is CUI; but CUI with no marking is still CUI. Ask the sender whether it is CUI and for a properly marked copy.`, "legacyVoid");
    }
    if (r.exportWarning) {
      if (verdict === "none") verdict = "unclear";
      add("ask", `Export-control wording (line ${r.exportWarning.line}) with no CUI banner. Export Controlled is a CUI category, and ITAR or EAR rules on who may see it apply either way. Ask whether the file is CUI.`, "exptDef");
    }
    if (r.mention) {
      if (verdict === "none") verdict = "unclear";
      add("ask", `The text mentions CUI or covered defense information (line ${r.mention.line}) but carries no banner. The contract can identify CUI without marking the file; ask which files it covers.`, "cdi");
    }
    if (r.distribution?.statement === "A") add("note", `Distribution statement A (line ${r.distribution.line}): approved for public release, so not controlled technical information. Check the rest of the package separately.`, "ctiDist");
    if (verdict === "none") add("note", "No CUI markings found in this text. That does not settle it: a contract can identify CUI with no marking on the file, and unmarked CUI is still CUI. Check the purchase order for DFARS 252.204-7012 and ask if in doubt.", "noMarkingNoExemption");
  }
  return { verdict, findings: out };
}

export const VERDICT = {
  marked: "Marked CUI",
  treat: "Treat as CUI and confirm",
  unclear: "Ask the sender",
  none: "No CUI marking found",
};

/** The questions for an email to the buyer, in order. */
export function questions(res) {
  return res.findings.filter((f) => f.kind === "ask").map((f) => f.message);
}

/** A plain-text summary for copying into a job folder or a reply. */
export function toText(r, res) {
  const lines = [`CUI marking check: ${Object.hasOwn(VERDICT, res.verdict) ? VERDICT[res.verdict] : res.verdict}`, ""];
  for (const f of res.findings) {
    lines.push(`- ${f.kind === "ask" ? "Ask" : f.kind === "cui" ? "CUI" : "Note"}: ${f.message}`);
    if (f.cite) lines.push(`  Source: "${f.cite.quote}" ${f.cite.src}`);
  }
  lines.push("", "A self-check of the markings in the text, not a determination that the file is or is not CUI. The designating agency and the contract decide that.");
  return lines.join("\n") + "\n";
}

/** Invented examples for the page's buttons. None is a real document. */
export const EXAMPLES = {
  marked: [
    "CUI//SP-CTI//FEDCON",
    "ACME PRECISION PARTS (invented)    DRAWING 4471-200 REV C",
    "BRACKET, MOUNTING  MATERIAL 6061-T6",
    "DISTRIBUTION STATEMENT D (see note 9)",
    "Controlled by: Program Office (invented)",
    "CUI Category: CTI",
    "POC: buyer@example.com",
    "CUI//SP-CTI//FEDCON",
  ].join("\n"),
  legacy: [
    "FOR OFFICIAL USE ONLY",
    "RFQ 26-118 (invented): 40 pcs housing per drawing 88-310 rev B",
    "EXPORT CONTROLLED: ITAR (invented note)",
    "FOR OFFICIAL USE ONLY",
  ].join("\n"),
  public: [
    "DRAWING 1020-004 REV A (invented)",
    "DISTRIBUTION STATEMENT A",
  ].join("\n"),
};
