// Make a serverless copy of the official Schematron check: node build-browser.mjs
// Run after `node build-schematron.mjs`. Writes ./browser/ next to index.html:
//   SaxonJS2.rt.js + LICENSE.txt   Saxon-JS browser runtime (Saxonica, free to use,
//                                  not MIT; fetched from saxonica.com, never committed)
//   *.sef.json                     the compiled rules from ./schematron/
//   manifest.json                  which rule sets are present
// Serve the folder with the page from any static host: the page then runs the
// official rules in the visitor's browser and the invoice never leaves it.
import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const src = process.env.EINVOICE_SEF_DIR || join(here, "schematron");
const out = join(here, "browser");
const ZIP = "https://www.saxonica.com/saxon-js/download/SaxonJS-2.7.zip";

const sefs = existsSync(src) ? readdirSync(src).filter((f) => f.endsWith(".sef.json")) : [];
if (!sefs.includes("ubl.sef.json") || !sefs.includes("cii.sef.json")) {
  throw new Error(`No compiled rules in ${src}; run node build-schematron.mjs first`);
}
mkdirSync(out, { recursive: true });
const work = mkdtempSync(join(tmpdir(), "einvoice-saxon-"));
const zip = join(work, "saxon.zip");
execFileSync("curl", ["-sSfL", "-o", zip, ZIP], { stdio: "inherit" });
execFileSync("unzip", ["-oq", zip, "saxon-js/SaxonJS2.rt.js", "saxon-js/LICENSE.txt", "-d", work], { stdio: "inherit" });
for (const f of ["SaxonJS2.rt.js", "LICENSE.txt"]) copyFileSync(join(work, "saxon-js", f), join(out, f));
for (const f of sefs) copyFileSync(join(src, f), join(out, f));
writeFileSync(join(out, "manifest.json"), JSON.stringify({ files: sefs.sort() }, null, 2) + "\n");
console.log(`Wrote ${out} (${sefs.length} rule sets). Serve it beside index.html.`);
