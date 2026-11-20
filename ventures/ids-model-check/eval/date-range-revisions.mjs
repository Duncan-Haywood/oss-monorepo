// Date, time and duration ranges in a revision diff (revision.mjs
// compareValuesDetail, pattern-lang.mjs dateRangePatterns) on the public IDS
// files: every value restriction whose bounds are dates, dateTimes, times or
// durations is
//   - read as a language when its bounds are plain dates, and that language
//     checked against ids.mjs (IdsValue.match) on strings near its bounds
//     (every zone sign, the calendar's edges, malformed forms);
//   - paired with every other such range of the same form, and every plain
//     date range with every XSD pattern in the files that reads a date
//     (contains a 4-digit-year-like run and a dash), each pair graded both
//     ways; examples (a value one side passes and the other refuses) are
//     tested against ids.mjs.
// Before this change every one of these pairs graded "changed".
// eval/date-range-revisions-2026-11-20.md.
//
//   sh eval/fetch-audit-corpus.sh && sh eval/fetch-testcases.sh
//   node eval/date-range-revisions.mjs

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parseIds, IdsValue } from "../ids.mjs";
import { restrictionLanguage, languageWithin } from "../pattern-lang.mjs";
import { compareValuesDetail } from "../revision.mjs";
import { temporalKind } from "../temporal.mjs";
import { parseXsdRegex } from "../xsdregex.mjs";

const here = new URL(".", import.meta.url).pathname;
const dirs = [join(here, "corpus/real"), join(here, "corpus/IDS-Audit-tool/testing.shared"), join(here, "IDS/Documentation/ImplementersDocumentation/TestCases")];
function* idsFiles(dir) {
  let ents; try { ents = readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const e of ents) {
    const p = join(dir, e.name);
    if (e.isDirectory()) yield* idsFiles(p);
    else if (/\.ids$/i.test(e.name)) yield p;
  }
}
const FIELDS = ["name", "predefinedType", "value", "propertySet", "baseName", "system", "relation"];
const BOUNDS = ["minInclusive", "maxInclusive", "minExclusive", "maxExclusive"];
const ranges = new Map(); // restriction text -> { v, kind, files }
const patterns = new Map();
let files = 0;
for (const dir of dirs) for (const f of idsFiles(dir)) {
  let ids;
  try { ids = parseIds(readFileSync(f, "utf8")); } catch { continue; }
  files++;
  for (const s of ids.specs || []) for (const facet of [...(s.applicability || []), ...(s.requirements || [])]) for (const k of FIELDS) {
    const v = facet[k];
    if (!v || !v.r) continue;
    for (const p of v.r.pattern) if (/\d{4}|\\d\{4\}|\[0-9\]\{4\}/.test(p) && p.includes("-") && parseXsdRegex(p).ok && !patterns.has(p)) patterns.set(p, v);
    const bs = BOUNDS.filter((b) => v.r[b] !== undefined);
    if (!bs.length) continue;
    const kinds = new Set(bs.map((b) => temporalKind(String(v.r[b]))));
    if (kinds.has(null) || kinds.size !== 1) continue;
    const plain = bs.every((b) => /^\s*\d{4}-\d{2}-\d{2}\s*$/.test(String(v.r[b])));
    const key = `${v.r.base}|${v.toString()}`;
    if (!ranges.has(key)) ranges.set(key, { v, kind: plain ? "plain date" : [...kinds][0], files: new Set() });
    ranges.get(key).files.add(f.slice(here.length));
  }
}

const simple = (s) => { const v = new IdsValue(null); v.simple = s; return v; };
const accepts = (L, s) => languageWithin(restrictionLanguage(simple(s)), L).within;
function candidates(days) {
  const zones = ["", "Z", "+00:00", "-00:00", "+00:01", "-00:01", "+01:00", "-05:00", "+14:00", "-12:00", "+23:59", "-23:59", "+24:00", "+10:60"];
  const out = ["", "2024-02-30", "2023-02-29", "2024-02-29", "1900-02-29", "2000-02-29", "2024-04-31", "2024-13-01", "2024-01-32", "\t2024-03-01\n", " 2024-03-01", "12024-01-01"];
  for (const d of days) {
    const t = Date.parse(d + "T00:00:00Z");
    if (Number.isNaN(t)) continue;
    for (const k of [-2, -1, 0, 1, 2]) for (const z of zones) out.push(new Date(t + k * 864e5).toISOString().slice(0, 10) + z);
  }
  return out;
}

const byKind = {};
let exactChecked = 0, exactWrong = 0;
const list = [...ranges.values()];
for (const r of list) {
  byKind[r.kind] = (byKind[r.kind] || 0) + 1;
  if (r.kind !== "plain date") continue;
  const L = restrictionLanguage(r.v);
  if (!L) { exactWrong++; console.log("no language:", r.v.toString()); continue; }
  for (const s of candidates(BOUNDS.map((b) => r.v.r[b]).filter(Boolean).map((x) => String(x).trim()))) {
    exactChecked++;
    if (accepts(L, s) !== r.v.match(s, "string")) { exactWrong++; console.log("disagree:", r.v.toString(), JSON.stringify(s)); }
  }
}

const effects = {}, exampleChecks = { ok: 0, wrong: 0 };
const grade = (a, b, label) => {
  const d = compareValuesDetail(a, b);
  const k = `${label}: ${d.effect}`;
  effects[k] = (effects[k] || 0) + 1;
  if (d.nowFails !== undefined) (a.match(d.nowFails, "string") && !b.match(d.nowFails, "string") ? exampleChecks.ok++ : exampleChecks.wrong++);
  if (d.nowPasses !== undefined) (b.match(d.nowPasses, "string") && !a.match(d.nowPasses, "string") ? exampleChecks.ok++ : exampleChecks.wrong++);
};
const t0 = Date.now();
for (const a of list) for (const b of list) if (a !== b && a.kind === b.kind) grade(a.v, b.v, `${a.kind} range vs ${b.kind} range`);
for (const a of list) if (a.kind === "plain date") for (const pv of patterns.values()) { grade(a.v, pv, "plain date range vs date pattern"); grade(pv, a.v, "date pattern vs plain date range"); }
const ms = Date.now() - t0;

console.log(`${files} IDS files; ${list.length} distinct ranges with temporal bounds:`, byKind);
console.log(`${patterns.size} distinct date-like XSD patterns`);
console.log(`language vs ids.mjs: ${exactChecked - exactWrong} of ${exactChecked} strings agree`);
console.log("graded pairs (all 'changed' before):");
for (const [k, n] of Object.entries(effects).sort()) console.log(`  ${k}  ${n}`);
console.log(`examples tested on ids.mjs: ${exampleChecks.ok} right, ${exampleChecks.wrong} wrong; ${ms} ms`);
console.log("ranges:");
for (const r of list) console.log(`  [${r.kind}] ${r.v.r.base || "(no base)"} ${r.v.toString()}  (${r.files.size} file(s))`);
console.log("patterns:");
for (const p of patterns.keys()) console.log(`  /${p}/`);
