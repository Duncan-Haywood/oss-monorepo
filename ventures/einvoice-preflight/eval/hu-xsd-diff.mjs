// Differential test of hu-xsd.mjs against xmllint on NAV's real Online Számla 3.0 XSD.
// Seeds are NAV's 30 InvoiceData samples (nav-gov-hu/Online-Invoice, sample/Data sample),
// which xmllint and hu-xsd.mjs both accept. Each is mutated (a leaf element deleted,
// duplicated or swapped with its neighbour, an unknown element added, a value emptied,
// lengthened, made text, negative, given a euro sign or a short date, a boolean flipped, written 1/0 or emptied (two
// elements are fixed="true"), an element's
// namespace prefix dropped or added) and both validators judge the result.
//   git clone --depth 1 https://github.com/nav-gov-hu/Online-Invoice
//   node eval/hu-xsd-diff.mjs <dir with invoiceData.xsd, invoiceBase.xsd, common.xsd> "<clone>/sample/Data sample" [--seed 1] [--per 60]
// NAV's XSDs import each other without a schemaLocation, so a temporary copy adds one for xmllint.
import { execFileSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { checkNavInvoiceData } from "../hungary-nav.mjs";

const [schemaDir, seedDir] = process.argv.slice(2).filter((a) => !a.startsWith("--") && Number.isNaN(Number(a)));
if (!schemaDir || !seedDir) { console.error("usage: node eval/hu-xsd-diff.mjs <xsd dir> <sample dir>"); process.exit(2); }
const arg = (k, d) => { const i = process.argv.indexOf(k); return i === -1 ? d : Number(process.argv[i + 1]); };
let s = arg("--seed", 1);
const rand = () => { s = (s * 1664525 + 1013904223) % 4294967296; return s / 4294967296; };
const pick = (a) => a[Math.floor(rand() * a.length)];

const work = mkdtempSync(join(tmpdir(), "hu-diff-"));
const loc = { "http://schemas.nav.gov.hu/NTCA/1.0/common": "common.xsd", "http://schemas.nav.gov.hu/OSA/3.0/base": "invoiceBase.xsd" };
for (const f of ["invoiceData.xsd", "invoiceBase.xsd", "common.xsd"]) {
  const text = readFileSync(join(schemaDir, f), "utf8").replace(/<xs:import namespace="([^"]+)"\/>/g, (m, ns) => `<xs:import namespace="${ns}" schemaLocation="${loc[ns]}"/>`);
  writeFileSync(join(work, f), text);
}
const xsd = join(work, "invoiceData.xsd");
const xmllintOk = (xml) => {
  writeFileSync(join(work, "t.xml"), xml);
  try { execFileSync("xmllint", ["--noout", "--schema", xsd, join(work, "t.xml")], { stdio: "pipe" }); return true; } catch { return false; }
};
const SCHEMA_RULES = new Set(["HU-027", "HU-028", "HU-029", "HU-030", "HU-031", "HU-032", "HU-001"]);
const ours = (xml) => !checkNavInvoiceData(xml).findings.some((f) => SCHEMA_RULES.has(f.rule));

