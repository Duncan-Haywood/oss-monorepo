// search() keeps per-index caches and a top-k selection (search.mjs); this pins it to the straightforward version
// it replaced, which scored every match in Maps and sorted them all, on real questions and odd limits.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildIndex, search, tokens, distance } from "./search.mjs";
import { parseKnowledge, buildAgent, normalise } from "./agent.mjs";
import { parseCases, evaluate } from "./eval.mjs";

const read = (f) => readFileSync(new URL(f, import.meta.url), "utf8");

function reference(index, query, { limit = 10 } = {}) {
  const qs = tokens(query);
  if (!qs.length || !index.n) return [];
  const expand = (term, isLast) => {
    if (index.postings.has(term)) return [[term, 1]];
    const out = [];
    if (isLast && term.length >= 2) for (const v of index.vocab) if (v.startsWith(term)) out.push([v, 0.6]);
    if (out.length) return out;
    const max = term.length >= 6 ? 2 : term.length >= 4 ? 1 : 0;
    if (max) for (const v of index.vocab) { if (max === 2 && v[0] !== term[0]) continue; const d = distance(term, v, max); if (d <= max) out.push([v, d === 1 ? 0.7 : 0.5]); }
    return out;
  };
  const k1 = 1.2, b = 0.75, scores = new Map(), hit = new Map();
  qs.forEach((q, qi) => {
    for (const [term, weight] of expand(q, qi === qs.length - 1)) {
      const p = index.postings.get(term); if (!p) continue;
      const idf = Math.log(1 + (index.n - p.size + 0.5) / (p.size + 0.5));
      for (const [id, tf] of p) {
        const norm = tf * (k1 + 1) / (tf + k1 * (1 - b + b * (index.lengths.get(id) / index.avg)));
        scores.set(id, (scores.get(id) || 0) + idf * norm * weight);
        if (!hit.has(id)) hit.set(id, new Set()); hit.get(id).add(qi);
      }
    }
  });
  const all = qs.length;
  return [...scores].map(([id, s]) => ({ id, score: s * (1 + (hit.get(id).size - 1) / all), matchedAll: hit.get(id).size === all })).sort((a, b) => b.score - a.score || (a.id < b.id ? -1 : 1)).slice(0, limit);
}

test("search matches the plain score-everything-and-sort version exactly, cached or not", () => {
  const agent = buildAgent(parseKnowledge(read("./fixtures/banking77/kb.md")));
  const questions = parseCases(read("./fixtures/banking77/test.csv")).slice(0, 300).map((c) => c.question);
  const exIndex = buildIndex(questions.map((q, i) => ({ id: i, title: "", headings: "", body: q })));
  const queries = [...questions, "", "the", "pasword reset", "refnd", "card arriv", "zzzz qqqq", "top-up topup top up"];
  for (const index of [agent.index, exIndex]) for (let pass = 0; pass < 2; pass++) for (const q of queries) {
    for (const limit of [0, 1, 3, 10, 40, 2.5, Infinity]) assert.deepEqual(search(index, normalise(q, agent.syn), { limit }), reference(index, normalise(q, agent.syn), { limit }), `${q} / ${limit}`);
    assert.deepEqual(search(index, q), reference(index, q), q);
  }
});

test("the bar sweep's counts equal the summary of scoring every question at that bar", () => {
  const agent = buildAgent(parseKnowledge(read("./fixtures/sample-kb.md")));
  const cases = parseCases(read("./fixtures/sample-questions.csv"));
  const r = evaluate(agent, cases);
  assert.ok(r.sweep.length > 3);
  for (const s of r.sweep) { const { bar, ...counts } = s; assert.deepEqual(counts, evaluate(agent, cases, { threshold: bar }).summary, `bar ${bar}`); }
});
