// node scripts/decide-graded-summary.mjs [docs/graded-answers-2026-11-14.jsonl.gz]
//
// Sums scripts/decide-graded-sim.mjs rows (plain or gzipped JSONL) into the
// tables in docs/DECIDE-PAGE.md "Graded answers": one line per reading
// (config, tau the model used, guard) and the person's true tau, over every
// case and run.
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";

const file = process.argv[2] || "docs/graded-answers-2026-11-14.jsonl.gz";
const raw = readFileSync(file);
const rows = (file.endsWith(".gz") ? gunzipSync(raw) : raw).toString("utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
const groups = new Map();
for (const r of rows) {
  const key = `${r.config} model-tau=${r.tauModel} guard=${r.guard ?? "-"} grade=${r.grade} | person tau=${r.tauTrue}`;
  if (!groups.has(key)) groups.set(key, []);
  groups.get(key).push(r);
}
console.log("reading | person tau | runs | Spearman at 1/4, 1/2, cap | stop: picks, at cap, best right, shortfall > 0.25, self-stops within 0.25 | 'much' share");
for (const [key, rs] of [...groups].sort()) {
  const N = rs.length;
  const sp = [0, 1, 2].map((k) => (rs.reduce((a, r) => a + r.at[k].spearman, 0) / N).toFixed(3)).join(" / ");
  const st = rs.map((r) => r.stop);
  const self = st.filter((s) => !s.atCap);
  const much = rs.filter((r) => r.muchShare !== null);
  console.log(`${key} | ${N} | ${sp} | ${st.reduce((a, s) => a + s.picks, 0)}, ${st.filter((s) => s.atCap).length}, ${st.reduce((a, s) => a + s.bestRight, 0)}, ${st.filter((s) => s.shortfall > 0.25).length}, ${self.filter((s) => s.shortfall <= 0.25).length}/${self.length} | ${much.length ? (much.reduce((a, r) => a + r.muchShare, 0) / much.length).toFixed(2) : "-"}`);
}
