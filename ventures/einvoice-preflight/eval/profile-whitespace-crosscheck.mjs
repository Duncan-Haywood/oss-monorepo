// The plain route's whitespace on the PINT and ZATCA sets, against the official XSLT run
// on SaxonC-HE (2026-11-17). Companion to eval/xml-whitespace-crosscheck.mjs, which did
// the EN 16931, XRechnung and Peppol BIS sets and skipped every file whose rules replace
// the EU base (PINT, ZATCA) because they had no Saxon form here. These sets come from
// XSLT in the first place (build-pint-rules.mjs, build-zatca-rules.mjs read the phive
// jars' stylesheets back into ./plain/), so SaxonC can run the same stylesheets directly.
//
//   node eval/profile-whitespace-crosscheck.mjs --out DIR --xsl-roots R1,R2,.. [per-file] [seed] dir ...
//   python3 -I eval/xml-whitespace-saxonc.py DIR DIR
//
// --xsl-roots: folders each holding an unzipped jar's external/schematron/ tree (from
// phive-rules-peppol-pint 4.6.4, phive-rules-peppol 4.6.3 and phive-rules-zatca 4.6.3,
// as the build scripts fetch them); each set's stylesheet is found from its `from` in
// plain/manifest.json and written to DIR/map.json, which xml-whitespace-saxonc.py reads
// in place of an XSL folder. Dirs are searched recursively for UBL files a PINT or ZATCA
// profile matches (matchingProfile); anything else is skipped.
// Needs `npm i --no-save slimdom fontoxpath`. The mutants and variants are
// xml-whitespace-crosscheck.mjs's: up to [per-file] text fields a file, picked with a
// fixed seed, five variants each (trailing U+00A0 literal, trailing &#160;, leading
// &#xA0;, an inner space made U+00A0, trailing U+2003).
import { createRequire } from "node:module";
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync, appendFileSync } from "node:fs";
import { join } from "node:path";
import { ADDONS, EXTENDED_BASES, PROFILES, detectSyntax, matchingAddons, matchingProfile, plainOnlySets } from "../schematron-core.mjs";
import { createPlainRunner, unreadableValues } from "../plain-schematron.mjs";

const args = process.argv.slice(2);
const take = (flag) => { const at = args.indexOf(flag); return at >= 0 ? args.splice(at, 2)[1] : null; };
const outDir = take("--out");
const roots = (take("--xsl-roots") ?? "").split(",").filter(Boolean);
// --addons: also take files no profile matches but a plain-only national add-on does
// (CIUS-RO, CIUS-PT, CIUS-HR, NLCIUS; added 2026-11-17). Only the add-on's own set is
// compared, the EU base under it being xml-whitespace-crosscheck.mjs's job. A root may
// then be the stylesheet's own folder (e.g. external/schematron/1.0.9).
const addons = args.includes("--addons") && args.splice(args.indexOf("--addons"), 1).length > 0;
// --fr: the French plain-only sets (added 2026-11-17): every file takes what
// plainOnlySets(xml, syntax, { profile: "france" }) names, as the page does with France
// picked: BR-FR (cius-fr) on UBL and CII, the EXTENDED-CTC-FR / Factur-X EXTENDED base on
// an extended file, BR-FR-CDV on a CDAR status, the Annexe 7 controls on a Flux 10 report.
// Their manifest `from` is a .sch; FNFE-MPE ships each compiled, so a root may be one of
// France_RFE's 2xslt folders and the .xslt of the same name is taken.
const fr = args.includes("--fr") && args.splice(args.indexOf("--fr"), 1).length > 0;
const SPECIAL = { "cdar-fr": "cdar-fr", "flux10-fr": "flux10-fr" };
const setFiles = (name, syntax) => {
  if (SPECIAL[name]) return [SPECIAL[name]];
  const f = (PROFILES[name] ?? EXTENDED_BASES[name] ?? ADDONS[name])?.files?.[syntax];
  if (!f) throw new Error(`${name}: no ${syntax} set`);
  return [].concat(f).map((x) => x.replace(/\.(sef\.)?json$/, ""));
};
if (!outDir || !roots.length) throw new Error("usage: --out DIR --xsl-roots R1,R2 [per-file] [seed] dir ...");
mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, "manifest.jsonl"), "");
const perFile = Number(args[0] ?? 3);
let seed = Number(args[1] ?? 7);
const dirs = args.slice(2);
const rand = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };

const require = createRequire(import.meta.url);
const fontoxpath = require("fontoxpath");
const { parseXmlDocument } = require("slimdom");
const fixed = createPlainRunner({ fontoxpath, parseXml: parseXmlDocument });
const before = createPlainRunner({ fontoxpath, parseXml: parseXmlDocument, xmlWhitespace: false });
const manifest = JSON.parse(readFileSync(new URL("../plain/manifest.json", import.meta.url))).sets;
const plainCache = {};
const plain = (name) => (plainCache[name] ??= JSON.parse(readFileSync(new URL(`../plain/${name}.json`, import.meta.url))));

