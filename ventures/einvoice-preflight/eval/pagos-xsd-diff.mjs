// Differential of the Pagos 2.0 schema layer (MX-002..MX-006 under
// /Comprobante/Complemento/Pagos, from Pagos20.xsd read by build-cfdi-schema.mjs)
// against xmllint on SAT's real Pagos20.xsd. Each seed is a type P CFDI 4.0; only its
// pago20: elements are mutated (an attribute deleted, emptied, given junk, lengthened,
// made negative or over-precise; an unknown attribute; an element deleted, duplicated
// or swapped with its neighbour). xmllint judges the pago20:Pagos subtree on its own
// against Pagos20.xsd; this tool judges the whole file and counts only schema findings
// inside Pagos. Seeds whose Pagos subtree xmllint rejects unmutated are left out.
//   node eval/pagos-xsd-diff.mjs <dir with Pagos/Pagos20.xsd, catalogos/catCFDI.xsd,
//        catalogos/Pagos/catPagos.xsd, tipoDatos/tdCFDI/tdCFDI.xsd> [--per N] seed.xml ...
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { checkCfdi } from "../cfdi.mjs";

const args = process.argv.slice(2);
const dir = args.shift();
let per = 400;
if (args[0] === "--per") { args.shift(); per = Number(args.shift()); }
const xsd = join(dir, "Pagos/Pagos20.xsd");
const SCHEMA_RULES = new Set(["MX-002", "MX-003", "MX-004", "MX-005", "MX-006"]);
const NS = "http://www.sat.gob.mx/Pagos20";

let seed = 20261112;
const rand = (n) => { seed = (seed * 1103515245 + 12345) % 2 ** 31; return seed % n; };

