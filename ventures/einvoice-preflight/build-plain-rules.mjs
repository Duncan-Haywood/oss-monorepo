// Compile the official Schematron into the plain JSON plain-schematron.mjs runs:
//   node build-plain-rules.mjs [en16931-checkout]
// Needs `npm i --no-save slimdom fontoxpath esbuild`, git. Fetches (shallow, temp folder):
//   ConnectingEurope/eInvoicing-EN16931  base rules, the "preprocessed" Schematron (EUPL-1.2)
//   itplr-kosit/xrechnung-schematron     XRechnung add-on (Apache-2.0)
//   OpenPEPPOL/peppol-bis-invoice-3      Peppol BIS Billing 3 add-on (MPL-2.0)
// Writes ./plain/ (committed: the rules are data, fontoxpath is MIT) with the
// commit each set was built from in manifest.json.
import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { compileSchematron } from "./plain-compile.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, "plain");
const work = mkdtempSync(join(tmpdir(), "einvoice-plain-"));
const git = (dir, ...args) => execFileSync("git", ["-C", dir, ...args], { encoding: "utf8" }).trim();
const clone = (url, dir) => {
  execFileSync("git", ["clone", "--depth", "1", url, dir], { stdio: "inherit", env: { ...process.env, GIT_LFS_SKIP_SMUDGE: "1" } });
  return dir;
};

mkdirSync(out, { recursive: true });
const en = process.argv[2] || clone("https://github.com/ConnectingEurope/eInvoicing-EN16931", join(work, "en16931"));
const xr = clone("https://github.com/itplr-kosit/xrechnung-schematron", join(work, "xrechnung"));
const pe = clone("https://github.com/OpenPEPPOL/peppol-bis-invoice-3", join(work, "peppol"));

const sets = [
  ["en16931-ubl", join(en, "ubl/schematron/preprocessed/EN16931-UBL-validation-preprocessed.sch"), en, "eInvoicing-EN16931 (EUPL-1.2)"],
  ["en16931-cii", join(en, "cii/schematron/preprocessed/EN16931-CII-validation-preprocessed.sch"), en, "eInvoicing-EN16931 (EUPL-1.2)"],
  ["xrechnung-ubl", join(xr, "src/validation/schematron/ubl/XRechnung-UBL-validation.sch"), xr, "xrechnung-schematron (Apache-2.0)"],
  ["xrechnung-cii", join(xr, "src/validation/schematron/cii/XRechnung-CII-validation.sch"), xr, "xrechnung-schematron (Apache-2.0)"],
  ["peppol-ubl", join(pe, "rules/sch/PEPPOL-EN16931-UBL.sch"), pe, "peppol-bis-invoice-3 (MPL-2.0)"],
  ["peppol-cii", join(pe, "rules/sch/PEPPOL-EN16931-CII.sch"), pe, "peppol-bis-invoice-3 (MPL-2.0)"],
];
const manifest = { built: new Date().toISOString().slice(0, 10), sets: {} };
for (const [name, sch, repo, licence] of sets) {
  if (!existsSync(sch)) throw new Error(`Missing ${sch}`);
  const rules = compileSchematron(sch);
  const checks = rules.patterns.reduce((n, p) => n + p.rules.reduce((m, r) => m + r.checks.length, 0), 0);
  writeFileSync(join(out, `${name}.json`), JSON.stringify(rules) + "\n");
  manifest.sets[name] = { source: licence, commit: git(repo, "rev-parse", "HEAD"), checks };
  console.log(`${name}: ${checks} checks`);
}
const fx = dirname(createRequire(import.meta.url).resolve("fontoxpath/package.json"));
// fontoxpath's ESM build imports xspattern and prsc by bare name; bundle them in so the page can import() one file.
const { build } = await import("esbuild");
await build({ entryPoints: [join(fx, "dist/fontoxpath.esm.js")], bundle: true, format: "esm", minify: true, outfile: join(out, "fontoxpath.esm.js"), logLevel: "warning" });
copyFileSync(join(fx, "LICENSE.md"), join(out, "fontoxpath.LICENSE.txt"));
manifest.fontoxpath = JSON.parse(readFileSync(join(fx, "package.json"), "utf8")).version;
writeFileSync(join(out, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
console.log(`Wrote ${out}`);
