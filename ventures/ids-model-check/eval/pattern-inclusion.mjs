// Pattern inclusion (pattern-lang.mjs) on the xs:pattern values of the public
// IDS files: every ordered pair of distinct XSD-valid patterns compared as
// languages, then checked two ways that do not trust the automata:
//   - every example value (matched by one side, not the other) is tested
//     with compileXsdRegex, the matcher the checker uses (elementpath's
//     reading, eval/xsd-regex-2026-11-18.md);
//   - every "within" verdict (b's strings all pass a) is probed with strings
//     sampled from b by random walks on its automaton, plus a fixed set of
//     short strings, each tested against a with compileXsdRegex.
// Also: the restrictions in those files whose language is empty (no value
// can pass), and the time taken. eval/pattern-inclusion-2026-11-20.md.
//
//   sh eval/fetch-audit-corpus.sh
//   node eval/pattern-inclusion.mjs [--seed N] [--probes N] [--json out.json]

import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseIds } from "../ids.mjs";
import { compileXsdRegex, parseXsdRegex } from "../xsdregex.mjs";
import { patternNfa, languageWithin, restrictionLanguage, languageEmpty } from "../pattern-lang.mjs";

const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d; };
let seed = Number(opt("--seed", 20261120));
const PROBES = Number(opt("--probes", 200));
const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };

const here = new URL(".", import.meta.url).pathname;
const dirs = [join(here, "corpus/real"), join(here, "corpus/IDS-Audit-tool/testing.shared")];
function* idsFiles(dir) {
  let ents; try { ents = readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const e of ents) {
    const p = join(dir, e.name);
    if (e.isDirectory()) yield* idsFiles(p);
    else if (/\.ids$/i.test(e.name)) yield p;
  }
}

// Every value restriction in every facet field.
const FIELDS = ["name", "predefinedType", "value", "propertySet", "baseName", "system", "relation"];
const patterns = new Map(); // pattern -> files
const restrictions = [];
let files = 0, unreadable = 0;
for (const dir of dirs) for (const f of idsFiles(dir)) {
  let ids;
  try { ids = parseIds(readFileSync(f, "utf8")); } catch { unreadable++; continue; }
  files++;
  for (const s of ids.specs || []) for (const facet of [...(s.applicability || []), ...(s.requirements || [])]) {
    for (const k of FIELDS) {
      const v = facet[k];
      if (!v || !v.r) continue;
      restrictions.push({ v, file: f.slice(here.length), spec: s.name, field: `${facet.kind}.${k}` });
      for (const p of v.r.pattern) { if (!patterns.has(p)) patterns.set(p, new Set()); patterns.get(p).add(f); }
    }
    if (facet.entity && facet.entity.name && facet.entity.name.r) restrictions.push({ v: facet.entity.name, file: f.slice(here.length), spec: s.name, field: "partOf.entity" });
  }
}

const valid = [...patterns.keys()].filter((p) => parseXsdRegex(p).ok).sort();
const nfas = new Map(valid.map((p) => [p, patternNfa(p)]));
const L = (p) => (nfas.get(p) ? { nfas: [nfas.get(p)] } : null);

// A random string of an automaton's language (null if a walk dead-ends).
function sample(nfa) {
  for (let tries = 0; tries < 20; tries++) {
    let s = nfa.start, out = [];
    for (let step = 0; step < 400; step++) {
      if (s === nfa.accept && (rnd() < 0.3 || (!nfa.eps[s].length && !nfa.edges[s].length))) return String.fromCodePoint(...out);
      const moves = [...nfa.eps[s].map((t) => [null, t]), ...nfa.edges[s]];
      if (!moves.length) break;
      const [set, t] = moves[Math.floor(rnd() * moves.length)];
      if (set) {
        // Mostly short ASCII picks when the set has them, else anywhere in it.
        const ascii = set.filter(([lo]) => lo < 0x80).map(([lo, hi]) => [lo, Math.min(hi, 0x7f)]);
        const pool = ascii.length && rnd() < 0.8 ? ascii : set;
        const [lo, hi] = pool[Math.floor(rnd() * pool.length)];
        out.push(lo + Math.floor(rnd() * (hi - lo + 1)));
      }
      s = t;
    }
  }
  return null;
}
const FIXED = ["", "A", "a", "0", "1", "-", " ", "\n", "^", "$", "_", "é", "٣", "AB", "D-1", "IfcWall", "IFCWALL", "true", "n/a", "2024-01-01"];

const t0 = Date.now();
const out = { files, unreadable, patterns: patterns.size, valid: valid.length, pairs: 0, unknown: 0, effect: {}, examples: 0, exampleAgree: 0, exampleDisagree: [], within: 0, probes: 0, probeViolations: [], slowest: { ms: 0 } };
const sampleCache = new Map();
const samplesOf = (p) => {
  if (!sampleCache.has(p)) { const ss = []; for (let k = 0; k < PROBES; k++) { const s = sample(nfas.get(p)); if (s !== null) ss.push(s); } sampleCache.set(p, [...new Set([...ss, ...FIXED.filter((x) => compileXsdRegex(p).test(x))])]); }
  return sampleCache.get(p);
};
for (const a of valid) for (const b of valid) {
  if (a === b) continue;
  out.pairs++;
  const ts = Date.now();
  const bInA = languageWithin(L(b), L(a));
  const ms = Date.now() - ts;
  if (ms > out.slowest.ms) out.slowest = { ms, a, b };
  if (!bInA) { out.unknown++; continue; }
  const ra = compileXsdRegex(a), rb = compileXsdRegex(b);
  if (bInA.within) {
    out.within++;
    for (const s of samplesOf(b)) {
      out.probes++;
      if (!ra.test(s)) out.probeViolations.push({ a, b, s });
    }
  } else {
    out.examples++;
    if (rb.test(bInA.example) && !ra.test(bInA.example)) out.exampleAgree++;
    else out.exampleDisagree.push({ a, b, example: bInA.example });
  }
}
// Effects per unordered pair.
for (let i = 0; i < valid.length; i++) for (let j = i + 1; j < valid.length; j++) {
  const x = languageWithin(L(valid[j]), L(valid[i])), y = languageWithin(L(valid[i]), L(valid[j]));
  const e = !x || !y ? "unknown" : x.within && y.within ? "same" : x.within || y.within ? "nested" : "neither";
  out.effect[e] = (out.effect[e] || 0) + 1;
  if (e === "same") (out.sameExamples ||= []).push([valid[i], valid[j]]);
}
out.pairMs = Date.now() - t0;

// Restrictions no value can pass (an enumeration, pattern and length facets that do not meet).
out.restrictions = restrictions.length;
out.exact = 0;
out.empty = [];
for (const r of restrictions) {
  const lang = restrictionLanguage(r.v);
  if (!lang) continue;
  out.exact++;
  if (languageEmpty(lang)) out.empty.push({ file: r.file, spec: r.spec, field: r.field, value: r.v.toString() });
}

const show = { ...out, sameExamples: (out.sameExamples || []).slice(0, 10) };
console.log(JSON.stringify(show, null, 1));
if (opt("--json")) writeFileSync(opt("--json"), JSON.stringify(out, null, 1));
