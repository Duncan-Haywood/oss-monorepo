// Deterministic numeric extraction + matching for the grounding verifier.
// Every number, date, dollar amount, percentage, ordinal and spelled-out quantity in a claim must
// appear (normalized) in one of the claim's cited facts. This module is deliberately strict: a
// false alarm costs a reviewer a minute, a missed fabricated statistic can be grant fraud.
import type { FactValue } from "@shared/content";

export type NumericKind = "number" | "money" | "percent" | "fraction" | "year" | "date" | "ordinal";

/**
 * The only hedges that loosen matching (see `approxMatches`). Anything else ("up to", "less than",
 * "almost all", "no more than") gets no tolerance: the figure must match exactly.
 */
export type ApproxQualifier =
  | "nearly"
  | "almost"
  | "about"
  | "approximately"
  | "roughly"
  | "more than"
  | "over"
  | "at least"
  | "under"
  | "fewer than";

export interface NumericToken {
  /** The text as it appeared in the source (for messages). */
  raw: string;
  kind: NumericKind;
  /** money: dollars; percent: percentage points; fraction: ratio 0..1; date: the year. */
  value: number;
  /** Canonical form, e.g. "1200", "$1200000", "25%", "frac:0.5", "2024", "2024-06", "ordinal:1". */
  normalized: string;
  index: number;
  /** An approximate qualifier directly before the figure ("more than 200"); never set when negated. */
  qualifier?: ApproxQualifier;
  /** Qualifier + figure as written ("more than 200"), for messages. Set only with `qualifier`. */
  phrase?: string;
  /** "years" when the figure is a span of years ("14 years", "a decade"), not an age ("18 years old"). */
  unit?: "years";
}

/** `phrase` if the figure was qualified, else `raw`: what a reviewer should look for in the text. */
export const tokenText = (t: NumericToken): string => t.phrase ?? t.raw;

export interface ExtractOptions {
  /** Also emit ratio fractions for "1 in 4" / "18 out of 24" (used on the fact side only). */
  ratios?: boolean;
}

const MONTH_NAMES: Record<string, number> = {
  jan: 1,
  january: 1,
  feb: 2,
  february: 2,
  mar: 3,
  march: 3,
  apr: 4,
  april: 4,
  may: 5,
  jun: 6,
  june: 6,
  jul: 7,
  july: 7,
  aug: 8,
  august: 8,
  sep: 9,
  sept: 9,
  september: 9,
  oct: 10,
  october: 10,
  nov: 11,
  november: 11,
  dec: 12,
  december: 12,
};
const MONTH =
  "(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sept?(?:ember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)";

