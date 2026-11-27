// Differential check of cii-xsd.mjs against xmllint on the same CEN D16B subset XSD:
//   node eval/cii-xsd-differential.mjs <path to CrossIndustryInvoice_100pD16B.xsd> [mutations per file] file.xml...
// Each file gets seeded random mutations (swap two adjacent sibling elements, delete an element,
// duplicate one, move an element into the wrong namespace, write a decimal with a comma, set a
// fixed listID to another value). For each mutant both verdicts (valid / invalid) are compared.
// Needs xmllint on PATH; not part of the test suite. Results: eval/cii-xsd-2026-11-26.md.
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { checkAgainstCiiSchema } from "../cii-xsd.mjs";

const [xsd, perFile = "40", ...files] = process.argv.slice(2);
let seed = 20261126;
const rand = (n) => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed % n; };
const work = mkdtempSync(join(tmpdir(), "ciidiff-"));

// Element spans by a stack over the tags: [start, end) offsets with depth and parent index.
function spans(text) {
  const out = [];
  const stack = [];
  for (const m of text.matchAll(/<!--[\s\S]*?-->|<\?[\s\S]*?\?>|<\/?[^>]+>/g)) {
    const t = m[0];
    if (t.startsWith("<!") || t.startsWith("<?")) continue;
    if (t.startsWith("</")) { const s = stack.pop(); s.end = m.index + t.length; continue; }
    const node = { start: m.index, end: m.index + t.length, name: t.slice(1).match(/^[^\s/>]+/)[0], parent: stack.length ? stack[stack.length - 1].i : -1, i: out.length, depth: stack.length };
    out.push(node);
    if (!t.endsWith("/>")) stack.push(node);
  }
  return out;
}

const MUTATIONS = {
  swap(text, s) {
    const pairs = [];
    for (let i = 1; i < s.length; i++) for (let j = i + 1; j < s.length; j++) {
      if (s[j].parent === s[i].parent && s[i].depth > 0) { if (s[j].start >= s[i].end) { pairs.push([s[i], s[j]]); } break; }
    }
    const adj = pairs.filter(([a, b]) => a.name !== b.name && text.slice(a.end, b.start).trim() === "");
    if (!adj.length) return null;
    const [a, b] = adj[rand(adj.length)];
    return text.slice(0, a.start) + text.slice(b.start, b.end) + text.slice(a.end, b.start) + text.slice(a.start, a.end) + text.slice(b.end);
  },
  remove(text, s) { const c = s.filter((n) => n.depth > 1); const n = c[rand(c.length)]; return text.slice(0, n.start) + text.slice(n.end); },
  duplicate(text, s) { const c = s.filter((n) => n.depth > 1); const n = c[rand(c.length)]; return text.slice(0, n.end) + text.slice(n.start, n.end) + text.slice(n.end); },
  namespace(text, s) {
    const c = s.filter((n) => /^(ram|udt|qdt):/.test(n.name));
    if (!c.length) return null;
    const n = c[rand(c.length)];
    const [p, local] = n.name.split(":");
    const other = ["ram", "udt", "qdt"].filter((x) => x !== p && new RegExp(`xmlns:${x}=`).test(text))[0];
    if (!other) return null;
    const body = text.slice(n.start, n.end).replace(new RegExp(`^<${p}:${local}`), `<${other}:${local}`).replace(new RegExp(`</${p}:${local}>$`), `</${other}:${local}>`);
    return text.slice(0, n.start) + body + text.slice(n.end);
  },
  comma(text) {
    const m = [...text.matchAll(/(Amount|Quantity|Percent)(\s[^>]*)?>(-?\d+)\.(\d+)</g)];
    if (!m.length) return null;
    const x = m[rand(m.length)];
    const at = x.index + x[0].indexOf(">") + 1;
    return text.slice(0, at) + `${x[3]},${x[4]}` + text.slice(at + x[3].length + 1 + x[4].length);
  },
  fixedAttr(text) { return text.includes("<ram:InvoiceCurrencyCode>") ? text.replace("<ram:InvoiceCurrencyCode>", '<ram:InvoiceCurrencyCode listID="ISO4217">') : null; },
};

const tally = { agree: 0, bothInvalid: 0, bothValid: 0, oursOnly: [], xmllintOnly: [] };
for (const f of files) {
  const base = readFileSync(f, "utf8");
  if (!checkAgainstCiiSchema(base).applied) continue;
  const names = Object.keys(MUTATIONS);
  for (let k = 0; k < Number(perFile); k++) {
    const kind = names[rand(names.length)];
    const mutant = MUTATIONS[kind](base, spans(base));
    if (!mutant || mutant === base) continue;
    const ours = checkAgainstCiiSchema(mutant);
    if (!ours.applied) continue;
    const p = join(work, "m.xml");
    writeFileSync(p, mutant);
    let theirs = true;
    try { execFileSync("xmllint", ["--noout", "--schema", xsd, p], { stdio: "pipe" }); } catch { theirs = false; }
    const oursValid = ours.findings.length === 0;
    if (oursValid === theirs) { tally.agree++; theirs ? tally.bothValid++ : tally.bothInvalid++; }
    else (oursValid ? tally.xmllintOnly : tally.oursOnly).push({ file: f.split("/").pop(), kind, ours: ours.findings.slice(0, 2).map((x) => x.message) });
  }
}
console.log(JSON.stringify({ agree: tally.agree, bothInvalid: tally.bothInvalid, bothValid: tally.bothValid, oursOnly: tally.oursOnly.length, xmllintOnly: tally.xmllintOnly.length }, null, 1));
for (const d of [...tally.oursOnly, ...tally.xmllintOnly].slice(0, 20)) console.log(JSON.stringify(d));
