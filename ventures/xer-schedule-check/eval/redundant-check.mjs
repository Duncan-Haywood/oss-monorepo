// Check for redundant.mjs on the public P6 files: does deleting the links it
// calls redundant really change nothing, and does it find links planted to
// be redundant?
//
//   bash eval/corpus-fetch.sh DIR && node eval/redundant-check.mjs DIR/xer [--draws 5] [--plants 20]
//
// 1. Deletion: every link marked redundant (sure and check apart) is removed
//    from a copy of the file and the file is rescheduled by cpm.mjs. Every
//    activity's early start and finish, late start and finish, total float
//    and free float, and each project's finish, are compared to the file
//    as it was. A redundant link is one no set of durations can make drive,
//    so the same comparison is repeated with every unstarted activity's
//    remaining duration redrawn at random (0 to 3 times the file's, a fifth
//    of them set to zero; --draws of them).
// 2. Control: the same deletion of the lag-carrying links (another path,
//    less lag) is expected to move dates in some draws; it shows the
//    comparison can see a change.
// 3. Plants: in a copy of the file, a duplicate of a random open link, and
//    a new FS link from an unstarted activity to the successor of one of its
//    FS successors (A -> B -> C gets A -> C), are added; each must be named.

import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { decodeXer, parseXer } from "../xer.mjs";
import { schedule, buildModel } from "../cpm.mjs";
import { redundantLogic, withoutLinks } from "../redundant.mjs";

const args = process.argv.slice(2);
const dir = args.find((a) => !a.startsWith("--"));
if (!dir) { console.error("usage: node eval/redundant-check.mjs DIR [--draws N] [--plants N]"); process.exit(2); }
const opt = (n) => (args.includes(n) ? args[args.indexOf(n) + 1] : undefined);
const DRAWS = Number(opt("--draws") || 5);
const PLANTS = Number(opt("--plants") || 20);

function rng(seed) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 2 ** 32; };
}
const FIELDS = ["es", "ef", "ls", "lf", "tf", "ff"];

function compare(xerA, xerB, durations) {
  const a = schedule(xerA, durations ? { durations } : {});
  const b = schedule(xerB, durations ? { durations } : {});
  let acts = 0, diff = 0;
  const examples = [];
  for (const [id, ra] of a.tasks) {
    const rb = b.tasks.get(id);
    if (!rb) continue;
    acts++;
    const bad = FIELDS.filter((f) => (ra[f] ?? null) !== (rb[f] ?? null) && !(Number.isFinite(ra[f]) && Number.isFinite(rb[f]) && Math.abs(ra[f] - rb[f]) < 1e-6));
    if (bad.length) { diff++; if (examples.length < 3) examples.push(`${a.model.tasks.get(id).code}: ${bad.join(",")}`); }
  }
  let finish = 0;
  for (const [pid, pa] of a.projects) { const pb = b.projects.get(pid); if (pb && pa.finish !== pb.finish) finish++; }
  return { acts, diff, finish, examples };
}

function drawDurations(model, seed) {
  const r = rng(seed);
  const m = new Map();
  for (const t of model.tasks.values()) {
    if (t.span || t.status !== "TK_NotStart") continue;
    if (t.type === "TT_Mile" || t.type === "TT_FinMile") continue;
    m.set(t.id, r() < 0.2 ? 0 : Math.round(t.remain * 3 * r()));
  }
  return m;
}