const UNITS: Record<string, number> = {
  zero: 0,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
  thirteen: 13,
  fourteen: 14,
  fifteen: 15,
  sixteen: 16,
  seventeen: 17,
  eighteen: 18,
  nineteen: 19,
};
const TENS: Record<string, number> = {
  twenty: 20,
  thirty: 30,
  forty: 40,
  fifty: 50,
  sixty: 60,
  seventy: 70,
  eighty: 80,
  ninety: 90,
};
const BIG_SCALES: Record<string, number> = { thousand: 1e3, million: 1e6, billion: 1e9 };
const WORD_MULTIPLIERS: Record<string, number> = {
  thousand: 1e3,
  million: 1e6,
  mn: 1e6,
  billion: 1e9,
  bn: 1e9,
  trillion: 1e12,
};
const LETTER_MULTIPLIERS: Record<string, number> = { k: 1e3, m: 1e6, b: 1e9 };
const ORDINALS: Record<string, number> = {
  first: 1,
  second: 2,
  third: 3,
  fourth: 4,
  fifth: 5,
  sixth: 6,
  seventh: 7,
  eighth: 8,
  ninth: 9,
  tenth: 10,
  eleventh: 11,
  twelfth: 12,
  thirteenth: 13,
  fourteenth: 14,
  fifteenth: 15,
  sixteenth: 16,
  seventeenth: 17,
  eighteenth: 18,
  nineteenth: 19,
  twentieth: 20,
  thirtieth: 30,
  fortieth: 40,
  fiftieth: 50,
  sixtieth: 60,
  seventieth: 70,
  eightieth: 80,
  ninetieth: 90,
  hundredth: 100,
  thousandth: 1000,
};
/** Fraction denominators; singular forms need "a/one" + "of" to count ("a third of"). */
const DENOMS: Record<string, { d: number; plural: boolean }> = {
  half: { d: 2, plural: false },
  halves: { d: 2, plural: true },
  third: { d: 3, plural: false },
  thirds: { d: 3, plural: true },
  quarter: { d: 4, plural: false },
  quarters: { d: 4, plural: true },
  fourth: { d: 4, plural: false },
  fourths: { d: 4, plural: true },
  fifth: { d: 5, plural: false },
  fifths: { d: 5, plural: true },
  tenth: { d: 10, plural: false },
  tenths: { d: 10, plural: true },
};
/** Fixed phrases where a number word carries no quantity. Matched against lowercased text. */
const IDIOMS = [
  /\bone[\s-]on[\s-]one\b/g,
  /\bone[\s-]stop\b/g,
  /\b(?:no|any|every|each|some|the|this|that|which)\s+one\b/g,
  /\bone\s+(?:another|of|who|that|which)\b/g,
  /\bfirst[\s-]hand\b/g,
  /\bfirst\s+and\s+foremost\b/g,
  /\bat\s+first\b/g,
  /\bfirst\s+of\s+all\b/g,
  /\bsecond\s+chances?\b/g,
  /\bsecond\s+nature\b/g,
  /\bon\s+behalf\b/g,
];

const round = (n: number) => Number(n.toPrecision(12));

function normalize(kind: NumericKind, value: number, dateNorm?: string): string {
  switch (kind) {
    case "money":
      return `$${round(value)}`;
    case "percent":
      return `${round(value)}%`;
    case "fraction":
      return `frac:${Number(value.toFixed(4))}`;
    case "ordinal":
      return `ordinal:${round(value)}`;
    case "date":
      return dateNorm ?? String(value);
    default:
      return String(round(value));
  }
}

const pad2 = (n: number) => String(n).padStart(2, "0");
const validYear = (y: number) => y >= 1900 && y <= 2100;

/** Replace [start,end) with spaces so later passes don't re-match it (keeps indexes stable). */
function mask(s: string, start: number, end: number): string {
  return s.slice(0, start) + " ".repeat(end - start) + s.slice(end);
}

function parseDigits(intPart: string, frac: string | undefined): number {
  return Number(`${intPart.replace(/,/g, "")}${frac ? `.${frac}` : ""}`);
}

/**
 * Extract every quantity-bearing token from free text, normalized.
 * Handles: integers, decimals, comma thousands, $ amounts ("$1.2 million", "$450K", "5,000 dollars"),
 * percentages ("25%", "25 percent"), years 1900–2100, dates ("June 2024", "6/30/2024", "2024-06-30"),
 * spelled numbers ("twenty-five", "three hundred", "a dozen", "a million"), fractions ("half",
 * "two-thirds", "a quarter of") and ordinals ("1st", "first", "twenty-fifth").
 */
