// Pure text helpers for the watchlist: normalization + hashing input, line diff against the previous
// snapshot, and the deterministic "is this quote really on the page" check.

/** Canonical page text: trimmed lines, collapsed whitespace, no blank lines. Hash input + snapshot. */
export function normalizePageText(text: string): string {
  return text
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((l) => l.replace(/[\s ]+/g, " ").trim())
    .filter(Boolean)
    .join("\n");
}

export interface LineDiff {
  /** Lines of `next` that were not in `prev` (multiset semantics), in document order. */
  added: string[];
  removedCount: number;
  /** Added lines with up to `context` neighbouring lines, ranges merged, separated by "…". */
  changedText: string;
}

/** Line diff of two normalized texts. `prev` null = first check: everything is new. */
export function diffLines(prev: string | null, next: string, context = 2): LineDiff {
  const nextLines = next ? next.split("\n") : [];
  if (prev === null) {
    return { added: nextLines, removedCount: 0, changedText: next };
  }
  const counts = new Map<string, number>();
  for (const l of prev ? prev.split("\n") : []) counts.set(l, (counts.get(l) ?? 0) + 1);
  const addedIdx: number[] = [];
  nextLines.forEach((l, i) => {
    const c = counts.get(l) ?? 0;
    if (c > 0) counts.set(l, c - 1);
    else addedIdx.push(i);
  });
  let removedCount = 0;
  for (const c of counts.values()) removedCount += c;

  const ranges: [number, number][] = [];
  for (const i of addedIdx) {
    const start = Math.max(0, i - context);
    const end = Math.min(nextLines.length - 1, i + context);
    const last = ranges.at(-1);
    if (last && start <= last[1] + 1) last[1] = Math.max(last[1], end);
    else ranges.push([start, end]);
  }
  const changedText = ranges.map(([s, e]) => nextLines.slice(s, e + 1).join("\n")).join("\n…\n");
  return { added: addedIdx.map((i) => nextLines[i] ?? ""), removedCount, changedText };
}

/** Case/whitespace/typography-insensitive form used to compare quotes with page text. */
export function canonicalForQuote(s: string): string {
  return s
    .normalize("NFKC")
    .replace(/[‘’‛′`]/g, "'")
    .replace(/[“”„″]/g, '"')
    .replace(/[‐-―−]/g, "-")
    .replace(/…/g, "...")
    .replace(/(^|\n)\s*(?:#{1,6}|[-*•]|\d+[.)])\s+/g, "$1 ") // heading / list markers
    .replace(/\s*\|\s*/g, " ") // table cell separators
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

export const MIN_QUOTE_CHARS = 20;
export const MAX_QUOTE_CHARS = 1500;

/** True when `quote` (≥ MIN_QUOTE_CHARS after canonicalization) appears verbatim in `page`. */
export function quoteAppears(quote: string, page: string): boolean {
  const q = canonicalForQuote(quote)
    .replace(/^\.{3}|\.{3}$/g, "")
    .trim();
  if (q.length < MIN_QUOTE_CHARS || q.length > MAX_QUOTE_CHARS) return false;
  return canonicalForQuote(page).includes(q);
}
