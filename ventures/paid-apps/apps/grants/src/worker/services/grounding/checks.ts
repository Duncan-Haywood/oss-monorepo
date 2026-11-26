// Deterministic claim checks (no LLM): numbers must come from cited facts; framing claims must not
// smuggle in checkable assertions (numbers, proper nouns, outcomes, superlatives).
import type { Claim, FactValue } from "@shared/content";
import type { FactStatus, Sensitivity } from "@shared/enums";
import {
  approxMatches,
  expandFactTokens,
  extractNumericTokens,
  factValueTokens,
  type NumericToken,
  spanMatchesStartYear,
  tokenMatches,
  tokenText,
} from "./numbers";

/**
 * The fact fields the verifier needs. Structurally compatible with `typeof facts.$inferSelect` and
 * with `FactDto`, so callers can pass DB rows directly.
 */
export interface FactRow {
  id: string;
  statement: string;
  status: FactStatus;
  value?: FactValue | null;
  sourceQuote?: string | null;
  sensitivity?: Sensitivity | null;
  asOf?: string | null;
  category?: string | null;
}

/** All text a fact vouches for: statement, verbatim quote, structured value text and as-of date. */
export function factText(f: FactRow): string {
  return [f.statement, f.sourceQuote ?? "", f.value?.text ?? "", f.asOf ?? ""]
    .filter(Boolean)
    .join("\n");
}

/** Every numeric token a set of facts supports (text + structured value + derived years). */
export function factNumericPool(facts: FactRow[]): NumericToken[] {
  const pool: NumericToken[] = [];
  for (const f of facts) {
    pool.push(...extractNumericTokens(f.statement, { ratios: true }));
    if (f.sourceQuote) pool.push(...extractNumericTokens(f.sourceQuote, { ratios: true }));
    if (f.asOf) pool.push(...extractNumericTokens(f.asOf));
    pool.push(...factValueTokens(f.value));
  }
  return expandFactTokens(pool);
}

/** A start word, then (within the same clause) a year: "founded in 2012", "has led EVTC since 2018". */
const START_YEAR =
  /\b(?:founded|established|incorporated|formed|started|began|opened|launched|chartered|since)\b[^.;!?\n]{0,40}?(?<!\d)((?:19|20)\d{2})(?!\d)/gi;

/** Years the cited facts give as a start ("founded in 2012"); spans of years are checked against them. */
export function factStartYears(facts: FactRow[]): number[] {
  const years = new Set<number>();
  for (const f of facts) {
    for (const text of [f.statement, f.sourceQuote ?? ""]) {
      for (const m of text.matchAll(START_YEAR)) years.add(Number(m[1]));
    }
  }
  return [...years];
}

export interface NumberCheckOptions {
  /** Reference year for spans of years ("over a decade" since a founding year). Default: this year (UTC). */
  asOfYear?: number;
}

export interface NumberMismatch {
  /** The figure as written in the claim, with its qualifier ("836", "more than 500"). */
  text: string;
  /** The closest comparable figure in the cited facts, phrased to follow "says" ("386"), or null. */
  factSays: string | null;
}