export function extractNumericTokens(text: string, opts: ExtractOptions = {}): NumericToken[] {
  const out: NumericToken[] = [];
  // Normalize unicode dashes / nbsp so "2024–2025" and "K–12" behave like ASCII.
  let s = text.replace(/[‐-―−]/g, "-").replace(/ /g, " ");
  const original = s;
  const push = (kind: NumericKind, value: number, start: number, end: number, dateNorm?: string) =>
    out.push({
      raw: original.slice(start, end).trim(),
      kind,
      value,
      normalized: normalize(kind, value, dateNorm),
      index: start,
    });

  const run = (re: RegExp, fn: (m: RegExpExecArray) => boolean) => {
    const spans: Array<[number, number]> = [];
    for (const m of s.matchAll(re)) {
      if (fn(m as RegExpExecArray)) spans.push([m.index ?? 0, (m.index ?? 0) + m[0].length]);
    }
    for (const [a, b] of spans) s = mask(s, a, b);
  };
  const dayDate = (y: number, mo: number, d: number, m: RegExpExecArray) => {
    if (!validYear(y) || mo < 1 || mo > 12 || d < 1 || d > 31) return false;
    push("date", y, m.index, m.index + m[0].length, `${y}-${pad2(mo)}-${pad2(d)}`);
    return true;
  };
  const monthDate = (y: number, mo: number, m: RegExpExecArray) => {
    if (!validYear(y) || mo < 1 || mo > 12) return false;
    push("date", y, m.index, m.index + m[0].length, `${y}-${pad2(mo)}`);
    return true;
  };
  const month = (name: string) => MONTH_NAMES[name.toLowerCase().replace(/\.$/, "")] ?? 0;

  // 1. Full dates.
  run(new RegExp(`\\b${MONTH}\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?,?\\s+(\\d{4})(?!\\d)`, "gi"), (m) =>
    dayDate(Number(m[3]), month(m[1] ?? ""), Number(m[2]), m),
  );
  run(
    new RegExp(
      `(?<!\\d)(\\d{1,2})(?:st|nd|rd|th)?\\s+(?:of\\s+)?${MONTH}\\.?,?\\s+(\\d{4})(?!\\d)`,
      "gi",
    ),
    (m) => dayDate(Number(m[3]), month(m[2] ?? ""), Number(m[1]), m),
  );
  run(/(?<!\d)(\d{4})-(\d{1,2})-(\d{1,2})(?!\d)/g, (m) =>
    dayDate(Number(m[1]), Number(m[2]), Number(m[3]), m),
  );
  run(/(?<![\d/])(\d{1,2})\/(\d{1,2})\/(\d{4})(?!\d)/g, (m) =>
    dayDate(Number(m[3]), Number(m[1]), Number(m[2]), m),
  );
  // 2. Month-year dates.
  run(new RegExp(`\\b${MONTH}\\.?,?\\s+(?:of\\s+)?(\\d{4})(?!\\d)`, "gi"), (m) =>
    monthDate(Number(m[2]), month(m[1] ?? ""), m),
  );
  run(/(?<![\d/])(\d{1,2})\/(\d{4})(?!\d)/g, (m) => monthDate(Number(m[2]), Number(m[1]), m));
  run(/(?<![\d-])(\d{4})-(\d{2})(?![\d-])/g, (m) => {
    const y = Number(m[1]);
    const mm = Number(m[2]);
    if (!validYear(y)) return false;
    if (mm >= 1 && mm <= 12) return monthDate(y, mm, m);
    // Fiscal-year range "2024-25" → two years.
    const y2 = Math.floor(y / 100) * 100 + mm;
    push("year", y, m.index, m.index + 4);
    push("year", y2 < y ? y2 + 100 : y2, m.index + 5, m.index + 7);
    return true;
  });

  // 3. Ratios (fact side): "1 in 4", "18 out of 24", "one in five".
  if (opts.ratios) {
    const num = `(\\d+(?:\\.\\d+)?|${Object.keys(UNITS).join("|")}|${Object.keys(TENS).join("|")})`;
    for (const m of s.matchAll(
      new RegExp(`\\b${num}\\s+(?:in|out\\s+of|of\\s+every)\\s+${num}\\b`, "gi"),
    )) {
      const toN = (t: string) => {
        const l = t.toLowerCase();
        return UNITS[l] ?? TENS[l] ?? Number(t);
      };
      const a = toN(m[1] ?? "");
      const b = toN(m[2] ?? "");
      if (b > 0 && b < 1900 && a <= b)
        push("fraction", a / b, m.index ?? 0, (m.index ?? 0) + m[0].length);
    }
  }

  // 3b. Decades as spans of years: "a decade", "two decades", "3 decades" (value in years).
  run(new RegExp(`\\b(an?|\\d+|${Object.keys(UNITS).join("|")})[\\s-]+decades?\\b`, "gi"), (m) => {
    const w = (m[1] ?? "").toLowerCase();
    const n = w === "a" || w === "an" ? 1 : (UNITS[w] ?? Number(w));
    if (!Number.isFinite(n) || n <= 0) return false;
    push("number", n * 10, m.index, m.index + m[0].length);
    return true;
  });

  // 4. Digit ordinals: 1st, 22nd, 25th.
  run(/(?<![\d.,])(\d+)(?:st|nd|rd|th)\b/gi, (m) => {
    push("ordinal", Number(m[1]), m.index, m.index + m[0].length);
    return true;
  });

  // 5. Digit numbers with optional currency, scale word, percent or "dollars".
  run(
    /(?<!\d)(?<!\d[.,])(US\$|\$|USD\s?)?\s?(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d+))?(?:\s?(million|billion|thousand|trillion|mn|bn)\b|([kKmMbB])\b)?(\s?(?:%|percent\b|per\s?cent\b|pct\b|percentage\s+points?\b))?(\s?-?\s?(?:dollars?\b|USD\b))?/g,
    (m) => {
      const currency = Boolean(m[1]) || Boolean(m[7]);
      let value = parseDigits(m[2] ?? "0", m[3]);
      const scaleWord = m[4]?.toLowerCase();
      const scaleLetter = m[5]?.toLowerCase();
      if (scaleWord) {
        value *= WORD_MULTIPLIERS[scaleWord] ?? 1;
      } else if (scaleLetter && currency) {
        value *= LETTER_MULTIPLIERS[scaleLetter] ?? 1;
      }
      const start = m.index + (m[0].length - m[0].trimStart().length);
      const end = m.index + m[0].trimEnd().length;
      let kind: NumericKind = "number";
      if (m[6]) kind = "percent";
      else if (currency) kind = "money";
      else if (!scaleWord && !m[3] && /^\d{4}$/.test(m[2] ?? "") && validYear(value)) kind = "year";
      push(kind, round(value), start, end);
      return true;
    },
  );

  // 6. Spelled-out numbers, fractions and ordinals.
  let lower = s.toLowerCase();
  for (const re of IDIOMS) {
    for (const m of lower.matchAll(re)) {
      s = mask(s, m.index ?? 0, (m.index ?? 0) + m[0].length);
    }
    lower = s.toLowerCase();
  }
  extractSpelled(s, original, out);

  for (const t of out) annotate(t, original);
  return out.sort((a, b) => a.index - b.index);
}

