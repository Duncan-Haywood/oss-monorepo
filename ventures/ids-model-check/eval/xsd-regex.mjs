// Compares xsdregex.mjs with elementpath (eval/xsd-regex-truth.py, the call
// IfcTester makes) on every xs:pattern in the fetched corpora and on random
// patterns: same valid/invalid verdict, and for valid ones the same full-match
// answer on probe strings. Then counts the corpus patterns that are not XSD,
// carry a portability note, or that the old matcher (ids.mjs xsdRegex, a JS
// regex with ^ and $ as anchors) answers differently.
//   sh eval/fetch-audit-corpus.sh; sh eval/fetch-testcases.sh
//   PY=$(python3 ../../platform/ci/pyenv.py elementpath) node eval/xsd-regex.mjs [seed] [count]
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { parseXsdRegex, compileXsdRegex, repairXsdRegex } from "../xsdregex.mjs";
import { jsRegex as oldRegex } from "../ids.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const seed0 = Number(process.argv[2] || 20261118), count = Number(process.argv[3] || 3000);
const PY = process.env.PY || "python3";

function walk(d, out = []) {
  if (!existsSync(d)) return out;
  for (const n of readdirSync(d)) {
    const p = join(d, n);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ids|xml)$/i.test(n) && !/\.ifc/i.test(n)) out.push(p);
  }
  return out;
}
const unxml = (s) => s.replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16))).replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(+d))
  .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&");