// Each set's stylesheet: its manifest `from` under one of the roots (ZATCA's is a bare
// file name inside the 3.4.6 folder).
const map = {};
const xslFor = (name) => {
  if (map[name]) return map[name];
  const from = manifest[name]?.from;
  if (!from) throw new Error(`${name}: no 'from' in plain/manifest.json`);
  for (const r of roots) {
    const xslt = from.replace(/\.sch$/, ".xslt");
    // The compiled .xslt first: France_RFE's Flux10 folder holds the .sch beside it.
    for (const p of [join(r, xslt), join(r, "external/schematron", from), join(r, "external/schematron/3.4.6", from), join(r, from)]) {
      if (existsSync(p)) return (map[name] = p);
    }
  }
  throw new Error(`${name}: ${from} not under ${roots.join(", ")}`);
};

const walk = (d) => (statSync(d).isFile() ? [d] : readdirSync(d).sort().flatMap((f) => {
  const p = join(d, f);
  return statSync(p).isDirectory() ? walk(p) : f.endsWith(".xml") ? [p] : [];
}));

let written = 0;
const record = (xml, row) => {
  const file = `${String(written++).padStart(5, "0")}.xml`;
  writeFileSync(join(outDir, file), xml);
  appendFileSync(join(outDir, "manifest.jsonl"), `${JSON.stringify({ file, ...row })}\n`);
};
let castFields = 0;
const plainIds = (runner, xml, sets) => {
  const doc = parseXmlDocument(xml);
  const ids = new Set();
  for (const name of sets) {
    const out = runner.runRules(plain(name), doc);
    if (out.castFailed) ids.add("#ERROR cast");
    // The assert's own id first, then a [ID] text prefix: what report() in
    // plain-schematron.mjs shows a user and what SaxonC's SVRL carries. (Until 2026-11-17
    // this read the text first, so CIUS-RO's decimal rules, all "[BR-RO-Z2]...", and
    // PINT SG's BR-NG-08-GST-SG showed as label mismatches the product never had.)
    for (const f of out) ids.add(f.rule || (f.text.match(/^\[([^\]]+)\]/) || [])[1]);
  }
  if (ids.has("#ERROR cast")) castFields = unreadableValues(fontoxpath.evaluateXPathToNodes("//*[not(*)] | //@*", doc, null, null, {})).length;
  return [...ids].sort();
};

const FIELD = /<([\w.-]+:)?([\w.-]+)((?:\s[^>]*)?)>([^<]+)<\/\1?\2>/g;
const VARIANTS = [
  ["trailing nbsp", (t) => `${t} `],
  ["trailing &#160;", (t) => `${t}&#160;`],
  ["leading &#xA0;", (t) => `&#xA0;${t}`],
  ["inner nbsp", (t) => (t.includes(" ") ? t.replace(" ", " ") : null)],
  ["trailing em space", (t) => `${t} `],
];

const tally = { files: 0, mutants: 0, skipped: 0, byProfile: {} };
for (const dir of dirs) {
  for (const path of walk(dir)) {
    const xml = readFileSync(path, "utf8").replace(/^\uFEFF/, "");
    const syntax = detectSyntax(xml);
    let profile = syntax === "ubl" && !fr ? matchingProfile(xml, syntax) : null;
    if (fr && syntax) {
      const names = plainOnlySets(xml, syntax, { profile: "france" });
      if (names.length) profile = [`${syntax}:${names.join("+")}`, { files: { ubl: names.flatMap((n) => setFiles(n, syntax)) } }];
    } else if (!profile && addons && syntax) {
      const found = matchingAddons(xml, syntax).filter(([, a]) => a.plainOnly);
      if (found.length) profile = [found.map(([n]) => n).join("+"), { files: { ubl: found.map(([, a]) => a.files[syntax].replace(/\.sef\.json$/, "")) } }];
    }
    if (!profile) { tally.skipped++; continue; }
    const sets = [].concat(profile[1].files.ubl).map((f) => f.replace(/\.json$/, ""));
    sets.forEach(xslFor);
    tally.files++;
    tally.byProfile[profile[0]] = (tally.byProfile[profile[0]] ?? 0) + 1;
    const source = path.split("/").slice(-3).join("/");
    const baseFile = written;
    record(xml, { source, profile: profile[0], base: null, sets, plainFixed: plainIds(fixed, xml, sets), plainBefore: plainIds(before, xml, sets) });
    const fields = [...xml.matchAll(FIELD)].filter((m) => m[4].trim() && !/EmbeddedDocument|AttachmentBinaryObject|UBLExtension|Signature|X509|DigestValue/.test(m[2]));
    for (let k = fields.length - 1; k > 0; k--) { const j = Math.floor(rand() * (k + 1)); [fields[k], fields[j]] = [fields[j], fields[k]]; }
    for (const m of fields.slice(0, perFile)) {
      for (const [variant, f] of VARIANTS) {
        const text = f(m[4]);
        if (text === null) continue;
        const at = m.index + m[0].length - `</${m[1] ?? ""}${m[2]}>`.length - m[4].length;
        const mutant = xml.slice(0, at) + text + xml.slice(at + m[4].length);
        tally.mutants++;
        castFields = 0;
        const pf = plainIds(fixed, mutant, sets);
        const pb = plainIds(before, mutant, sets);
        record(mutant, { source, profile: profile[0], base: baseFile, field: m[2], variant, sets, plainFixed: pf, plainBefore: pb, castFields });
      }
    }
  }
}
writeFileSync(join(outDir, "map.json"), JSON.stringify(map, null, 1) + "\n");
console.log(JSON.stringify(tally));
