// Duplicate finder for feature requests. Pure, browser-safe, no dependencies.
// TF-IDF cosine similarity over lightly stemmed words plus bigrams, so
// "dark mode" and "night theme please" still land close to each other only
// when they share words, and "export to CSV" and "CSV export" match fully.

const STOP = new Set(("a an and are as at be but by can could do for from get has have how i if in into is it its just like make me my of on or our please so that the their there this to us want we when will with would you your add allow ability able support need needs").split(" "));

const stem = (w) => w.replace(/(ing|ed|es|s)$/, (m, s, i) => (w.length - m.length >= 3 ? "" : m));

export function tokens(text) {
  const words = String(text || "").toLowerCase().normalize("NFKD").replace(/[^a-z0-9\s]/g, " ").split(/\s+/)
    .filter((w) => w && !STOP.has(w)).map(stem);
  const out = [...words];
  for (let i = 0; i + 1 < words.length; i++) out.push(`${words[i]}_${words[i + 1]}`);
  return out;
}

const counts = (toks) => { const m = new Map(); for (const t of toks) m.set(t, (m.get(t) || 0) + 1); return m; };

// docs: [{id, text}] -> [{id, score}] best first, score in 0..1, only >= min.
export function similar(query, docs, { min = 0.25, limit = 5 } = {}) {
  const q = counts(tokens(query));
  if (!q.size) return [];
  const bags = docs.map((d) => ({ id: d.id, bag: counts(tokens(d.text)) }));
  const df = new Map();
  for (const { bag } of bags) for (const t of bag.keys()) df.set(t, (df.get(t) || 0) + 1);
  const n = bags.length + 1;
  const w = (t, c) => (1 + Math.log(c)) * (Math.log((n + 1) / ((df.get(t) || 0) + 1)) + 1);
  const vec = (bag) => { const v = new Map(); let norm = 0; for (const [t, c] of bag) { const x = w(t, c); v.set(t, x); norm += x * x; } return { v, norm: Math.sqrt(norm) }; };
  const qv = vec(q);
  const res = [];
  for (const { id, bag } of bags) {
    const dv = vec(bag);
    if (!dv.norm) continue;
    let dot = 0;
    for (const [t, x] of qv.v) { const y = dv.v.get(t); if (y) dot += x * y; }
    const score = dot / (qv.norm * dv.norm);
    if (score >= min) res.push({ id, score: Math.round(score * 1000) / 1000 });
  }
  return res.sort((a, b) => b.score - a.score).slice(0, limit);
}
