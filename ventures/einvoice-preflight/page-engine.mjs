// The checker engine behind index.html, in one module the page loads on demand.
//
// These imports pull in 74 modules, about 310 kB compressed (rule tables and
// XSD data; Mexico's and Brazil's checkers, 568 kB more, load from report.mjs
// only for a file of their format, national-sniff.mjs). As static imports of the
// page's inline module script they had to arrive and evaluate before any of
// the page's handlers were attached, so on a slow connection the sample
// buttons and "Check" did nothing for seconds. The page now imports this file
// with `import()` when a visitor starts using the checker (and awaits it on
// "Check" or "Repair"), so the form is live as soon as the HTML is
// (docs/history/ci-perf-2026-11-20-einvoice-page-engine-on-demand.md).
//
// The official-Schematron bridge (official.mjs and its runners) and the four
// repair modules, 51 kB compressed that a plain "Check" never runs, load on
// first use through the async wrappers below; `warmOfficial` starts that
// fetch early, and `repairsReady` lets the page wait for the repair modules
// outside its error handling
// (docs/history/einvoice-page-perf-2026-11-26-official-and-repair-on-demand.md).
export { preflightDocuments, buildChecklist, buildMarkdown, buildJsonReport, buildRemediationCsv, summarizePreflight } from "./report.mjs";
export { officialNote } from "./official-note.mjs";
export { looksLikeCii } from "./cii.mjs";
export { auditPackHtml } from "./auditpack.mjs";

// A failed fetch clears the cache, so the next click retries.
function once(load) {
  let p = null;
  return () => (p ||= load().catch((e) => { p = null; throw e; }));
}

const loadOfficial = once(() => import("./official.mjs"));
const loadRepairs = once(() => Promise.all([
  import("./repair.mjs"),
  import("./repair-ubl.mjs"),
  import("./repair-cii.mjs"),
  import("./repair-facturx.mjs"),
]).then(([invoice, ubl, cii, facturx]) => ({ invoice, ubl, cii, facturx })));

export async function warmOfficial() { await loadOfficial(); }
export async function repairsReady() { await loadRepairs(); }

export async function addOfficialFindings(...args) {
  return (await loadOfficial()).addOfficialFindings(...args);
}
export async function repairInvoice(invoice) {
  return (await loadRepairs()).invoice.repairInvoice(invoice);
}
export async function repairUbl(source) {
  return (await loadRepairs()).ubl.repairUbl(source);
}
export async function repairCii(source) {
  return (await loadRepairs()).cii.repairCii(source);
}
export async function repairFacturX(source) {
  return (await loadRepairs()).facturx.repairFacturX(source);
}
