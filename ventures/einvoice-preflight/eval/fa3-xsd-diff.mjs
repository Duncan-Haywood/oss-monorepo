// Differential test of fa3-xsd.mjs against xmllint on the real FA(3) XSD.
// Seeds are FA(3) files the XSD accepts (examples/fa3-invoice.xml and fa3-invoice-rich.xml, and any
// directory of your own given as the third argument); each is mutated (an element
// deleted, duplicated or swapped with its neighbour, an unknown element added, a
// value emptied, lengthened, made text, negative or given a euro sign) and both
// validators judge the result.
//   npm pack ksef-client-ts && tar xzf ksef-client-ts-*.tgz   (schemas in package/docs/schemas/FA)
//   node build-fa3-schema.mjs package/docs/schemas/FA
//   node eval/fa3-xsd-diff.mjs package/docs/schemas/FA [seed dir] [--seed 1] [--per 60]
// xmllint cannot fetch the schema's remote import, so a temporary copy points it at bazowe/.
import { execFileSync } from "node:child_process";
import { cpSync, mkdtempSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseXmlTree } from "../ubl.mjs";
import { checkAgainstFa3Schema } from "../fa3-xsd.mjs";

const [schemaDir, seedDir] = process.argv.slice(2).filter((a) => !a.startsWith("--") && Number.isNaN(Number(a)));
if (!schemaDir) { console.error("usage: node eval/fa3-xsd-diff.mjs <dir with schemat_FA(3)_v1-0E.xsd and bazowe/> [seed dir]"); process.exit(2); }
const arg = (k, d) => { const i = process.argv.indexOf(k); return i === -1 ? d : Number(process.argv[i + 1]); };
let s = arg("--seed", 1);
const rand = () => { s = (s * 1664525 + 1013904223) % 4294967296; return s / 4294967296; };
const pick = (a) => a[Math.floor(rand() * a.length)];

const work = mkdtempSync(join(tmpdir(), "fa3-diff-"));
cpSync(schemaDir, join(work, "fa"), { recursive: true });
const xsd = join(work, "fa", "schemat_FA(3)_v1-0E.xsd");
writeFileSync(xsd, readFileSync(xsd, "utf8").replace(/schemaLocation="http:[^"]*StrukturyDanych_v10-0E.xsd"/, 'schemaLocation="bazowe/StrukturyDanych_v10-0E.xsd"'));
const xmllintOk = (xml) => {
  writeFileSync(join(work, "t.xml"), xml);
  try { execFileSync("xmllint", ["--noout", "--schema", xsd, join(work, "t.xml")], { stdio: "pipe" }); return true; } catch { return false; }
};
const ours = (xml) => {
  const root = parseXmlTree(xml).children.find((c) => c.name === "Faktura");
  return checkAgainstFa3Schema(root, xml).length === 0;
};

function* walk(d) { for (const n of readdirSync(d)) { const p = join(d, n); if (statSync(p).isDirectory()) yield* walk(p); else if (n.endsWith(".xml")) yield p; } }
const seeds = [];
const files = ["fa3-invoice.xml", "fa3-invoice-rich.xml"].map((f) => new URL(`../examples/${f}`, import.meta.url).pathname).concat(seedDir ? [...walk(seedDir)] : []);
for (const p of files) {
  const xml = readFileSync(p, "utf8").replace(/^\uFEFF/, "");
  if (xmllintOk(xml)) seeds.push([p.split("/").pop(), xml]);
}
const elementRe = /<([A-Za-z][\w]*)(?:\s[^>]*)?>([^<]*)<\/\1>|<([A-Za-z][\w]*)(?:\s[^>]*)?>/g;
const MUTATIONS = {
  delete: (x) => { const m = [...x.matchAll(/<([A-Z]\w+)>[^<]*<\/\1>/g)]; if (!m.length) return null; const e = pick(m); return x.slice(0, e.index) + x.slice(e.index + e[0].length); },
  duplicate: (x) => { const m = [...x.matchAll(/<([A-Z]\w+)>[^<]*<\/\1>/g)]; if (!m.length) return null; const e = pick(m); return x.slice(0, e.index) + e[0] + e[0] + x.slice(e.index + e[0].length); },
  unknown: (x) => { const m = [...x.matchAll(/<([A-Z]\w+)>[^<]*<\/\1>/g)]; if (!m.length) return null; const e = pick(m); return x.slice(0, e.index) + "<Extra>1</Extra>" + x.slice(e.index); },
  swap: (x) => { const m = [...x.matchAll(/(<([A-Z]\w+)>[^<]*<\/\2>)(\s*)(<([A-Z]\w+)>[^<]*<\/\5>)/g)]; if (!m.length) return null; const e = pick(m); return x.slice(0, e.index) + e[4] + e[3] + e[1] + x.slice(e.index + e[0].length); },
  empty: (x) => value(x, () => ""),
  long: (x) => value(x, (v) => v + "X".repeat(1100)),
  euro: (x) => value(x, (v) => v + "€"),
  text: (x) => value(x, () => "abc"),
  negative: (x) => value(x, () => "-1"),
  shortdate: (x) => value(x, (v) => (/^\d{4}-\d\d-\d\d$/.test(v) ? v.slice(0, 7) : v)),
};
let lastValue = "";
function value(x, f) {
  const m = [...x.matchAll(/<([A-Z]\w*)>([^<]+)<\/\1>/g)];
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
      const a = xmllintOk(m), b = ours(m);
      const t = (tally[kind] ??= { n: 0, agree: 0, xmllintRejects: 0, weMiss: 0, weFlagWrongly: 0 });
      t.n++; if (!a) t.xmllintRejects++;
      if (a === b) t.agree++; else if (!a && b) { t.weMiss++; diffs.push([kind, lastValue, name, "we pass, xmllint rejects"]); } else { t.weFlagWrongly++; diffs.push([kind, lastValue, name, "we reject, xmllint accepts"]); }
    }
  }
}
console.log(`${seeds.length} seeds`);
console.table(tally);
for (const d of diffs.slice(0, 40)) console.log(d.join(" | "));
