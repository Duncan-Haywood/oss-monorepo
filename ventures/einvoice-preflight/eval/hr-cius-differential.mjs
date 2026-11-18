// Differential: the Porezna uprava's HR-CIUS XSLT under Saxon-JS vs the plain route.
// Needs `npm i --no-save xslt3` (Saxon-JS 2) and a SEF of the stylesheet from the jar:
//   npx xslt3 -xsl:external/schematron/1.0.4/HR-CIUS-EXT-EN16931-UBL.xslt -export:hr.sef.json -nogo -relocate:on
//   node eval/hr-cius-differential.mjs hr.sef.json examples/hr-invoice.xml [N] [seed]
// Prints how many edited copies get the same HR rule ids from both, and each difference.
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const SaxonJS = require(require.resolve("saxon-js", { paths: [process.cwd()] }));
const { runPlain } = await import("../plain-node.mjs");
const sef = JSON.parse(readFileSync(process.argv[2], "utf8"));
const base = readFileSync(process.argv[3], "utf8");
const N = +process.argv[4] || 400;
let seed = +process.argv[5] || 20261114; const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
const pick = (a) => a[Math.floor(rnd() * a.length)];
function mutate(xml) {
  const leaves = [...xml.matchAll(/<(cbc:[A-Za-z]+)([^>]*)>([^<]*)<\/\1>/g)];
  const m = pick(leaves); const [all, tag, attrs, val] = m; const i = m.index;
  const kind = pick(["delete", "blank", "digit", "number", "code", "attr"]);
  let rep = all;
  if (kind === "delete") rep = "";
  else if (kind === "blank") rep = `<${tag}${attrs}></${tag}>`;
  else if (kind === "digit") { const p = [...val].map((c, j) => /\d/.test(c) ? j : -1).filter((j) => j >= 0); if (p.length) { const j = pick(p); rep = `<${tag}${attrs}>${val.slice(0, j)}${(+val[j] + 1 + Math.floor(rnd() * 8)) % 10}${val.slice(j + 1)}</${tag}>`; } }
  else if (kind === "number") rep = `<${tag}${attrs}>${pick(["0", "-5.00", "1.123456789012", "99999.99", "abc", "2025-12-31", "12:00"])}</${tag}>`;
  else if (kind === "code") rep = `<${tag}${attrs}>${pick(["S", "E", "O", "Z", "AE", "HR:E", "HR:O", "HR:PDV13", "P12", "P0", "381", "386", "XX"])}</${tag}>`;
  else if (kind === "attr") rep = all.replace(/(listID|schemeID|unitCode)="[^"]*"/, '$1="ZZ"');
  return xml.slice(0, i) + rep + xml.slice(i + all.length);
}
function saxonIds(xml) {
  const out = SaxonJS.transform({ stylesheetInternal: sef, sourceText: xml, destination: "serialized" }, "sync").principalResult;
  return [...out.matchAll(/<svrl:failed-assert[^>]*\bid="([^"]+)"/g)].map((x) => x[1]);
}
const norm = (a) => [...new Set(a)].sort().join(",");
let same = 0, diffs = [], fired = new Set(), errors = 0;
const docs = [base];
for (let k = 0; k < N; k++) { let x = base; const n = 1 + Math.floor(rnd() * 3); for (let j = 0; j < n; j++) x = mutate(x); docs.push(x); }
for (const [k, xml] of docs.entries()) {
  let s, p;
  try { s = norm(saxonIds(xml)); } catch (e) { errors++; if (errors <= 4) { const r0 = await runPlain(xml); console.log("saxon error:", String(e.message).slice(0, 90), "| plain:", norm(r0.findings.filter((f) => f.source === "cius-hr-schematron").map((f) => f.rule)), "skipped", r0.skipped.length); } continue; }
  const r = await runPlain(xml);
  p = norm(r.findings.filter((f) => f.source === "cius-hr-schematron").map((f) => f.rule));
  for (const id of s.split(",").filter(Boolean)) fired.add(id);
  if (s === p) same++; else diffs.push({ k, saxon: s, plain: p, bt24: (xml.match(/<cbc:CustomizationID>([^<]*)</) || [, "(none)"])[1].slice(0, 90) });
}
console.log(JSON.stringify({ docs: docs.length, saxonErrors: errors, same, differ: diffs.length, rulesFired: [...fired].sort() }, null, 1));
for (const d of diffs.slice(0, 15)) console.log(d);