let allOk = true;
const files = readdirSync(dir).filter((f) => /\.xer$/i.test(f)).sort();
for (const f of files) {
  const xer = parseXer(decodeXer(readFileSync(join(dir, f))));
  const model = buildModel(xer);
  const r = redundantLogic(xer, { model });
  const s = r.summary;
  console.log(`\n${f}: ${s.checked} open links checked, ${s.redundant} redundant (${s.sure} sure, ${s.duplicates} duplicates), ${s.lagCarrying} lag-carrying; ${s.intoDone} into completed, ${s.intoStarted} into started, ${s.fromProgress} from progress skipped (${r.ms} ms)`);
  const sets = [
    ["sure", r.redundant.filter((x) => x.sure).map((x) => x.id)],
    ["check", r.redundant.filter((x) => !x.sure).map((x) => x.id)],
    ["control (lag-carrying)", r.lagCarrying.map((x) => x.id)],
  ];
  for (const [name, ids] of sets) {
    if (!ids.length) continue;
    const cut = withoutLinks(xer, ids);
    const runs = [compare(xer, cut, null)];
    for (let d = 1; d <= DRAWS; d++) runs.push(compare(xer, cut, drawDurations(model, 1000 * d + 7)));
    const moved = runs.filter((x) => x.diff || x.finish).length;
    const line = runs.map((x) => `${x.diff}/${x.acts}${x.finish ? ` finish ${x.finish}` : ""}`).join("; ");
    const ex = runs.flatMap((x) => x.examples).slice(0, 3);
    console.log(`  delete ${ids.length} ${name}: activities with any date or float changed, file durations then ${DRAWS} random draws: ${line}${ex.length ? `  e.g. ${ex.join(" | ")}` : ""}`);
    if (name !== "control (lag-carrying)" && name !== "check" && moved) allOk = false;
  }

  // plants
  const rr = rng(4242);
  const open = (t) => t && !t.span && t.status === "TK_NotStart";
  const links = (xer.tables.TASKPRED || []).filter((l) => open(model.tasks.get(l.task_id)) && open(model.tasks.get(l.pred_task_id)));
  const fs = links.filter((l) => l.pred_type === "PR_FS" && Number(l.lag_hr_cnt || 0) >= 0);
  const fsBySucc = new Map();
  for (const l of fs) { if (!fsBySucc.has(l.pred_task_id)) fsBySucc.set(l.pred_task_id, []); fsBySucc.get(l.pred_task_id).push(l); }
  const dupMiss = [];
  let dupFound = 0, dupN = 0, chainFound = 0, chainN = 0;
  for (let k = 0; k < PLANTS && links.length; k++) {
    const l = links[Math.floor(rr() * links.length)];
    const id = `plant-dup-${k}`;
    const planted = { ...xer, tables: { ...xer.tables, TASKPRED: [...xer.tables.TASKPRED, { ...l, task_pred_id: id }] } };
    const res = redundantLogic(planted);
    dupN++;
    // exactly one of the two copies is named (the network may imply the
    // other as well, if it already implied the original)
    const named = res.redundant.filter((x) => x.id === id || x.id === l.task_pred_id).length;
    const before = r.redundant.some((x) => x.id === l.task_pred_id) ? 1 : 0;
    if (named === 1 + before) dupFound++;
    else if (dupMiss.length < 3) dupMiss.push(`${l.task_pred_id}: named ${named}, before ${before}`);
  }
  const chains = fs.filter((ab) => (fsBySucc.get(ab.task_id) || []).length);
  for (let k = 0; k < PLANTS && chains.length; k++) {
    const ab = chains[Math.floor(rr() * chains.length)];
    const bcs = fsBySucc.get(ab.task_id);
    const bc = bcs[Math.floor(rr() * bcs.length)];
    if (bc.task_id === ab.pred_task_id) continue;
    const id = `plant-chain-${k}`;
    const planted = { ...xer, tables: { ...xer.tables, TASKPRED: [...xer.tables.TASKPRED, { ...ab, task_pred_id: id, task_id: bc.task_id, lag_hr_cnt: 0 }] } };
    const res = redundantLogic(planted);
    chainN++;
    if (res.redundant.some((x) => x.id === id)) chainFound++;
  }
  console.log(`  plants: duplicates named ${dupFound}/${dupN}${dupMiss.length ? ` (missed: ${dupMiss.join("; ")})` : ""}; A->C over A->B->C named ${chainFound}/${chainN}`);
  if (dupFound !== dupN || chainFound !== chainN) allOk = false;
}
console.log(allOk ? "\nOK: deleting the sure redundant links changed no date or float in any run, and every plant was named" : "\nFAIL: see above");
process.exit(allOk ? 0 : 1);
