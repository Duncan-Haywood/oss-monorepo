/**
 * Drawing reader: what an estimator reads off a customer's part drawing
 * before quoting, taken from the PDF's text layer.
 *
 * Input is the line list `extractPdfLines` (pdf-text.mjs) makes: per page,
 * lines top to bottom, each with its pieces of text and their x positions.
 * Out comes, by pattern:
 *
 * - the title block fields (part number, drawing number, revision, title,
 *   material, finish, scale, sheet, CAGE code), each with the text it came
 *   from, and the latest revision in a revision table when there is one;
 * - the general tolerance block (".XX ±.01", "ANGLES ±0.5°", fractions,
 *   an ISO 2768 class, the units and the Y14.5 edition named);
 * - the numbered notes, each tagged with what it costs (finish, heat treat,
 *   marking, deburr, inspection, certs, controlled data);
 * - the dimension text found in the views, as a starter characteristic
 *   list for a first article (balloon order is the shop's to set);
 * - markings a supplier must act on (CUI, export control, a distribution
 *   statement other than A);
 * - questions for the buyer from what is missing or contradicts itself.
 *
 * It reads text, not geometry: a dimension drawn as lines, a scanned
 * drawing, or a font with no Unicode map is not readable, and it says so.
 * Nothing leaves the browser; the page runs this on the file's bytes.
 */
import { readRfq } from "./rfq.mjs";

// --- Title block --------------------------------------------------------

