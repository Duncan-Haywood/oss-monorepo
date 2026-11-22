// Does the monthly schedule narrative (narrative.mjs) say what the two
// updates hold, on real P6 files? No public series of real consecutive updates
// exists (eval/compare-check-*), so each real file is the previous update and
// the current one is made from it by statusing it as planned 20 working days
// later (status.mjs) with two planted changes:
//   - a progress slip of S days on a driving-path activity due in the window
//     (it is left in progress, so the narrative must name it under planned
//     work not accomplished, with a cause fill-in);
//   - a lag of +L days on an unstarted FS link on the driving path (a revision:
//     the narrative must list it under changes, with a reason fill-in).
// Checked per file and seed:
//   1. the slipped activity is in section 4 with "Cause: [FILL IN";
//   2. the planted lag is in section 5 as "Lag on P -> S FS changed from a to b";
//   3. section 5 has exactly one line per change the comparison found (none
//      lost, none invented) and every one but a rename asks for a reason;
//   4. section 4 names each missed activity once, and exactly those;
//   5. the status paragraph carries the comparison's finish movement and split;
//   6. the fill-in count equals the markers in the text and the highlights in the HTML;
//   7. the file against itself: no change lines, no slip, no recovery request.
//
//   node eval/narrative-check.mjs <dir-with-xer-files> [--seeds 3] [--json out.json]
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseXer, decodeXer, num } from "../xer.mjs";
import { schedule, drivingPath } from "../cpm.mjs";
import { compare, pickProject } from "../compare.mjs";
import { statusAsPlanned, cloneXer } from "../status.mjs";
import { lookahead } from "../lookahead.mjs";
import { narrative, narrativeText, narrativeHtml } from "../narrative.mjs";

const args = process.argv.slice(2);
const dir = args[0];
const SEEDS = args.includes("--seeds") ? +args[args.indexOf("--seeds") + 1] : 3;
const STEP_DAYS = 20;

function rng(seed) {
  let x = (seed * 2654435761) >>> 0 || 1;
  return () => ((x ^= x << 13, x ^= x >>> 17, x ^= x << 5) >>> 0) / 4294967296;
}