/** Qualifier ending right before a figure; group 1 = a negation that cancels it ("no more than"). */
const QUALIFIER_BEFORE =
  /(?:^|[^\p{L}\p{N}])(?:(not|no|never)\s+)?(nearly|almost|about|approximately|roughly|more\s+than|over|at\s+least|under|fewer\s+than)\s+$/iu;
/** A span of years right after a figure; ages ("18 years old", "18-year-old") are excluded. */
const YEARS_AFTER = /^[\s-]*(?:years?|yrs?)\b(?![\s-]*(?:old|of\s+age)\b)/i;

/** Attach the approximate qualifier and the years unit (both read from the surrounding text). */
function annotate(t: NumericToken, text: string) {
  if (t.index < 0) return;
  let end = t.index + t.raw.length;
  if (t.kind === "number") {
    const years = text.slice(end).match(YEARS_AFTER);
    if (/decades?$/i.test(t.raw)) t.unit = "years";
    else if (years) {
      t.unit = "years";
      end += years[0].length; // the phrase reads "over 8 years", not "over 8"
    }
  }
  if (t.kind === "year" || t.kind === "date" || t.kind === "ordinal") return;
  const before = text.slice(0, t.index);
  const m = before.match(QUALIFIER_BEFORE);
  if (!m?.[2] || m[1]) return;
  const qStart = before.length - m[0].length + m[0].toLowerCase().lastIndexOf(m[2].toLowerCase());
  t.qualifier = m[2].toLowerCase().replace(/\s+/g, " ") as ApproxQualifier;
  t.phrase = text.slice(qStart, end).replace(/\s+/g, " ");
}

interface Word {
  w: string;
  start: number;
  end: number;
}

