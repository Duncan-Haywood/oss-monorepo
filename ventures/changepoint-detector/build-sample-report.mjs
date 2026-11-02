// Regenerates sample-change-report.html from the real report code on the bundled Nile series, so
// the marketing page shows exactly what a buyer gets. Run: node build-sample-report.mjs
import { writeFileSync } from "node:fs";
import { analyze, DEFAULTS } from "./engine.mjs";
import { changeReportHtml } from "./report.mjs";

export function sampleReport() {
  const html = changeReportHtml(analyze({ csv: DEFAULTS.csv }), { title: "Nile flow: did it change? (sample)", author: "A. Analyst, Sample Hydrology Ltd (both invented)", accent: "#1f5f86", contact: "Sample only: not a real firm", notes: "Annual flow at Aswan, 1871-1970 (public domain).\nThe 1898 change matches the literature (Cobb 1978).", date: "2026-11-02" });
  return html.replace('<meta name="viewport"', '<meta name="robots" content="noindex"><meta name="viewport"');
}
if (process.argv[1] && process.argv[1].endsWith("build-sample-report.mjs")) writeFileSync(new URL("./sample-change-report.html", import.meta.url), sampleReport());
