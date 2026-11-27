// Insurance requirements read from the subcontract's insurance exhibit (insurance certificates,
// part 6): the coverages, minimum limits and endorsements a GC's exhibit asks for, proposed for the
// job's requirements form so nobody types them from the PDF. Pure and deterministic: no model reads
// the exhibit, and every value proposed carries the sentence it was read from, so the person checks
// it against the subcontract before saving. Nothing here is saved; the form saves what the person
// keeps.
//
// How the text is read:
// - Text: a PDF's positioned text (src/shared/pdf/text.ts) is put back into lines, and lines a
//   paragraph wraps are joined again; pasted text is read the same way.
// - Coverages: each name ("Commercial General Liability", "Automobile Liability", "Employer's
//   Liability", "Umbrella/Excess Liability" ...) opens that coverage, and the limits after it belong
//   to it until another coverage is named. Names in an exception ("all policies except Workers'
//   Compensation") or in an umbrella's "over General Liability and Auto" open nothing.
// - Limits: a dollar amount is a limit when a label sits beside it, before it on a table line
//   ("Each Occurrence $1,000,000") or after it in prose ("$1,000,000 per occurrence"). Labels that are
//   not one of the two limits the form keeps (products-completed operations aggregate, personal and
//   advertising injury, medical expense, each employee, deductibles, contract-size thresholds) set
//   nothing. An amount with no label is the limit only for a single-limit coverage (auto, umbrella,
//   professional, pollution) with nothing read yet; otherwise it is listed for the person to place.
// - Endorsements: additional insured, waiver of subrogation and primary and non-contributory go to
//   the coverages their sentence names; "all policies" means every liability coverage read (not
//   workers' compensation unless named, which cannot carry an additional insured); a sentence that
//   names none goes to the coverage being read. "Not required" sets nothing.
// - Umbrella counting: "limits may be met by a combination of primary and umbrella/excess" lets the
//   umbrella count toward the limits of the coverages it names, or all of them.
// - Limits by contract size ("Subcontracts over $1,000,000 and up to $5,000,000: Umbrella
//   $5,000,000", or "Umbrella $2,000,000 for subcontracts under $1,000,000; $5,000,000 for
//   subcontracts of $1,000,000 or more"): a contract-size condition opens a tier. A limit belongs to
//   the condition right after it ("$2,000,000 for subcontracts under ..."), else to the one before it
//   in its sentence, else to the last tier opened on its own ("Subcontracts up to $1,000,000:" with
//   the coverages on the lines below), until another tier or "regardless of contract size". Given
//   the job's contract sum, limits of the tiers that do not contain it are set aside (each named in
//   a note), and a limit from the job's tier replaces one read with no tier. Without it, the first
//   is kept and a note asks for the contract sum. The thresholds themselves are never limits.
// - Two different amounts for one limit otherwise keep the first and say so.
// What the text does not say is left blank: a blank limit is "none asked", which the person can fill.
import { INSURANCE_KIND_LABELS, type InsuranceKind } from "./insurance";
import {
  ENDORSEMENTS,
  type EndorsementKey,
  formatLimit,
  type InsuranceRequirement,
  LIMIT_LABELS,
} from "./insurance-requirements";
import { PdfUnreadable } from "./pdf/reader";
import { extractText, type PdfText } from "./pdf/text";
import { type Ocr, type OcrProgress, ocrText } from "./sov-import/ocr";

/** One value read, and the sentence it came from (trimmed). */
export interface ExhibitEvidence {
  what: string;
  quote: string;
}

export interface ExhibitRequirement {
  requirement: InsuranceRequirement;
  evidence: ExhibitEvidence[];
}

export interface ExhibitReading {
  /** One a coverage, in the order the exhibit names them. */
  found: ExhibitRequirement[];
  /** Amounts that looked like limits but could not be placed: the person decides. */
  unplaced: ExhibitEvidence[];
  /** Conflicts and things set aside, in words. */
  notes: string[];
  /** The contract-size tiers the exhibit sets limits by, in words ("subcontracts over $1,000,000"); empty when it has none. */
  tiers: string[];
  /** The tier the job's contract sum falls in, when a contract sum was given and a tier holds it. */
  jobTier: string | null;
}

export interface ExhibitOptions {
  /** The job's contract sum, which picks the tier when the exhibit sets limits by contract size. */
  contractSumCents?: number | null;
}

/** A contract-size band: over (or from) lo, up to (or under) hi, in cents; null is open. */
export interface ContractTier {
  loCents: number | null;
  loInclusive: boolean;
  hiCents: number | null;
  hiInclusive: boolean;
}