function extractSpelled(s: string, original: string, out: NumericToken[]) {
  const words: Word[] = [];
  for (const m of s.matchAll(/[A-Za-z]+/g)) {
    words.push({ w: m[0].toLowerCase(), start: m.index ?? 0, end: (m.index ?? 0) + m[0].length });
  }
  const adjacent = (a: Word | undefined, b: Word | undefined) =>
    Boolean(a && b && /^[\s-]+$/.test(s.slice(a.end, b.start)));
  const push = (kind: NumericKind, value: number, start: number, end: number) =>
    out.push({
      raw: original.slice(start, end),
      kind,
      value,
      normalized: normalize(kind, value),
      index: start,
    });
  const isCount = (w: string) => w === "a" || w === "an" || w in UNITS;
  const isScale = (w: string | undefined) =>
    w !== undefined && (w === "hundred" || w === "dozen" || w in BIG_SCALES);

  let i = 0;
  while (i < words.length) {
    const cur = words[i] as Word;
    const next = words[i + 1];
    const after = words[i + 2];

    // "half a million"
    if (
      cur.w === "half" &&
      next?.w === "a" &&
      after &&
      after.w in BIG_SCALES &&
      adjacent(next, after)
    ) {
      push("number", 0.5 * (BIG_SCALES[after.w] as number), cur.start, after.end);
      i += 3;
      continue;
    }
    // Fractions: "two-thirds", "three quarters", "a third of", "one-half", "half".
    if (isCount(cur.w) && next && next.w in DENOMS && adjacent(cur, next)) {
      const den = DENOMS[next.w] as { d: number; plural: boolean };
      const n = cur.w === "a" || cur.w === "an" ? 1 : (UNITS[cur.w] as number);
      const followedByOf = after?.w === "of" && adjacent(next, after);
      if (den.d === 2 || den.plural || followedByOf) {
        if (n > 0 && n <= den.d) {
          push("fraction", n / den.d, cur.start, next.end);
          i += 2;
          continue;
        }
      }
    }
    if (cur.w === "half") {
      push("fraction", 0.5, cur.start, cur.end);
      i += 1;
      continue;
    }

    const startsNumber =
      cur.w in UNITS ||
      cur.w in TENS ||
      cur.w in ORDINALS ||
      ((cur.w === "a" || cur.w === "an") && isScale(next?.w) && adjacent(cur, next));
    if (!startsNumber) {
      i += 1;
      continue;
    }

    let total = 0;
    let current = 0;
    let last: "none" | "unit" | "tens" | "scale" = "none";
    let ordinal = false;
    let j = i;
    let endIdx = cur.end;
    while (j < words.length) {
      const wd = words[j] as Word;
      if (j > i && !adjacent(words[j - 1], wd)) {
        // allow "three hundred and fifty"
        break;
      }
      const t = wd.w;
      if (j === i && (t === "a" || t === "an")) {
        current = 1;
        last = "unit";
      } else if (
        t === "and" &&
        last === "scale" &&
        (words[j + 1]?.w ?? "") in { ...UNITS, ...TENS } &&
        adjacent(wd, words[j + 1])
      ) {
        // skip connector
      } else if (t in UNITS) {
        if (last === "unit") break;
        current += UNITS[t] as number;
        last = "unit";
      } else if (t in TENS) {
        if (last === "unit" || last === "tens") break;
        current += TENS[t] as number;
        last = "tens";
      } else if (t === "hundred") {
        current = (current || 1) * 100;
        last = "scale";
      } else if (t === "dozen") {
        current = (current || 1) * 12;
        last = "scale";
      } else if (t in BIG_SCALES) {
        total += (current || 1) * (BIG_SCALES[t] as number);
        current = 0;
        last = "scale";
      } else if (t in ORDINALS) {
        if (last === "unit") break;
        const v = ORDINALS[t] as number;
        if (v >= 100) current = (current || 1) * v;
        else current += v;
        ordinal = true;
        endIdx = wd.end;
        j += 1;
        break;
      } else {
        break;
      }
      endIdx = wd.end;
      j += 1;
    }
    if (j === i || ((cur.w === "a" || cur.w === "an") && j === i + 1)) {
      i += 1;
      continue;
    }
    const value = total + current;
    const unitWord = words[j];
    const unitAdj = adjacent(words[j - 1], unitWord);
    if (!ordinal && unitWord && unitAdj && /^(percent|pct)$/.test(unitWord.w)) {
      push("percent", value, cur.start, unitWord.end);
      j += 1;
    } else if (
      !ordinal &&
      unitWord &&
      unitAdj &&
      unitWord.w === "per" &&
      words[j + 1]?.w === "cent" &&
      adjacent(unitWord, words[j + 1])
    ) {
      push("percent", value, cur.start, (words[j + 1] as Word).end);
      j += 2;
    } else if (!ordinal && unitWord && unitAdj && /^dollars?$/.test(unitWord.w)) {
      push("money", value, cur.start, unitWord.end);
      j += 1;
    } else {
      push(ordinal ? "ordinal" : "number", value, cur.start, endIdx);
    }
    i = j;
  }
}

