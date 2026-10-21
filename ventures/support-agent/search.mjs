// Ranked search with typo tolerance. Browser-safe, no dependencies.
//   index = buildIndex(docs)  docs: [{id, title, headings, body, tags}]
//   search(index, "reset pasword") -> [{id, score, matched: [terms]}]
// BM25 over three fields (title x3, headings x2, body x1). Query words that are not in the vocabulary are matched to the closest
// indexed word (one edit for 4-5 letters, two for 6+ when the first letter agrees), and the last word also matches as a prefix while the visitor is still typing.

const STOP = new Set("a an and are as at be but by do does for from how i if in is it its my of on or so that the this to was we what when where which who why will with you your can cant cannot not no".split(" "));

export function stem(w) {
  if (w.length <= 3) return w;
  for (const [suf, rep] of [["ies", "y"], ["sses", "ss"], ["ings", ""], ["ing", ""], ["edly", ""], ["ed", ""], ["es", ""], ["s", ""], ["ly", ""]]) {
    if (w.endsWith(suf) && w.length - suf.length + rep.length >= 3 && !(suf === "s" && w.endsWith("ss"))) return w.slice(0, -suf.length) + rep;
  }
  return w;
}

export function tokens(text, { keepStop = false } = {}) {
  const out = [];
  for (const raw of String(text ?? "").toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").match(/[a-z0-9]+/g) || []) {
    if (!keepStop && STOP.has(raw)) continue;
    out.push(stem(raw));
  }
  return out;
}

// Edit distance with adjacent transpositions, giving up beyond `max`.
export function distance(a, b, max = 2) {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  const prev2 = new Array(b.length + 1).fill(0); let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  let rowMin;
  for (let i = 1; i <= a.length; i++) {
    const cur = [i]; rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let v = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) v = Math.min(v, prev2[j - 2] + 1);
      cur[j] = v; if (v < rowMin) rowMin = v;
    }
    if (rowMin > max) return max + 1;
    for (let j = 0; j <= b.length; j++) prev2[j] = prev[j];
    prev = cur;
  }
  return prev[b.length];
}

const FIELDS = [["title", 3], ["headings", 2], ["tags", 2], ["body", 1]];

export function buildIndex(docs) {
  const postings = new Map(); // term -> Map(docId -> weighted tf)
  const lengths = new Map(); let total = 0;
  for (const d of docs) {
    let len = 0;
    for (const [f, w] of FIELDS) {
      const text = Array.isArray(d[f]) ? d[f].join(" ") : d[f];
      for (const t of tokens(text)) {
        if (!postings.has(t)) postings.set(t, new Map());
        const p = postings.get(t); p.set(d.id, (p.get(d.id) || 0) + w); len += w;
      }
    }
    lengths.set(d.id, len); total += len;
  }
  return { postings, lengths, n: docs.length, avg: docs.length ? total / docs.length : 1, vocab: [...postings.keys()] };
}

function expand(index, term, isLast) {
  if (index.postings.has(term)) return [[term, 1]];
  const out = [];
  if (isLast && term.length >= 2) for (const v of index.vocab) if (v.startsWith(term)) out.push([v, 0.6]);
  if (out.length) return out;
  const max = term.length >= 6 ? 2 : term.length >= 4 ? 1 : 0;
  if (max) for (const v of index.vocab) { if (max === 2 && v[0] !== term[0]) continue; const d = distance(term, v, max); if (d <= max) out.push([v, d === 1 ? 0.7 : 0.5]); }
  return out;
}

export function search(index, query, { limit = 10 } = {}) {
  const qs = tokens(query);
  if (!qs.length || !index.n) return [];
  const k1 = 1.2, b = 0.75, scores = new Map(), hit = new Map();
  qs.forEach((q, qi) => {
    for (const [term, weight] of expand(index, q, qi === qs.length - 1)) {
      const p = index.postings.get(term); if (!p) continue;
      const idf = Math.log(1 + (index.n - p.size + 0.5) / (p.size + 0.5));
      for (const [id, tf] of p) {
        const norm = tf * (k1 + 1) / (tf + k1 * (1 - b + b * (index.lengths.get(id) / index.avg)));
        scores.set(id, (scores.get(id) || 0) + idf * norm * weight);
        if (!hit.has(id)) hit.set(id, new Set()); hit.get(id).add(qi);
      }
    }
  });
  // Articles that match every query word outrank ones that match a subset.
  const all = qs.length;
  return [...scores].map(([id, s]) => ({ id, score: s * (1 + (hit.get(id).size - 1) / all), matchedAll: hit.get(id).size === all })).sort((a, b) => b.score - a.score || (a.id < b.id ? -1 : 1)).slice(0, limit);
}

// A short excerpt around the best-matching spot, as segments so the caller decides how to mark them up safely.
export function snippet(text, query, width = 180) {
  const qs = new Set(tokens(query)); const words = String(text ?? "").split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  const isHit = (w) => tokens(w).some((t) => qs.has(t) || [...qs].some((q) => q.length > 3 && distance(q, t, 1) <= 1));
  let best = 0, bestScore = -1; const win = Math.max(8, Math.round(width / 6));
  for (let i = 0; i < words.length; i += 4) { let s = 0; for (let j = i; j < Math.min(words.length, i + win); j++) if (isHit(words[j])) s++; if (s > bestScore) { bestScore = s; best = i; } }
  const start = Math.max(0, best - 3), slice = words.slice(start, start + win + 3);
  const segs = []; let buf = [];
  for (const w of slice) { if (isHit(w)) { if (buf.length) segs.push({ text: buf.join(" ") + " ", hit: false }); buf = []; segs.push({ text: w, hit: true }, { text: " ", hit: false }); } else buf.push(w); }
  if (buf.length) segs.push({ text: buf.join(" "), hit: false });
  if (start > 0) segs.unshift({ text: "… ", hit: false });
  if (start + win + 3 < words.length) segs.push({ text: " …", hit: false });
  return segs;
}

// Similar articles by shared weighted terms (for "Related").
export function related(index, id, limit = 3) {
  const mine = new Map();
  for (const [t, p] of index.postings) if (p.has(id)) mine.set(t, p.get(id) * Math.log(1 + index.n / p.size));
  const scores = new Map();
  for (const [t, w] of mine) for (const [other, tf] of index.postings.get(t)) if (other !== id) scores.set(other, (scores.get(other) || 0) + Math.min(w, tf * Math.log(1 + index.n / index.postings.get(t).size)));
  return [...scores].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1)).slice(0, limit).filter(([, s]) => s > 0).map(([i]) => i);
}
