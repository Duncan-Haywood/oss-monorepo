// Build the SEF files schematron.mjs runs: node build-schematron.mjs [checkout]
// Needs `npm i --no-save saxon-js xslt3`, git, curl and unzip. Fetches (shallow, into a temp folder):
//   ConnectingEurope/eInvoicing-EN16931  base EN 16931 rules, precompiled XSLT (EUPL-1.2)
//   itplr-kosit/xrechnung-schematron     XRechnung add-on, Schematron source (Apache-2.0)
//   OpenPEPPOL/peppol-bis-invoice-3      Peppol BIS Billing 3 add-on, Schematron source (MPL-2.0)
//   SchXslt 1.10.1 from Maven Central    compiles those two .sch files to XSLT (MIT)
// Output goes to ./schematron/ (ignored by git). An optional first argument is an
// existing eInvoicing-EN16931 checkout.
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const work = mkdtempSync(join(tmpdir(), "einvoice-sch-"));
const run = (cmd, args, opts = {}) => execFileSync(cmd, args, { stdio: "inherit", ...opts });
const clone = (url, dir) => {
  run("git", ["clone", "--depth", "1", url, dir], { env: { ...process.env, GIT_LFS_SKIP_SMUDGE: "1" } });
  return dir;
};
const sef = (xsl, name) => run("npx", ["xslt3", `-xsl:${xsl}`, `-export:${join(out, name)}`, "-nogo", "-relocate:on"]);

const out = join(here, "schematron");
mkdirSync(out, { recursive: true });

const checkout = process.argv[2] || clone("https://github.com/ConnectingEurope/eInvoicing-EN16931", join(work, "en16931"));
for (const syntax of ["ubl", "cii"]) {
  const xsl = join(checkout, syntax, "xslt", `EN16931-${syntax.toUpperCase()}-validation.xslt`);
  if (!existsSync(xsl)) throw new Error(`Missing ${xsl}`);
  sef(xsl, `${syntax}.sef.json`);
}

// Add-ons: Schematron source -> XSLT (SchXslt, includes resolved) -> SEF.
const jar = join(work, "schxslt.jar");
run("curl", ["-sSfL", "-o", jar, "https://repo1.maven.org/maven2/name/dmaus/schxslt/schxslt/1.10.1/schxslt-1.10.1.jar"]);
run("unzip", ["-oq", jar, "xslt/2.0/*", "-d", join(work, "schxslt")]);
const pipeline = join(work, "schxslt", "xslt", "2.0", "pipeline-for-svrl.xsl");
const xr = clone("https://github.com/itplr-kosit/xrechnung-schematron", join(work, "xrechnung"));
const pe = clone("https://github.com/OpenPEPPOL/peppol-bis-invoice-3", join(work, "peppol"));
const addons = [
  ["xrechnung-ubl", join(xr, "src/validation/schematron/ubl/XRechnung-UBL-validation.sch")],
  ["xrechnung-cii", join(xr, "src/validation/schematron/cii/XRechnung-CII-validation.sch")],
  ["peppol-ubl", join(pe, "rules/sch/PEPPOL-EN16931-UBL.sch")],
  ["peppol-cii", join(pe, "rules/sch/PEPPOL-EN16931-CII.sch")],
];
for (const [name, sch] of addons) {
  if (!existsSync(sch)) throw new Error(`Missing ${sch}`);
  const xsl = join(work, `${name}.xsl`);
  run("npx", ["xslt3", `-xsl:${pipeline}`, `-s:${sch}`, `-o:${xsl}`]);
  sef(xsl, `${name}.sef.json`);
}
console.log(`SEF files written to ${out}`);
