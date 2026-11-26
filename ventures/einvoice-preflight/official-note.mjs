// officialNote, the one-line note the page shows under a file the official
// Schematron ran on. No imports, so page-engine.mjs can export it without
// pulling official.mjs and its Schematron runners into every check
// (docs/history/einvoice-page-perf-2026-11-26-official-and-repair-on-demand.md).
// official.mjs re-exports it, so existing imports are unchanged.
export function officialNote(report) {
  if (report.schematron === "ok") {
    const skipped = report.schematronSkipped?.length ? ` ${report.schematronSkipped.length} rule(s) could not be evaluated in the browser and were NOT checked: ${report.schematronSkipped.join(", ")}.` : "";
    if (report.flux10) return (report.schematronWhere === "browser" ? "Official Flux 10 e-reporting controls (FNFE-MPE, PPF Annexe 7 v1.8): run in your browser, the file did not leave this page; findings listed below." : "Official Flux 10 e-reporting controls (FNFE-MPE, PPF Annexe 7 v1.8): run, findings listed below.") + skipped;
    if (report.cdar) return (report.schematronWhere === "browser" ? "Official BR-FR-CDV rules (FNFE-MPE, French life-cycle statuses): run in your browser, the file did not leave this page; findings listed below." : "Official BR-FR-CDV rules (FNFE-MPE, French life-cycle statuses): run, findings listed below.") + skipped;
    return (report.schematronWhere === "browser" ? "Official EN 16931 Schematron: run in your browser, the file did not leave this page; findings listed below." : "Official EN 16931 Schematron: run, findings listed below.") + skipped;
  }
  if (report.schematron === "unavailable") return "Official Schematron not run: this copy has neither the ./plain/ rules (node build-plain-rules.mjs) nor a server with the rules built (see README).";
  return "";
}
