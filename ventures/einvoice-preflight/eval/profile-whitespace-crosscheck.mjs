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
import { detectSyntax, matchingProfile } from "../schematron-core.mjs";
import { createPlainRunner, unreadableValues } from "../plain-schematron.mjs";

const args = process.argv.slice(2);
const take = (flag) => { const at = args.indexOf(flag); return at >= 0 ? args.splice(at, 2)[1] : null; };
const outDir = take("--out");
const roots = (take("--xsl-roots") ?? "").split(",").filter(Boolean);
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
    for (const p of [join(r, "external/schematron", from), join(r, "external/schematron/3.4.6", from)]) {
      if (existsSync(p)) return (map[name] = p);
    }
  }
  throw new Error(`${name}: ${from} not under ${roots.join(", ")}`);
};

const walk = (d) => readdirSync(d).sort().flatMap((f) => {
  const p = join(d, f);
  return statSync(p).isDirectory() ? walk(p) : f.endsWith(".xml") ? [p] : [];
});

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
    for (const f of out) ids.add((f.text.match(/^\[([^\]]+)\]/) || [])[1] || f.rule);
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
    const xml = readFileSync(path, "utf8").replace(/^﻿/, "");
    const syntax = detectSyntax(xml);
    const profile = syntax === "ubl" ? matchingProfile(xml, syntax) : null;
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