function tags(text) {
  return [...text.matchAll(/<pago20:([A-Za-z]+)\b([^>]*?)(\/?)>/g)].map((m) => ({ index: m.index, len: m[0].length, name: m[1], attrs: [...m[2].matchAll(/ ([^\s=]+)="([^"]*)"/g)].map((a) => ({ n: a[1], v: a[2] })), self: m[3] === "/" }));
}
function span(text, t) {
  if (t.self) return [t.index, t.index + t.len];
  const close = `</pago20:${t.name}>`;
  let depth = 0;
  const re = new RegExp(`<pago20:${t.name}\\b[^>]*?(/?)>|</pago20:${t.name}>`, "g");
  re.lastIndex = t.index;
  for (let m; (m = re.exec(text));) {
    if (m[0].startsWith("</")) { depth--; if (depth === 0) return [t.index, m.index + close.length]; }
    else if (m[1] !== "/") depth++;
    else if (depth === 0) return [t.index, m.index + m[0].length];
  }
  return [t.index, t.index + t.len];
}

const KINDS = ["delAttr", "emptyAttr", "junkAttr", "longAttr", "negAttr", "precAttr", "unknownAttr", "delEl", "dupEl", "swapEl"];
function mutate(text, kind) {
  const ts = tags(text).filter((t) => t.name !== "Pagos" || kind.endsWith("Attr"));
  if (!ts.length) return null;
  const t = ts[rand(ts.length)];
  const head = text.slice(t.index, t.index + t.len);
  if (kind.endsWith("Attr") && kind !== "unknownAttr") {
    const as = t.attrs.filter((a) => !a.n.startsWith("xmlns") && !a.n.includes(":"));
    if (!as.length) return null;
    const a = as[rand(as.length)];
    const val = { delAttr: null, emptyAttr: "", junkAttr: "Z|Z", longAttr: "9".repeat(1100), negAttr: "-1", precAttr: (a.v || "1") + "1234567" }[kind];
    const nh = head.replace(new RegExp(` ${a.n}="[^"]*"`), val === null ? "" : ` ${a.n}="${val}"`);
    return text.slice(0, t.index) + nh + text.slice(t.index + t.len);
  }
  if (kind === "unknownAttr") return text.slice(0, t.index) + head.replace(/^<pago20:([A-Za-z]+)/, '<pago20:$1 Zeta="1"') + text.slice(t.index + t.len);
  const [s, e] = span(text, t);
  if (kind === "delEl") return text.slice(0, s) + text.slice(e);
  if (kind === "dupEl") return text.slice(0, e) + text.slice(s, e) + text.slice(e);
  const after = tags(text).find((x) => x.index >= e);
  if (!after) return null;
  const [s2, e2] = span(text, after);
  if (text.slice(e, s2).trim()) return null;
  return text.slice(0, s) + text.slice(s2, e2) + text.slice(e, s2) + text.slice(s, e) + text.slice(e2);
}

// The pago20:Pagos subtree as its own document.
function subtree(text) {
  const m = /<pago20:Pagos\b[\s\S]*<\/pago20:Pagos>/.exec(text);
  if (!m) return null;
  return `<?xml version="1.0" encoding="UTF-8"?>\n` + m[0].replace(/^<pago20:Pagos\b(?![^>]*xmlns:pago20=)/, `<pago20:Pagos xmlns:pago20="${NS}"`);
}

const work = mkdtempSync(join(tmpdir(), "pagos-diff-"));
function lint(texts) {
  const paths = texts.map((t, i) => { const p = join(work, `p${i}-${Math.random().toString(36).slice(2)}.xml`); writeFileSync(p, t ?? ""); return p; });
  const verdict = new Map();
  for (let i = 0; i < paths.length; i += 400) {
    const r = spawnSync("xmllint", ["--noout", "--schema", xsd, ...paths.slice(i, i + 400)], { encoding: "utf8", maxBuffer: 1 << 28 });
    const out = (r.stdout || "") + (r.stderr || "");
    for (const m of out.matchAll(/(\S+\.xml) (validates|fails to validate)/g)) verdict.set(m[1], m[2] === "validates");
  }
  return paths.map((p) => verdict.get(p));
}
const mineOk = (text) => {
  try { return !checkCfdi(text).findings.some((f) => SCHEMA_RULES.has(f.rule) && f.path.startsWith("/Comprobante/Complemento/Pagos")); } catch { return false; }
};

const seeds = [];
for (const f of args) {
  const text = readFileSync(f, "utf8");
  const [ok] = lint([subtree(text)]);
  if (ok && mineOk(text)) seeds.push({ f, text });
  else console.log(`seed left out (Pagos subtree not schema-valid unmutated: xmllint ${ok}, ours ${mineOk(text)}): ${f.split("/").pop()}`);
}
const cases = [];
for (const s of seeds) {
  cases.push({ seed: s.f, kind: "seed", text: s.text });
  for (const kind of KINDS) for (let i = 0; i < per / KINDS.length; i++) {
    const m = mutate(s.text, kind);
    if (m && m !== s.text) cases.push({ seed: s.f, kind, text: m });
  }
}
const verdicts = lint(cases.map((c) => subtree(c.text)));
let agree = 0, ours = 0, theirs = 0;
const byKind = {}, examples = [];
cases.forEach((c, i) => {
  const l = verdicts[i];
  const mine = mineOk(c.text);
  const k = (byKind[c.kind] ||= { n: 0, agree: 0 });
  k.n++;
  const lv = l === undefined ? false : l; // not well-formed: invalid
  if (lv === mine) { agree++; k.agree++; }
  else { if (mine) theirs++; else ours++; if (examples.length < 8) examples.push({ kind: c.kind, seed: c.seed.split("/").pop(), lint: l, diff: c.text.length - (seeds.find((s) => s.f === c.seed)?.text.length || 0) }); }
});
console.log(`${cases.length} cases from ${seeds.length} seeds; ${agree} of ${cases.length} verdicts agree with xmllint`);
console.log(`we flag, xmllint accepts: ${ours}; xmllint rejects, we pass: ${theirs}`);
for (const [k, v] of Object.entries(byKind)) console.log(`  ${k.padEnd(12)} ${v.agree}/${v.n}`);
for (const e of examples) console.log("  disagree", e);