// Label patterns, matched at the start of a piece of text. Order matters:
// "DWG NO" before "NO", "PART NUMBER" before "PART".
export const FIELDS = [
  { id: "partNumber", label: "Part number", re: /^(?:PART\s*(?:NO|NUMBER|NBR|#)|P\/N|PN)\b\.?\s*[:#]?\s*/i },
  { id: "drawingNumber", label: "Drawing number", re: /^(?:DWG|DRAWING)\s*(?:NO|NUMBER|NBR|#)\b\.?\s*[:#]?\s*/i },
  { id: "revision", label: "Revision", re: /^REV(?:ISION)?\b\.?\s*(?:LEVEL\s*)?[:#]?\s*/i },
  { id: "title", label: "Title", re: /^(?:TITLE|DESCRIPTION|PART\s*NAME)\b\s*:?\s*/i },
  { id: "material", label: "Material", re: /^(?:MATERIAL|MAT'?L|MATL)\b\.?\s*:?\s*/i },
  { id: "finish", label: "Finish", re: /^(?:FINISH|TREATMENT)\b\s*:?\s*/i },
  { id: "scale", label: "Scale", re: /^SCALE\b\s*:?\s*/i },
  { id: "sheet", label: "Sheet", re: /^SHEET\b\s*:?\s*/i },
  { id: "cage", label: "CAGE code", re: /^(?:CAGE|FSCM)(?:\s*(?:CODE|NO))?\b\.?\s*:?\s*/i },
];

// What a value has to look like to be taken for a field. A label with
// nothing plausible next to or under it is left as "not found".
const VALID = {
  partNumber: /^[A-Z0-9][A-Z0-9\-_./ ]{1,30}[A-Z0-9]$/i,
  drawingNumber: /^[A-Z0-9][A-Z0-9\-_./ ]{1,30}[A-Z0-9]$/i,
  revision: /^(?:[A-Z]{1,2}\d?|\d{1,3}|-|NC|N\/C)$/i,
  title: /^[A-Z0-9].{1,60}$/i,
  material: /^[A-Z0-9].{1,80}$/i,
  finish: /^[A-Z0-9].{1,80}$/i,
  scale: /^(?:\d+(?:\.\d+)?\s*:\s*\d+(?:\.\d+)?|NTS|NONE|FULL|HALF|\d+\/\d+)$/i,
  sheet: /^\d+\s*(?:OF|\/)\s*\d+$/i,
  cage: /^[0-9A-Z]{5}$/,
};

// Words that are a label themselves, so never a value.
const LABELISH = /^(?:PART|DWG|DRAWING|REV|REVISION|TITLE|MATERIAL|MATL|FINISH|SCALE|SHEET|CAGE|SIZE|DATE|DRAWN|CHECKED|APPROVED|APPR|ENG|MFG|QA|NAME|DESCRIPTION|DESC|ZONE|ECO|ECN|WEIGHT|TOLERANCES?|UNLESS|NOTES?)\b/i;

const isLabel = (t) => FIELDS.some((f) => f.re.test(t)) || LABELISH.test(t);

function lineText(l) {
  let s = "";
  let end = null;
  for (const it of l.items) {
    if (end != null) s += it.x - end > 12 ? "   " : it.x - end > 1 ? " " : "";
    s += it.text;
    end = it.xEnd;
  }
  return s.replace(/\s+$/, "");
}

const clean = (s) => String(s ?? "").replace(/\s+/g, " ").trim();

/** Every page's lines, numbered in reading order, with their joined text. */
export function flatten(pages) {
  const out = [];
  pages.forEach((p, pi) => (p.lines || []).forEach((l) => out.push({ ...l, page: l.page ?? pi + 1, text: lineText(l), idx: out.length })));
  return out;
}

function median(xs) {
  if (!xs.length) return 12;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}

/**
 * Title block fields. A field's value is the rest of the label's own text
 * ("REV: C"), else the next piece on the same line, else the first piece
 * under the label (within four line heights, overlapping it across).
 */
export function readTitleBlock(lines) {
  const found = {};
  const used = new Set();
  const gaps = [];
  for (let i = 1; i < lines.length; i++) if (lines[i].page === lines[i - 1].page) gaps.push(Math.abs(lines[i].key - lines[i - 1].key));
  const lh = Math.max(6, median(gaps.filter((g) => g > 0.5)));
  for (const l of lines) {
    // A revision table's header row ("REV  DESCRIPTION  DATE") is read by readRevisionTable.
    if (/\bREV\b/i.test(l.text) && /\bDESC(?:RIPTION)?\b/i.test(l.text) && /\bDATE\b/i.test(l.text)) continue;
    l.items.forEach((it, j) => {
      const t = clean(it.text);
      for (const f of FIELDS) {
        const m = t.match(f.re);
        if (!m) continue;
        if (f.id === "title" && /^DESCRIPTION/i.test(t) && found.title) break;
        if (found[f.id]) break;
        const candidates = [];
        const rest = clean(t.slice(m[0].length));
        if (rest) candidates.push({ text: rest, it });
        const next = l.items[j + 1];
        if (next && next.x - it.xEnd < 120 && !isLabel(clean(next.text))) candidates.push({ text: clean(next.text), it: next });
        const below = lines.filter((b) => b.page === l.page && b.key > l.key && b.key - l.key <= lh * 4)
          .flatMap((b) => b.items.map((x) => ({ x, b })))
          .filter(({ x }) => x.x < it.xEnd + 40 && x.xEnd > it.x - 10 && !isLabel(clean(x.text)));
        if (below.length) candidates.push({ text: clean(below[0].x.text), it: below[0].x });
        const valid = Object.hasOwn(VALID, f.id) ? VALID[f.id] : null;
        let pick = valid ? candidates.find((c) => valid.test(c.text)) : null;
        // "SHEET 1 OF 2" is often three pieces of text on one line.
        if (!pick && f.id === "sheet") {
          const m2 = l.text.match(/SHEET\s*:?\s*(\d+\s*(?:OF|\/)\s*\d+)/i);
          if (m2) pick = { text: clean(m2[1]), it };
        }
        if (pick) {
          found[f.id] = { value: pick.text, page: l.page, evidence: clean(`${t}${pick.it !== it ? " … " + pick.text : ""}`) };
          used.add(it); used.add(pick.it);
        }
        break;
      }
    });
  }
  return { fields: found, used };
}

// Revision letters in order: A..Z, then AA, AB... (I, O, Q, S, X, Z are
// skipped by many standards, but the order still holds); numbers by value.
export function revRank(r) {
  const s = String(r).toUpperCase();
  if (/^\d+$/.test(s)) return Number(s);
  if (/^[A-Z]+$/.test(s)) return [...s].reduce((n, c) => n * 26 + (c.charCodeAt(0) - 64), 0) + 100000;
  return -1;
}

/** The latest revision listed in a revision table (header REV / DESCRIPTION / DATE). */
export function readRevisionTable(lines) {
  for (const l of lines) {
    if (!(/\bREV\b/i.test(l.text) && /\bDESC(?:RIPTION)?\b/i.test(l.text) && /\bDATE\b/i.test(l.text))) continue;
    const head = l.items.find((it) => /^REV\b/i.test(clean(it.text)));
    if (!head) continue;
    // Rows are the lines with a piece of text under the REV heading; other
    // text at the same heights (notes, views) is on other lines and skipped.
    const rows = [];
    let lastKey = l.key;
    for (const b of lines) {
      if (b.page !== l.page || b.key <= l.key) continue;
      const cell = b.items.find((x) => x.x < head.xEnd + 20 && x.xEnd > head.x - 20);
      if (!cell) continue;
      if (b.key - lastKey > 40) break;
      const v = clean(cell.text).split(" ")[0];
      if (!/^(?:[A-Z]{1,2}|\d{1,3}|-)$/.test(v)) break;
      const row = b.items.filter((x) => x.x >= head.x - 20);
      rows.push({ rev: v, text: lineText({ items: row }) });
      lastKey = b.key;
    }
    if (!rows.length) continue;
    const latest = rows.reduce((a, r) => (revRank(r.rev) > revRank(a.rev) ? r : a));
    return { latest: latest.rev, rows: rows.map((r) => r.rev), evidence: clean(latest.text), page: l.page };
  }
  return null;
}

// --- General tolerances -------------------------------------------------

const PM = "(?:±|\\+\\/-|\\+-|\\+\\s*\\/\\s*-)";
const NUM = "(\\d*\\.\\d+|\\d+)";
const DEC_RE = new RegExp(`(?:(?<![\\w.])X*\\.(X{1,4})\\b|\\b(\\d)\\s*(?:-\\s*)?(?:PL|PLC|PLACE)S?(?:\\s*DEC(?:IMALS?)?)?\\b|\\bX{1,3}\\.(X{1,4})\\b)\\s*[:=]?\\s*${PM}\\s*${NUM}`, "gi");
const ANG_RE = new RegExp(`\\bANG(?:LES?|ULAR)?\\b\\s*[:=]?\\s*${PM}\\s*(\\d*\\.?\\d+)\\s*(?:°|DEG(?:REES?)?)?(?:\\s*(\\d{1,2})\\s*['’])?`, "i");
const FRAC_RE = new RegExp(`\\bFRACT(?:IONS?|IONAL)?\\b\\s*[:=]?\\s*${PM}\\s*(\\d+)\\s*\\/\\s*(\\d+)`, "i");
const ISO2768_RE = /\bISO\s*2768\s*(?:-\s*1)?\s*[-‑]?\s*([fmcv])\s*([HKL])?\b/i;
const UNITS_RE = /\b(?:DIMENSIONS?\s+(?:ARE\s+)?IN|UNITS?\s*:?|ALL\s+DIMENSIONS\s+IN)\s*(INCH(?:ES)?|MILLIMET(?:ER|RE)S?|MM|IN)\b/i;
const Y145_RE = /\b(?:ASME\s*)?Y14\.5(M)?\s*[-–]?\s*((?:19|20)\d{2})\b/i;

/** The general tolerance block: by decimal places, angles, fractions, ISO 2768, units, Y14.5 edition. */
export function readGeneralTolerances(text) {
  const src = String(text ?? "");
  const linear = {};
  const evidence = [];
  for (const m of src.matchAll(DEC_RE)) {
    const places = m[1] ? m[1].length : m[2] ? Number(m[2]) : m[3].length;
    const tol = Number(m[4]);
    if (!(places >= 1 && places <= 4) || !(tol > 0) || tol >= 10) continue;
    if (linear[places] == null) { linear[places] = tol; evidence.push(clean(m[0])); }
  }
  const out = { linear, angular: null, fractional: null, iso2768: null, units: null, standard: null, evidence };
  const a = src.match(ANG_RE);
  if (a) {
    const deg = Number(a[1]) + (a[2] ? Number(a[2]) / 60 : 0);
    if (deg > 0 && deg < 30) { out.angular = Number(deg.toFixed(4)); evidence.push(clean(a[0])); }
  }
  const fr = src.match(FRAC_RE);
  if (fr && Number(fr[2]) > 0) { out.fractional = { text: `±${fr[1]}/${fr[2]}`, value: Number(fr[1]) / Number(fr[2]) }; evidence.push(clean(fr[0])); }
  const iso = src.match(ISO2768_RE);
  if (iso) { out.iso2768 = (iso[1] + (iso[2] || "")).toLowerCase().replace(/^([fmcv])(.?)$/, (_, c, g) => c + g.toUpperCase()); evidence.push(clean(iso[0])); }
  const u = src.match(UNITS_RE);
  if (u) out.units = /^M/i.test(u[1]) ? "mm" : "inch";
  const y = src.match(Y145_RE);
  if (y) out.standard = `ASME Y14.5${y[1] ? "M" : ""}-${y[2]}`;
  out.found = Object.keys(linear).length > 0 || out.angular != null || out.fractional != null || out.iso2768 != null;
  return out;
}

// --- Notes --------------------------------------------------------------

export const NOTE_TAGS = [
  { id: "deburr", label: "deburr / edge break", re: /\b(?:deburr|break (?:all )?(?:sharp )?edges?|remove (?:all )?burrs?|edge break|burr[- ]free)\b/i },
  { id: "finish", label: "finish / coating", re: /\b(?:anodi[sz]\w*|MIL-(?:A|PRF)-8625|chem(?:ical)? film|alodine|MIL-DTL-5541|passivat\w*|AMS ?2700|ASTM ?A967|black oxide|plat(?:e|ed|ing)\b|powder coat\w*|paint\w*|prime[rd]?\b)/i },
  { id: "heat", label: "heat treat / hardness", re: /\b(?:heat treat\w*|harden\w*|HRC\s?\d|Rc\s?\d|\d{2}\s*-\s*\d{2}\s*(?:HRC|Rc)|case depth|stress reliev\w*|temper\w*)\b/i },
  { id: "marking", label: "part marking", re: /\b(?:mark(?:ed|ing)? (?:part|with|per)|part mark\w*|laser (?:mark|etch)\w*|engrav\w*|ink stamp|bag (?:and|&) tag|IUID|UID|MIL-STD-130)\b/i },
  { id: "surface", label: "surface finish", re: /(?:\b\d{1,3}\s*(?:Ra|RMS|µin|microinch(?:es)?)\b|\bRa\s*\d|√|surface (?:finish|roughness))/i },
  { id: "thread", label: "threads / inserts", re: /\b(?:\d+\/\d+-\d+|#\d+-\d+|M\d+(?:\s*[xX]\s*\d*\.?\d+)?)\s*(?:UN[CFEJ]?|-\s*\d[AB]|6H|6g)?|\bhelicoil\b|\bthread(?:ed)? insert|\bSTI\b/i },
  { id: "inspect", label: "inspection / first article", re: /\b(?:AS ?9102|first article|FAIR?\b|inspect\w*|CMM\b|100%|critical (?:dimension|characteristic)|key characteristic|KC\b)/i },
  { id: "certs", label: "certs / traceability", re: /\b(?:certs?\b|certif\w*|traceab\w*|mill test|MTR|C ?of ?C|heat (?:lot|number))/i },
  { id: "controlled", label: "controlled data", re: /\b(?:CUI|ITAR|EAR99|export[- ]controlled|distribution statement|proprietary)\b/i },
  { id: "noscale", label: "do not scale", re: /\bdo not scale\b|\bDNS\b/i },
  { id: "clean", label: "cleanliness / packaging", re: /\b(?:clean(?:ed|liness)?\b|free of (?:oil|chips|debris)|packag\w*|individually bag\w*)\b/i },
];

const NOTE_START = /^\s*(\d{1,2})\s*[.)]\s+(\S.*)$/;

/**
 * Numbered notes under a NOTES heading (or anywhere, when there is no
 * heading). A line that is not numbered and starts right of the note's
 * number continues the note above it.
 */
export function readNotes(lines) {
  const heads = lines.filter((l) => /^\s*(?:GENERAL\s+)?NOTES?\s*:?\s*(?:\(.*\))?\s*$/i.test(l.text) || /^\s*NOTES?\s*:\s*$/i.test(clean(l.items[0]?.text)));
  const notes = [];
  const used = new Set();
  const scan = heads.length ? heads : [null];
  for (const h of scan) {
    let cur = null;
    let lastKey = null;
    const pool = lines.filter((l) => (h ? l.page === h.page && l.key > h.key : true));
    for (const l of pool) {
      // Notes run down one column: read only text left-aligned near the heading.
      const items = h ? l.items.filter((it) => it.x >= h.items[0].x - 30 && it.x < h.items[0].x + 400) : l.items;
      if (!items.length) continue;
      const text = lineText({ items });
      const m = text.match(NOTE_START);
      const gap = lastKey == null ? 0 : l.key - lastKey;
      if (m) {
        cur = { n: Number(m[1]), text: clean(m[2]), x: items[0].x, page: l.page };
        notes.push(cur); items.forEach((it) => used.add(it)); lastKey = l.key;
        continue;
      }
      if (cur && items[0].x > cur.x + 2 && gap < 30 && !LABELISH.test(clean(text))) {
        cur.text = clean(`${cur.text} ${text}`); items.forEach((it) => used.add(it)); lastKey = l.key;
        continue;
      }
      if (cur && h && gap > 40) break;
    }
    if (notes.length) break;
  }
  // Keep one run of numbering: a stray "1." elsewhere is not a second note 1.
  const seen = new Set();
  const kept = notes.filter((n) => (seen.has(n.n) ? false : (seen.add(n.n), true)));
  for (const n of kept) n.tags = NOTE_TAGS.filter((t) => t.re.test(n.text)).map((t) => t.id);
  const nums = kept.map((n) => n.n);
  const skipped = [];
  for (let k = 1; k <= Math.max(0, ...nums); k++) if (!nums.includes(k)) skipped.push(k);
  return { notes: kept, skipped, heading: heads.length > 0, used };
}

// --- Dimension text in the views ----------------------------------------

const DIM_PATTERNS = [
  new RegExp(`^(?:\\d+\\s*[Xx]\\s+)?[ØR⌀]?\\s*\\d*\\.\\d+\\s*${PM}\\s*\\d*\\.\\d+`),            // .500 ±.005
  /^(?:\d+\s*[Xx]\s+)?[ØR⌀]?\s*\d*\.\d+\s*\+\s*\d*\.\d+\s*\/?\s*-\s*\d*\.\d+/,                // .500 +.002/-.000
  /^(?:\d+\s*[Xx]\s+)?[ØR⌀]?\s*\d*\.\d{2,4}\s*\/\s*\d*\.\d{2,4}$/,                              // 1.005/1.000
  /^(?:\d+\s*[Xx]\s+)?(?:\d+\/\d+|#\d+)-\d+\s*UN[CFEJ]?(?:-\d[AB])?/i,                           // 1/4-20 UNC-2B
  /^(?:\d+\s*[Xx]\s+)?M\d+(?:\.\d+)?\s*[xX]\s*\d*\.?\d+(?:\s*-?\s*\d[HhGg])?/,                   // M6x1.0-6H
  /^(?:\d+\s*[Xx]\s+)?[ØR⌀]\s*\d*\.\d+(?:\s*(?:THRU|TYP|MAX|MIN))?/i,                            // Ø.250 THRU
  /^(?:\d+\s*[Xx]\s+)?\d*\.\d{1,4}(?:\s*(?:TYP|MAX|MIN|REF|BSC|BASIC))?$/i,                      // 2.500, .03 MAX
  /^(?:\d+\s*[Xx]\s+)?\(\d*\.\d{1,4}\)$/,                                                         // (1.250) reference
  /^(?:\d+\s*[Xx]\s+)?\d+(?:\.\d+)?\s*°(?:\s*[±]\s*\d*\.?\d+°?)?$/,                              // 45°
];

const looksDate = (t) => /^\d{1,2}[./-]\d{1,2}[./-]\d{2,4}$/.test(t);

/**
 * Text in the views that reads as a dimension or a thread callout, in
 * reading order (top to bottom, left to right). A starter list for the
 * first article characteristic table, not a ballooned drawing.
 */
export function readDimensions(lines, skip = new Set()) {
  const out = [];
  for (const l of lines) {
    for (const it of l.items) {
      if (skip.has(it)) continue;
      const t = clean(it.text);
      if (!t || t.length > 40 || looksDate(t)) continue;
      if (DIM_PATTERNS.some((re) => re.test(t))) out.push({ text: t, page: l.page });
    }
  }
  return out;
}

// --- Markings -----------------------------------------------------------

const DIST_RE = /\bDISTRIBUTION\s+STATEMENT\s+([A-F])\b/i;

export function readMarkings(text) {
  const out = [];
  const d = text.match(DIST_RE);
  if (d) out.push({ id: "distribution", statement: d[1].toUpperCase(), evidence: clean(text.slice(Math.max(0, d.index - 10), d.index + 120)) });
  if (/\bCUI\b|CONTROLLED UNCLASSIFIED/i.test(text)) out.push({ id: "cui" });
  if (/\bITAR\b|INTERNATIONAL TRAFFIC IN ARMS|22 CFR 12\d/i.test(text)) out.push({ id: "itar" });
  if (/\bEXPORT ADMINISTRATION REGULATIONS\b|\bEAR99\b|\bECCN\b/i.test(text)) out.push({ id: "ear" });
  if (/\bPROPRIETARY\b|\bCONFIDENTIAL\b/i.test(text)) out.push({ id: "proprietary" });
  return out;
}

// --- The whole drawing --------------------------------------------------

/**
 * Read a drawing from extractPdfLines' output: `{ pages, flags }`.
 * Options: { tightInches } for the tight-tolerance flag (default 0.001).
 */
export function readDrawing(extracted, { tightInches = 0.001 } = {}) {
  const pages = extracted?.pages ?? [];
  const flags = extracted?.flags ?? {};
  const lines = flatten(pages);
  const text = lines.map((l) => l.text).join("\n");
  const tb = readTitleBlock(lines);
  const revTable = readRevisionTable(lines);
  const general = readGeneralTolerances(text);
  const notes = readNotes(lines);
  const markings = readMarkings(text);
  // Title block values, notes and the tolerance block's own text are not dimensions.
  const skip = new Set([...tb.used, ...notes.used]);
  const tolRe = new RegExp(`UNLESS OTHERWISE|TOLERANCES?\\b|X*\\.X{1,4}\\s*[:=]?\\s*${PM}`, "i");
  for (const l of lines) for (const it of l.items) if (tolRe.test(it.text) || ANG_RE.test(it.text) || FRAC_RE.test(it.text)) skip.add(it);
  const dims = readDimensions(lines, skip);
  const rfq = readRfq(text, { tightInches });
  const result = {
    pageCount: flags.pageCount ?? pages.length,
    readable: lines.length > 0,
    flags,
    fields: tb.fields,
    revisionTable: revTable,
    general,
    notes: notes.notes,
    notesSkipped: notes.skipped,
    dimensions: dims,
    markings,
    clauses: rfq.clauses,
    otherClauses: rfq.otherClauses,
    requirements: rfq.requirements,
    specs: rfq.specs,
    tightest: rfq.lines.reduce((t, l) => (l.tightest != null && (t == null || l.tightest < t) ? l.tightest : t), null),
    tightInches: rfq.tightInches,
    // The material line the RFQ reader recognised, as a cross-check for the title block.
    materialSeen: rfq.lines.find((l) => l.material)?.material?.text ?? null,
    text,
  };
  result.questions = drawingQuestions(result);
  return result;
}

/** Questions for the buyer from what the drawing leaves out or contradicts. */
export function drawingQuestions(d) {
  const q = [];
  if (!d.readable) return ["The PDF has no readable text (a scan, or text drawn as lines). Can you send a PDF exported from CAD, or the STEP model?"];
  const f = d.fields;
  const pn = f.partNumber?.value || f.drawingNumber?.value;
  const who = pn ? `P/N ${pn}` : "this part";
  if (!pn) q.push("Which part number is this drawing for? We could not find one in the title block.");
  if (!f.revision && !d.revisionTable) q.push(`Which revision of ${who} should we quote? The drawing shows none.`);
  if (f.revision && d.revisionTable && revRank(d.revisionTable.latest) >= 0 && revRank(f.revision.value) >= 0 && revRank(d.revisionTable.latest) !== revRank(f.revision.value))
    q.push(`The title block says revision ${f.revision.value} but the revision table lists ${d.revisionTable.latest} as the latest. Which one should we quote?`);
  if (!f.material && !d.materialSeen) q.push(`What material, temper or condition and spec is ${who}? We could not find a material callout.`);
  if (!f.finish && !d.notes.some((n) => n.tags.includes("finish"))) q.push(`Is ${who} supplied as machined, or is there a finish we did not find on the drawing?`);
  if (!d.general.found) q.push("We could not find a general tolerance block. What tolerance applies to dimensions with none of their own?");
  if (d.general.iso2768 && !Object.keys(d.general.linear).length) q.push(`General tolerances are ISO 2768-${d.general.iso2768}. Please confirm that is the only general tolerance (no title-block decimal tolerances).`);
  if (!d.general.units) q.push("Are the dimensions in inches or millimetres? The drawing does not say.");
  if (d.notesSkipped.length) q.push(`The notes skip number${d.notesSkipped.length > 1 ? "s" : ""} ${d.notesSkipped.join(", ")}. Is a note missing from this copy?`);
  const dist = d.markings.find((m) => m.id === "distribution");
  if (dist && dist.statement !== "A") q.push(`The drawing carries distribution statement ${dist.statement}. May we send it to our outside processors (plating, heat treat), and is any of it CUI?`);
  else if (d.markings.some((m) => m.id === "cui")) q.push("The drawing is marked CUI. How will you send revisions, and may we share it with outside processors?");
  if (d.markings.some((m) => m.id === "itar" || m.id === "ear")) q.push("The drawing carries an export-control marking. What is the classification, and who may see it?");
  if (d.tightest != null && d.tightest < d.tightInches) q.push(`The tightest tolerance we found is ±${Number(d.tightest.toFixed(5))}". Is it needed on every feature it is called out on?`);
  return [...new Set(q)];
}

/** Hand-over to the first article checker: general tolerances in the query, characteristics in the hash. */
export function faiLink(d, base = "first-article-inspection.html") {
  const p = new URLSearchParams();
  for (const k of [1, 2, 3, 4]) if (d.general.linear[k] != null) p.set(`g${k}`, String(d.general.linear[k]));
  if (d.general.angular != null) p.set("ga", String(d.general.angular));
  const rows = faiStarter(d);
  const hash = rows ? "#chars=" + encodeURIComponent(rows.slice(0, 8000)) : "";
  const qs = p.toString();
  return base + (qs ? "?" + qs : "") + hash;
}

/** Starter characteristic table (tab-separated) the first article checker reads. */
export function faiStarter(d) {
  if (!d.dimensions.length && !d.notes.length) return "";
  const rows = ["Char No.\tRequirement\tResult"];
  let n = 0;
  for (const x of d.dimensions) rows.push(`${++n}\t${x.text.replace(/\t/g, " ")}\t`);
  for (const note of d.notes) rows.push(`${++n}\tNote ${note.n}: ${note.text.replace(/\t/g, " ").slice(0, 200)}\t`);
  return rows.join("\n");
}

const csvCell = (v) => {
  let s = String(v ?? "");
  // A plain number such as -12.50 stays a number; anything else starting
  // like a formula is defused into text.
  if (/^[=+\-@\t\r]/.test(s) && !/^[-+]?\d+(?:\.\d+)?$/.test(s)) s = "'" + s;
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** The whole read as a CSV: section, item, value, source text. */
export function drawingCsv(d) {
  const rows = [["Section", "Item", "Value", "Found in"]];
  for (const f of FIELDS) rows.push(["Title block", f.label, d.fields[f.id]?.value ?? "not found", d.fields[f.id]?.evidence ?? ""]);
  if (d.revisionTable) rows.push(["Revision table", "Latest revision", d.revisionTable.latest, d.revisionTable.evidence]);
  for (const k of [1, 2, 3, 4]) if (d.general.linear[k] != null) rows.push(["General tolerance", `${k} decimal place${k > 1 ? "s" : ""}`, `±${d.general.linear[k]}`, ""]);
  if (d.general.angular != null) rows.push(["General tolerance", "Angles", `±${d.general.angular}°`, ""]);
  if (d.general.fractional) rows.push(["General tolerance", "Fractions", d.general.fractional.text, ""]);
  if (d.general.iso2768) rows.push(["General tolerance", "ISO 2768", d.general.iso2768, ""]);
  rows.push(["General tolerance", "Units", d.general.units ?? "not stated", ""]);
  if (d.general.standard) rows.push(["General tolerance", "Dimensioning standard", d.general.standard, ""]);
  for (const n of d.notes) rows.push(["Note", String(n.n), n.text, n.tags.join(" ")]);
  for (const x of d.dimensions) rows.push(["Dimension text", "", x.text, `page ${x.page}`]);
  for (const s of d.specs) rows.push(["Spec named", "", s.spec, ""]);
  for (const c of d.clauses) rows.push(["Clause", c.id, c.title, c.evidence]);
  for (const q of d.questions) rows.push(["Question for the buyer", "", q, ""]);
  return rows.map((r) => r.map(csvCell).join(",")).join("\n") + "\n";
}
