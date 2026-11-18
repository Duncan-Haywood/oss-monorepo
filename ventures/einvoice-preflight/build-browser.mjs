// Make a serverless copy of the official Schematron check: node build-browser.mjs
// Run after `node build-schematron.mjs`. Writes ./browser/ next to index.html:
//   SaxonJS2.rt.js + LICENSE.txt   Saxon-JS browser runtime (Saxonica, free to use,
//                                  not MIT; fetched from saxonica.com, never committed)
//   *.sef.json                     the compiled rules from ./schematron/
//   manifest.json                  which rule sets are present
// Serve the folder with the page from any static host: the page then runs the
// official rules in the visitor's browser and the invoice never leaves it.
//
// The runtime runs in visitors' browsers, so the download is pinned: a zip whose
// SHA-256 differs from SAXON_ZIP_SHA256 is refused before anything is unpacked.
// Upgrading Saxon-JS means changing ZIP and the hash together, after checking
// the new release by hand (build-browser.test.mjs covers the rest offline).
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
export const ZIP = "https://www.saxonica.com/saxon-js/download/SaxonJS-2.7.zip";
// sha256 of SaxonJS-2.7.zip as served on 2026-11-15 (two fetches agreed; the
// runtime inside is dated 2024-10-17).
export const SAXON_ZIP_SHA256 = "13cbd2e6eb0a80dcf64067e88cb5eab54a52c3a29e01fe0b156346895585845d";

export function ruleSourceDir(env = process.env, base = here) {
  return env.EINVOICE_SEF_DIR || join(base, "schematron");
}

export function findRuleSets(src) {
  const sefs = existsSync(src) ? readdirSync(src).filter((f) => f.endsWith(".sef.json")) : [];
  if (!sefs.includes("ubl.sef.json") || !sefs.includes("cii.sef.json")) {
    throw new Error(`No compiled rules in ${src}; run node build-schematron.mjs first`);
  }
  return sefs.sort();
}

export function verifyDownload(file, expected = SAXON_ZIP_SHA256) {
  const got = createHash("sha256").update(readFileSync(file)).digest("hex");
  if (got !== expected) {
    throw new Error(`SHA-256 mismatch for ${ZIP}: got ${got}, pinned ${expected}. ` +
      "Not unpacking it. If Saxonica re-issued the file, check it and update SAXON_ZIP_SHA256.");
  }
  return got;
}

export function writeBrowserDir({ src, out, runtimeDir, sefs }) {
  mkdirSync(out, { recursive: true });
  for (const f of ["SaxonJS2.rt.js", "LICENSE.txt"]) copyFileSync(join(runtimeDir, f), join(out, f));
  for (const f of sefs) copyFileSync(join(src, f), join(out, f));
  writeFileSync(join(out, "manifest.json"), JSON.stringify({ files: sefs }, null, 2) + "\n");
  return sefs;
}

function main() {
  const src = ruleSourceDir();
  const out = join(here, "browser");
  const sefs = findRuleSets(src);
  const work = mkdtempSync(join(tmpdir(), "einvoice-saxon-"));
  try {
    const zip = join(work, "saxon.zip");
    execFileSync("curl", ["-sSfL", "-o", zip, ZIP], { stdio: "inherit" });
    verifyDownload(zip);
    execFileSync("unzip", ["-oq", zip, "saxon-js/SaxonJS2.rt.js", "saxon-js/LICENSE.txt", "-d", work], { stdio: "inherit" });
    writeBrowserDir({ src, out, runtimeDir: join(work, "saxon-js"), sefs });
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
  console.log(`Wrote ${out} (${sefs.length} rule sets). Serve it beside index.html.`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
