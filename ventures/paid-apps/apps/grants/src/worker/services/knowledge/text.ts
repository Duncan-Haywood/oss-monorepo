// Pure text helpers for the fact base: quote verification, statement normalization / dedupe,
// sentence splitting. No runtime dependencies so they can be unit-tested in Node.
import { INVISIBLE_CHARS_RE } from "../safety/untrusted";

/**
 * Collapse all whitespace runs to single spaces, unify quotes/dashes, trim, lowercase. NFKC and
 * invisible-character removal match what the model is shown (services/safety/untrusted.ts), so a
 * quote copied from the sanitized prompt still verifies against the original text.
 */
export function normalizeForMatch(s: string): string {
  return s
    .normalize("NFKC")
    .replace(INVISIBLE_CHARS_RE, "")
    .replace(/[‘’‚‛′]/g, "'")
    .replace(/[“”„‟″]/g, '"')
    .replace(/[‐-―−]/g, "-")
    .replace(/ /g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/** Strip markdown emphasis / link syntax that converters add but quotes usually omit. */
function stripMarkup(s: string): string {
  return s
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/[*_`#>|]/g, " ")
    .replace(/\s+/g, " ");
}

/**
 * True when `quote` appears verbatim in `source` (whitespace-normalized, case-insensitive).
 * Also tolerates markdown emphasis/link syntax differences. Empty / trivial quotes never match.
 */
export function quoteInText(quote: string, source: string): boolean {
  const q = normalizeForMatch(quote).replace(/^["'\s]+|["'\s]+$/g, "");
  if (q.length < 8) return false;
  const src = normalizeForMatch(source);
  if (src.includes(q)) return true;
  const q2 = normalizeForMatch(stripMarkup(q));
  return q2.length >= 8 && normalizeForMatch(stripMarkup(src)).includes(q2);
}

/** Normalized statement used for exact-duplicate detection. */
export function normalizeStatement(s: string): string {
  return normalizeForMatch(s)
    .replace(/[^\p{L}\p{N}%$.\s]/gu, " ")
    .replace(/(\D)\.|\.(\D|$)/g, "$1 $2")
    .replace(/\s+/g, " ")
    .trim();
}

const STOPWORDS = new Set(
  "a an the and or of to in on for with by at from as is are was were be been its it this that their our we has have had which who".split(
    " ",
  ),
);

/** Content tokens of a statement (stopwords removed, numbers kept with separators stripped). */
export function statementTokens(s: string): string[] {
  return normalizeStatement(s)
    .split(" ")
    .map((t) => (/^[$\d]/.test(t) ? t.replace(/[$,]/g, "") : t))
    .filter((t) => t && !STOPWORDS.has(t));
}

/** Numbers mentioned in a statement (so "served 300" and "served 400" are never duplicates). */
export function statementNumbers(s: string): string[] {
  return [...normalizeForMatch(s).matchAll(/\d[\d,]*(?:\.\d+)?/g)]
    .map((m) => m[0].replace(/,/g, ""))
    .sort();
}

export function jaccard(a: string[], b: string[]): number {
  const A = new Set(a);
  const B = new Set(b);
  if (A.size === 0 && B.size === 0) return 1;
  let inter = 0;
  for (const t of A) if (B.has(t)) inter++;
  return inter / (A.size + B.size - inter);
}

export const DUPLICATE_OVERLAP = 0.8;

export interface StatementKey {
  norm: string;
  tokens: string[];
  numbers: string;
}

export function statementKey(statement: string): StatementKey {
  return {
    norm: normalizeStatement(statement),
    tokens: statementTokens(statement),
    numbers: statementNumbers(statement).join("|"),
  };
}

/** Duplicate = same normalized text, or same numbers and high token overlap. */
export function isDuplicateStatement(a: StatementKey, b: StatementKey): boolean {
  if (a.norm === b.norm) return true;
  if (a.numbers !== b.numbers) return false;
  return jaccard(a.tokens, b.tokens) >= DUPLICATE_OVERLAP;
}

/** Index of known statements for fast-ish duplicate checks while extracting. */
export class StatementIndex {
  private exact = new Set<string>();
  private keys: StatementKey[] = [];

  constructor(statements: Iterable<string> = []) {
    for (const s of statements) this.add(s);
  }

  add(statement: string): void {
    const k = statementKey(statement);
    this.exact.add(k.norm);
    this.keys.push(k);
  }

  has(statement: string): boolean {
    const k = statementKey(statement);
    if (this.exact.has(k.norm)) return true;
    return this.keys.some((o) => isDuplicateStatement(k, o));
  }
}

/** Split prose into sentences (markdown-aware enough for fakes and heuristics). */
export function splitSentences(text: string): string[] {
  const out: string[] = [];
  for (const block of text.split(/\n\s*\n|\n(?=\s*[-*#]|\s*\d+\.\s)/)) {
    const flat = block.replace(/\s+/g, " ").trim();
    if (!flat) continue;
    // Split after . ! ? followed by space + capital/quote/digit; avoid common abbreviations.
    const parts = flat.split(
      /(?<=(?<!\b(?:Mr|Mrs|Ms|Dr|St|No|Inc|Jr|Sr|vs|etc|U\.S|e\.g|i\.e))[.!?])\s+(?=["'(\p{Lu}\d])/u,
    );
    for (const p of parts) {
      const s = p.trim();
      if (s) out.push(s);
    }
  }
  return out;
}

export const clamp01 = (n: number) => (Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0.5);