export function tierContains(t: ContractTier, cents: number): boolean {
  if (t.loCents !== null && (t.loInclusive ? cents < t.loCents : cents <= t.loCents)) return false;
  if (t.hiCents !== null && (t.hiInclusive ? cents > t.hiCents : cents >= t.hiCents)) return false;
  return true;
}

/** "subcontracts over $1,000,000 and up to $5,000,000". */
export function tierLabel(t: ContractTier): string {
  const lo =
    t.loCents === null || (t.loCents === 0 && t.loInclusive)
      ? null
      : t.loInclusive
        ? `of ${formatLimit(t.loCents)} or more`
        : `over ${formatLimit(t.loCents)}`;
  const hi =
    t.hiCents === null
      ? null
      : t.hiInclusive
        ? `up to ${formatLimit(t.hiCents)}`
        : `under ${formatLimit(t.hiCents)}`;
  if (lo && hi) return `subcontracts ${lo} and ${hi}`;
  return `subcontracts ${lo ?? hi ?? "of any amount"}`;
}

/** Exhibits are a few pages; a whole subcontract is longer, and only the text is kept in memory. */
export const MAX_EXHIBIT_CHARS = 200_000;
const QUOTE_CHARS = 240;

const KIND_PATTERNS: [InsuranceKind, RegExp][] = [
  ["general_liability", /\b(?:commercial\s+)?general\s+liability\b|\bCGL\b/gi],
  [
    "auto",
    /\b(?:(?:business|commercial)\s+)?auto(?:mobile)?\s+(?:liability|insurance|policy|coverage)\b|\bcommercial\s+auto\b/gi,
  ],
  [
    "workers_comp",
    /\bworkers'?\s*'?\s*comp(?:ensation)?\b|\bemployers?'?s?'?\s+liability\b|\bE\.\s?L\.(?=\s)/gi,
  ],
  [
    "umbrella",
    /\bumbrella\b|\bexcess\s+(?:liability|policy|policies|coverage|insurance)\b|\bexcess\s*\/\s*umbrella\b/gi,
  ],
  ["professional", /\bprofessional\s+(?:liability|errors)\b|\berrors\s+(?:and|&)\s+omissions\b/gi],
  ["pollution", /\b(?:contractors?'?\s+)?pollution\s+(?:legal\s+)?liability\b/gi],
  ["builders_risk", /\bbuilders?'?\s*'?\s*risk\b/gi],
];

const AMOUNT =
  /\$\s?(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d{1,2}))?(?:\s?(million|mil\.?|MM|M)\b)?|\b(\d{1,3}(?:,\d{3}){2,})(?:\.\d{2})?\b/g;

type Label = "each" | "aggregate" | "both" | "ignore";
// Longest first, so "general aggregate" is read before "aggregate" and "products ... aggregate"
// before both.
const LABELS: [Label, RegExp][] = [
  [
    "both",
    /\b(?:each|per)\s+occurrence\s*(?:and|\/|&)\s*(?:in\s+the\s+)?(?:general\s+)?aggregate\b/gi,
  ],
  [
    "ignore",
    /\boccurrence\s+(?:basis|form)\b|\bproducts?\s*[-/&]?\s*(?:and\s+)?completed\s+operations?(?:\s+aggregate)?\b|\bpersonal\s+(?:and|&)\s+advertising(?:\s+injury)?\b|\bmed(?:ical)?\.?\s+exp(?:ense)?s?\b|\bdamage\s+to\s+rented\s+premises\b|\bfire\s+damage\b|\beach\s+employee\b|\bdeductibles?\b|\bself[-\s]insured\s+retentions?\b|\bretentions?\b|\b(?:sub)?contracts?\s+(?:sum|amount|value|price|over|exceeding|greater|of\s+more)\b|\bprojects?\s+(?:over|exceeding|greater|valued)\b|\bexceeding\b|\bover\b(?=\s*\$)/gi,
  ],
  ["aggregate", /\b(?:general\s+|annual\s+)?aggregate\b|\bpolicy\s+limit\b/gi],
  [
    "each",
    /\b(?:each|per)\s+(?:occurrence|accident|claim|incident|loss)\b|\bcombined\s+single\s+limit\b|\bCSL\b|\boccurrence\b/gi,
  ],
];

const EXCEPTION = /\b(?:except(?:\s+for)?|excluding|other\s+than|but\s+not)\b/gi;
const EXCEPTION_END = /\b(?:shall|must|will|are|is|to|which)\b|[.;:]/gi;
const OVER =
  /\b(?:over|above|in\s+excess\s+of|following\s+form(?:\s+(?:of|over))?|schedul(?:e|ing))\b/gi;
const ALL_POLICIES =
  /\b(?:all|each|every|such|these|the\s+above|said|required|above|foregoing)\s+(?:of\s+the\s+)?(?:(?:liability|required)\s+)?(?:policies|policy|insurance|insurances|coverages?)\b/i;
const NEGATED =
  /\bnot\s+(?:be\s+)?(?:required|necessary|needed)\b|\bno\s+(?:additional|waiver|primary)\b|\bN\/A\b/i;
const UMBRELLA_COUNTS =
  /(?:umbrella|excess)[^.]{0,120}\b(?:satisf|meet|met\b|count|combin|achiev|used\s+to|toward)|\b(?:satisf|meet|met\b|combin|achiev)[^.]{0,120}(?:umbrella|excess)/i;

const ENDORSEMENT_PATTERNS: [EndorsementKey, RegExp][] = [
  [
    "additionalInsured",
    /\badditional(?:ly)?\s+insureds?\b|\bCG\s?20\s?(?:10|37|26|38)\b|\bAI\s+endorsement\b/i,
  ],
  [
    "waiverOfSubrogation",
    /\bwaiv(?:e|er|ers|ing)\s+(?:of\s+|all\s+(?:rights\s+of\s+)?)?subrogation\b|\bsubrogation\s+(?:is\s+)?waived\b|\bCG\s?24\s?04\b/i,
  ],
  ["primaryNoncontributory", /\bprimary\b[^.]{0,40}\bnon[-\s]?contributory\b|\bCG\s?20\s?01\b/i],
];

const LIABILITY_KINDS: InsuranceKind[] = [
  "general_liability",
  "auto",
  "umbrella",
  "professional",
  "pollution",
];

const norm = (s: string) =>
  s.replace(/[‘’ʼ]/g, "'").replace(/[“”]/g, '"').replace(/[‐-―]/g, "-").replace(/ /g, " ");

/** The PDF's text in reading order, a line of text a line, pages one after another. */
export function linesFromPdfText(text: PdfText): string[] {
  const out: string[] = [];
  for (const page of text.pages) {
    const runs = [...page.runs]
      .filter((r) => r.text.trim())
      .sort((a, b) => a.y - b.y || a.x0 - b.x0);
    const lines: (typeof runs)[] = [];
    for (const r of runs) {
      const last = lines[lines.length - 1];
      const ref = last?.[0];
      if (last && ref && Math.abs(r.y - ref.y) <= 0.5 * Math.max(ref.size, r.size, 1)) last.push(r);
      else lines.push([r]);
    }
    for (const l of lines) {
      l.sort((a, b) => a.x0 - b.x0);
      let s = "";
      let prev: (typeof l)[number] | null = null;
      for (const r of l) {
        if (prev && r.x0 - prev.x1 > 0.15 * Math.max(r.size, 1) && !s.endsWith(" ")) s += " ";
        s += r.text;
        prev = r;
      }
      const t = s.replace(/\s+/g, " ").trim();
      if (t) out.push(t);
    }
  }
  return out;
}

const CONNECTOR =
  /(?:[,(&/-]|\b(?:and|or|of|the|to|for|with|in|than|as|a|an|by|shall|be|not|less|on|at|per|each|any|its|their|least|such|which|that|all|including|name|naming|limits?))$/i;

// A line that is a row or a heading, not a wrapped sentence: "Umbrella Liability: $2,000,000", or
// "Subcontracts over $1,000,000:".
const TABLE_ROW = /^[A-Z][^:.]{0,60}:\s*\$|^[A-Z].{0,120}:$/;

/** Lines a paragraph wraps are joined again, so a sentence reads whole; table lines stay apart. */
export function paragraphs(lines: readonly string[]): string[] {
  const longest = lines.reduce((m, l) => Math.max(m, l.length), 0);
  const out: string[] = [];
  for (const raw of lines) {
    const line = raw.replace(/\s+/g, " ").trim();
    if (!line) {
      out.push("");
      continue;
    }
    const prev = out[out.length - 1];
    const join =
      prev !== undefined &&
      prev !== "" &&
      !/[.:;!?]$/.test(prev) &&
      (/^[a-z]/.test(line) ||
        CONNECTOR.test(prev) ||
        (longest >= 60 && prev.length >= 0.8 * longest && !TABLE_ROW.test(line)));
    if (join) out[out.length - 1] = `${prev} ${line}`;
    else out.push(line);
  }
  return out.filter((l) => l !== "");
}

/** A paragraph's sentences: split after a full stop or semicolon before a capital, a bullet or a number. */
function sentences(paragraph: string): string[] {
  return paragraph
    .split(/(?<=[.;])\s+(?=[A-Z(\d•*-])|\s+(?=\(\s?[a-z0-9]{1,3}\s?\)\s)|\s+(?=•)/)
    .map((s) => s.trim())
    .filter(Boolean);
}

interface Span {
  start: number;
  end: number;
}
const within = (i: number, spans: Span[]) => spans.some((s) => i >= s.start && i < s.end);

function regions(s: string, open: RegExp, close: RegExp): Span[] {
  const out: Span[] = [];
  for (const m of s.matchAll(open)) {
    const start = m.index ?? 0;
    const from = start + m[0].length;
    close.lastIndex = 0;
    const rest = s.slice(from);
    const c = new RegExp(close.source, close.flags).exec(rest);
    out.push({ start, end: c ? from + c.index : s.length });
  }
  return out;
}

interface Mention {
  kind: InsuranceKind;
  start: number;
  end: number;
}

function mentions(s: string): { open: Mention[]; excepted: Mention[] } {
  const all: Mention[] = [];
  for (const [kind, re] of KIND_PATTERNS)
    for (const m of s.matchAll(re)) {
      const start = m.index ?? 0;
      all.push({ kind, start, end: start + m[0].length });
    }
  all.sort((a, b) => a.start - b.start);
  // "Excess/Umbrella" and "umbrella" overlapping: keep the first match at a place.
  const dedup = all.filter(
    (m, i) => !all.slice(0, i).some((o) => m.start < o.end && o.start < m.end),
  );
  const except = regions(s, EXCEPTION, EXCEPTION_END);
  const hasUmbrella = dedup.some((m) => m.kind === "umbrella");
  const over = hasUmbrella ? regions(s, OVER, /[.;]/g) : [];
  const open: Mention[] = [];
  const excepted: Mention[] = [];
  for (const m of dedup) {
    if (within(m.start, except)) excepted.push(m);
    else if (m.kind !== "umbrella" && within(m.start, over)) excepted.push(m);
    else open.push(m);
  }
  return { open, excepted };
}

interface Amount {
  cents: number;
  start: number;
  end: number;
  text: string;
}

function amounts(s: string): Amount[] {
  const out: Amount[] = [];
  for (const m of s.matchAll(AMOUNT)) {
    const start = m.index ?? 0;
    const whole = m[1] ?? m[4];
    if (!whole) continue;
    const dollars = Number(whole.replace(/,/g, ""));
    const decimals = m[2] ? Number(m[2].padEnd(2, "0")) / 100 : 0;
    const scale = m[3] ? 1_000_000 : 1;
    const cents = Math.round((dollars + decimals) * scale * 100);
    if (!Number.isSafeInteger(cents) || cents <= 0) continue;
    out.push({ cents, start, end: start + m[0].length, text: m[0] });
  }
  return out;
}

interface LabelHit {
  label: Label;
  start: number;
  end: number;
}

function labels(s: string): LabelHit[] {
  const hits: LabelHit[] = [];
  for (const [label, re] of LABELS)
    for (const m of s.matchAll(re)) {
      const start = m.index ?? 0;
      const end = start + m[0].length;
      if (hits.some((h) => start < h.end && h.start < end)) continue;
      hits.push({ label, start, end });
    }
  return hits.sort((a, b) => a.start - b.start);
}

function quote(s: string, at: number): string {
  if (s.length <= QUOTE_CHARS) return s;
  const from = Math.max(0, Math.min(at - QUOTE_CHARS / 2, s.length - QUOTE_CHARS));
  return `${from > 0 ? "…" : ""}${s.slice(from, from + QUOTE_CHARS).trim()}${from + QUOTE_CHARS < s.length ? "…" : ""}`;
}

const blank = (kind: InsuranceKind): InsuranceRequirement => ({
  kind,
  eachOccurrenceCents: null,
  aggregateCents: null,
  additionalInsured: false,
  waiverOfSubrogation: false,
  primaryNoncontributory: false,
  umbrellaCounts: false,
});

const SINGLE_LIMIT: InsuranceKind[] = [
  "auto",
  "umbrella",
  "professional",
  "pollution",
  "builders_risk",
];

interface TierHit {
  tier: ContractTier;
  label: string;
  /** From the contract word to the end of the last threshold. */
  start: number;
  end: number;
  /** Where the threshold amounts start: they are never limits. */
  thresholds: number[];
}

const CONTRACT_WORD = /\b(?:sub)?contracts?\b|\bprojects?\b/gi;
// Words between "subcontract" and the condition: "amount:", "value of", "with a value of", "valued at".
const TIER_FILLER =
  /^\s*(?:(?:sum|amount|value|price|size|total)s?\b)?\s*(?:(?:is|are|of|with\s+(?:a|an|the)\s+(?:total\s+)?(?:value|amount|sum|price)(?:\s+of)?|with\s+(?:values?|amounts?)(?:\s+of)?|valued(?:\s+at)?|amounting\s+to|totall?ing|whose\s+(?:value|amount)\s+is)\b)?\s*[:(]?\s*/i;
const LO_INCL = /^(?:not\s+less\s+than|at\s+least|(?:a\s+)?minimum\s+of)$/i;
const LO_EXCL = /^(?:over|exceeding|greater\s+than|more\s+than|above|in\s+excess\s+of)$/i;
const HI_INCL =
  /^(?:up\s+to(?:\s+and\s+including)?|not\s+(?:exceeding|to\s+exceed|over|more\s+than|greater\s+than|above)|(?:a\s+)?maximum\s+of|at\s+most)$/i;
const HI_EXCL = /^(?:less\s+than|under|below)$/i;
const BETWEEN = /^(?:between|from)$/i;
const RANGE_MID = /^\s*(?:-|to|through|thru)\s*$/i;
const BETWEEN_MID = /^\s*(?:-|to|through|thru|and)\s*$/i;
const UPPER_AFTER_LOWER =
  /^\s*(?:,|and|but)?\s*(up\s+to(?:\s+and\s+including)?|not\s+(?:exceeding|to\s+exceed|over|more\s+than|greater\s+than|above)|less\s+than|under|below|to|through|-)\s*$/i;
// After a limit, the words that tie it to the condition that follows: "$2,000,000 for subcontracts".
const TRAILING =
  /^(?:[\s,()/&-]|\b(?:and|for|on|with|if|when|where|all|any|those|the|each|of|is|are|required|applies|apply|applicable|to|in)\b)*$/i;
const TIER_RESET =
  /\bregardless\s+of\s+(?:the\s+)?(?:sub)?contract\b|\b(?:for\s+)?all\s+(?:sub)?contracts\s*(?:[:,]|regardless)/i;

function tierConditions(s: string, amts: readonly Amount[]): TierHit[] {
  const out: TierHit[] = [];
  for (const m of s.matchAll(CONTRACT_WORD)) {
    const start = m.index ?? 0;
    const ce = start + m[0].length;
    if (out.some((t) => start < t.end)) continue;
    const i = amts.findIndex((a) => a.start >= ce);
    const a1 = amts[i];
    if (!a1 || a1.start - ce > 60) continue;
    let rel = s.slice(ce, a1.start).replace(TIER_FILLER, "").trim();
    // "$0 - $500,000": a zero is no amount (no limit is zero), so the range reads as "up to".
    if (/^\$\s?0(?:\.00)?\s*(?:-|to|through|thru)$/i.test(rel)) rel = "up to";
    const a2 = amts[i + 1];
    const mid = a2 ? s.slice(a1.end, a2.start) : null;
    let tier: ContractTier | null = null;
    let end = a1.end;
    const thresholds = [a1.start];
    const both = (lo: Amount, hi: Amount) => {
      tier = { loCents: lo.cents, loInclusive: true, hiCents: hi.cents, hiInclusive: true };
      end = hi.end;
      thresholds.push(hi.start);
    };
    if (BETWEEN.test(rel)) {
      if (a2 && mid !== null && BETWEEN_MID.test(mid)) both(a1, a2);
    } else if (LO_INCL.test(rel) || LO_EXCL.test(rel)) {
      tier = {
        loCents: a1.cents,
        loInclusive: LO_INCL.test(rel),
        hiCents: null,
        hiInclusive: false,
      };
      const up = mid !== null ? UPPER_AFTER_LOWER.exec(mid) : null;
      if (a2 && up) {
        tier.hiCents = a2.cents;
        tier.hiInclusive = !/^(?:less|under|below)/i.test(up[1] ?? "");
        end = a2.end;
        thresholds.push(a2.start);
      }
    } else if (HI_INCL.test(rel) || HI_EXCL.test(rel)) {
      tier = {
        loCents: null,
        loInclusive: false,
        hiCents: a1.cents,
        hiInclusive: HI_INCL.test(rel),
      };
    } else if (rel === "") {
      const after = s.slice(a1.end, a1.end + 24);
      const more = /^\s*(?:\+|(?:or|and)\s+(?:more|greater|over|above|higher|up)\b)/i.exec(after);
      const less = /^\s*(?:or|and)\s+(?:less|under|below|lower)\b/i.exec(after);
      if (a2 && mid !== null && RANGE_MID.test(mid)) both(a1, a2);
      else if (more) {
        tier = { loCents: a1.cents, loInclusive: true, hiCents: null, hiInclusive: false };
        end = a1.end + more[0].length;
      } else if (less) {
        tier = { loCents: null, loInclusive: false, hiCents: a1.cents, hiInclusive: true };
        end = a1.end + less[0].length;
      }
    }
    if (tier) out.push({ tier, label: tierLabel(tier), start, end, thresholds });
  }
  return out;
}

/** Reads an insurance exhibit's text into proposed requirements, each value with its sentence. */
export function readInsuranceExhibit(
  input: string | readonly string[],
  options: ExhibitOptions = {},
): ExhibitReading {
  const sum =
    options.contractSumCents && options.contractSumCents > 0 ? options.contractSumCents : null;
  const tierLabels: string[] = [];
  let jobTier: string | null = null;
  const skipped = new Set<string>();
  // kind|field set from the job's own tier (or, with no contract sum, from any tier).
  const fromTier = new Set<string>();
  const lines = (typeof input === "string" ? input.split(/\r?\n/) : [...input]).map(norm);
  let chars = 0;
  const kept: string[] = [];
  for (const l of lines) {
    if (chars > MAX_EXHIBIT_CHARS) break;
    chars += l.length + 1;
    kept.push(l);
  }
  const found = new Map<InsuranceKind, ExhibitRequirement>();
  const unplaced: ExhibitEvidence[] = [];
  const notes: string[] = [];
  const noted = new Set<string>();
  const note = (n: string) => {
    if (!noted.has(n)) {
      noted.add(n);
      notes.push(n);
    }
  };
  const get = (kind: InsuranceKind) => {
    let r = found.get(kind);
    if (!r) {
      r = { requirement: blank(kind), evidence: [] };
      found.set(kind, r);
    }
    return r;
  };
  const evidence = (kind: InsuranceKind, what: string, q: string) => {
    const r = get(kind);
    if (!r.evidence.some((e) => e.what === what && e.quote === q))
      r.evidence.push({ what, quote: q });
  };
  const setLimit = (
    kind: InsuranceKind,
    field: "eachOccurrenceCents" | "aggregateCents",
    cents: number,
    q: string,
    tier: TierHit | null = null,
  ) => {
    const r = get(kind).requirement;
    const label =
      LIMIT_LABELS[kind][field === "eachOccurrenceCents" ? "each" : "aggregate"].toLowerCase();
    const what = `${label} ${formatLimit(cents)}${tier ? ` (${tier.label})` : ""}`;
    const key = `${kind}|${field}`;
    const current = r[field];
    if (tier && sum !== null && !tierContains(tier.tier, sum)) {
      if (!skipped.has(`${key}|${cents}|${tier.label}`)) {
        skipped.add(`${key}|${cents}|${tier.label}`);
        note(
          `${INSURANCE_KIND_LABELS[kind]}: set aside ${formatLimit(cents)} for the ${label}, which the exhibit asks for ${tier.label}; this job's contract sum is ${formatLimit(sum)}.`,
        );
      }
      return;
    }
    if (current !== null && tier && sum !== null && !fromTier.has(key) && current !== cents) {
      // The job's own tier wins over a limit read with no tier.
      r[field] = cents;
      fromTier.add(key);
      const r2 = get(kind);
      r2.evidence = r2.evidence.filter(
        (e) => !e.what.startsWith(`${label} ${formatLimit(current)}`),
      );
      evidence(kind, what, q);
      note(
        `${INSURANCE_KIND_LABELS[kind]}: ${formatLimit(cents)} for the ${label} from this job's tier (${tier.label}) replaces ${formatLimit(current)}, read with no contract size.`,
      );
      return;
    }
    if (current === null) {
      r[field] = cents;
      if (tier) fromTier.add(key);
      evidence(kind, what, q);
    } else if (current !== cents) {
      note(
        `${INSURANCE_KIND_LABELS[kind]}: the exhibit also gives ${formatLimit(cents)} for the ${label} (kept ${formatLimit(current)}, read first). Check which applies to this job.`,
      );
    }
  };
  // Endorsement sentences that say "all policies" are applied once every coverage is known.
  const toAll: {
    key: EndorsementKey;
    q: string;
    named: Set<InsuranceKind>;
    excepted: Set<InsuranceKind>;
  }[] = [];
  const umbrellaToAll: { q: string; excepted: Set<InsuranceKind> }[] = [];

  let current: InsuranceKind | null = null;
  let headerTier: TierHit | null = null;
  for (const para of paragraphs(kept))
    for (const s of sentences(para)) {
      const { open, excepted } = mentions(s);
      const tiers = tierConditions(s, amounts(s));
      for (const t of tiers) {
        if (!tierLabels.includes(t.label)) tierLabels.push(t.label);
        if (sum !== null && jobTier === null && tierContains(t.tier, sum)) jobTier = t.label;
      }
      if (!tiers.length && TIER_RESET.test(s)) headerTier = null;
      const thresholdAt = new Set(tiers.flatMap((t) => t.thresholds));
      const trailingUsed = new Set<TierHit>();
      const exceptedKinds = new Set(excepted.map((m) => m.kind));
      const countsSentence = UMBRELLA_COUNTS.test(s) && amounts(s).length === 0;
      if (countsSentence) {
        const named = open.filter((m) => m.kind !== "umbrella").map((m) => m.kind);
        const q = quote(s, 0);
        if (named.length) for (const k of named) markUmbrella(k, q);
        else umbrellaToAll.push({ q, excepted: exceptedKinds });
        continue;
      }
      // Coverages, amounts and labels in the order the sentence has them; contract-size thresholds are not limits.
      const amts = amounts(s).filter((a) => !thresholdAt.has(a.start));
      // A contract-size condition's words ("subcontracts over") are not a limit's label.
      const labs = labels(s).filter((l) => !tiers.some((t) => l.start < t.end && t.start < l.end));
      const events: { at: number; mention?: Mention; amount?: Amount }[] = [
        ...open.map((m) => ({ at: m.start, mention: m })),
        ...amts.map((a) => ({ at: a.start, amount: a })),
      ].sort((a, b) => a.at - b.at);
      // Which side the labels sit: before the first amount on a table line, after it in prose.
      const firstAmount = amts[0];
      const lastMentionBefore = firstAmount
        ? open.filter((m) => m.end <= firstAmount.start).pop()
        : undefined;
      // Before only when a label ends right where the first amount starts ("Each Occurrence: $1,000,000");
      // "on an occurrence basis with limits of not less than $1,000,000 per occurrence" reads after.
      const before =
        firstAmount !== undefined &&
        labs.some(
          (l) =>
            l.label !== "ignore" &&
            l.start >= (lastMentionBefore?.end ?? 0) &&
            l.end <= firstAmount.start &&
            /^[\s:\-=.]{0,4}$/.test(s.slice(l.end, firstAmount.start)),
        );
      for (const m of open) get(m.kind);
      for (const [i, e] of events.entries()) {
        if (e.mention) {
          current = e.mention.kind;
          continue;
        }
        const a = e.amount;
        if (!a) continue;
        const q = quote(s, a.start);
        const prevEnd = i > 0 ? events[i - 1] : undefined;
        const lo = prevEnd ? (prevEnd.mention?.end ?? prevEnd.amount?.end ?? 0) : 0;
        const next = events[i + 1];
        const hi = next ? next.at : s.length;
        const behind = labs.filter((l) => l.start >= lo && l.end <= a.start).pop();
        const ahead = labs.find((l) => l.start >= a.end && l.end <= hi);
        // The side the sentence's labels sit on, else the other ("Medical Expense (any one person) $5,000").
        const window = before ? (behind ?? ahead) : (ahead ?? behind);
        // An amount right after "over" or "exceeding" is a threshold whichever side the labels are.
        const lead = labs.find(
          (l) => l.label === "ignore" && l.end <= a.start && l.end >= a.start - 3,
        );
        const label: Label | null = lead ? "ignore" : (window?.label ?? null);
        if (label === "ignore") continue;
        const tier = ((): TierHit | null => {
          const before = tiers.filter((t) => t.end <= a.start).pop();
          // "Subcontracts up to $1,000,000: Umbrella $2,000,000" reads as a heading for what follows.
          if (before && /^\s*[:)-]/.test(s.slice(before.end))) return before;
          const after = tiers.find((t) => t.start >= a.end);
          if (after) {
            // "$1,000,000 each occurrence and $2,000,000 aggregate for subcontracts under ...".
            let between = s.slice(a.end, after.start).replace(new RegExp(AMOUNT.source, "g"), " ");
            for (const [, re] of LABELS)
              between = between.replace(new RegExp(re.source, re.flags), " ");
            if (TRAILING.test(between)) {
              trailingUsed.add(after);
              return after;
            }
          }
          return before ?? headerTier;
        })();
        if (!current) {
          unplaced.push({ what: formatLimit(a.cents), quote: q });
          continue;
        }
        if (current === "workers_comp" && label === null) {
          unplaced.push({ what: formatLimit(a.cents), quote: q });
          continue;
        }
        if (label === "each" || label === "both")
          setLimit(current, "eachOccurrenceCents", a.cents, q, tier);
        if (label === "aggregate" || label === "both")
          setLimit(current, "aggregateCents", a.cents, q, tier);
        if (label === null) {
          const r = get(current).requirement;
          // A single-limit coverage takes its one amount, and in a tiered exhibit each tier's one amount
          // (set aside, kept or noted as the tier and the contract sum decide).
          if (SINGLE_LIMIT.includes(current) && (r.eachOccurrenceCents === null || tier !== null))
            setLimit(current, "eachOccurrenceCents", a.cents, q, tier);
          else unplaced.push({ what: formatLimit(a.cents), quote: q });
        }
      }
      if (tiers.length) {
        const last = tiers[tiers.length - 1];
        if (last && !trailingUsed.has(last)) headerTier = last;
      }
      if (
        /\bstatutory\b/i.test(s) &&
        (open.some((m) => m.kind === "workers_comp") || current === "workers_comp")
      )
        evidence("workers_comp", "statutory limits", quote(s, s.search(/statutory/i)));
      // Endorsements.
      for (const [key, re] of ENDORSEMENT_PATTERNS) {
        const hit = re.exec(s);
        if (!hit) continue;
        const q = quote(s, hit.index);
        const label = ENDORSEMENTS.find((e) => e.key === key)?.label ?? key;
        if (NEGATED.test(s)) {
          note(`"${q}" reads as ${label.toLowerCase()} not required, so it is not ticked.`);
          continue;
        }
        const named = new Set(open.map((m) => m.kind));
        if (ALL_POLICIES.test(s)) {
          toAll.push({ key, q, named, excepted: exceptedKinds });
        } else if (named.size) {
          for (const k of named) setEndorsement(k, key, q);
        } else if (current) {
          setEndorsement(current, key, q);
        }
      }
    }

  for (const t of toAll) {
    for (const [kind] of found) {
      if (t.excepted.has(kind) && !t.named.has(kind)) continue;
      if (kind === "workers_comp" && !t.named.has(kind)) continue;
      if (kind === "builders_risk" && !t.named.has(kind)) continue;
      if (!LIABILITY_KINDS.includes(kind) && !t.named.has(kind) && kind !== "workers_comp")
        continue;
      setEndorsement(kind, t.key, t.q);
    }
  }
  for (const u of umbrellaToAll)
    for (const [kind] of found) if (!u.excepted.has(kind)) markUmbrella(kind, u.q);

  if (tierLabels.length) {
    if (sum === null)
      note(
        `The exhibit sets limits by contract size (${tierLabels.join("; ")}). The first limit read for each coverage is filled in: enter the job's contract sum to pick its tier.`,
      );
    else if (jobTier === null)
      note(
        `The exhibit sets limits by contract size (${tierLabels.join("; ")}), and none holds this job's contract sum of ${formatLimit(sum)}: check the exhibit.`,
      );
  }
  return { found: [...found.values()], unplaced, notes, tiers: tierLabels, jobTier };

  function setEndorsement(kind: InsuranceKind, key: EndorsementKey, q: string) {
    if (kind === "workers_comp" && key !== "waiverOfSubrogation") return;
    const r = get(kind);
    r.requirement[key] = true;
    const label = ENDORSEMENTS.find((e) => e.key === key)?.label ?? key;
    evidence(kind, label.toLowerCase(), q);
  }
  function markUmbrella(kind: InsuranceKind, q: string) {
    if (kind === "umbrella" || kind === "builders_risk") return;
    const r = get(kind);
    r.requirement.umbrellaCounts = true;
    evidence(kind, "umbrella may count toward the limits", q);
  }
}

export interface ExhibitPdfOptions {
  ocr?: Ocr;
  onOcrProgress?: OcrProgress;
}

/** A PDF exhibit's text as lines, read in the browser; a scan with no text layer through OCR. */
export async function exhibitLinesFromPdf(
  bytes: Uint8Array,
  options: ExhibitPdfOptions = {},
): Promise<{ ok: true; lines: string[]; ocr: boolean } | { ok: false; error: string }> {
  let text: PdfText;
  try {
    text = await extractText(bytes);
  } catch (e) {
    if (e instanceof PdfUnreadable)
      return { ok: false, error: `This PDF ${e.message}. Paste the exhibit's text instead.` };
    return { ok: false, error: "This PDF could not be read. Paste the exhibit's text instead." };
  }
  let ocr = false;
  if (
    text.chars - text.unreadable < 20 &&
    options.ocr &&
    text.pages.some((p) => p.images?.length)
  ) {
    const r = await ocrText(text, options.ocr, options.onOcrProgress);
    if (!r.ok) return { ok: false, error: r.error };
    text = r.text;
    ocr = true;
  }
  if (text.chars - text.unreadable < 20)
    return {
      ok: false,
      error:
        "This PDF has no text to read (a scan with no text layer). Save it as a searchable PDF, or paste the exhibit's text.",
    };
  if (text.unreadable > 0.2 * text.chars)
    return {
      ok: false,
      error:
        "Most of this PDF's text cannot be read back (its fonts have no character map). Paste the exhibit's text instead.",
    };
  return { ok: true, lines: linesFromPdfText(text), ocr };
}
