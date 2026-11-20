// The checker engine behind index.html, in one module the page loads on demand.
//
// These imports pull in 114 modules, about 3.3 MB before compression (rule
// tables, XSD data, Mexico's postal catalogue). As static imports of the
// page's inline module script they had to arrive and evaluate before any of
// the page's handlers were attached, so on a slow connection the sample
// buttons and "Check" did nothing for seconds. The page now imports this file
// with `import()` when a visitor starts using the checker (and awaits it on
// "Check" or "Repair"), so the form is live as soon as the HTML is
// (docs/history/ci-perf-2026-11-20-einvoice-page-engine-on-demand.md).
export { preflightDocuments, buildChecklist, buildMarkdown, buildJsonReport, buildRemediationCsv, summarizePreflight } from "./report.mjs";
export { addOfficialFindings, officialNote } from "./official.mjs";
export { repairInvoice } from "./repair.mjs";
export { repairUbl } from "./repair-ubl.mjs";
export { repairCii } from "./repair-cii.mjs";
export { repairFacturX } from "./repair-facturx.mjs";
export { looksLikeCii } from "./cii.mjs";
export { auditPackHtml } from "./auditpack.mjs";
