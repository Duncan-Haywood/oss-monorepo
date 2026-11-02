// Regenerates sample-staff-pack.html from the real staff pack on the built-in invented café week, so
// the marketing page shows exactly what a buyer gets. Run: node build-sample-pack.mjs
import { writeFileSync } from "node:fs";
import { parseStaff, parseShifts, buildRoster, sampleStaff, sampleShifts } from "./calc.mjs";
import { staffPackHtml } from "./staffpack.mjs";

export function samplePack() {
  const st = parseStaff(sampleStaff());
  const sh = parseShifts(sampleShifts());
  const roster = buildRoster(st.staff, sh.slots, {});
  return staffPackHtml(roster, { business: "Sample Café (invented)", weekStart: "2026-11-02", accent: "#5f1b7e", contact: "Sample only: not a real business", notes: "Swaps: find cover, then tell the manager.\nClock in at the door, not the car park." });
}
if (process.argv[1] && process.argv[1].endsWith("build-sample-pack.mjs")) writeFileSync(new URL("./sample-staff-pack.html", import.meta.url), samplePack());