const eq = (a: number, b: number) =>
  Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(a), Math.abs(b));

/** Does a claim token match a fact token? Asymmetric: the claim may be less specific, never more. */
export function tokenMatches(claim: NumericToken, fact: NumericToken): boolean {
  switch (claim.kind) {
    case "number":
      return (
        (fact.kind === "number" || fact.kind === "year" || fact.kind === "money") &&
        eq(claim.value, fact.value)
      );
    case "year":
      return (fact.kind === "year" || fact.kind === "number") && eq(claim.value, fact.value);
    case "money":
      return fact.kind === "money" && eq(claim.value, fact.value);
    case "percent":
      return (
        (fact.kind === "percent" && eq(claim.value, fact.value)) ||
        (fact.kind === "fraction" && Math.abs(fact.value * 100 - claim.value) <= 1)
      );
    case "fraction":
      return (
        (fact.kind === "fraction" && Math.abs(fact.value - claim.value) < 0.005) ||
        (fact.kind === "percent" && Math.abs(claim.value * 100 - fact.value) <= 1)
      );
    case "date":
      return (
        fact.kind === "date" &&
        (fact.normalized === claim.normalized || fact.normalized.startsWith(`${claim.normalized}-`))
      );
    case "ordinal":
      return fact.kind === "ordinal" && eq(claim.value, fact.value);
  }
}

/**
 * Does a documented value make an approximate statement true? Conservative by design, and never
 * lets a hedge inflate a figure:
 *   more than / over N → fact > N;  at least N → fact ≥ N;  under / fewer than N → fact < N;
 *   nearly / almost N  → 0.9·N ≤ fact < N;  about / approximately / roughly N → within ±5% of fact.
 */
export function approxSatisfied(q: ApproxQualifier, stated: number, fact: number): boolean {
  const tol = 1e-9 * Math.max(1, Math.abs(stated), Math.abs(fact));
  switch (q) {
    case "more than":
    case "over":
      return fact > stated + tol;
    case "at least":
      return fact >= stated - tol;
    case "under":
    case "fewer than":
      return fact < stated - tol;
    case "nearly":
    case "almost":
      return fact >= 0.9 * stated - tol && fact < stated - tol;
    case "about":
    case "approximately":
    case "roughly":
      return Math.abs(fact - stated) <= 0.05 * Math.abs(fact) + tol;
  }
}

/** Qualifiers that state the same kind of bound; only these restate each other. */
const BOUND: Record<ApproxQualifier, string> = {
  "more than": "above",
  over: "above",
  "at least": "at_least",
  under: "below",
  "fewer than": "below",
  nearly: "nearly",
  almost: "nearly",
  about: "about",
  approximately: "about",
  roughly: "about",
};

/**
 * The approximate-qualifier rule, the ONLY way a qualified claim figure ("nearly half", "more than
 * 200") is supported: so "more than 214" is not supported by a fact of exactly 214. Compares
 * like with like (counts, money, shares; spans of years only with spans of years), never years,
 * dates or ordinals. A fact figure that is itself hedged ("at least one", "under 250") is not an
 * exact value: it supports only the same hedge on the same figure.
 */
