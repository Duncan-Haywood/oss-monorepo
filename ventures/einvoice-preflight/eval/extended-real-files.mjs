// Runs real ZUGFeRD / Factur-X EXTENDED invoices from the ZUGFeRD corpus's `correct`
// folders through the EN 16931 base (what an extended file got before 2026-11-17) and the
// Factur-X EXTENDED base (what it gets now), and Saxon-JS running FNFE-MPE's compiled
// FACTUR-X_EXTENDED.xslt as the reference.
//   git clone --depth 1 https://github.com/ZUGFeRD/corpus
//   (extract each PDF's attachment with `pdfdetach -saveall`; list the XML whose BT-24 names
//   an extended profile, one path per line)
//   node eval/extended-real-files.mjs <list file> <fx-ext.sef.json>
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { parseSvrl } from "../schematron-core.mjs";
import { createPlainRunner } from "../plain-schematron.mjs";

const [listFile, sef] = process.argv.slice(2);
const require = createRequire(import.meta.url);
const SaxonJS = require("saxon-js");
const { parseXmlDocument } = require("slimdom");
const runner = createPlainRunner({ fontoxpath: require("fontoxpath"), parseXml: (x) => parseXmlDocument(x) });
const plain = (f) => JSON.parse(readFileSync(new URL(`../plain/${f}`, import.meta.url)));
const en = plain("en16931-cii.json");
const fx = plain("facturx-extended-cii.json");
const files = readFileSync(listFile, "utf8").split("\n").filter(Boolean);
let enFatal = 0, fxFatal = 0, agree = 0, skipped = 0;
for (const file of files) {
  const xml = readFileSync(file, "utf8").replace(/^\uFEFF/, "");
  const fatal = (out) => [...new Set(out.filter((f) => f.flag !== "warning").map((f) => f.rule))].sort();
  const a = runner.runRules(en, parseXmlDocument(xml));
  const b = runner.runRules(fx, parseXmlDocument(xml));
  skipped += b.skipped.length;
  const ids = [...new Set(b.map((f) => f.rule))].sort();
  const res = SaxonJS.transform({ stylesheetFileName: sef, sourceText: xml, destination: "serialized" });
  const s = [...new Set(parseSvrl(res.principalResult).map((f) => f.rule))].sort();
  const same = JSON.stringify(ids) === JSON.stringify(s);
  if (same) agree++;
  if (fatal(a).length) enFatal++;
  if (fatal(b).length) fxFatal++;
  const name = file.split("/").slice(-2).join("/").replace(/^.*correct__/, "");
  console.log(`${name}\n  EN 16931 base fatal: ${fatal(a).join(" ") || "-"}\n  Factur-X EXTENDED base: ${ids.join(" ") || "-"} (fatal: ${fatal(b).join(" ") || "-"}); Saxon ${same ? "same" : `DIFFERS: ${s.join(" ")}`}`);
}
console.log(`files: ${files.length}; with a fatal finding under the EN 16931 base: ${enFatal}; under the Factur-X EXTENDED base: ${fxFatal}; plain = Saxon on ${agree}/${files.length}; plain rules skipped: ${skipped}`);
