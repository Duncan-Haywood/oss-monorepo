// node scripts/decide-cap-summary.mjs [file.jsonl[.gz] ...] (default docs/decide-cap-2026-11-15.jsonl.gz)
//
// Sums scripts/decide-cap-sweep.mjs rows into docs/DECIDE-PAGE.md "A larger
// cap": per person tau and cap scale, over every case and run, the picks
// spent, runs ending at the cap, shown best right, true best more than 0.25
// ahead, self-stops that kept the 0.25 promise, and the whole order's Spearman.
// --by-case adds a line per case.
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";

const files = process.argv.slice(2).filter((a) => !a.startsWith("--"));
if (!files.length) files.push("docs/decide-cap-2026-11-15.jsonl.gz");
const byCase = process.argv.includes("--by-case");
const rows = files.flatMap((file) => {
  const raw = readFileSync(file);
  return (file.endsWith(".gz") ? gunzipSync(raw) : raw).toString("utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
});
const groups = new Map();
for (const r of rows) {
  for (const [scale, s] of Object.entries(r.stops)) {
    // Rows from --long-run (2026-11-15 later) name the stop past the checkpoint; older rows are "none".
    const lr = r.longRun && r.longRun !== "none" ? ` long-run=${r.longRun}${r.longRun === "level" ? ` p${r.power}` : ""}` : "";
    // Rows from --guard (2026-11-15, latest) name the guard; older rows are "auto" at scale 1.
    const gd = !r.guard || (r.guard === "auto" && r.guardScale === 1) ? ""
      : r.guard === "switch" ? ` guard=plain below ${r.switchBelow}` : ` guard=${r.guard}${r.guard === "auto" ? ` x${r.guardScale}` : ""}`;
    const keys = [`tau=${r.tauTrue} focus=${r.focus}${lr}${gd} cap x${scale}`];
    if (byCase) keys.push(`tau=${r.tauTrue} focus=${r.focus}${lr}${gd} cap x${scale} | ${r.n}x${r.C} spread ${r.spread}`);
    for (const key of keys) { if (!groups.has(key)) groups.set(key, []); groups.get(key).push(s); }
  }
}
console.log("person tau, cap | runs | picks | at cap | best right | true best > 0.25 ahead | self-stops within 0.25 | Spearman");
for (const [key, st] of [...groups].sort()) {
  const self = st.filter((s) => !s.atCap);
  console.log(`${key} | ${st.length} | ${st.reduce((a, s) => a + s.picks, 0)} | ${st.filter((s) => s.atCap).length} | ${st.reduce((a, s) => a + s.bestRight, 0)} | ${st.filter((s) => s.shortfall > 0.25).length} | ${self.filter((s) => s.shortfall <= 0.25).length}/${self.length} | ${(st.reduce((a, s) => a + s.spearman, 0) / st.length).toFixed(3)}`);
}
