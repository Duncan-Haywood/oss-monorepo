// Differential of the NF-e 4.00 schema layer (BR-002..BR-004, from leiauteNFe_v4.00.xsd
// and tiposBasico_v4.00.xsd read by build-nfe-schema.mjs) against xmllint on the real
// PL_009_V4 schemas. Each seed is a signed NF-e or NFC-e that xmllint accepts; each
// mutant changes one thing outside ds:Signature: a value deleted, emptied, given junk,
// lengthened, made negative or over-precise, padded with a space; an element deleted,
// duplicated or swapped with its next sibling; an unknown element inserted. xmllint
// validates the whole <NFe> against nfe_v4.00.xsd; this tool counts only its schema
// findings. The signature no longer matches any mutant; neither side checks it.
//   node eval/nfe-xsd-diff.mjs <dir with nfe_v4.00.xsd and its includes> [--per N] seed.xml ...
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { checkNfe } from "../nfe.mjs";
import { parseCfdiXml } from "../cfdi-xml.mjs";

const args = process.argv.slice(2);
const dir = args.shift();
let per = 300;
if (args[0] === "--per") { args.shift(); per = Number(args.shift()); }
const xsd = join(dir, "nfe_v4.00.xsd");
const SCHEMA = new Set(["BR-002", "BR-003", "BR-004"]);

let seed = 20261112;
const rand = (n) => { seed = (seed * 1103515245 + 12345) % 2 ** 31; return seed % n; };

const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
function serialize(n, parentNs = "") {
  const attrs = Object.entries(n.attrs).map(([k, v]) => ` ${k}="${esc(v).replace(/"/g, "&quot;")}"`).join("");
  const ns = n.ns !== parentNs ? ` xmlns="${n.ns}"` : "";
  const kids = n.children.filter((c) => c.name);
  const body = kids.length ? kids.map((c) => serialize(c, n.ns)).join("") : esc(n.text);
  return `<${n.name}${ns}${attrs}>${body}</${n.name}>`;
}
const clone = (n) => ({ ...n, attrs: { ...n.attrs }, children: n.children.map(clone) });

function nodes(root) {
  const out = [];
  (function walk(n, parent) {
    if (n.name === "Signature") return;
    out.push({ n, parent });
    for (const c of n.children) if (c.name) walk(c, n);
  })(root, null);
  return out;
}

const KINDS = ["delVal", "emptyVal", "junkVal", "longVal", "negVal", "precVal", "spaceVal", "delEl", "dupEl", "swapEl", "unknownEl"];
function mutate(root, kind) {
  const r = clone(root);
  const all = nodes(r).filter((x) => x.parent);
  const leaves = all.filter((x) => !x.n.children.some((c) => c.name));
  const pool = kind.endsWith("Val") ? leaves : all;
  if (!pool.length) return null;
  const { n, parent } = pool[rand(pool.length)];
  const i = parent.children.indexOf(n);
  switch (kind) {
    case "delVal": case "delEl": parent.children.splice(i, 1); break;
    case "emptyVal": n.text = ""; break;
    case "junkVal": n.text = "Z|Z"; break;
    case "longVal": n.text = "9".repeat(70); break;
    case "negVal": n.text = "-1"; break;
    case "precVal": n.text = (n.text || "1") + ".1234567"; break;
    case "spaceVal": n.text = ` ${n.text}`; break;
    case "dupEl": parent.children.splice(i, 0, clone(n)); break;
    case "swapEl": {
      const j = parent.children.findIndex((c, k) => k > i && c.name);
      if (j < 0) return null;
      [parent.children[i], parent.children[j]] = [parent.children[j], parent.children[i]];
      break;
    }
    case "unknownEl": parent.children.splice(i, 0, { name: "xUnknown", prefix: "", ns: parent.ns, attrs: {}, children: [], text: "x" }); break;
  }
  return { text: `<?xml version="1.0" encoding="UTF-8"?>${serialize(r)}`, where: `${parent.name}/${n.name}`, kind };
}

const tmp = mkdtempSync(join(tmpdir(), "nfe-diff-"));
function xmllintValid(text) {
  const f = join(tmp, "m.xml");
  writeFileSync(f, text);
  return spawnSync("xmllint", ["--noout", "--schema", xsd, f], { encoding: "utf8" }).status === 0;
}

const tally = { both: 0, neither: 0, onlyXsd: 0, onlyUs: 0 };
const misses = [];
for (const file of args) {
  const root = parseCfdiXml(readFileSync(file, "utf8")).root;
  const base = `<?xml version="1.0" encoding="UTF-8"?>${serialize(root)}`;
  if (!xmllintValid(base)) { console.log(`${file}: xmllint rejects the seed itself; skipped`); continue; }
  const clean = checkNfe(base).findings.filter((f) => SCHEMA.has(f.rule));
  if (clean.length) { console.log(`${file}: schema findings on the clean seed: ${clean.map((f) => f.message).join(" | ")}`); continue; }
  for (let k = 0; k < per; k++) {
    const m = mutate(root, KINDS[k % KINDS.length]);
    if (!m) continue;
    const xs = !xmllintValid(m.text);
    const us = checkNfe(m.text).findings.some((f) => SCHEMA.has(f.rule));
    if (xs && us) tally.both++; else if (!xs && !us) tally.neither++;
    else { tally[xs ? "onlyXsd" : "onlyUs"]++; misses.push(`${xs ? "xmllint only" : "this tool only"}: ${m.kind} at ${m.where}`); }
  }
}
const n = Object.values(tally).reduce((a, b) => a + b, 0);
console.log(JSON.stringify({ mutants: n, ...tally, agreement: n ? +((tally.both + tally.neither) / n).toFixed(4) : null }));
const counts = {};
for (const m of misses) counts[m] = (counts[m] || 0) + 1;
for (const [m, c] of Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 25)) console.log(`${c}\t${m}`);
