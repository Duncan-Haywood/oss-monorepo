// Differential of DSF's schema layer (DSF-002..006, from the ISSDSF 1.00/1.01 XSDs read by
// build-abrasf-schema.mjs) against xmllint on the same XSDs, as eval/abrasf-xsd-diff.mjs does
// for ABRASF: verdicts on the files as they are, then single-change mutants of every file both
// accept (a value deleted, emptied, given junk, lengthened, made negative or over-precise,
// padded with a space; an element deleted, duplicated, swapped with its next sibling; an
// unknown element inserted). Each message validates against the XSD named after its root
// (ReqEnvioLoteRPS.xsd, ...), in the layout dsf.mjs chose.
//   node eval/dsf-xsd-diff.mjs <OpenAC Schemas/ISSDSF dir> [--per N] file.xml ...
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { checkDsf, DSF_NS } from "../dsf.mjs";
import { parseCfdiXml } from "../cfdi-xml.mjs";

const args = process.argv.slice(2);
const dir = args.shift();
let per = 60;
if (args[0] === "--per") { args.shift(); per = Number(args.shift()); }
const SCHEMA = new Set(["DSF-001", "DSF-002", "DSF-003", "DSF-004", "DSF-005", "DSF-006"]);

let seed = 20261113;
const rand = (n) => { seed = (seed * 1103515245 + 12345) % 2 ** 31; return seed % n; };
const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
function serialize(n, parentNs = "") {
  const attrs = Object.entries(n.attrs).filter(([k]) => !k.includes(":") && k !== "xmlns").map(([k, v]) => ` ${k}="${esc(v).replace(/"/g, "&quot;")}"`).join("");
  const ns = n.ns !== parentNs ? ` xmlns="${n.ns}"` : "";
  const kids = n.children.filter((c) => c.name);
  const body = kids.length ? kids.map((c) => serialize(c, n.ns)).join("") : esc(n.text);
  return `<${n.name}${ns}${attrs}>${body}</${n.name}>`;
}
const clone = (n) => ({ ...n, attrs: { ...n.attrs }, children: n.children.map(clone) });
function dsfRoot(n) {
  if (n.ns === DSF_NS) return n;
  for (const c of n.children) { if (!c.name) continue; const r = dsfRoot(c); if (r) return r; }
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
    case "unknownEl": parent.children.splice(i, 0, { name: "xUnknown", prefix: "", ns: "", attrs: {}, children: [], text: "x" }); break;
  }
  return { text: `<?xml version="1.0" encoding="UTF-8"?>${serialize(r)}`, where: `${parent.name}/${n.name}`, kind };
}

const tmp = mkdtempSync(join(tmpdir(), "dsf-diff-"));
const xmllint = (text, layout, root) => {
  const f = join(tmp, "m.xml");
  writeFileSync(f, text);
  const r = spawnSync("xmllint", ["--noout", "--schema", join(dir, layout.split(" ")[1], `${root}.xsd`), f], { encoding: "utf8" });
  return { ok: r.status === 0, err: r.stderr };
};

const byRoot = {};
const verdicts = { files: 0, bothValid: 0, bothInvalid: 0, onlyXmllint: 0, onlyUs: 0 };
const disagree = [];
const seeds = [];
const seen = new Set();
for (const file of args) {
  let doc;
  try { doc = parseCfdiXml(readFileSync(file, "utf8")).root; } catch { continue; }
  const root = doc && dsfRoot(doc);
  if (!root) continue;
  const text = `<?xml version="1.0" encoding="UTF-8"?>${serialize(root)}`;
  const h = createHash("md5").update(text).digest("hex");
  if (seen.has(h)) continue;
  seen.add(h);
  const r = checkDsf(text);
  if (!r.meta.version) continue;
  verdicts.files++;
  byRoot[root.name] = (byRoot[root.name] ?? 0) + 1;
  const xs = xmllint(text, r.meta.version, root.name);
  const us = !r.findings.some((f) => SCHEMA.has(f.rule));
  if (xs.ok && us) { verdicts.bothValid++; seeds.push({ root: parseCfdiXml(text).root, v: r.meta.version }); }
  else if (!xs.ok && !us) verdicts.bothInvalid++;
  else { verdicts[xs.ok ? "onlyUs" : "onlyXmllint"]++; disagree.push(`${xs.ok ? "this tool only" : "xmllint only"}: ${file} (${r.meta.version})\n    xmllint: ${xs.err.split("\n").slice(0, 3).join(" | ")}\n    ours: ${r.findings.filter((f) => SCHEMA.has(f.rule)).map((f) => f.message).slice(0, 3).join(" | ")}`); }
}
console.log(JSON.stringify({ verdicts, byRoot }));
for (const d of disagree) console.log(`  ${d}`);

const tally = { both: 0, neither: 0, onlyXsd: 0, onlyUs: 0 };
const misses = [];
for (const { root, v } of seeds) {
  for (let k = 0; k < per; k++) {
    const m = mutate(root, KINDS[k % KINDS.length]);
    if (!m) continue;
    const r = checkDsf(m.text);
    if (r.meta.version !== v) continue; // the mutant changed the layout (CodigoServico added or removed)
    const xs = !xmllint(m.text, v, root.name).ok;
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
