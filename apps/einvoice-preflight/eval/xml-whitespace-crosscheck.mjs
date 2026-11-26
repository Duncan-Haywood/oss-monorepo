// The plain route (fontoxpath) against Saxon-JS running the official compiled rules, on
// invoices with a no-break space (U+00A0) or another non-XML space put into one field.
// XPath's whitespace is #x20, #x9, #xD, #xA only; fontoxpath 3.34's normalize-space and
// its \s in replace()/tokenize() also take U+00A0, so before 2026-11-17 the plain route
// passed values every Saxon-based validator rejects. plain-schematron.mjs now rewrites
// them (xmlWhitespaceRewrite); this measures both.
//   node eval/xml-whitespace-crosscheck.mjs [--out DIR] [--no-saxon-js] [per-file] [seed] [dir ...]
// --out writes every mutant and its baseline with what each engine raised to DIR
// (manifest.jsonl) for eval/xml-whitespace-saxonc.py, which re-runs them on SaxonC-HE:
// Saxon-JS 2.x reads \s in a regex as JavaScript does (U+00A0 included), so it is the
// reference for normalize-space only.
// Needs `node build-schematron.mjs` (./schematron/: EN 16931, XRechnung, Peppol SEF) and
// `npm i --no-save slimdom fontoxpath saxon-js`. Dirs default to ./examples; give an
// eInvoicing-EN16931 checkout's ubl/examples and cii/examples for more files.
// For each file whose sets the Saxon route has (EN 16931 base plus XRechnung or Peppol),
// it picks up to [per-file] text fields at random and writes one mutant per field and
// variant (a trailing, leading or inner U+00A0, as a literal or as &#160;, or U+2003).
// Per mutant it compares the rule ids each engine raises; a file whose unmutated copy
// already differs (rule-set versions) is compared on the change from that baseline.
import { createRequire } from "node:module";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync, appendFileSync } from "node:fs";
import { join } from "node:path";
import { FILES, ADDONS, detectSyntax, matchingAddons, matchingProfile, parseSvrl } from "../schematron-core.mjs";
import { createPlainRunner, PLAIN_ADDON_FILES, unreadableValues } from "../plain-schematron.mjs";
import { SEF_DIR } from "../schematron.mjs";

const args = process.argv.slice(2);
const sjsAt = args.indexOf("--no-saxon-js");
const useSaxonJs = sjsAt < 0;
if (!useSaxonJs) args.splice(sjsAt, 1);
const outAt = args.indexOf("--out");
const outDir = outAt >= 0 ? args.splice(outAt, 2)[1] : null;
if (outDir) { mkdirSync(outDir, { recursive: true }); writeFileSync(join(outDir, "manifest.jsonl"), ""); }
let written = 0;
const record = (xml, row) => {
  if (!outDir) return;
  const file = `${String(written++).padStart(5, "0")}.xml`;
  writeFileSync(join(outDir, file), xml);
  appendFileSync(join(outDir, "manifest.jsonl"), `${JSON.stringify({ file, ...row })}\n`);
};
const list = (set) => [...set].sort();
const perFile = Number(args[0] ?? 40);
let seed = Number(args[1] ?? 7);
const dirs = args.length > 2 ? args.slice(2) : [new URL("../examples", import.meta.url).pathname];
const require = createRequire(import.meta.url);
const SaxonJS = require("saxon-js");
const fontoxpath = require("fontoxpath");
const { parseXmlDocument } = require("slimdom");
const fixed = createPlainRunner({ fontoxpath, parseXml: parseXmlDocument });
const before = createPlainRunner({ fontoxpath, parseXml: parseXmlDocument, xmlWhitespace: false });
const plain = (f) => JSON.parse(readFileSync(new URL(`../plain/${f}`, import.meta.url)));
const BASE = { ubl: plain("en16931-ubl.json"), cii: plain("en16931-cii.json") };
const rand = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };

const sets = (xml, syntax) => {
  const out = [[BASE[syntax], join(SEF_DIR, FILES[syntax])]];
  for (const [name, addon] of matchingAddons(xml, syntax)) {
    if (addon.plainOnly || !PLAIN_ADDON_FILES[name]?.[syntax]) return null;
    out.push([plain(PLAIN_ADDON_FILES[name][syntax]), join(SEF_DIR, addon.files[syntax])]);
  }
  return out;
};
const saxonIds = (xml, s) => {
  const ids = new Set();
  if (!useSaxonJs) return ids;
  // A dynamic error (an uncastable value in a rule) is its own outcome, not a pass.
  for (const [, sef] of s) {
    try {
      for (const f of parseSvrl(SaxonJS.transform({ stylesheetFileName: sef, sourceText: xml, destination: "serialized" }, "sync").principalResult)) ids.add(f.rule);
    } catch (e) { ids.add(`#ERROR ${e.code ?? "?"}`); }
  }
  return ids;
};
// "#ERROR cast": a rule could not cast a value, which the plain route's run() reports as
// XML-VALUE-01 at the fields unreadableValues() names (castFields).
let castFields = 0;
const plainIds = (runner, xml, s) => {
  const doc = parseXmlDocument(xml);
  const ids = new Set();
  for (const [rules] of s) {
    const out = runner.runRules(rules, doc);
    if (out.castFailed) ids.add("#ERROR cast");
    for (const f of out) ids.add((f.text.match(/^\[([^\]]+)\]/) || [])[1] || f.rule);
  }
  if (ids.has("#ERROR cast")) castFields = unreadableValues(fontoxpath.evaluateXPathToNodes("//*[not(*)] | //@*", doc, null, null, {})).length;
  return ids;
};
const delta = (now, base) => [...now].filter((x) => !base.has(x)).sort().join(" ") + " / -" + [...base].filter((x) => !now.has(x)).sort().join(" -");

