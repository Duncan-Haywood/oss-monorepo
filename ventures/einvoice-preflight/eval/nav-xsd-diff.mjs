// Differential test of nav-xsd.mjs against xmllint on NAV's real Online Számla 3.0 XSDs.
// Seeds are NAV's own InvoiceData samples (all 30 pass xmllint); each is mutated (a leaf
// element deleted, duplicated or swapped with its neighbour, an unknown element added, a
// leaf moved into another namespace, a value emptied, lengthened, made text, negative,
// given extra decimals or a bad date) and both validators judge the result.
//   git clone --depth 1 https://github.com/nav-gov-hu/Online-Invoice.git /tmp/oi
//   git clone https://github.com/nav-gov-hu/Common.git /tmp/common && git -C /tmp/common checkout common-1.0.0
//   node eval/nav-xsd-diff.mjs /tmp/oi /tmp/common [--seed 1] [--per 40]
// invoiceData.xsd imports the NTCA common and OSA base namespaces without a schemaLocation,
// so a temporary copy adds one for xmllint. Both repositories are MIT (NAV); nothing is copied
// into the tree.
import { execFileSync } from "node:child_process";
import { copyFileSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { checkAgainstNavSchema } from "../nav-xsd.mjs";

const [oi, common] = process.argv.slice(2).filter((a) => !a.startsWith("--") && Number.isNaN(Number(a)));
if (!oi || !common) { console.error("usage: node eval/nav-xsd-diff.mjs <Online-Invoice clone> <Common clone at common-1.0.0>"); process.exit(2); }
const arg = (k, d) => { const i = process.argv.indexOf(k); return i === -1 ? d : Number(process.argv[i + 1]); };
let s = arg("--seed", 1);
const rand = () => { s = (s * 1664525 + 1013904223) % 4294967296; return s / 4294967296; };
const pick = (a) => a[Math.floor(rand() * a.length)];

const work = mkdtempSync(join(tmpdir(), "nav-diff-"));
const osa = join(oi, "src/schemas/nav/gov/hu/OSA");
copyFileSync(join(common, "schemas/src/main/resources/xsd/hu/gov/nav/schemas/NTCA/1.0/common/common.xsd"), join(work, "common.xsd"));
for (const f of ["invoiceBase.xsd", "invoiceData.xsd"]) {
  writeFileSync(join(work, f), readFileSync(join(osa, f), "utf8")
    .replace('<xs:import namespace="http://schemas.nav.gov.hu/NTCA/1.0/common"/>', '<xs:import namespace="http://schemas.nav.gov.hu/NTCA/1.0/common" schemaLocation="common.xsd"/>')
    .replace('<xs:import namespace="http://schemas.nav.gov.hu/OSA/3.0/base"/>', '<xs:import namespace="http://schemas.nav.gov.hu/OSA/3.0/base" schemaLocation="invoiceBase.xsd"/>'));
}
const xsd = join(work, "invoiceData.xsd");
const xmllintOk = (xml) => {
  writeFileSync(join(work, "t.xml"), xml);
  try { execFileSync("xmllint", ["--noout", "--schema", xsd, join(work, "t.xml")], { stdio: "pipe" }); return true; } catch { return false; }
};
const ours = (xml) => checkAgainstNavSchema(xml).length === 0;

const sampleDir = join(oi, "sample", "Data sample");
const seeds = [];
for (const n of readdirSync(sampleDir).filter((n) => n.endsWith(".xml")).sort()) {
  const xml = readFileSync(join(sampleDir, n), "utf8").replace(/^﻿/, "");
  if (xmllintOk(xml)) seeds.push([n, xml]);
}
// A leaf: <p:name>text</p:name> or <name>text</name>.
const LEAF = /<((?:[a-z]+:)?([A-Za-z]\w*))>([^<]*)<\/\1>/g;
let last = "";
const leafEdit = (x, f) => {
  const m = [...x.matchAll(LEAF)];
  if (!m.length) return null;
  const e = pick(m);
  last = e[2];
  const r = f(e);
  return r === null ? null : x.slice(0, e.index) + r + x.slice(e.index + e[0].length);
};
const valueEdit = (fn) => (x) => leafEdit(x, (e) => { const v = fn(e[3]); return v === null ? null : `<${e[1]}>${v}</${e[1]}>`; });
const MUTATIONS = {
  delete: (x) => leafEdit(x, () => ""),
  duplicate: (x) => leafEdit(x, (e) => e[0] + e[0]),
  unknown: (x) => leafEdit(x, (e) => "<extraField>1</extraField>" + e[0]),
  swap: (x) => {
    const m = [...x.matchAll(/(<((?:[a-z]+:)?([A-Za-z]\w*))>[^<]*<\/\2>)(\s*)(<((?:[a-z]+:)?([A-Za-z]\w*))>[^<]*<\/\6>)/g)].filter((e) => e[3] !== e[7]);
    if (!m.length) return null;
    const e = pick(m);
    last = `${e[3]}<->${e[7]}`;
    return x.slice(0, e.index) + e[5] + e[4] + e[1] + x.slice(e.index + e[0].length);
  },
  namespace: (x) => leafEdit(x, (e) => {
    const [pre, name] = e[1].includes(":") ? e[1].split(":") : ["", e[1]];
    const to = pick(["", "base", "common"].filter((p) => p !== pre));
    const q = to ? `${to}:${name}` : name;
    return `<${q}>${e[3]}</${q}>`;
  }),
  empty: valueEdit(() => ""),
  long: valueEdit((v) => v + "X".repeat(600)),
  text: valueEdit(() => "abc"),
  negative: valueEdit(() => "-1"),
  decimals: valueEdit((v) => (/^-?\d+(\.\d+)?$/.test(v) ? `${v.split(".")[0]}.123456789012` : null)),
  baddate: valueEdit((v) => (/^\d{4}-\d\d-\d\d/.test(v) ? v.replace(/^(\d{4})-\d\d/, "$1-13") : null)),
};
const per = arg("--per", 40);
const tally = {};
const diffs = [];
for (const [name, xml] of seeds) {
  for (const [kind, f] of Object.entries(MUTATIONS)) {
    for (let k = 0; k < Math.ceil(per / Object.keys(MUTATIONS).length); k++) {
      const m = f(xml);
      if (!m || m === xml) continue;
      const a = xmllintOk(m), b = ours(m);
      const t = (tally[kind] ??= { n: 0, agree: 0, xmllintRejects: 0, weMiss: 0, weFlagWrongly: 0 });
      t.n++; if (!a) t.xmllintRejects++;
      if (a === b) t.agree++;
      else if (!a && b) { t.weMiss++; diffs.push([kind, last, name, "we pass, xmllint rejects"]); }
      else { t.weFlagWrongly++; diffs.push([kind, last, name, "we reject, xmllint accepts"]); }
    }
  }
}
const total = Object.values(tally).reduce((a, t) => ({ n: a.n + t.n, agree: a.agree + t.agree, rej: a.rej + t.xmllintRejects }), { n: 0, agree: 0, rej: 0 });
console.log(`${seeds.length} seeds; ${total.n} mutants; xmllint rejects ${total.rej}; agree ${total.agree} (${(100 * total.agree / total.n).toFixed(1)}%)`);
console.table(tally);
for (const d of diffs.slice(0, 40)) console.log(d.join(" | "));