const corpus = new Map(); // pattern -> files
for (const f of [...walk(join(here, "corpus")), ...walk(join(here, "IDS/Documentation/ImplementersDocumentation/TestCases"))]) {
  for (const m of readFileSync(f, "utf8").matchAll(/<(?:xs:)?pattern\s+value\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) {
    const p = unxml(m[1] ?? m[2]);
    if (!corpus.has(p)) corpus.set(p, new Set());
    corpus.get(p).add(f.slice(here.length + 1));
  }
}

let seed = seed0;
const rnd = () => { // mulberry32
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const pick = (a) => a[Math.floor(rnd() * a.length)];
const TOK = ["a", "b", "1", "-", "^", "$", "{", "}", "/", ",", ".", " ", "é", "\\d", "\\w", "\\s", "\\i", "\\c", "\\D", "\\W", "\\S",
  "\\.", "\\-", "\\^", "\\$", "\\/", "\\b", "\\n", "\\{", "\\p{L}", "\\p{Lu}", "\\p{IsBasicLatin}", "\\P{Nd}", "\\p{Foo}", "\\p{IsGreek}",
  "[ab]", "[^a]", "[a-c]", "[a-]", "[-a]", "[a-c-[b]]", "[\\d]", "[\\w-]", "[a\\-z]", "[]", "[c-a]", "[a-c-[^b]]", "[\\d-z]", "[^-a]", "[a[b]", "[\\p{L}\\p{Nd}_]", "[^\\p{P}\\p{Z}\\p{C}]",
  "?", "*", "+", "{2}", "{1,3}", "{2,}", "{,2}", "{3,1}", "*?", "++", "(", ")", "(?:", "|", "|"];
const ALPHA = [..."ab1-^$. /{}é_+٣Ωz", "\n", "\t", "IFC"];
function probes(n) {
  const out = ["", "a", "ab", "1", "IFCWALL", "Våtrom", "Wall+", "^a", "a$", "٣"];
  for (let k = 0; k < n; k++) { let s = ""; const L = Math.floor(rnd() * 6); for (let j = 0; j < L; j++) s += pick(ALPHA); out.push(s); }
  return out;
}
const cases = [];
for (const p of corpus.keys()) cases.push({ p, probes: probes(30), src: "corpus" });
// Each corpus repair (repairXsdRegex): elementpath must take it, and read as
// XSD it must answer as the original did read as a JavaScript regex (the
// author's evident meaning), on the probes plus values the originals target.
const TARGETED = ["IFCDISTRIBUTIONSYSTEM", "IFCPIPESYSTEM", "2a", "2b", "2a5", "12.34.567", "n/a", "n/abc", "nx", "2024-03-05", "2024-13-05", "2024-03-05T10:20:30Z",
  "did:web:x.y:id:01:12345678", "did:web:x:id:01:1234", "Servizi", "Ambienti", "211 - Kontor", "10.1 - Soverom", "10x1 - Soverom", "-/12/123", "12/-/1"];
for (const p of [...corpus.keys()]) {
  const fix = repairXsdRegex(p);
  if (fix !== null) cases.push({ p: fix, orig: p, probes: [...probes(30), ...TARGETED], src: "repair" });
}
for (let k = 0; k < count; k++) {
  let p = ""; const L = 1 + Math.floor(rnd() * 6);
  for (let j = 0; j < L; j++) p += pick(TOK);
  cases.push({ p, probes: probes(30), src: "random" });
}
const truth = execFileSync(PY, [join(here, "xsd-regex-truth.py")], { input: cases.map((c) => JSON.stringify({ p: c.p, probes: c.probes })).join("\n") + "\n", maxBuffer: 1 << 28 })
  .toString().trim().split("\n").map((l) => JSON.parse(l));

const tally = { repair: { n: 0, verdict: 0, match: 0, probesN: 0 }, corpus: { n: 0, verdict: 0, match: 0, probesN: 0 }, random: { n: 0, verdict: 0, match: 0, probesN: 0 } };
const disagree = [];
cases.forEach((c, k) => {
  const t = truth[k], r = parseXsdRegex(c.p), T = tally[c.src];
  T.n++;
  if (r.ok === t.ok) T.verdict++; else { disagree.push({ src: c.src, p: c.p, ours: r.ok ? "valid" : r.error, theirs: t.ok ? "valid" : t.err }); return; }
  if (!r.ok) { T.match++; return; }
  const re = compileXsdRegex(c.p);
  if (c.orig) {
    const old = oldRegex(c.orig);
    const bad = c.probes.filter((s, j) => (old && t.m[j] !== old.test(s)) || re.test(s) !== t.m[j]);
    T.probesN += c.probes.length;
    if (!old) T.noJs = (T.noJs || []).concat(c.orig);
    if (!bad.length) T.match++; else disagree.push({ src: c.src, p: c.p, orig: c.orig, probes: bad.slice(0, 3) });
    return;
  }
  const bad = c.probes.filter((s, j) => re.test(s) !== t.m[j]);
  T.probesN += c.probes.length;
  if (!bad.length) T.match++; else disagree.push({ src: c.src, p: c.p, probes: bad.slice(0, 3) });
});
console.log(`seed ${seed0}, ${count} random patterns; truth: elementpath translate_pattern as IfcTester calls it`);
for (const [k, T] of Object.entries(tally)) console.log(`${k}: ${T.n} patterns, same verdict ${T.verdict}, same verdict and every probe answer ${T.match} (${T.probesN} probe strings on valid ones)${T.noJs ? `; originals JavaScript cannot read, compared with elementpath only: ${JSON.stringify(T.noJs)}` : ""}`);
// Two places elementpath departs from the XSD text (Part 2, Appendix F), so a
// disagreement there is elementpath's, not ours: a bare \w or \W becomes
// Python's \w (letters, digits, underscore) instead of "not punctuation,
// separator or other" (inside [...] it uses the XSD set); and "[\d-z]" is
// copied through to Python, where it becomes a backslash-to-z range.
function known(d) {
  const bare = d.p.replace(/\[[^\]]*\]/g, "");
  if (d.probes && /\\[wW]/.test(bare)) return "elementpath: bare \\w/\\W read as Python's \\w";
  if (!d.probes && /\\[dDsSwWiIcC]-[^\]\[]/.test(d.p)) return "elementpath: a range from a multi-character escape";
  return null;
}
const byWhy = {};
for (const d of disagree) { const k = known(d) || "unexplained"; byWhy[k] = (byWhy[k] || 0) + 1; if (k === "unexplained") console.log("DISAGREE", JSON.stringify(d)); }
console.log("disagreements by cause:", JSON.stringify(byWhy));

// What the corpus shows.
console.log(`\ncorpus: ${corpus.size} distinct patterns in ${new Set([...corpus.values()].flatMap((s) => [...s])).size} files`);
const rows = [];
for (const [p, files] of corpus) {
  const r = parseXsdRegex(p);
  const fix = repairXsdRegex(p);
  const old = oldRegex(p);
  const nu = compileXsdRegex(p);
  const probesFor = [...cases.find((c) => c.p === p).probes, ...TARGETED];
  const oldDiffers = r.ok && old && nu && probesFor.some((s) => old.test(s) !== nu.test(s));
  if (!r.ok || r.notes.length || oldDiffers) rows.push({ p: p.length > 70 ? p.slice(0, 67) + "..." : p, files: files.size, xsd: r.ok ? "valid" : r.error, notes: r.notes.map((n) => n.code).join(" "), fix: fix && (fix.length > 50 ? fix.slice(0, 47) + "..." : fix), oldDiffers, where: [...files].map((f) => f.split("/").slice(-1)[0]).slice(0, 2).join("; ") });
}
for (const r of rows) console.log(JSON.stringify(r));