const seeds = [];
for (const n of readdirSync(seedDir).filter((n) => n.endsWith(".xml")).sort()) {
  const xml = readFileSync(join(seedDir, n), "utf8").replace(/^\uFEFF/, "");
  if (xmllintOk(xml) && ours(xml)) seeds.push([n, xml]);
}
const LEAF = /<((?:\w+:)?[a-z]\w*)>[^<]*<\/\1>/g;
let last = "";
const leaf = (x) => { const m = [...x.matchAll(LEAF)]; if (!m.length) return null; const e = pick(m); last = e[1]; return e; };
const MUTATIONS = {
  delete: (x) => { const e = leaf(x); return e && x.slice(0, e.index) + x.slice(e.index + e[0].length); },
  duplicate: (x) => { const e = leaf(x); return e && x.slice(0, e.index) + e[0] + e[0] + x.slice(e.index + e[0].length); },
  unknown: (x) => { const e = leaf(x); return e && x.slice(0, e.index) + "<extraNote>1</extraNote>" + x.slice(e.index); },
  swap: (x) => { const m = [...x.matchAll(/(<((?:\w+:)?[a-z]\w*)>[^<]*<\/\2>)(\s*)(<((?:\w+:)?[a-z]\w*)>[^<]*<\/\5>)/g)]; if (!m.length) return null; const e = pick(m); last = `${e[2]}<->${e[5]}`; return x.slice(0, e.index) + e[4] + e[3] + e[1] + x.slice(e.index + e[0].length); },
  empty: (x) => value(x, () => ""),
  long: (x) => value(x, (v) => v + "X".repeat(600)),
  euro: (x) => value(x, (v) => v + "€"),
  text: (x) => value(x, () => "abc"),
  negative: (x) => value(x, () => "-1"),
  shortdate: (x) => value(x, (v) => (/^\d{4}-\d\d-\d\d$/.test(v) ? v.slice(0, 7) : v)),
  bool: (x) => { const m = [...x.matchAll(/<((?:\w+:)?[a-z]\w*)>(true|false)<\/\1>/g)]; if (!m.length) return null; const e = pick(m); last = e[1]; const v = pick(["true", "false", "1", "0", "", " true "].filter((b) => b !== e[2])); return x.slice(0, e.index) + `<${e[1]}>${v}</${e[1]}>` + x.slice(e.index + e[0].length); },
  dropprefix: (x) => { const m = [...x.matchAll(/<(\w+):([a-z]\w*)>([^<]*)<\/\1:\2>/g)]; if (!m.length) return null; const e = pick(m); last = `${e[1]}:${e[2]}`; return x.slice(0, e.index) + `<${e[2]}>${e[3]}</${e[2]}>` + x.slice(e.index + e[0].length); },
  addprefix: (x) => { const m = [...x.matchAll(/<([a-z]\w*)>([^<]*)<\/\1>/g)]; if (!m.length) return null; const e = pick(m); last = e[1]; return x.slice(0, e.index) + `<base:${e[1]}>${e[2]}</base:${e[1]}>` + x.slice(e.index + e[0].length); },
};
function value(x, f) {
  const e = leaf(x);
  if (!e) return null;
  const inner = e[0].slice(e[1].length + 2, -(e[1].length + 3));
  return x.slice(0, e.index) + `<${e[1]}>${f(inner)}</${e[1]}>` + x.slice(e.index + e[0].length);
}
const per = arg("--per", 60);
const tally = {};
const diffs = [];
for (const [name, xml] of seeds) {
  for (const [kind, f] of Object.entries(MUTATIONS)) {
    for (let k = 0; k < per / Object.keys(MUTATIONS).length + 1; k++) {
      const m = f(xml);
      if (!m || m === xml) continue;
      const a = xmllintOk(m), b = ours(m);
      const t = (tally[kind] ??= { n: 0, agree: 0, xmllintRejects: 0, weMiss: 0, weFlagWrongly: 0 });
      t.n++; if (!a) t.xmllintRejects++;
      if (a === b) t.agree++; else if (!a && b) { t.weMiss++; diffs.push([kind, last, name, "we pass, xmllint rejects"]); } else { t.weFlagWrongly++; diffs.push([kind, last, name, "we reject, xmllint accepts"]); }
    }
  }
}
const total = Object.values(tally).reduce((a, t) => ({ n: a.n + t.n, agree: a.agree + t.agree }), { n: 0, agree: 0 });
console.log(`${seeds.length} seeds; ${total.n} mutants; agree ${total.agree} (${(100 * total.agree / total.n).toFixed(1)}%)`);
console.table(tally);
for (const d of diffs.slice(0, 60)) console.log(d.join(" | "));