/** How a fact token reads in a message: as written when it came from text, else formatted. */
function factDisplay(t: NumericToken): string {
  if (t.index >= 0 && t.raw) return t.raw;
  switch (t.kind) {
    case "money":
      return `$${t.value.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
    case "percent":
      return `${t.value}%`;
    case "number":
      return t.value.toLocaleString("en-US");
    default:
      return String(t.value);
  }
}

/** The claim value and a fact value on a common scale, or null when they aren't comparable. */
function comparable(claim: NumericToken, fact: NumericToken): number | null {
  const share = (t: NumericToken) =>
    t.kind === "percent" ? t.value : t.kind === "fraction" ? t.value * 100 : null;
  switch (claim.kind) {
    case "number":
      return fact.kind === "number" && claim.unit === fact.unit ? fact.value : null;
    case "percent":
    case "fraction":
      return share(fact);
    case "date":
    case "year":
      return fact.kind === "year" || fact.kind === "date" ? fact.value : null;
    default:
      return fact.kind === claim.kind ? fact.value : null;
  }
}

function closestFigure(
  tok: NumericToken,
  pool: NumericToken[],
  startYears: number[],
  asOfYear: number,
): string | null {
  const scale = tok.kind === "fraction" ? tok.value * 100 : tok.value;
  let best: { d: number; text: string } | null = null;
  for (const f of pool) {
    const v = comparable(tok, f);
    if (v === null) continue;
    const d = Math.abs(v - scale);
    if (!best || d < best.d) best = { d, text: factDisplay(f) };
  }
  if (best) return best.text;
  if (tok.unit === "years" && startYears.length) {
    const y = Math.min(...startYears);
    const ago = asOfYear - y;
    return `it started in ${y} (${ago} year${ago === 1 ? "" : "s"} ago)`;
  }
  return null;
}

/**
 * Figures in the claim the cited facts don't support, in order of appearance, deduplicated, each
 * with the closest comparable figure from the facts (for a reviewer-facing message).
 *
 * An unqualified figure is supported when it matches a fact figure exactly (normalized); a figure
 * with an approximate qualifier only via `approxMatches`. A span of years may also be measured from
 * a start year in the facts ("over a decade" ← "founded in 2012").
 */
export function findNumberMismatches(
  claim: Pick<Claim, "text">,
  citedFacts: FactRow[],
  opts: NumberCheckOptions = {},
): NumberMismatch[] {
  const asOfYear = opts.asOfYear ?? new Date().getUTCFullYear();
  const pool = factNumericPool(citedFacts);
  const starts = factStartYears(citedFacts);
  const out: NumberMismatch[] = [];
  for (const tok of extractNumericTokens(claim.text)) {
    const matches = tok.qualifier ? approxMatches : tokenMatches;
    if (pool.some((f) => matches(tok, f))) continue;
    if (tok.unit === "years" && starts.some((y) => spanMatchesStartYear(tok, y, asOfYear))) {
      continue;
    }
    const text = tokenText(tok);
    if (out.some((m) => m.text === text)) continue;
    out.push({ text, factSays: closestFigure(tok, pool, starts, asOfYear) });
  }
  return out;
}

/**
 * Numbers / dates / amounts / percentages in the claim that the cited facts don't support (see
 * `findNumberMismatches`). Returns the claim's strings, deduplicated, in order of appearance.
 */
export function checkClaimNumbers(
  claim: Pick<Claim, "text">,
  citedFacts: FactRow[],
  opts: NumberCheckOptions = {},
): string[] {
  return findNumberMismatches(claim, citedFacts, opts).map((m) => m.text);
}

/** Verbs/nouns that assert an outcome or activity level — checkable, so never allowed in framing. */
const OUTCOME_WORDS = new Set(
  [
    "graduated",
    "graduates",
    "served",
    "serves",
    "increased",
    "increases",
    "decreased",
    "reduced",
    "placed",
    "places",
    "trained",
    "trains",
    "hired",
    "employed",
    "employs",
    "completed",
    "achieved",
    "improved",
    "doubled",
    "tripled",
    "raised",
    "secured",
    "awarded",
    "won",
    "earned",
    "built",
    "launched",
    "founded",
    "established",
    "expanded",
    "grew",
    "helped",
    "enrolled",
    "certified",
    "delivered",
    "created",
    "generated",
    "saved",
    "lowered",
    "boosted",
    "exceeded",
    "surpassed",
    "transformed",
    "eliminated",
    "prevented",
    "housed",
    "fed",
    "partnered",
    "funded",
  ].map((w) => w.toLowerCase()),
);

/** Superlative / uniqueness language: a checkable claim dressed up as framing. */
const SUPERLATIVES =
  /\b(largest|biggest|oldest|leading|premier|best|foremost|top-rated|award-winning|renowned|unparalleled|unmatched|unprecedented|only\s+(?:organization|program|provider|nonprofit|one)|first-ever|nationally\s+recognized|most\s+(?:successful|effective|trusted|experienced))\b/gi;

const SENTENCE_STARTERS = new Set(
  "a an and as at but by each every for from in its many our since the their these this through to together we when while with".split(
    " ",
  ),
);

/** Capitalized words that are not proper nouns even mid-sentence. */
const NOT_PROPER = new Set(["I", "I'm", "I've", "OK"]);

export interface FramingCheckOptions {
  /** Names the framing may mention: the org's own name(s)/acronym, optionally the funder. */
  allowedNames?: string[];
}

export interface FramingCheck {
  ok: boolean;
  numbers: string[];
  properNouns: string[];
  outcomeWords: string[];
  superlatives: string[];
}

function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?:;])\s+|\n+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * A framing claim is connective/persuasive language. It must not contain numbers, proper-noun
 * sequences (other than a single capitalized sentence-initial word or the org's own name), outcome
 * verbs or superlatives — those are factual assertions that need citations.
 */
export function checkFramingClaim(
  claim: Pick<Claim, "text">,
  opts: FramingCheckOptions = {},
): FramingCheck {
  const numbers = extractNumericTokens(claim.text).map(tokenText);

  const allowedWords = new Set<string>();
  const allowedPhrases: string[] = [];
  for (const name of opts.allowedNames ?? []) {
    const n = name.trim();
    if (!n) continue;
    allowedPhrases.push(n.toLowerCase());
    for (const w of n.split(/\s+/)) allowedWords.add(w.replace(/[^\p{L}\p{N}&-]/gu, ""));
  }

  const properNouns: string[] = [];
  for (const sentence of splitSentences(claim.text)) {
    const words = [...sentence.matchAll(/[\p{L}][\p{L}\p{N}'’&.-]*/gu)].map((m) => ({
      w: m[0].replace(/[.'’]+$/, "").replace(/['’]s$/, ""),
      i: m.index ?? 0,
    }));
    let k = 0;
    while (k < words.length) {
      const cur = words[k];
      if (!cur || !/^\p{Lu}/u.test(cur.w) || NOT_PROPER.has(cur.w)) {
        k += 1;
        continue;
      }
      // Collect a run of capitalized words (allowing "of"/"the"/"and"/"for" connectors inside).
      const run = [cur.w];
      let j = k + 1;
      while (j < words.length) {
        const w = words[j]?.w ?? "";
        if (/^\p{Lu}/u.test(w)) {
          run.push(w);
          j += 1;
        } else if (/^(of|the|and|for|de|del)$/.test(w) && /^\p{Lu}/u.test(words[j + 1]?.w ?? "")) {
          run.push(w);
          j += 1;
        } else break;
      }
      let sentenceInitial = k === 0;
      // "With HUD support…" / "The Navajo Nation…": a common sentence-starter isn't part of the name.
      if (sentenceInitial && run.length > 1 && SENTENCE_STARTERS.has(run[0]?.toLowerCase() ?? "")) {
        run.shift();
        sentenceInitial = false;
      }
      const isAcronym = run.length === 1 && /^\p{Lu}{2,}$/u.test(run[0] ?? "");
      const phrase = run.join(" ");
      const allowed =
        allowedPhrases.some((p) => p.includes(phrase.toLowerCase())) ||
        run.every((w) => allowedWords.has(w) || /^(of|the|and|for|de|del)$/.test(w));
      if (!allowed && (!sentenceInitial || run.length > 1 || isAcronym)) {
        properNouns.push(phrase);
      }
      k = j;
    }
  }

  const outcomeWords: string[] = [];
  for (const m of claim.text.matchAll(/[A-Za-z]+/g)) {
    const w = m[0].toLowerCase();
    if (OUTCOME_WORDS.has(w) && !outcomeWords.includes(w)) outcomeWords.push(w);
  }
  const superlatives = [...claim.text.matchAll(SUPERLATIVES)].map((m) => m[0]);

  return {
    ok: !numbers.length && !properNouns.length && !outcomeWords.length && !superlatives.length,
    numbers,
    properNouns,
    outcomeWords,
    superlatives,
  };
}

/**
 * Best-effort org names from identity facts ("Southwest Indian Foundation (SWIF) is a ..."): the
 * leading capitalized subject and any parenthesized acronyms. Used to allow the org's own name in
 * framing claims when the caller doesn't pass it explicitly.
 */
export function deriveOrgNames(facts: FactRow[]): string[] {
  const names = new Set<string>();
  for (const f of facts) {
    if (f.category !== "identity") continue;
    const lead = f.statement.match(
      /^(?:The\s+)?((?:\p{Lu}[\p{L}'’&.-]*)(?:\s+(?:of|the|and|for)?\s*\p{Lu}[\p{L}'’&.-]*)*)/u,
    );
    if (lead?.[1] && lead[1].split(/\s+/).length >= 2) names.add(lead[1].trim());
    for (const m of f.statement.matchAll(/\((\p{Lu}{2,8})\)/gu)) if (m[1]) names.add(m[1]);
  }
  return [...names];
}
