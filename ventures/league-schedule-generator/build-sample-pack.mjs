// Regenerates sample-season-pack.html from the real print pack on an invented league, so the
// marketing page shows exactly what a buyer gets. Run: node build-sample-pack.mjs
import { writeFileSync } from "node:fs";
import { readSpec, buildSchedule, sampleFields } from "./calc.mjs";
import { printPackHtml } from "./printpack.mjs";

export function samplePack() {
  const f = sampleFields();
  const r = readSpec(f);
  if (r.errors?.length) throw new Error(r.errors.join("; "));
  return printPackHtml(buildSchedule(r.spec), { league: "Sample Rec League (invented)", season: "Fall", accent: "#1d5a3f", contact: "Sample only: not a real league", notes: "Bring your own balls.\nGames start on time; 10 minute grace." });
}
if (process.argv[1] && process.argv[1].endsWith("build-sample-pack.mjs")) writeFileSync(new URL("./sample-season-pack.html", import.meta.url), samplePack());
