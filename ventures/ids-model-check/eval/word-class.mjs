// A bare \w or \s spelled out (xsdregex.mjs spellWordClass) against elementpath,
// the reader IfcTester uses (eval/xsd-regex-truth.py). For every pattern with
// a bare \w, \W, \s or \S, from the corpora and from random patterns:
//   1. both spellings parse in elementpath, and elementpath reads each the
//      way this checker does, on every probe (so every checker agrees);
//   2. the "xsd" spelling, read by elementpath, answers as this checker
//      answers the original (IfcTester now gives the standard's verdict);
//   3. the "letters" spelling, read by elementpath, against IfcTester's own
//      reading of the original: the probe strings where they part, by the
//      character that makes the difference.
// Then buildingSMART's test files that write a bare \w or \s are repaired with each
// choice and scored with the checker against their own IFC files.
//   sh eval/fetch-audit-corpus.sh; sh eval/fetch-testcases.sh
//   PY=$(python3 ../../platform/ci/pyenv.py elementpath) node eval/word-class.mjs [seed] [count]
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, dirname, basename } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { parseXsdRegex, compileXsdRegex, spellWordClass, WORD_CLASS } from "../xsdregex.mjs";
import { fixStructure } from "../fix.mjs";
import { check } from "../node.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const seed0 = Number(process.argv[2] || 20261118), count = Number(process.argv[3] || 1500);
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
const unxml = (s) => s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&");
const TC = join(here, "IDS/Documentation/ImplementersDocumentation/TestCases");
const files = [...walk(join(here, "corpus")), ...walk(TC)];
const corpus = new Map();
const realFiles = new Set();
for (const f of files) {
  for (const mm of readFileSync(f, "utf8").matchAll(/<(?:xs:)?pattern\s+value\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) {
    const p = unxml(mm[1] ?? mm[2]);
    if (spellWordClass(p, "xsd") === null) continue;
    if (!corpus.has(p)) corpus.set(p, new Set());
    corpus.get(p).add(f.slice(here.length + 1));
    if (f.includes("/corpus/real/")) realFiles.add(f);
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
const TOK = ["a", "b", "1", "-", ".", " ", "é", "\\d", "\\w", "\\w", "\\W", "\\s", "\\i", "\\c", "\\D", "\\S", "\\.", "\\-", "\\p{L}", "\\P{Nd}",
  "[ab]", "[^a]", "[a-c]", "[\\w-]", "[^\\w]", "[a-c-[b]]", "[\\p{L}\\p{Nd}_]", "?", "*", "+", "{2}", "{1,3}", "(", ")", "|"];
// Every Unicode category a probe can fall in, so the parts where the readings
// differ show up: + (Sm), € (Sc), ° (So), ^ (Sk), ² (No), Ⅳ (Nl), a combining
// acute (Mn), a Devanagari vowel sign (Mc), ٣ (Nd), Ω (Lu), ʰ (Lm), 中 (Lo),
// tab, line feed, a no-break space (Zs), an em space (Zs) and a form feed (Cc).
const ALPHA = [..."ab1-_. +€°^²Ⅳ́ा٣Ωʰ中", "\t", "\n", " ", " ", "\f"];
function probes(n) {
  const out = ["", "a", "Wall", "Wall+", "90°", "Våtrom", "x²", "Ⅳ", "é", "a b", "W-01"];
  for (let k = 0; k < n; k++) { let s = ""; const L = 1 + Math.floor(rnd() * 5); for (let j = 0; j < L; j++) s += pick(ALPHA); out.push(s); }
  return out;
}
const pats = [...corpus.keys()].map((p) => ({ p, src: "corpus" }));
const seen = new Set(pats.map((x) => x.p));
for (let k = 0; pats.length < corpus.size + count && k < count * 50; k++) {
  let p = ""; const L = 1 + Math.floor(rnd() * 6);
  for (let j = 0; j < L; j++) p += pick(TOK);
  if (seen.has(p) || !parseXsdRegex(p).ok || spellWordClass(p, "xsd") === null) continue;
  seen.add(p);
  pats.push({ p, src: "random" });
}
// One truth query per (pattern text, probes): the original, and both spellings.
const cases = [];
for (const x of pats) {
  x.probes = probes(40);
  x.xsd = spellWordClass(x.p, "xsd");
  x.letters = spellWordClass(x.p, "letters");
  for (const q of [x.p, x.xsd, x.letters]) cases.push({ p: q, probes: x.probes });
}
const truth = execFileSync(PY, [join(here, "xsd-regex-truth.py")], { input: cases.map((c) => JSON.stringify(c)).join("\n") + "\n", maxBuffer: 1 << 28 })
  .toString().trim().split("\n").map((l) => JSON.parse(l));

const T = {};
const bad = [];
pats.forEach((x, k) => {
  const [tOrig, tXsd, tLet] = truth.slice(3 * k, 3 * k + 3);
  const t = (T[x.src] ||= { n: 0, parse: 0, agreeXsd: 0, agreeLetters: 0, xsdKeepsMeaning: 0, origDiffers: 0, lettersVsIfcTester: 0, partStrings: 0, probes: 0 });
  t.n++;
  t.probes += x.probes.length;
  if (!(tXsd.ok && tLet.ok && x.xsd && x.letters)) { bad.push({ p: x.p, why: "spelling not taken", tXsd, tLet }); return; }
  t.parse++;
  const ours = (p) => { const re = compileXsdRegex(p); return x.probes.map((s) => re.test(s)); };
  const oOrig = ours(x.p), oXsd = ours(x.xsd), oLet = ours(x.letters);
  const eq = (a, b) => a.every((v, j) => v === b[j]);
  if (eq(oXsd, tXsd.m)) t.agreeXsd++; else bad.push({ p: x.p, why: "xsd spelling read differently", s: x.probes.filter((_, j) => oXsd[j] !== tXsd.m[j]).slice(0, 3) });
  if (eq(oLet, tLet.m)) t.agreeLetters++; else bad.push({ p: x.p, why: "letters spelling read differently", s: x.probes.filter((_, j) => oLet[j] !== tLet.m[j]).slice(0, 3) });
  if (eq(tXsd.m, oOrig)) t.xsdKeepsMeaning++; else bad.push({ p: x.p, why: "xsd spelling changed the meaning", s: x.probes.filter((_, j) => oOrig[j] !== tXsd.m[j]).slice(0, 3) });
  if (tOrig.ok && !eq(tOrig.m, oOrig)) t.origDiffers++;
  if (tOrig.ok && eq(tOrig.m, tLet.m)) t.lettersVsIfcTester++;
  if (tOrig.ok) t.partStrings += x.probes.filter((_, j) => tOrig.m[j] !== tLet.m[j]).length;
});
console.log(`seed ${seed0}; truth: elementpath translate_pattern as IfcTester calls it; ${files.length} IDS files read, ${realFiles.size} of the public ones (corpus/real) write a bare \\w or \\s`);
for (const [k, t] of Object.entries(T)) {
  console.log(`${k}: ${t.n} patterns with a bare \\w, \\W, \\s or \\S (${t.probes} probe strings)`);
  console.log(`  both spellings taken by elementpath: ${t.parse}`);
  console.log(`  elementpath reads the xsd spelling as this checker does: ${t.agreeXsd}; the letters spelling: ${t.agreeLetters}`);
  console.log(`  IfcTester reads the original differently from the standard on some probe: ${t.origDiffers}`);
  console.log(`  xsd spelling in IfcTester = the original in this checker (the standard's meaning, kept): ${t.xsdKeepsMeaning}`);
  console.log(`  letters spelling = IfcTester's reading of the original on every probe: ${t.lettersVsIfcTester}`);
}
const name = (c) => `${JSON.stringify(c)} U+${c.codePointAt(0).toString(16).toUpperCase().padStart(4, "0")}`;
console.log(`probe strings where the letters spelling and IfcTester's reading of the original part: ${Object.values(T).reduce((n, t) => n + t.partStrings, 0)}`);
// Character by character: a bare \\w and \\s in IfcTester, in XSD, and spelled "letters".
const ONE = [...new Set(ALPHA)];
const py = execFileSync(PY, [join(here, "xsd-regex-truth.py")], { input: ["\\w", "\\s"].map((p) => JSON.stringify({ p, probes: ONE })).join("\n") + "\n" }).toString().trim().split("\n").map((l) => JSON.parse(l).m);
const xsdW = compileXsdRegex("\\w"), letW = compileXsdRegex(WORD_CLASS.letters.w), xsdS = compileXsdRegex("\\s"), letS = compileXsdRegex(WORD_CLASS.letters.s);
const yn = (b) => (b ? "yes" : "no");
console.log("character | \\w IfcTester | \\w XSD | \\w letters | \\s IfcTester | \\s XSD | \\s letters");
ONE.forEach((c, j) => console.log(`${name(c)} | ${yn(py[0][j])} | ${yn(xsdW.test(c))} | ${yn(letW.test(c))} | ${yn(py[1][j])} | ${yn(xsdS.test(c))} | ${yn(letS.test(c))}`));
for (const b of bad.slice(0, 20)) console.log("BAD", JSON.stringify(b));
console.log(`problems: ${bad.length}`);

// buildingSMART's test files that write \w+, repaired each way, then scored.
if (existsSync(TC)) {
  const rows = { asIs: 0, xsd: 0, letters: 0 };
  let n = 0;
  for (const f of walk(TC)) {
    const text = readFileSync(f, "utf8");
    if (![...text.matchAll(/pattern\s+value="([^"]*)"/g)].some((m) => spellWordClass(unxml(m[1]), "xsd") !== null)) continue;
    const ifc = f.replace(/\.ids$/, ".ifc");
    if (!existsSync(ifc)) continue;
    n++;
    const expected = basename(f).split("-")[0];
    const model = readFileSync(ifc, "utf8");
    const score = (t) => { try { const r = check(t, model); const got = r.specs.some((s) => s.status === "invalid") ? "invalid" : r.pass ? "pass" : "fail"; return expected === "pass" ? got === "pass" : got !== "pass"; } catch { return expected !== "pass"; } };
    if (score(text)) rows.asIs++;
    for (const wc of ["xsd", "letters"]) {
      const fx = fixStructure(text, { wordClass: wc });
      if (!fx.fixes.some((x) => x.code === "pattern-word-class")) console.log(`not rewritten (${wc}): ${f.slice(here.length + 1)}`);
      if (score(fx.text)) rows[wc]++;
    }
  }
  console.log(`buildingSMART test pairs with a bare \\w or \\s: ${n}; scored right as written ${rows.asIs}, repaired xsd ${rows.xsd}, repaired letters ${rows.letters}`);
}