function runFile(path, seed) {
  const xer = parseXer(decodeXer(readFileSync(path)));
  const res = schedule(xer);
  const projId = pickProject(xer, res.model, null).id;
  const p = res.projects.get(projId);
  const hpd = p.cal.hoursPerDay || 8;
  const rand = rng(seed);
  const pick = (a) => a[Math.floor(rand() * a.length)];
  const dd = p.cal.addWork(p.dataDate, STEP_DAYS * hpd * 60);
  const S = 1 + Math.floor(rand() * 5), L = 1 + Math.floor(rand() * 5);
  const dpath = drivingPath(res, projId).map((id) => res.model.tasks.get(id));
  // a slip: driving work due to finish inside the window, on the project calendar
  const slipC = dpath.filter((t) => { const r = res.tasks.get(t.id); return t.type !== "TT_Mile" && t.type !== "TT_FinMile" && r.ef <= dd && r.ef > p.dataDate && t.cal === p.cal; }).map((t) => t.code);
  const slip = slipC.length ? pick(slipC) : null;
  let cur = statusAsPlanned(xer, projId, dd, { slips: slip ? [{ code: slip, hours: S * hpd }] : [] });
  // a lag: an FS link on the driving path between two activities not started at dd
  const r2 = schedule(cur);
  const ids = drivingPath(r2, projId);
  const lagC = [];
  for (let i = 1; i < ids.length; i++) {
    const s = r2.model.tasks.get(ids[i]), pr = r2.model.tasks.get(ids[i - 1]);
    const rel = s.preds.find((r) => r.predId === pr.id && r.type === "PR_FS");
    if (!rel || pr.status !== "TK_NotStart" || s.status !== "TK_NotStart") continue;
    if (r2.model.rels.filter((r) => r.predId === pr.id && r.succId === s.id).length !== 1) continue;
    lagC.push({ relId: rel.id, pred: pr.code, succ: s.code });
  }
  const lag = lagC.length ? pick(lagC) : null;
  let lagWas = null;
  if (lag) {
    cur = cloneXer(cur);
    for (const r of cur.tables.TASKPRED) if (r.task_pred_id === lag.relId) { lagWas = num(r.lag_hr_cnt) ?? 0; r.lag_hr_cnt = String(lagWas + L * hpd); }
  }

  const t0 = Date.now();
  const cmp = compare(xer, cur, { prevProjId: projId, curProjId: projId });
  const n = narrative(cmp, { lookahead: lookahead(cur, { weeks: 4, projId }) });
  const ms = Date.now() - t0;
  const text = narrativeText(n), html = narrativeHtml(n);
  const sec = (id) => n.sections.find((s) => s.id === id);
  const fails = [];
  const check = (ok, what) => { if (!ok) fails.push(what); };

  // 1. the slip
  if (slip) {
    const line = sec("missed").bullets.find((b) => b.startsWith(`${slip} `));
    check(line && /Cause: \[FILL IN/.test(line), `slipped ${slip} not under planned work missed`);
  }
  // 2. the lag
  if (lag) {
    const line = sec("changes").bullets.find((b) => b.startsWith(`Lag on ${lag.pred} -> ${lag.succ} FS changed`));
    check(line && /Reason: \[FILL IN/.test(line), `planted lag ${lag.pred} -> ${lag.succ} not under changes`);
  }
  // 3. one line per change
  const want = cmp.durations.origChanged.length + cmp.progress.remainingUp.length + cmp.logic.deleted.filter((r) => r.bothRemain).length
    + cmp.logic.added.length + cmp.logic.typeChanged.length + cmp.logic.lagChanged.length + cmp.constraints.length + cmp.calendars.length
    + cmp.activities.added.length + cmp.activities.deleted.length + cmp.activities.renamed.length;
  const changeLines = sec("changes").bullets.filter((b) => !b.startsWith("... and "));
  const capped = sec("changes").bullets.length !== changeLines.length;
  check(capped || changeLines.length === want, `changes: ${changeLines.length} lines for ${want} changes`);
  check(changeLines.every((b) => /renamed from/.test(b) || /Reason: \[FILL IN/.test(b)), "a change line without a reason fill-in");
  // 4. missed work once each
  const missedCodes = sec("missed").bullets.filter((b) => !b.startsWith("... and ")).map((b) => b.split(" ")[0]);
  const wantMissed = new Set([...cmp.progress.plannedNotFinished, ...cmp.progress.plannedNotStarted].map((r) => r.code));
  check(new Set(missedCodes).size === missedCodes.length, "an activity listed twice under missed");
  check(missedCodes.length < 25 ? missedCodes.length === wantMissed.size && missedCodes.every((c) => wantMissed.has(c)) : missedCodes.every((c) => wantMissed.has(c)), "missed list differs from the comparison");
  // 5. status numbers
  const f = cmp.finish;
  if (f.moved) check(text.includes(`${Math.abs(f.moved)} working day${Math.abs(f.moved) === 1 ? "" : "s"} ${f.moved > 0 ? "later" : "earlier"} than the previous update's`), "finish movement missing from status");
  else check(/unchanged from the previous update/.test(text), "unchanged finish not said");
  if (f.moved && f.halfStep) check(text.includes("progress during the period moved the finish"), "half-step split missing");
  // 6. fill-ins
  check((text.match(/\[FILL IN: /g) || []).length === n.fillIns, "fill-in count differs from the text");
  check((html.match(/<mark class="fill">/g) || []).length === n.fillIns, "fill-in count differs from the HTML");
  // 7. identity
  const same = narrativeText(narrative(compare(xer, xer, { prevProjId: projId, curProjId: projId })));
  check(/No logic, duration, constraint, calendar or activity changes/.test(same) && !/Cause of the slip/.test(same) && !/Corrective action to recover/.test(same), "identity narrative reports a change or a slip");

  return { file: path.split("/").pop(), seed, slip, slipDays: S, lag: lag ? `${lag.pred} -> ${lag.succ}` : null, lagDays: L, moved: f.moved, progress: f.progressEffect, revisions: f.revisionEffect,
    changes: want, missed: wantMissed.size, fillIns: n.fillIns, ms, pass: !fails.length, fails };
}

const files = readdirSync(dir).filter((f) => /\.xer$/i.test(f)).sort();
const rows = [];
for (const f of files) for (let s = 1; s <= SEEDS; s++) {
  try { rows.push(runFile(join(dir, f), s)); } catch (e) { rows.push({ file: f, seed: s, pass: false, fails: [`error: ${e.message}`] }); }
  const r = rows.at(-1);
  console.log(`${r.pass ? "ok  " : "FAIL"} ${r.file} seed ${r.seed}: slip ${r.slip ?? "-"} +${r.slipDays}d, lag ${r.lag ?? "-"} +${r.lagDays}d; finish ${r.moved ?? "?"} (progress ${r.progress ?? "?"}, revisions ${r.revisions ?? "?"}); ${r.changes ?? "?"} changes, ${r.missed ?? "?"} missed, ${r.fillIns ?? "?"} fill-ins; ${r.ms ?? "?"} ms${r.fails.length ? " -- " + r.fails.join("; ") : ""}`);
}
const pass = rows.filter((r) => r.pass).length;
console.log(`\n${pass} of ${rows.length} runs pass; ${rows.filter((r) => r.slip).length} with a planted slip, ${rows.filter((r) => r.lag).length} with a planted lag`);
if (args.includes("--json")) writeFileSync(args[args.indexOf("--json") + 1], JSON.stringify(rows, null, 2) + "\n");
process.exit(pass === rows.length ? 0 : 1);
