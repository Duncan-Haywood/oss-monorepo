// Differential of the ABRASF schema layer (ABR-002..ABR-006, from the 2.03 and 2.04 XSDs
// read by build-abrasf-schema.mjs) against xmllint on the same schemas.
//   1. Verdicts on the files as they are: each file's ABRASF element (the one abrasf.mjs
//      checks, unwrapped from SOAP or a reply) is validated by xmllint against the layout
//      this tool chose, and both verdicts (valid / not valid) are compared.
//   2. Mutants: every file both accept is a seed; each mutant changes one thing outside
//      ds:Signature (as eval/nfse-xsd-diff.mjs: a value deleted, emptied, given junk,
//      lengthened, made negative or over-precise, padded with a space; an element deleted,
//      duplicated or swapped with its next sibling; an unknown element inserted).
// xmllint needs the two XSDs with xmldsig beside them; nfse_v204.xsd as published puts
// minOccurs/maxOccurs on the global CompNfse element, which xmllint refuses to compile, so
// strip those two attributes from that line in your copy (they mean nothing there).
//   node eval/abrasf-xsd-diff.mjs <dir with 2.03/nfse_v203.xsd and 2.04/nfse_v204.xsd> [--per N] file.xml ...
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { checkAbrasf, ABRASF_NS } from "../abrasf.mjs";
import { parseCfdiXml } from "../cfdi-xml.mjs";
import { VERSIONS, rootsOf } from "../abrasf-xsd.mjs";

const args = process.argv.slice(2);
const dir = args.shift();
let per = 60;
if (args[0] === "--per") { args.shift(); per = Number(args.shift()); }
const XSD = { "2.03": join(dir, "2.03/nfse_v203.xsd"), "2.04": join(dir, "2.04/nfse_v204.xsd") };
const SCHEMA = new Set(["ABR-001", "ABR-002", "ABR-003", "ABR-004", "ABR-005", "ABR-006"]);

let seed = 20261113;
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
const ROOTS = new Set(VERSIONS.flatMap(rootsOf));
function abrasfRoot(n) {
  if (n.ns === ABRASF_NS && ROOTS.has(n.name)) return n;
  for (const c of n.children) { if (!c.name) continue; const r = abrasfRoot(c); if (r) return r; }
  return null;
}
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

const tmp = mkdtempSync(join(tmpdir(), "abrasf-diff-"));
const xmllintValid = (text, v) => {
  const f = join(tmp, "m.xml");
  writeFileSync(f, text);
  return spawnSync("xmllint", ["--noout", "--schema", XSD[v], f], { encoding: "utf8" }).status === 0;
};
const ours = (text) => checkAbrasf(text);

const verdicts = { files: 0, bothValid: 0, bothInvalid: 0, onlyXmllint: 0, onlyUs: 0 };
const disagree = [];
const seeds = [];
const seen = new Set();
for (const file of args) {
  const raw = readFileSync(file, "utf8");
  let doc;
  try { doc = parseCfdiXml(raw).root; } catch { continue; }
  const root = doc && abrasfRoot(doc);
  if (!root) continue;
  const text = `<?xml version="1.0" encoding="UTF-8"?>${serialize(root)}`;
  const h = createHash("md5").update(text).digest("hex");
  if (seen.has(h)) continue;
  seen.add(h);
  const r = ours(text);
  const v = r.meta.version;
  if (!XSD[v]) continue; // a layout this tool does not read (1.00, 2.00-2.02)
  verdicts.files++;
  const xs = xmllintValid(text, v);
  const us = !r.findings.some((f) => SCHEMA.has(f.rule));
  if (xs && us) { verdicts.bothValid++; seeds.push({ root: parseCfdiXml(text).root, v }); }
  else if (!xs && !us) verdicts.bothInvalid++;
  else { verdicts[xs ? "onlyUs" : "onlyXmllint"]++; disagree.push(`${xs ? "this tool only" : "xmllint only"}: ${file} (${v})`); }
}
console.log(JSON.stringify({ verdicts }));
for (const d of disagree) console.log(`  ${d}`);

const tally = { both: 0, neither: 0, onlyXsd: 0, onlyUs: 0 };
const misses = [];
for (const { root, v } of seeds) {
  for (let k = 0; k < per; k++) {
    const m = mutate(root, KINDS[k % KINDS.length]);
    if (!m) continue;
    const r = ours(m.text);
    if (r.meta.version !== v && r.meta.version) continue; // the mutant changed the layout guess
    const xs = !xmllintValid(m.text, v);
    const us = r.findings.some((f) => SCHEMA.has(f.rule));
    if (xs && us) tally.both++; else if (!xs && !us) tally.neither++;
    else { tally[xs ? "onlyXsd" : "onlyUs"]++; misses.push(`${xs ? "xmllint only" : "this tool only"}: ${m.kind} at ${m.where}`); }
  }
}
const n = Object.values(tally).reduce((a, b) => a + b, 0);
console.log(JSON.stringify({ seeds: seeds.length, mutants: n, ...tally, agreement: n ? +((tally.both + tally.neither) / n).toFixed(4) : null }));
const counts = {};
for (const m of misses) counts[m] = (counts[m] || 0) + 1;
for (const [m, c] of Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 25)) console.log(`${c}\t${m}`);
