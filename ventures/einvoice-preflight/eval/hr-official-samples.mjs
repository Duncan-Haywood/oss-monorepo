// The Porezna uprava's own sample eRačun files (Primjeri eRačuna, porezna.gov.hr; mirrored in
// github.com/shunkica/fiskalizacija2 docs/Primjeri_eRacuna) run through the plain route and,
// when a SEF is given, through the authority's HR-CIUS XSLT under Saxon-JS:
//   node eval/hr-official-samples.mjs <dir of samples> [hr.sef.json]
// Each file is run twice: as published, and with its placeholders made current (issue date
// moved into 2026, the OIB 12345678901, whose check digit is wrong, swapped for 12345678903),
// so what is left is what a real file built the same way would get.
import { readFileSync, readdirSync } from "node:fs";
import { createRequire } from "node:module";
const { runPlain } = await import("../plain-node.mjs");
const dir = process.argv[2];
let saxon = null;
if (process.argv[3]) {
  const require = createRequire(import.meta.url);
  const SaxonJS = require(require.resolve("saxon-js", { paths: [process.cwd(), dir] }));
  const sef = JSON.parse(readFileSync(process.argv[3], "utf8"));
  saxon = (xml) => [...SaxonJS.transform({ stylesheetInternal: sef, sourceText: xml, destination: "serialized" }, "sync").principalResult.matchAll(/<svrl:failed-assert[^>]*\bid="([^"]+)"/g)].map((x) => x[1]);
}
const norm = (a) => [...new Set(a)].sort().join(",") || "-";
const current = (xml) => xml.replace(/(<cbc:(?:IssueDate|DueDate|TaxPointDate|StartDate|EndDate|ActualDeliveryDate)>)2025-/g, "$12026-").replaceAll("12345678901", "12345678903");
for (const f of readdirSync(dir).filter((x) => x.endsWith(".xml")).sort()) {
  const xml = readFileSync(`${dir}/${f}`, "utf8");
  for (const [label, doc] of [["as published", xml], ["placeholders fixed", current(xml)]]) {
    const r = await runPlain(doc);
    const hr = norm(r.findings.filter((x) => x.source === "cius-hr-schematron").map((x) => x.rule));
    const base = norm(r.findings.filter((x) => x.source !== "cius-hr-schematron" && x.severity !== "warning").map((x) => x.rule));
    const warn = norm(r.findings.filter((x) => x.severity === "warning").map((x) => x.rule));
    const s = saxon ? norm(saxon(doc)) : null;
    console.log(JSON.stringify({ file: f, run: label, sets: r.sets, skipped: r.skipped.length, hr, saxonHr: s, agree: s === null ? null : s === hr, baseFatal: base, warnings: warn }));
  }
}
