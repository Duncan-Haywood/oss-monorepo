// Regenerates sample-print-pack.html from the page's invented example league.
// Run: node make-sample-pack.mjs
import { writeFileSync } from "node:fs";
import { buildSchedule, readSpec, sampleFields } from "./calc.mjs";
import { printPackHtml } from "./printpack.mjs";
const r = readSpec(sampleFields());
if (r.errors.length) throw new Error(r.errors.join("; "));
const html = printPackHtml(buildSchedule(r.spec), { league: "Sample Rec League (invented teams)", season: "Fall", accent: "#1d5a3f", contact: "Organiser: your name, your email", notes: "Sample only. Every team name here is made up." });
writeFileSync(new URL("./sample-print-pack.html", import.meta.url), html);
