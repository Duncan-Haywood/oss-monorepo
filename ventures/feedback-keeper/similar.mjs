// Duplicate detection for feedback posts: TF-IDF vectors over title + body, cosine similarity.
// Pure and browser-safe (no node: imports), so the demo page and the server share it.
const STOP = new Set("a an the and or but if to of in on for with at by from as is are was were be been it its this that these those i we you they my our your can could would should will please add make want need have has had not no do does don get use using able via than then so very more".split(" "));

export function tokens(text) {
  return String(text || "").toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/)
    .filter((w) => w.length > 1 && !STOP.has(w))
    .map((w) => w.replace(/(ing|ed|es|s)$/, (m, _s, i) => (w.length - m.length >= 3 ? "" : m)));
}

const termFreq = (toks) => { const f = new Map(); for (const t of toks) f.set(t, (f.get(t) || 0) + 1); return f; };

// docs: [{id, title, body}]. Returns a function query(text, k, min) -> [{id, score}].
export function index(docs) {
  const vecs = docs.map((d) => ({ id: d.id, f: termFreq([...tokens(d.title), ...tokens(d.title), ...tokens(d.body)]) }));
  const df = new Map();
  for (const v of vecs) for (const t of v.f.keys()) df.set(t, (df.get(t) || 0) + 1);
  const n = Math.max(1, vecs.length);
  const idf = (t) => Math.log(1 + n / (1 + (df.get(t) || 0)));
  const weigh = (f) => { const w = new Map(); let norm = 0; for (const [t, c] of f) { const x = (1 + Math.log(c)) * idf(t); w.set(t, x); norm += x * x; } return { w, norm: Math.sqrt(norm) || 1 }; };
  const weighted = vecs.map((v) => ({ id: v.id, ...weigh(v.f) }));
  return (text, k = 5, min = 0.25) => {
    const q = weigh(termFreq(tokens(text)));
    if (!q.w.size) return [];
    return weighted.map((d) => {
      let dot = 0;
      for (const [t, x] of q.w) { const y = d.w.get(t); if (y) dot += x * y; }
      return { id: d.id, score: Math.round((dot / (q.norm * d.norm)) * 1000) / 1000 };
    }).filter((r) => r.score >= min).sort((a, b) => b.score - a.score).slice(0, k);
  };
}

export const findSimilar = (docs, text, k, min) => index(docs)(text, k, min);

// Clusters docs whose pairwise similarity reaches `min` (single linkage). Returns groups of 2+ docs.
export function duplicateGroups(docs, min = 0.3) {
  const q = index(docs), parent = docs.map((_, i) => i);
  const find = (x) => (parent[x] === x ? x : (parent[x] = find(parent[x])));
  const at = new Map(docs.map((d, i) => [d.id, i]));
  docs.forEach((d, i) => { for (const r of q(`${d.title} ${d.body}`, 8, min)) { const j = at.get(r.id); if (j !== i) parent[find(i)] = find(j); } });
  const by = new Map();
  docs.forEach((d, i) => { const r = find(i); by.set(r, [...(by.get(r) || []), d]); });
  return [...by.values()].filter((g) => g.length > 1);
}
