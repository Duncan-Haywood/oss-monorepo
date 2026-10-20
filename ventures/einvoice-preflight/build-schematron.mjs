// Build the SEF files schematron.mjs runs: node build-schematron.mjs [checkout]
// Needs `npm i --no-save saxon-js xslt3` and a checkout of
// https://github.com/ConnectingEurope/eInvoicing-EN16931 (cloned shallow into
// a temp folder when no path is given). Output goes to ./schematron/ (ignored by git).
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
let checkout = process.argv[2];
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
