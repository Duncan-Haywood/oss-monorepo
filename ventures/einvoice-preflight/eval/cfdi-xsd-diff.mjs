// Differential of cfdi.mjs's schema layer (MX-002..MX-006) against xmllint on SAT's
// real cfdv40.xsd. Seeds are CFDI 4.0 files; their Complemento is dropped first (its
// xs:any is strict, so a stamp would need the TimbreFiscalDigital schema too). Each
// seed is mutated (an attribute deleted, emptied, given junk, lengthened, made
// negative or over-precise; an unknown attribute; an element deleted, duplicated or
// swapped with its neighbour) and both sides say schema-valid or not.
//   node eval/cfdi-xsd-diff.mjs <dir with cfd/4/cfdv40.xsd, cfd/catalogos/catCFDI.xsd,
//        cfd/tipoDatos/tdCFDI/tdCFDI.xsd> [--per N] seed.xml ...
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { checkCfdi } from "../cfdi.mjs";
import { parseCfdiXml } from "../cfdi-xml.mjs";

const args = process.argv.slice(2);
const dir = args.shift();
let per = 400;
if (args[0] === "--per") { args.shift(); per = Number(args.shift()); }
const seeds = args;
const xsd = join(dir, "cfd/4/cfdv40.xsd");
const SCHEMA_RULES = new Set(["MX-002", "MX-003", "MX-004", "MX-005", "MX-006"]);

let seed = 20261112;
const rand = (n) => { seed = (seed * 1103515245 + 12345) % 2 ** 31; return seed % n; };

function tags(text) {
  return [...text.matchAll(/<cfdi:([A-Za-z]+)\b([^>]*?)(\/?)>/g)].map((m) => ({ index: m.index, len: m[0].length, name: m[1], attrs: [...m[2].matchAll(/ ([^\s=]+)="([^"]*)"/g)].map((a) => ({ n: a[1], v: a[2] })), self: m[3] === "/" }));
}
// The whole element (start tag to matching end) starting at a tag.
function span(text, t) {
  if (t.self) return [t.index, t.index + t.len];
  const close = `</cfdi:${t.name}>`;
  let depth = 0, i = t.index;
  const re = new RegExp(`<cfdi:${t.name}\\b[^>]*?(/?)>|</cfdi:${t.name}>`, "g");
  re.lastIndex = i;
  for (let m; (m = re.exec(text));) {
    if (m[0].startsWith("</")) { depth--; if (depth === 0) return [t.index, m.index + close.length]; }
    else if (m[1] !== "/") depth++;
    else if (depth === 0) return [t.index, m.index + m[0].length];
  }
  return [t.index, t.index + t.len];
}

const KINDS = ["delAttr", "emptyAttr", "junkAttr", "longAttr", "negAttr", "precAttr", "unknownAttr", "delEl", "dupEl", "swapEl"];
function mutate(text, kind) {
  const ts = tags(text).filter((t) => t.name !== "Comprobante" || kind.endsWith("Attr"));
  const t = ts[rand(ts.length)];
  const head = text.slice(t.index, t.index + t.len);
  if (kind.endsWith("Attr") && kind !== "unknownAttr") {
    const as = t.attrs.filter((a) => !a.n.startsWith("xmlns") && !a.n.includes(":"));
    if (!as.length) return null;
    const a = as[rand(as.length)];
    const val = { delAttr: null, emptyAttr: "", junkAttr: "Z|Z", longAttr: "9".repeat(1100), negAttr: "-1", precAttr: (a.v || "1") + "1234567" }[kind];
    const re = new RegExp(` ${a.n}="[^"]*"`);
    const nh = head.replace(re, val === null ? "" : ` ${a.n}="${val}"`);
    return text.slice(0, t.index) + nh + text.slice(t.index + t.len);
  }
  if (kind === "unknownAttr") return text.slice(0, t.index) + head.replace(/^<cfdi:([A-Za-z]+)/, '<cfdi:$1 Zeta="1"') + text.slice(t.index + t.len);
  const [s, e] = span(text, t);
  if (kind === "delEl") return text.slice(0, s) + text.slice(e);
  if (kind === "dupEl") return text.slice(0, e) + text.slice(s, e) + text.slice(e);
  // swap with the next sibling element
  const after = tags(text).find((x) => x.index >= e);
  if (!after) return null;
  const [s2, e2] = span(text, after);
  if (text.slice(e, s2).trim()) return null; // not a sibling
  return text.slice(0, s) + text.slice(s2, e2) + text.slice(e, s2) + text.slice(s, e) + text.slice(e2);
}

const work = mkdtempSync(join(tmpdir(), "cfdi-diff-"));
const cases = [];
for (const f of seeds) {
  let text = readFileSync(f, "utf8").replace(/\s*<cfdi:Complemento>[\s\S]*?<\/cfdi:Complemento>/, "").replace(/\s*<cfdi:Complemento\/>/, "");
  text = text.replace(/ xsi:schemaLocation="[^"]*"/, "");
  cases.push({ seed: f, kind: "seed", text });
  for (const kind of KINDS) for (let i = 0; i < per / KINDS.length; i++) {
    const m = mutate(text, kind);
    if (m && m !== text) cases.push({ seed: f, kind, text: m });
  }
}
const paths = cases.map((c, i) => { const p = join(work, `c${i}.xml`); writeFileSync(p, c.text); return p; });
const verdict = new Map();
for (let i = 0; i < paths.length; i += 400) {
  let out = "";
  try { out = execFileSync("xmllint", ["--noout", "--schema", xsd, ...paths.slice(i, i + 400)], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], maxBuffer: 1 << 28 }); }
  catch (e) { out = (e.stdout || "") + (e.stderr || ""); }
  for (const m of out.matchAll(/(\S+\.xml) (validates|fails to validate)/g)) verdict.set(m[1], m[2] === "validates");
}
let agree = 0, ours = 0, theirs = 0;
const byKind = {}, examples = [];
cases.forEach((c, i) => {
  const lint = verdict.get(paths[i]);
  let mine;
  try { mine = !checkCfdi(c.text).findings.some((f) => SCHEMA_RULES.has(f.rule) || f.rule === "MX-001"); } catch { mine = false; }
  const k = (byKind[c.kind] ||= { n: 0, agree: 0 });
  k.n++;
  if (lint === undefined) { // not well-formed for xmllint
    if (!mine) { agree++; k.agree++; } else theirs++;
    return;
  }
  if (lint === mine) { agree++; k.agree++; }
  else { if (mine) theirs++; else ours++; if (examples.length < 8) examples.push({ kind: c.kind, seed: c.seed.split("/").pop(), lint, file: paths[i] }); }
});
console.log(`${cases.length} cases from ${seeds.length} seeds; ${agree} of ${cases.length} verdicts agree with xmllint`);
console.log(`we flag, xmllint accepts: ${ours}; xmllint rejects, we pass: ${theirs}`);
for (const [k, v] of Object.entries(byKind)) console.log(`  ${k.padEnd(12)} ${v.agree}/${v.n}`);
for (const e of examples) console.log("  disagree", e);
