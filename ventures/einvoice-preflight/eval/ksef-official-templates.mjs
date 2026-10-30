// Runs checkFa3 over the FA(3) invoice templates that the Polish Ministry of
// Finance / CIRF ship in their KSeF client repositories, and compares the
// schema verdict with xmllint on the real XSD. The templates carry #placeholders#
// (NIP, invoice number, date, internal ids); this fills them with valid values first.
// Files are read from a checkout and not copied here.
//   git clone --depth 1 https://github.com/CIRFMF/ksef-client-csharp
//   git clone --depth 1 https://github.com/CIRFMF/ksef-client-java
//   git clone --depth 1 https://github.com/CIRFMF/ksef-docs     (schemas in faktury/schemy/FA)
//   node eval/ksef-official-templates.mjs <dir holding the clones> <ksef-docs/faktury/schemy/FA>
import { execFileSync } from "node:child_process";
import { cpSync, mkdtempSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { checkFa3 } from "../fa3.mjs";

const [root, schemaDir] = process.argv.slice(2);
if (!root || !schemaDir) { console.error("usage: node eval/ksef-official-templates.mjs <clones dir> <schemy/FA dir>"); process.exit(2); }
const work = mkdtempSync(join(tmpdir(), "ksef-tpl-"));
cpSync(schemaDir, join(work, "fa"), { recursive: true });
const xsd = join(work, "fa", "schemat_FA(3)_v1-0E.xsd");
writeFileSync(xsd, readFileSync(xsd, "utf8").replace(/schemaLocation="http:[^"]*StrukturyDanych_v10-0E.xsd"/, 'schemaLocation="bazowe/StrukturyDanych_v10-0E.xsd"'));

const walk = (d) => readdirSync(d).flatMap((n) => {
  if (n === ".git") return [];
  const p = join(d, n);
  return statSync(p).isDirectory() ? walk(p) : p.endsWith(".xml") ? [p] : [];
});
const fill = (t) => t
  .replace(/#invoice_number#/g, "FV-2026-0001").replace(/#invoicing_date#/g, "2026-03-01")
  .replace(/#(nip_podmiot2|nip2_podmiot3)#/g, "5252344078")
  .replace(/#(nip\w*|selfInvocingNip|subject\dnip|subject3IdentifierValue)#/g, "5260250274")
  .replace(/#(idWewnetrzne|idwew\d_podmiot3)#/g, "5260250274-12345");

const seen = new Set();
let n = 0, agree = 0, clean = 0;
for (const f of walk(root)) {
  const raw = readFileSync(f, "utf8");
  if (!raw.includes("crd.gov.pl/wzor/2025/06/25/13775")) continue;
  const xml = fill(raw);
  if (seen.has(xml)) continue;
  seen.add(xml);
  writeFileSync(join(work, "t.xml"), xml);
  let xmllintOk = true;
  try { execFileSync("xmllint", ["--noout", "--schema", xsd, join(work, "t.xml")], { stdio: "pipe" }); } catch { xmllintOk = false; }
  const findings = checkFa3(xml).findings;
  const ours = findings.some((x) => /^PL-01[2-7]$/.test(x.rule)) ? false : true;
  n++; if (ours === xmllintOk) agree++; if (!findings.length) clean++;
  console.log(`${f.split("/").slice(-2).join("/")}  xmllint=${xmllintOk ? "valid" : "invalid"}  findings=${findings.map((x) => x.rule).join(",") || "none"}`);
}
console.log(`\n${n} distinct filled templates, schema verdict agrees with xmllint on ${agree}, no findings at all on ${clean}`);
