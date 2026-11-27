// Differential test of ubl-xsd.mjs against xmllint on the real OASIS UBL 2.1 XSD.
// Seeds are the UBL Invoice and CreditNote files in examples/ and fixtures/ (and any
// directory given as the second argument) that xmllint accepts; each is mutated and
// both validators judge the result. Mutations inside ExtensionContent are not made
// (ubl-xsd.mjs does not look into an extension's content; see its header).
//   curl -sSfLO https://docs.oasis-open.org/ubl/os-UBL-2.1/UBL-2.1.zip && unzip -q UBL-2.1.zip 'xsd/*' 'xml/*'
//   node eval/ubl-xsd-diff.mjs xsd [xml] [--seed 1] [--per 24]
import { spawnSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { checkAgainstUblSchema, looksLikeUblDocument } from "../ubl-xsd.mjs";

const [xsdDir, seedDir] = process.argv.slice(2).filter((a, i, all) => !a.startsWith("--") && !(all[i - 1] ?? "").startsWith("--"));
if (!xsdDir) { console.error("usage: node eval/ubl-xsd-diff.mjs <os-UBL-2.1 xsd dir> [seed dir]"); process.exit(2); }
const arg = (k, d) => { const i = process.argv.indexOf(k); return i === -1 ? d : Number(process.argv[i + 1]); };
let s = arg("--seed", 1);
const rand = () => { s = (s * 1664525 + 1013904223) % 4294967296; return s / 4294967296; };
const pick = (a) => a[Math.floor(rand() * a.length)];

const work = mkdtempSync(join(tmpdir(), "ubl-diff-"));
const schemaFor = (xml) => join(xsdDir, "maindoc", /<(?:[\w.-]+:)?CreditNote[\s>]/.test(xml) && !/<(?:[\w.-]+:)?Invoice[\s>]/.test(xml) ? "UBL-CreditNote-2.1.xsd" : "UBL-Invoice-2.1.xsd");
/** xmllint's verdict on each document, one process per schema. */
function xmllintAll(docs) {
  const verdict = new Array(docs.length);
  const bySchema = new Map();
  docs.forEach((xml, i) => {
    const file = join(work, `m${i}.xml`);
    writeFileSync(file, xml);
    const xsd = schemaFor(xml);
    if (!bySchema.has(xsd)) bySchema.set(xsd, []);
    bySchema.get(xsd).push([i, file]);
  });
  for (const [xsd, list] of bySchema) {
    for (let k = 0; k < list.length; k += 200) {
      const chunk = list.slice(k, k + 200);
      // xmllint prints "<file> validates" on stderr, whatever its exit code.
      const r = spawnSync("xmllint", ["--noout", "--schema", xsd, ...chunk.map(([, f]) => f)], { maxBuffer: 1 << 28 });
      if (r.error) throw r.error;
      const lines = new Set(`${r.stdout}${r.stderr}`.split("\n"));
      for (const [i, f] of chunk) verdict[i] = lines.has(`${f} validates`);
    }
  }
  return verdict;
}

function* walk(d) { for (const n of readdirSync(d)) { const p = join(d, n); if (statSync(p).isDirectory()) yield* walk(p); else if (n.endsWith(".xml")) yield p; } }
const here = new URL("..", import.meta.url).pathname;
const candidates = [...walk(join(here, "examples")), ...walk(join(here, "fixtures")), ...(seedDir ? [...walk(seedDir)] : [])]
  .map((p) => [p.slice(p.lastIndexOf("/") + 1), readFileSync(p, "utf8").replace(/^\uFEFF/, "")])
  .filter(([, x]) => looksLikeUblDocument(x));
const ok = xmllintAll(candidates.map(([, x]) => x));
const seeds = candidates.filter((_, i) => ok[i]);

// Spans of ExtensionContent, where no mutation is made.
const extSpans = (x) => [...x.matchAll(/<([\w.-]+:)?ExtensionContent[\s>][\s\S]*?<\/\1?ExtensionContent>/g)].map((m) => [m.index, m.index + m[0].length]);
const outside = (x, ms) => { const sp = extSpans(x); return ms.filter((m) => !sp.some(([a, b]) => m.index >= a && m.index < b)); };
const leaves = (x) => outside(x, [...x.matchAll(/<(cbc:\w+)((?:\s[^>]*)?)>([^<]*)<\/\1>/g)]);
const blocks = (x) => outside(x, [...x.matchAll(/<(cac:\w+)(?:\s[^>]*)?>(?:(?!<cac:)[\s\S])*?<\/\1>/g)]);
const at = (x, e, put) => x.slice(0, e.index) + put + x.slice(e.index + e[0].length);
let last = "";
const leaf = (f) => (x) => { const m = leaves(x); if (!m.length) return null; const e = pick(m); last = e[1]; return f(x, e); };
const value = (f) => leaf((x, e) => { const v = f(e[3], e[1]); return v === null ? null : at(x, e, `<${e[1]}${e[2]}>${v}</${e[1]}>`); });
const MUTATIONS = {
  delete: leaf((x, e) => at(x, e, "")),
  duplicate: leaf((x, e) => at(x, e, e[0] + e[0])),
  unknown: leaf((x, e) => x.slice(0, e.index) + "<cbc:Extra>1</cbc:Extra>" + x.slice(e.index)),
  swap: (x) => { const m = outside(x, [...x.matchAll(/(<(cbc:\w+)(?:\s[^>]*)?>[^<]*<\/\2>)(\s*)(<(cbc:\w+)(?:\s[^>]*)?>[^<]*<\/\5>)/g)]).filter((e) => e[2] !== e[5]); if (!m.length) return null; const e = pick(m); last = `${e[2]}<->${e[5]}`; return at(x, e, e[4] + e[3] + e[1]); },
  deleteBlock: (x) => { const m = blocks(x); if (!m.length) return null; const e = pick(m); last = e[1]; return at(x, e, ""); },
  duplicateBlock: (x) => { const m = blocks(x); if (!m.length) return null; const e = pick(m); last = e[1]; return at(x, e, e[0] + e[0]); },
  wrongNs: leaf((x, e) => { const n = e[1].replace("cbc:", "cac:"); return at(x, e, `<${n}${e[2]}>${e[3]}</${n}>`); }),
  dropAttr: (x) => { const m = leaves(x).filter((e) => /\s\w+="/.test(e[2])); if (!m.length) return null; const e = pick(m); last = `${e[1]} ${e[2].trim()}`; return at(x, e, `<${e[1]}${e[2].replace(/\s\w+="[^"]*"/, "")}>${e[3]}</${e[1]}>`); },
  addAttr: leaf((x, e) => at(x, e, `<${e[1]}${e[2]} bogus="1">${e[3]}</${e[1]}>`)),
  empty: value(() => ""),
  text: value(() => "abc"),
  euro: value((v) => v + "€"),
  negative: value(() => "-1"),
  shortdate: value((v) => (/^\d{4}-\d\d-\d\d$/.test(v) ? v.slice(0, 7) : null)),
  badtime: value((v) => (/^\d\d:\d\d:\d\d/.test(v) ? "25:00:00" : null)),
  boolean: value((v) => (/^(true|false)$/.test(v) ? "yes" : null)),
};
const per = arg("--per", 24);
const runs = [];
for (const [name, xml] of seeds) {
  for (const [kind, f] of Object.entries(MUTATIONS)) {
    for (let k = 0; k < per; k++) {
      const m = f(xml);
      if (m && m !== xml) runs.push({ name, kind, what: last, xml: m });
    }
  }
}
const lint = xmllintAll(runs.map((r) => r.xml));
const tally = {};
const diffs = [];
runs.forEach((r, i) => {
  const a = lint[i];
  const b = checkAgainstUblSchema(r.xml).length === 0;
  const t = (tally[r.kind] ??= { n: 0, agree: 0, xmllintRejects: 0, weMiss: 0, weFlagWrongly: 0 });
  t.n++; if (!a) t.xmllintRejects++;
  if (a === b) t.agree++;
  else if (!a && b) { t.weMiss++; diffs.push([r.kind, r.what, r.name, "we pass, xmllint rejects"]); }
  else { t.weFlagWrongly++; diffs.push([r.kind, r.what, r.name, "we reject, xmllint accepts"]); }
});
const total = Object.values(tally).reduce((a, t) => ({ n: a.n + t.n, agree: a.agree + t.agree }), { n: 0, agree: 0 });
console.log(`${seeds.length} seeds of ${candidates.length} UBL files; ${total.agree} of ${total.n} verdicts agree with xmllint`);
console.table(tally);
for (const d of diffs.slice(0, 40)) console.log(d.join(" | "));
process.exitCode = diffs.length ? 1 : 0;
