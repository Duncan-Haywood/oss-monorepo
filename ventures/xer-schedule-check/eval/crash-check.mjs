// Joint acceleration (crash.mjs) on the six public XERs (eval/corpus-fetch.sh)
// with the default data (each task may lose 25% of its remaining duration,
// cost 1 per working day) and a 20-working-day target, against the best one
// activity can do (drag.mjs), plus a replay the analysis does not use: put
// every shortening it chose into one fresh schedule and the finish must be
// the one it reports.
//   node eval/crash-check.mjs DIR/xer [targetDays]
import { readFileSync, readdirSync } from "node:fs";
import { decodeXer, parseXer, formatDate } from "../xer.mjs";
import { buildModel, schedule } from "../cpm.mjs";
import { crashAnalysis } from "../crash.mjs";
import { dragAnalysis } from "../drag.mjs";
const dir = process.argv[2] || "/tmp/xer-corpus/xer";
const targetDays = Number(process.argv[3]) || 20;
const out = [];
for (const f of readdirSync(dir).filter((n) => n.endsWith(".xer")).sort()) {
  const xer = parseXer(decodeXer(readFileSync(`${dir}/${f}`)));
  const model = buildModel(xer);
  const r = crashAnalysis(xer, { model, targetDays });
  const d = dragAnalysis(xer, { model, lags: false });
  const byCode = new Map([...model.tasks.values()].filter((t) => t.proj === r.project.id).map((t) => [String(t.code), t]));
  const durs = new Map(r.activities.map((a) => { const t = byCode.get(String(a.code)); return [t.id, t.remain - a.shortenMinutes]; }));
  const replay = formatDate(schedule(null, { model, forwardOnly: true, durations: durs }).projects.get(r.project.id).finish);
  const maxCut = Math.max(0, ...r.steps.map((s) => s.activities.length));
  out.push({
    file: f, project: r.project.code, finishBefore: r.finishBefore, finishAfter: r.finishAfter, replayFinish: replay, replayMatches: replay === r.finishAfter,
    gainedDays: r.gainedDays, activityDaysBought: r.totalCost, steps: r.steps.length, largestCut: maxCut, givingBack: r.steps.filter((s) => s.givenBack.length).length,
    activitiesShortened: r.activities.length, bestSingleDragDays: d.summary.largest ? d.summary.largest.days : 0,
    stoppedBecause: r.stoppedBecause, runs: r.runs, ms: r.ms, warnings: r.warnings.filter((w) => !w.startsWith("NOTE")).slice(0, 3),
  });
  console.error(`${f}: ${r.gainedDays} d in ${r.steps.length} steps, ${r.ms} ms`);
}
console.log(JSON.stringify(out, null, 2));
