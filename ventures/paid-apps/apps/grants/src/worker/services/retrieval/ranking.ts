// Pure ranking helpers for hybrid retrieval: tokenizer + light stemmer, BM25-lite keyword
// scoring and reciprocal-rank fusion. No I/O here so it is unit-testable in Node.

const STOPWORDS = new Set(
  (
    "a an and are as at be been but by can could did do does for from had has have how i if in into is " +
    "it its it's me my no not of on or our ours so than that the their them then there these they this " +
    "those to too us was we were what when where which who whom why will with would you your yours " +
    "about after all also am any because before being both each few more most other over own same " +
    "should some such through under until up very via just only per tell describe please"
  ).split(" "),
);

/** Minimal suffix stripper. Applied identically to queries and documents, so it only needs to be consistent. */
export function stem(word: string): string {
  let w = word;
  if (w.length <= 3) return w;
  if (w.endsWith("ies") && w.length > 4) w = `${w.slice(0, -3)}y`;
  else if (w.endsWith("sses")) w = w.slice(0, -2);
  else if (w.endsWith("s") && !/(ss|us|is)$/.test(w) && w.length > 3) w = w.slice(0, -1);
  if (w.endsWith("ing") && w.length > 5) w = w.slice(0, -3);
  else if (w.endsWith("ed") && w.length > 4) w = w.slice(0, -2);
  if (w.endsWith("e") && w.length > 4) w = w.slice(0, -1);
  return w;
}

/** Lowercased, stemmed, stopword-free tokens. Numbers are kept ("2025", "40"). */
export function tokenize(text: string): string[] {
  const out: string[] = [];
  for (const raw of text.toLowerCase().match(/[a-z0-9]+(?:'[a-z]+)?/g) ?? []) {
    if (STOPWORDS.has(raw)) continue;
    const word = raw.replace(/'s$/, "").replace(/'/g, "");
    if (word.length < 2 && !/\d/.test(word)) continue;
    out.push(stem(word));
  }
  return out;
}

/**
 * Distinct query terms used for the SQL LIKE prefilter, most specific first (longer terms and
 * numbers are rarer). Terms are [a-z0-9] only, so they are safe inside a LIKE pattern.
 */
export function queryTerms(query: string, max = 6): string[] {
  const seen = new Set<string>();
  const terms: string[] = [];
  for (const t of tokenize(query)) {
    const clean = t.replace(/[^a-z0-9]/g, "");
    if (clean.length < 2 || seen.has(clean)) continue;
    seen.add(clean);
    terms.push(clean);
  }
  return terms
    .map((t, i) => ({ t, i }))
    .sort((a, b) => b.t.length - a.t.length || a.i - b.i)
    .slice(0, max)
    .map((x) => x.t);
}

export interface KeywordDoc {
  id: string;
  text: string;
}

export interface Scored {
  id: string;
  score: number;
}

/**
 * BM25 over the candidate set. `totalDocs` is the size of the whole corpus (org chunk count) so IDF
 * is not distorted by the prefilter; document frequency is counted within the candidates.
 * Returns only documents with score > 0, best first.
 */
export function bm25(
  docs: KeywordDoc[],
  terms: string[],
  opts: { totalDocs?: number; k1?: number; b?: number } = {},
): Scored[] {
  if (docs.length === 0 || terms.length === 0) return [];
  const k1 = opts.k1 ?? 1.2;
  const b = opts.b ?? 0.75;
  const termSet = new Set(terms);
  const tokenized = docs.map((d) => {
    const toks = tokenize(d.text);
    const tf = new Map<string, number>();
    for (const t of toks) if (termSet.has(t)) tf.set(t, (tf.get(t) ?? 0) + 1);
    return { id: d.id, len: toks.length, tf };
  });
  const avgLen = tokenized.reduce((s, d) => s + d.len, 0) / tokenized.length || 1;
  const df = new Map<string, number>();
  for (const d of tokenized) for (const t of d.tf.keys()) df.set(t, (df.get(t) ?? 0) + 1);
  const n = Math.max(opts.totalDocs ?? docs.length, docs.length);

  const out: Scored[] = [];
  for (const d of tokenized) {
    let score = 0;
    for (const t of termSet) {
      const f = d.tf.get(t);
      if (!f) continue;
      const dft = df.get(t) ?? 0;
      const idf = Math.log(1 + (n - dft + 0.5) / (dft + 0.5));
      score += (idf * (f * (k1 + 1))) / (f + k1 * (1 - b + (b * d.len) / avgLen));
    }
    if (score > 0) out.push({ id: d.id, score });
  }
  return out.sort((x, y) => y.score - x.score || x.id.localeCompare(y.id));
}

export interface RankedList {
  ids: string[];
  weight?: number;
}

/**
 * Reciprocal-rank fusion: score(d) = Σ w / (k + rank). Scores are normalized to 0..1 where 1 means
 * "ranked first in every list". Ties break by best single rank, then id (deterministic).
 */
export function reciprocalRankFusion(lists: RankedList[], k = 60): Scored[] {
  const totals = new Map<string, { score: number; best: number }>();
  let maxPossible = 0;
  for (const list of lists) {
    const w = list.weight ?? 1;
    if (list.ids.length) maxPossible += w / (k + 1);
    const seen = new Set<string>();
    list.ids.forEach((id, i) => {
      if (seen.has(id)) return;
      seen.add(id);
      const cur = totals.get(id) ?? { score: 0, best: Number.POSITIVE_INFINITY };
      cur.score += w / (k + i + 1);
      cur.best = Math.min(cur.best, i);
      totals.set(id, cur);
    });
  }
  if (maxPossible === 0) return [];
  return [...totals.entries()]
    .sort((a, b) => b[1].score - a[1].score || a[1].best - b[1].best || a[0].localeCompare(b[0]))
    .map(([id, v]) => ({ id, score: Math.round((v.score / maxPossible) * 1e4) / 1e4 }));
}