export function approxMatches(claim: NumericToken, fact: NumericToken): boolean {
  const q = claim.qualifier;
  if (!q) return false;
  const share = (t: NumericToken) =>
    t.kind === "percent" ? t.value : t.kind === "fraction" ? t.value * 100 : null;
  let stated: number | null = null;
  let documented: number | null = null;
  if (claim.kind === "number" && fact.kind === "number" && claim.unit === fact.unit) {
    [stated, documented] = [claim.value, fact.value];
  } else if (claim.kind === "money" && fact.kind === "money") {
    [stated, documented] = [claim.value, fact.value];
  } else if (claim.kind === "percent" || claim.kind === "fraction") {
    [stated, documented] = [share(claim), share(fact)];
  }
  if (stated === null || documented === null) return false;
  if (fact.qualifier) return BOUND[fact.qualifier] === BOUND[q] && eq(stated, documented);
  return approxSatisfied(q, stated, documented);
}

/**
 * Span-of-years claims ("over a decade", "for 14 years") against a start year from the facts
 * ("founded in 2012"), as of `asOfYear`. The year difference d = asOfYear − start only pins the
 * completed years to d−1 or d, so: an exact span must be d−1 or d; lower bounds ("over", "more
 * than", "at least") must hold for d−1; the other qualifiers are applied to d.
 */
export function spanMatchesStartYear(
  claim: NumericToken,
  startYear: number,
  asOfYear: number,
): boolean {
  if (claim.kind !== "number" || claim.unit !== "years") return false;
  const d = asOfYear - startYear;
  if (d < 0) return false;
  const exact = eq(claim.value, d) || eq(claim.value, d - 1);
  const q = claim.qualifier;
  if (!q) return exact;
  if (q === "more than" || q === "over" || q === "at least") return d - 1 >= claim.value;
  if (q === "about" || q === "approximately" || q === "roughly") {
    return exact || approxSatisfied(q, claim.value, d);
  }
  return approxSatisfied(q, claim.value, d);
}

const CURRENCY_UNITS = /^(usd|us\$|\$|dollars?)$/i;
const CENT_UNITS = /^(cents?|usd_cents|usd cents)$/i;
const PERCENT_UNITS = /^(percent|%|pct|percentage|percentage points?)$/i;

/** Tokens contributed by a structured FactValue (number + unit, year, text). */
export function factValueTokens(value: FactValue | null | undefined): NumericToken[] {
  if (!value) return [];
  const toks: NumericToken[] = [];
  const mk = (kind: NumericKind, v: number): NumericToken => ({
    raw: String(v),
    kind,
    value: round(v),
    normalized: normalize(kind, v),
    index: -1,
  });
  if (typeof value.number === "number" && Number.isFinite(value.number)) {
    const unit = (value.unit ?? "").trim();
    const n = value.number;
    if (CURRENCY_UNITS.test(unit)) toks.push(mk("money", n));
    else if (CENT_UNITS.test(unit)) toks.push(mk("money", n / 100));
    else if (PERCENT_UNITS.test(unit)) {
      toks.push(mk("percent", n));
      if (n > 0 && n < 1) toks.push(mk("percent", n * 100));
    } else {
      toks.push(mk(validYear(n) && Number.isInteger(n) ? "year" : "number", n));
    }
  }
  if (typeof value.year === "number") toks.push(mk("year", value.year));
  if (value.text) toks.push(...extractNumericTokens(value.text, { ratios: true }));
  return toks;
}

/** Expand fact-side tokens: a date also vouches for its year ("June 2024" supports "2024"). */
export function expandFactTokens(tokens: NumericToken[]): NumericToken[] {
  const extra: NumericToken[] = [];
  for (const t of tokens) {
    if (t.kind === "date") {
      extra.push({ ...t, kind: "year", normalized: String(t.value) });
      const ym = t.normalized.slice(0, 7);
      if (ym.length === 7 && ym !== t.normalized) extra.push({ ...t, normalized: ym });
    }
  }
  return [...tokens, ...extra];
}
