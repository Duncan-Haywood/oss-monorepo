// INV-065 in the Flux 10 and CDAR readers (2026-11-17), on the mutants
// eval/profile-whitespace-crosscheck.mjs --fr writes. For each row: does the product's own
// reader (readFlux10 + flux10Findings, readCdar + cdarFindings) raise INV-065, and on
// which element. eval/french-inv065-saxonc.py joins this with SaxonC's aborts.
//   node eval/french-inv065.mjs DIR [DIR ...] > rows.jsonl
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { detectSyntax } from "../schematron-core.mjs";
import { flux10Findings, readFlux10 } from "../flux10.mjs";
import { cdarFindings, readCdar } from "../cdar.mjs";

for (const dir of process.argv.slice(2)) {
  for (const line of readFileSync(join(dir, "manifest.jsonl"), "utf8").split("\n").filter(Boolean)) {
    const row = JSON.parse(line);
    const xml = readFileSync(join(dir, row.file), "utf8");
    const syntax = detectSyntax(xml);
    if (syntax !== "flux10" && syntax !== "cdar") continue;
    const findings = syntax === "flux10" ? flux10Findings(readFlux10(xml)) : cdarFindings(readCdar(xml)).findings;
    const inv = findings.filter((f) => f.rule === "INV-065");
    console.log(JSON.stringify({ dir, file: row.file, base: row.base, syntax, field: row.field ?? null, variant: row.variant ?? null, inv065: inv.map((f) => f.path) }));
  }
}