// Text fields: an element with no child elements and non-empty text, outside any
// embedded attachment.
const FIELD = /<([\w.-]+:)?([\w.-]+)((?:\s[^>]*)?)>([^<]+)<\/\1?\2>/g;
const VARIANTS = [
  ["trailing nbsp", (t) => `${t} `],
  ["trailing &#160;", (t) => `${t}&#160;`],
  ["leading &#xA0;", (t) => `&#xA0;${t}`],
  ["inner nbsp", (t) => (t.includes(" ") ? t.replace(" ", " ") : null)],
  ["trailing em space", (t) => `${t} `],
];

const tally = { files: 0, mutants: 0, saxonChanged: 0, beforeDiff: 0, afterDiff: 0, skippedFiles: 0 };
const rows = [];
const byRuleBefore = {};
for (const dir of dirs) {
  if (!existsSync(dir)) continue;
  for (const name of readdirSync(dir).filter((f) => f.endsWith(".xml")).sort()) {
    const xml = readFileSync(join(dir, name), "utf8").replace(/^\uFEFF/, "");
    const syntax = detectSyntax(xml);
    if (syntax !== "ubl" && syntax !== "cii") continue;
    if (matchingProfile(xml, syntax)) { tally.skippedFiles++; continue; }
    const s = sets(xml, syntax);
    if (!s) { tally.skippedFiles++; continue; }
    tally.files++;
    const sx0 = saxonIds(xml, s), pf0 = plainIds(fixed, xml, s), pb0 = plainIds(before, xml, s);
    const sef = s.map(([, p]) => p.split("/").pop().replace(".sef.json", ""));
    const baseFile = written;
    record(xml, { source: name, base: null, sets: sef, ...(useSaxonJs ? { saxonjs: list(sx0) } : {}), plainFixed: list(pf0), plainBefore: list(pb0) });
    const fields = [...xml.matchAll(FIELD)].filter((m) => m[4].trim() && !/EmbeddedDocument|AttachmentBinaryObject/.test(m[2]));
    for (let k = fields.length - 1; k > 0; k--) { const j = Math.floor(rand() * (k + 1)); [fields[k], fields[j]] = [fields[j], fields[k]]; }
    for (const m of fields.slice(0, perFile)) {
      for (const [variant, f] of VARIANTS) {
        const text = f(m[4]);
        if (text === null) continue;
        const at = m.index + m[0].length - `</${m[1] ?? ""}${m[2]}>`.length - m[4].length;
        const mutant = xml.slice(0, at) + text + xml.slice(at + m[4].length);
        tally.mutants++;
        castFields = 0;
        const sxIds = saxonIds(mutant, s), pfIds = plainIds(fixed, mutant, s), pbIds = plainIds(before, mutant, s);
        record(mutant, { source: name, base: baseFile, field: m[2], variant, sets: sef, ...(useSaxonJs ? { saxonjs: list(sxIds) } : {}), plainFixed: list(pfIds), plainBefore: list(pbIds), castFields });
        const sx = delta(sxIds, sx0);
        const pf = delta(pfIds, pf0);
        const pb = delta(pbIds, pb0);
        if (sx !== " / -") tally.saxonChanged++;
        if (pb !== sx) { tally.beforeDiff++; for (const id of sx.split(/[ /-]+/).filter(Boolean)) if (!pb.includes(id)) byRuleBefore[id] = (byRuleBefore[id] ?? 0) + 1; }
        if (pf !== sx) { tally.afterDiff++; rows.push(`${name}\t${m[2]}\t${variant}\tsaxon: ${sx}\tplain: ${pf}`); }
      }
    }
  }
}
console.log(JSON.stringify(tally));
console.log("rules Saxon raised that the plain route missed before the fix (mutant count):", JSON.stringify(Object.fromEntries(Object.entries(byRuleBefore).sort((a, b) => b[1] - a[1]))));
for (const r of rows.slice(0, 60)) console.log(r);
if (rows.length > 60) console.log(`... ${rows.length - 60} more`);
