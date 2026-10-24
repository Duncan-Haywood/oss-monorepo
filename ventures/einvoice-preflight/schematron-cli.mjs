// node schematron-cli.mjs invoice.xml [--json]
// Runs the built-in rules plus the official EN 16931 Schematron. Exit 0 pass, 1 findings, 2 unreadable.
import { readFile } from "node:fs/promises";
import { buildJsonReport, preflightDocuments } from "./report.mjs";

const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith("--"));
if (!file) {
  console.error("Usage: node schematron-cli.mjs <invoice.xml|pdf|json> [--json]");
  process.exit(2);
}
const source = file.toLowerCase().endsWith(".pdf") ? new Uint8Array(await readFile(file)) : await readFile(file, "utf8");
const result = await preflightDocuments([{ name: file, source }], { schematron: true });
const report = buildJsonReport(result);
if (args.includes("--json")) console.log(JSON.stringify(report, null, 2));
else {
  const state = report.reports[0]?.schematron;
  if (state === "unavailable") console.log("Official Schematron not available (run build-schematron.mjs, install saxon-js); built-in rules only.");
  for (const e of report.errors) console.log(`${e.rule}${e.source ? " [official]" : ""}: ${e.message}\n    fix: ${e.fix}`);
  for (const r of report.read_errors) console.log(`${r.file}: ${r.error}`);
  if (!report.errors.length && !report.read_errors.length) console.log("No findings.");
}
process.exit(report.exit_code);
