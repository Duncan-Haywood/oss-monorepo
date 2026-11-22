// Critical path drag on the six public XERs (eval/corpus-fetch.sh), plus a
// consistency check the drag itself does not use: shorten each activity by
// exactly its drag and the finish must come in by exactly that much; shorten
// it by its drag plus one hour more (where drag < remaining) and the finish
// must come in by no more than the drag.
//   node eval/drag-check.mjs DIR/xer
import { readFileSync, readdirSync } from "node:fs";
import { decodeXer, parseXer } from "../xer.mjs";
import { buildModel, schedule } from "../cpm.mjs";
import { dragAnalysis } from "../drag.mjs";
const dir = process.argv[2] || "/tmp/xer-corpus/xer";
const out = [];
for (const f of readdirSync(dir).filter((n) => n.endsWith(".xer")).sort()) {
  const xer = parseXer(decodeXer(readFileSync(`${dir}/${f}`)));
  const model = buildModel(xer);
  const r = dragAnalysis(xer, { model });
  const base = schedule(null, { model, forwardOnly: true });
  const F0 = base.projects.get(r.project.id).finish;
  const cal = model.projects.get(r.project.id).cal;
  let exact = 0, exactOf = 0, noMore = 0, noMoreOf = 0, expectedSkipped = 0, otherCal = 0;
  for (const a of r.activities) {
    if (a.drag.hours <= 0) continue;
    const t = model.tasks.get(a.id);
    const rem = base.tasks.get(a.id).rem ?? t.remain;
    const dm = a.drag.minutes;
    // an expected finish overrides a shorter duration (the note says so)
    if (a.notes.some((n) => n.startsWith("its expected finish"))) { expectedSkipped++; continue; }
    // the drag is in project-calendar hours; shorten on the activity's own
    // calendar only where the two agree (same calendar), else skip
    if (t.cal !== cal) { otherCal++; continue; }
    const fin = (m) => schedule(null, { model, forwardOnly: true, durations: new Map([[a.id, m]]) }).projects.get(r.project.id).finish;
    exactOf++;
    if (cal.workBetween(fin(rem - dm), F0) === dm) exact++;
    if (dm + 60 <= rem) { noMoreOf++; if (cal.workBetween(fin(rem - dm - 60), F0) <= dm) noMore++; }
  }
  const s = r.summary;
  out.push({ file: f, project: r.project.code, finish: r.finish, tested: s.tested, withDrag: s.withDrag, reverse: s.reverse, limitedByParallel: s.limitedByParallel, largest: s.largest, lagsWithDrag: s.lagsWithDrag, runs: r.runs, ms: r.ms, exact: `${exact}/${exactOf}`, noMore: `${noMore}/${noMoreOf}`, expectedSkipped, otherCal });
}
console.log(JSON.stringify(out, null, 2));
