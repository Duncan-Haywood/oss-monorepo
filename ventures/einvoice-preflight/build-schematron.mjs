// Build the SEF files schematron.mjs runs: node build-schematron.mjs [checkout]
// Needs `npm i --no-save saxon-js xslt3` and a checkout of
// https://github.com/ConnectingEurope/eInvoicing-EN16931 (cloned shallow into
// a temp folder when no path is given). Also compiles the XRechnung add-on rules
// (KoSIT xrechnung-schematron release, Apache-2.0, Peppol BIS rules merged in)
// to xr-ubl / xr-cii; skip them with --no-xrechnung. Output goes to ./schematron/
// (ignored by git).
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, existsSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
let checkout = args.find((a) => !a.startsWith("--"));
if (!checkout) {
  checkout = join(mkdtempSync(join(tmpdir(), "en16931-")), "repo");
  execFileSync("git", ["clone", "--depth", "1", "https://github.com/ConnectingEurope/eInvoicing-EN16931", checkout], { stdio: "inherit", env: { ...process.env, GIT_LFS_SKIP_SMUDGE: "1" } });
}
const out = join(here, "schematron");
mkdirSync(out, { recursive: true });
for (const syntax of ["ubl", "cii"]) {
  const xsl = join(checkout, syntax, "xslt", `EN16931-${syntax.toUpperCase()}-validation.xslt`);
  if (!existsSync(xsl)) throw new Error(`Missing ${xsl}`);
  execFileSync("npx", ["xslt3", `-xsl:${xsl}`, `-export:${join(out, `${syntax}.sef.json`)}`, "-nogo", "-relocate:on"], { stdio: "inherit" });
}
console.log(`SEF files written to ${out}`);

if (!args.includes("--no-xrechnung")) {
  const XR = "v2.6.0", XR_ZIP = "xrechnung-3.0.2-schematron-2.6.0.zip";
  const dir = mkdtempSync(join(tmpdir(), "xrechnung-"));
  const res = await fetch(`https://github.com/itplr-kosit/xrechnung-schematron/releases/download/${XR}/${XR_ZIP}`);
  if (!res.ok) throw new Error(`XRechnung release download failed: HTTP ${res.status}`);
  writeFileSync(join(dir, "xr.zip"), Buffer.from(await res.arrayBuffer()));
  execFileSync("unzip", ["-qo", join(dir, "xr.zip"), "-d", dir], { stdio: "inherit" });
  for (const syntax of ["ubl", "cii"]) {
    const xsl = join(dir, "schematron", syntax, `XRechnung-${syntax.toUpperCase()}-validation.xsl`);
    if (!existsSync(xsl)) throw new Error(`Missing ${xsl}`);
    execFileSync("npx", ["xslt3", `-xsl:${xsl}`, `-export:${join(out, `xr-${syntax}.sef.json`)}`, "-nogo", "-relocate:on"], { stdio: "inherit" });
  }
  console.log("XRechnung add-on SEF files written too.");
}
