// Differential test of fatturapa-xsd.mjs against xmllint on the real XSD.
// Seeds are the corpus files the XSD accepts; each is mutated (an element deleted,
// duplicated or swapped with its neighbour, an unknown element added, a value
// emptied, lengthened or given a euro sign) and both validators judge the result.
//   git clone --depth 1 https://github.com/ZUGFeRD/corpus
//   node build-fatturapa-schema.mjs [/path/to/Schema_VFPR12_v1.2.3.xsd]   (no path: pinned download)
//   node eval/fatturapa-xsd-diff.mjs <corpus>/fatturaPA <Schema_VFPR12_v1.2.3.xsd> [--seed 1] [--per 60]
// xmllint needs the xmldsig import; a stub schema stands in for ds:Signature.
// Value mutations skip TipoDocumento, RegimeFiscale and Natura, whose lists are
// checked by IT-008/IT-006/IT-011 (outside this schema check); every other code list
// is enforced since the 1.2.3 upgrade, and the "code" mutation swaps a coded value
// for another code from the same list, a made-up one, or a retired one.
import { execFileSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { checkFatturaPa } from "../fatturapa.mjs";
import schema from "../fatturapa-xsd-data.mjs";

const [dir, xsdPath] = process.argv.slice(2);
if (!dir || !xsdPath) { console.error("usage: node eval/fatturapa-xsd-diff.mjs <corpus>/fatturaPA <Schema_VFPR12_v1.2.3.xsd>"); process.exit(2); }
const arg = (k, d) => { const i = process.argv.indexOf(k); return i === -1 ? d : Number(process.argv[i + 1]); };
let s = arg("--seed", 1);
const rand = () => { s = (s * 1664525 + 1013904223) % 4294967296; return s / 4294967296; };
const pick = (a) => a[Math.floor(rand() * a.length)];

const work = mkdtempSync(join(tmpdir(), "fp-diff-"));
writeFileSync(join(work, "dsstub.xsd"), `<?xml version="1.0"?><xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema" targetNamespace="http://www.w3.org/2000/09/xmldsig#" elementFormDefault="qualified"><xs:element name="Signature"><xs:complexType><xs:sequence><xs:any processContents="skip" minOccurs="0" maxOccurs="unbounded"/></xs:sequence><xs:anyAttribute processContents="skip"/></xs:complexType></xs:element></xs:schema>`);
writeFileSync(join(work, "fp.xsd"), readFileSync(xsdPath, "utf8").replace(/schemaLocation="http:[^"]*xmldsig[^"]*"/, 'schemaLocation="dsstub.xsd"'));
const xmllintOk = (xml) => {
  writeFileSync(join(work, "t.xml"), xml);
  try { execFileSync("xmllint", ["--noout", "--schema", join(work, "fp.xsd"), join(work, "t.xml")], { stdio: "pipe" }); return true; } catch { return false; }
};
const ours = (xml) => checkFatturaPa(xml).findings.filter((f) => /^IT-(018|019|02[0-2])$/.test(f.rule) || (f.rule === "IT-021")).length === 0;

function* walk(d) { for (const n of readdirSync(d)) { const p = join(d, n); if (statSync(p).isDirectory()) yield* walk(p); else if (n.endsWith(".xml")) yield p; } }
const seeds = [];
for (const p of walk(dir)) {
  let xml = readFileSync(p, "utf8").replace(/^﻿/, "");
  if (p.endsWith("FPR02.xml")) xml = xml.replace(/(\s*<PECDestinatario>[\s\S]*?<\/PECDestinatario>)(\s*<ContattiTrasmittente>[\s\S]*?<\/ContattiTrasmittente>)/, "$2$1");
  if (xmllintOk(xml)) seeds.push([p.split("/").pop(), xml]);
}
const NO_VALUE = /^(TipoDocumento|RegimeFiscale|Natura)$/;
// Element name -> code list, for every element typed by an enumeration.
const CODED = new Map();
for (const steps of Object.values(schema.complex)) {
  const walk = (ss) => { for (const st of ss) { if (st.choice) st.choice.forEach(walk); else if (schema.enums[st.type] && !NO_VALUE.test(st.el)) CODED.set(st.el, st.type); } };
  walk(steps);
}
const RETIRED = new Map((schema.retired ?? []).map((r) => [r.type, r.code]));
const elementRe = /<([A-Za-z][\w]*)(?:\s[^>]*)?>([^<]*)<\/\1>|<([A-Za-z][\w]*)(?:\s[^>]*)?>/g;
const MUTATIONS = {
  delete: (x) => { const m = [...x.matchAll(/<([A-Z]\w+)>[^<]*<\/\1>/g)]; if (!m.length) return null; const e = pick(m); return x.slice(0, e.index) + x.slice(e.index + e[0].length); },
  duplicate: (x) => { const m = [...x.matchAll(/<([A-Z]\w+)>[^<]*<\/\1>/g)]; if (!m.length) return null; const e = pick(m); return x.slice(0, e.index) + e[0] + e[0] + x.slice(e.index + e[0].length); },
  unknown: (x) => { const m = [...x.matchAll(/<([A-Z]\w+)>[^<]*<\/\1>/g)]; if (!m.length) return null; const e = pick(m); return x.slice(0, e.index) + "<Extra>1</Extra>" + x.slice(e.index); },
  swap: (x) => { const m = [...x.matchAll(/(<([A-Z]\w+)>[^<]*<\/\2>)(\s*)(<([A-Z]\w+)>[^<]*<\/\5>)/g)]; if (!m.length) return null; const e = pick(m); return x.slice(0, e.index) + e[4] + e[3] + e[1] + x.slice(e.index + e[0].length); },
  empty: (x) => value(x, () => ""),
  long: (x) => value(x, (v) => v + "X".repeat(1100)),
  euro: (x) => value(x, (v) => v + "€"),
  code: (x) => {
    const m = [...x.matchAll(/<([A-Z]\w+)>([^<]+)<\/\1>/g)].filter((e) => CODED.has(e[1]));
    if (!m.length) return null;
    const e = pick(m);
    const list = schema.enums[CODED.get(e[1])];
    const r = rand();
    // A made-up code keeps the list's shape (MP23 -> MP24, RT06 -> RT07, TP03 -> TP04), so a
    // length or pattern facet cannot catch it; only the list can.
    const next = () => {
      const m2 = /^([A-Z]*)(\d+)$/.exec(e[2].trim());
      if (!m2) return e[2].trim() + "X";
      const nums = list.map((c) => (c.startsWith(m2[1]) && /^\d+$/.test(c.slice(m2[1].length)) ? Number(c.slice(m2[1].length)) : 0));
      return m2[1] + String(Math.max(...nums) + 1).padStart(m2[2].length, "0");
    };
    const v = r < 0.4 ? pick(list) : r < 0.8 ? next() : (RETIRED.get(CODED.get(e[1])) ?? next());
    lastValue = `${e[1]}=${v}`;
    return x.slice(0, e.index) + `<${e[1]}>${v}</${e[1]}>` + x.slice(e.index + e[0].length);
  },
};
let lastValue = "";
function value(x, f) {
  const m = [...x.matchAll(/<([A-Z]\w+)>([^<]+)<\/\1>/g)].filter((e) => !NO_VALUE.test(e[1]));
  if (!m.length) return null;
  const e = pick(m);
  lastValue = e[1];
  return x.slice(0, e.index) + `<${e[1]}>${f(e[2])}</${e[1]}>` + x.slice(e.index + e[0].length);
}
const per = arg("--per", 60);
const tally = {};
const diffs = [];
for (const [name, xml] of seeds) {
  for (const [kind, f] of Object.entries(MUTATIONS)) {
    for (let k = 0; k < per / Object.keys(MUTATIONS).length + 1; k++) {
      const m = f(xml);
      if (!m) continue;
      // A retired code (CausalePagamento Z) passes the XSD but its comment retires it: we refuse it on purpose.
      const retiredCode = kind === "code" && [...RETIRED.values()].some((c) => lastValue.endsWith(`=${c}`));
      const a = xmllintOk(m) && !retiredCode, b = ours(m);
      const t = (tally[kind] ??= { n: 0, agree: 0, xmllintRejects: 0, weMiss: 0, weFlagWrongly: 0 });
      t.n++; if (!a) t.xmllintRejects++;
      if (a === b) t.agree++; else if (!a && b) { t.weMiss++; diffs.push([kind, lastValue, name, "we pass, xmllint rejects"]); } else { t.weFlagWrongly++; diffs.push([kind, lastValue, name, "we reject, xmllint accepts"]); }
    }
  }
}
console.log(`${seeds.length} seeds`);
console.table(tally);
for (const d of diffs.slice(0, 40)) console.log(d.join(" | "));
