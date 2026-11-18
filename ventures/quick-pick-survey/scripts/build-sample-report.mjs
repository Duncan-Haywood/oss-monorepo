// Regenerates site/sample-results-report.html from the real resultsReportHtml() on an
// invented team-offsite vote, so the marketing page shows exactly what a buyer gets.
// Respondent ratings are a seeded simulation (not real people).
// Run: node scripts/build-sample-report.mjs   (Node 22.18+ strips the TypeScript types)
import { writeFileSync } from "node:fs";
import { groupRanking, coverage } from "../src/lib/groupRanking.ts";
import { resultsReportHtml } from "../src/lib/resultsReport.ts";

let s = 20261107; // mulberry32, so the sample is byte-stable
const rnd = () => { s = (s + 0x6d2b79f5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const gauss = () => Math.sqrt(-2 * Math.log(rnd() || 1e-9)) * Math.cos(2 * Math.PI * rnd());

const options = [
  ["a", "Lakeside cabin weekend", 1640], ["b", "Cooking class in the city", 1585], ["c", "Escape room and dinner", 1570],
  ["d", "Day hike and picnic", 1530], ["e", "Pottery workshop", 1470], ["f", "Bowling night", 1440], ["g", "Museum tour", 1330],
];
const items = options.map(([id, label]) => ({ id, label }));
const respondents = 14;
const rows = [];
for (let p = 0; p < respondents; p++) {
  for (const [id, , truth] of options) {
    if (id === "g" && p > 1) continue; // few people were shown the last option: it will be flagged as thin
    rows.push({ itemId: id, rating: truth + gauss() * 55, rd: 70 + rnd() * 50 });
  }
}
const ranked = groupRanking(items, rows);
const cov = coverage(ranked, respondents);
const html = resultsReportHtml("Team offsite vote (invented sample)", ranked, cov, respondents,
  { name: "Sample Co (invented)", colour: "#8f3420", note: "Sample only: an invented team and a simulated vote. Not a real survey." }, "2026-11-07")
  .replace('<meta name="viewport"', '<meta name="robots" content="noindex"><meta name="viewport"');
writeFileSync(new URL("../site/sample-results-report.html", import.meta.url), html);
console.log(ranked.map((r) => `${r.tied ? r.bestRank + "-" + r.worstRank : r.rank} ${r.label}`).join("\n"));
