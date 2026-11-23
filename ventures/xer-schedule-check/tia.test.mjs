import { test } from "node:test";
import assert from "node:assert/strict";
import { parseXer, xerText } from "./xer.mjs";
import { schedule } from "./cpm.mjs";
import { EXAMPLE_XER } from "./example.mjs";
import { parseFragnet, timeImpact, timeImpactText, timeImpactCsv, timeImpactHtml, partyHtml, EXAMPLE_FRAGNET, EXAMPLE_PARTY_FRAGNET } from "./tia.mjs";

const xer = () => parseXer(EXAMPLE_XER);
const H = "Activity ID,Name,Duration,Predecessors,Successors,Not before,Event\n";

test("parseFragnet reads links, lags, extensions, dates and events", () => {
  const f = parseFragnet(`${H}F1,Redesign,10,A1030 SS+2; A1020,A1100 FF-1,2026-04-20,CO-1\nA1040,,+5,,,,CO-2\n`);
  assert.equal(f.rows.length, 2);
  const [a, b] = f.rows;
  assert.deepEqual(a.preds.map(({ code, type, lagDays }) => [code, type, lagDays]), [["A1030", "SS", 2], ["A1020", "FS", 0]]);
  assert.deepEqual(a.succs.map(({ code, type, lagDays }) => [code, type, lagDays]), [["A1100", "FF", -1]]);
  assert.equal(a.days, 10);
  assert.equal(a.event, "CO-1");
  assert.ok(a.notBefore > 0);
  assert.equal(b.extend, true);
  assert.equal(b.days, 5);
  // tab-separated, pasted from a spreadsheet
  const t = parseFragnet("Activity ID\tDuration\tPredecessors\nF9\t3\tA1030\n");
  assert.equal(t.rows[0].days, 3);
  assert.equal(t.rows[0].preds[0].code, "A1030");
});

test("a zero-day fragnet between linked activities moves nothing", () => {
  const r = timeImpact(xer(), `${H}F0,Null,0,A1120,A1140\n`);
  assert.equal(r.finish.delayDays, 0);
  assert.equal(r.consumed.length, 0);
});

test("a fragnet on the driving path moves the finish by its length", () => {
  // A1140 -> A1150 is finish-to-start with no lag on the driving path to the finish
  const base = timeImpact(xer(), `${H}F0,Null,0,A1140,A1150\n`);
  assert.ok(base.drivingPath.includes("A1140") && base.drivingPath.includes("A1150"));
  const r = timeImpact(xer(), `${H}F1,Owner hold,7,A1140,A1150\n`);
  assert.equal(r.finish.delayDays, 7);
  assert.ok(r.fragnetOnPath.includes("F1"));
  assert.equal(r.fragnet[0].kind, "new");
  assert.ok(r.fragnet[0].driving);
});

test("a delay inside an activity's float moves nothing; past it, the rest", () => {
  // A1190 Signage has 30 days of float in the example
  const inside = timeImpact(xer(), `${H}A1190,,+10\n`);
  assert.equal(inside.finish.delayDays, 0);
  const sig = inside.consumed.find((c) => c.code === "A1190");
  assert.equal(sig.usedDays, 10);
  const past = timeImpact(xer(), `${H}A1040,,+25\n`);
  // A1040 has 20 days over the must-finish date, 10 over the finish path
  assert.ok(past.finish.delayDays > 0);
  assert.deepEqual(past.extended, ["A1040"]);
});

test("a new activity after A equals A made longer when A has one FS successor", () => {
  const frag = timeImpact(xer(), `${H}F1,Late hardware,15,A1040,A1170\n`);
  const ext = timeImpact(xer(), `${H}A1040,,+15\n`);
  assert.equal(frag.finish.impacted, ext.finish.impacted);
  assert.deepEqual(frag.milestones.map((m) => m.impacted), ext.milestones.map((m) => m.impacted));
});

test("a not-before date holds the fragnet back", () => {
  const r = timeImpact(xer(), `${H}F1,Permit hold,0,,A1060,2026-06-01\n`);
  const f = r.fragnet[0];
  assert.ok(f.start >= "2026-06-01");
  assert.ok(r.finish.delayDays > 0);
});

test("milestones refuse added days; finished work cannot be held up", () => {
  const ms = timeImpact(xer(), `${H}M1210,,+5\n`);
  assert.equal(ms.finish.delayDays, 0);
  assert.deepEqual(ms.extended, []);
  assert.ok(ms.warnings.some((w) => /is a milestone/.test(w)));
  const done = timeImpact(xer(), `${H}F1,Late,5,A1010,A1020\n`);
  assert.ok(done.warnings.some((w) => /A1020 is finished/.test(w)));
});

test("an ID that ends in -1 is taken whole, not as a lag", () => {
  const x = xer();
  const t = x.tables.TASK.find((r) => r.task_code === "A1150");
  t.task_code = "A1150-1";
  const r = timeImpact(x, `${H}F1,Hold,4,A1140,A1150-1\n`);
  assert.equal(r.finish.delayDays, 4);
  assert.ok(!r.warnings.some((w) => /not in project/.test(w)));
});

test("a fragnet that closes a loop is refused", () => {
  assert.throws(() => timeImpact(xer(), `${H}F1,Loop,2,A1150,A1140\n`), /logic loop/);
});

test("each event alone, and their overlap", () => {
  const r = timeImpact(xer(), EXAMPLE_FRAGNET);
  assert.equal(r.byEvent.length, 2);
  const sum = r.byEvent.reduce((s, e) => s + e.delayDays, 0);
  assert.equal(Math.round((sum - r.finish.delayDays) * 10) / 10, r.overlapDays);
  assert.ok(r.finish.delayDays >= Math.max(...r.byEvent.map((e) => e.delayDays)));
});

test("the impacted XER reads back to the same finish", () => {
  const r = timeImpact(xer(), EXAMPLE_FRAGNET);
  const back = schedule(parseXer(xerText(r.impactedXer)));
  const p = [...back.projects.values()][0];
  assert.equal(new Date(p.finish * 60000).toISOString().slice(0, 16).replace("T", " "), r.finish.impacted);
});

test("text, CSV and the printable exhibit", () => {
  const r = timeImpact(xer(), EXAMPLE_FRAGNET);
  assert.match(timeImpactText(r), /working days later/);
  const csv = timeImpactCsv(r);
  assert.match(csv, /^section,activity/);
  assert.match(csv, /fragnet,F110/);
  const html = timeImpactHtml(r, { event: "CO-03 <b>" });
  assert.match(html, /RP 52R-06/);
  assert.ok(!html.includes("CO-03 <b>"));
  assert.match(html, /CO-03 &lt;b&gt;/);
});

test("an expected finish date that absorbs the delay is named; off, the delay shows", () => {
  const x = xer();
  x.tables.SCHEDOPTIONS[0].sched_use_expect_end_flag = "Y";
  // A1150 Paint (64 h) expected to finish a week after its own early finish
  const t = x.tables.TASK.find((r) => r.task_code === "A1150");
  const ef = schedule(x).tasks.get(t.task_id).ef;
  t.expect_end_date = new Date((ef + 7 * 1440) * 60000).toISOString().slice(0, 16).replace("T", " ");
  const on = timeImpact(x, `${H}F1,Hold,3,A1140,A1150\n`);
  assert.ok(on.absorbed.some((a) => a.code === "A1150"));
  assert.ok(on.warnings.some((w) => /expected finish/.test(w)));
  const off = timeImpact(x, `${H}F1,Hold,3,A1140,A1150\n`, { expectedFinish: false });
  assert.equal(off.absorbed.length, 0);
  assert.ok(off.finish.delayDays > on.finish.delayDays);
});

// probabilistic branches (branchSetup, rowsForOutcome)
const HB = "Activity ID,Name,Duration,Predecessors,Successors,Branch group,Branch,Probability\n";
test("branches: each outcome is scheduled, and the expectation weighs them", () => {
  // A1140 -> A1150 is on the driving path (see above): a 7-day hold moves the finish 7 days
  const r = timeImpact(xer(), `${HB}F1,Hold,7,A1140,A1150,Hold,Happens,30%\n`);
  const b = r.branches;
  assert.equal(b.outcomes.length, 2);
  const g = b.groups[0];
  assert.deepEqual(g.branches.map((x) => [x.name, x.remainder, x.delayDays]), [["Happens", false, 7], ["none of these", true, 0]]);
  assert.equal(g.mostLikely, "none of these");
  // the single result takes the most likely branch: nothing inserted
  assert.equal(r.finish.delayDays, 0);
  assert.equal(r.fragnet.length, 0);
  assert.equal(b.expectedDelayDays, 2.1);
  assert.equal(b.p50DelayDays, 0);
  assert.equal(b.p80DelayDays, 7);
  assert.ok(Math.abs(b.chanceOfDelay - 0.3) < 1e-9);
});

test("branches: the same activity ID on two branches, and links to a branch not taken", () => {
  const f = `${HB}F1,Review,5,A1140,A1150,Review,Pass,0.7\nF1,Review and resubmit,15,A1140,A1150,Review,Resubmit,0.3\nF2,Rework,4,F1,A1150,Review,Resubmit,\n`;
  const r = timeImpact(xer(), f);
  const out = new Map(r.branches.outcomes.map((o) => [o.picks[0].branch, o.delayDays]));
  assert.equal(out.get("Pass"), 5);
  assert.equal(out.get("Resubmit"), 19);
  assert.equal(r.finish.delayDays, 5);
  assert.deepEqual(r.fragnet.map((x) => [x.code, x.days]), [["F1", 5]]);
  // each outcome equals the plain TIA of its own rows
  const alone = timeImpact(xer(), `${H}F1,Review and resubmit,15,A1140,A1150\nF2,Rework,4,F1,A1150\n`);
  assert.equal(alone.finish.delayDays, out.get("Resubmit"));
  assert.equal(r.branches.expectedDelayDays, Math.round((0.7 * 5 + 0.3 * 19) * 10) / 10);
});

test("branches: a link from an always-in row to a branch-only activity is dropped when the branch is not taken", () => {
  const f = `${HB}F1,Inspection,0,A1140,,,,\nF2,Rework,6,F1,A1150,Inspect,Fail,25%\n`;
  const r = timeImpact(xer(), f);
  const fail = r.branches.outcomes.find((o) => o.picks[0].branch === "Fail");
  assert.equal(fail.delayDays, 6);
  assert.ok(!r.warnings.some((w) => /F2 is not in project/.test(w)));
});

test("branches: two groups multiply, probabilities fill in, over 100% is refused", () => {
  const f = `${HB}F1,Hold A,3,A1140,A1150,G1,Yes,50%\nF2,Hold B,2,A1140,A1150,G2,Short,\nF3,Hold B long,8,A1140,A1150,G2,Long,\n`;
  const r = timeImpact(xer(), f);
  assert.equal(r.branches.outcomes.length, 4);
  const g2 = r.branches.groups.find((g) => g.group === "G2");
  assert.deepEqual(g2.branches.map((x) => x.probability), [0.5, 0.5]);
  assert.ok(r.warnings.some((w) => /equally likely/.test(w)));
  const sum = r.branches.outcomes.reduce((a, o) => a + o.probability, 0);
  assert.ok(Math.abs(sum - 1) < 1e-9);
  // the two holds are in parallel on one link: the outcome is the longer
  assert.equal(r.branches.maxDelayDays, 8);
  assert.throws(() => timeImpact(xer(), `${HB}F1,A,3,A1140,A1150,G,X,80%\nF2,B,3,A1140,A1150,G,Y,40%\n`), /over 100%/);
});

test("branches: no branch columns leaves the result as it was", () => {
  const r = timeImpact(xer(), EXAMPLE_FRAGNET);
  assert.equal(r.branches, null);
});

test("branches appear in the text, CSV and exhibit", () => {
  const r = timeImpact(xer(), `${HB}F1,Hold,7,A1140,A1150,Hold,Happens,30%\n`);
  assert.match(timeImpactText(r), /Probabilistic branches \(2 outcomes/);
  assert.match(timeImpactCsv(r), /^outcome,,Hold: Happens,/m);
  assert.match(timeImpactHtml(r), /Probabilistic branches<\/h2>/);
});

// red team 2026-11-22: guards for mutants that escaped this suite
test("a fragnet lag on a 24-hour lag calendar is written as 24 hours a day", () => {
  const x = parseXer(EXAMPLE_XER.replace("\tFT_FF\trcal_Predecessor\t", "\tFT_FF\trcal_24Hour\t"));
  const r = timeImpact(x, `${H}F1,Hold,3,A1140 FS+2,A1150\n`);
  const f1 = r.impactedXer.tables.TASK.find((t) => t.task_code === "F1");
  const link = r.impactedXer.tables.TASKPRED.find((l) => l.task_id === f1.task_id);
  assert.equal(link.lag_hr_cnt, "48");
  // on the default (predecessor) calendar the same lag is 2 x 8 hours
  const d = timeImpact(xer(), `${H}F1,Hold,3,A1140 FS+2,A1150\n`);
  const df1 = d.impactedXer.tables.TASK.find((t) => t.task_code === "F1");
  assert.equal(d.impactedXer.tables.TASKPRED.find((l) => l.task_id === df1.task_id).lag_hr_cnt, "16");
});

test("branches: the same probability written on two rows of a branch gives no warning; a different one does", () => {
  const same = timeImpact(xer(), `${HB}F1,Hold,3,A1140,A1150,G,Yes,40%\nF2,Rework,2,F1,A1150,G,Yes,40%\n`);
  assert.ok(!same.warnings.some((w) => /on an earlier row/.test(w)));
  const diff = timeImpact(xer(), `${HB}F1,Hold,3,A1140,A1150,G,Yes,40%\nF2,Rework,2,F1,A1150,G,Yes,60%\n`);
  assert.ok(diff.warnings.some((w) => /was given 40% on an earlier row/.test(w)));
});

test("the exhibit counts the rows it leaves to the CSV", () => {
  const r = timeImpact(xer(), `${HB}F1,Hold,7,A1140,A1150,Hold,Happens,30%\n`);
  const c = { code: "X", name: "x", floatBefore: 5, floatAfter: 1, usedDays: 4 };
  const consumed = Array.from({ length: 45 }, () => ({ ...c }));
  const outcomes = Array.from({ length: 43 }, () => ({ ...r.branches.outcomes[0] }));
  const html = timeImpactHtml({ ...r, consumed, branches: { ...r.branches, outcomes } });
  assert.match(html, />5 more in the CSV\./);
  assert.match(html, />3 more outcomes in the CSV\./);
});

test("an update with every activity finished measures added work from its last actual finish", () => {
  const x = xer();
  for (const t of x.tables.TASK) { t.status_code = "TK_Complete"; t.remain_drtn_hr_cnt = "0"; t.act_start_date ||= "2026-03-02 07:00"; t.act_end_date ||= "2026-04-03 15:30"; }
  const r = timeImpact(x, `${H}F1,Added scope,10,,\n`);
  // it used to print "Finish:  -> 2026-04-17 15:30: no change"
  assert.equal(r.finish.base, "2026-04-03 15:30");
  assert.equal(r.finish.delayDays, 10);
  assert.ok(r.warnings.some((w) => /every activity of the update is finished/.test(w)));
  // with no actual finish it falls back to the data date (here the plan start)
  for (const t of x.tables.TASK) t.act_end_date = "";
  for (const p of x.tables.PROJECT) p.last_recalc_date = "";
  const n = timeImpact(x, `${H}F1,Added scope,10,,\n`);
  assert.equal(n.finish.base, "2026-03-02 07:00");
  assert.equal(n.finish.delayDays, 10);
  assert.ok(n.warnings.some((w) => /measured from its data date/.test(w)));
});

test("delay by party: sole parts and concurrent delay add to the total (example)", () => {
  const r = timeImpact(xer(), EXAMPLE_PARTY_FRAGNET);
  assert.equal(r.finish.delayDays, 8);
  const by = Object.fromEntries(r.byParty.map((x) => [x.party, x]));
  assert.equal(by.Owner.aloneDays, 3);
  assert.equal(by.Contractor.aloneDays, 8);
  assert.equal(by.Owner.soleDays, 0);
  assert.equal(by.Contractor.soleDays, 5);
  assert.equal(r.apportionment.concurrentDays, 3);
  assert.equal(by.Owner.rows, 3);
  assert.match(timeImpactText(r), /8 d = 0 sole Owner \+ 5 sole Contractor \+ 3 concurrent/);
  assert.match(timeImpactCsv(r), /concurrent delay,,stays when any one party is taken out,,,3,/);
  assert.match(timeImpactHtml(r), /Delay by party/);
  assert.match(partyHtml(r, { h: "h3" }), /<h3>Delay by party<\/h3>/);
});

test("delay by party: series delays are not concurrent; one party owns all; rows with no party grouped", () => {
  // A1110 then A1120 both on the driving path, each made longer
  const s = timeImpact(xer(), "Activity ID,Duration,Party\nA1110,+2,Owner\nA1140,+3,Contractor\n");
  assert.equal(s.apportionment.concurrentDays, 0);
  assert.equal(s.byParty.find((x) => x.party === "Owner").soleDays + s.byParty.find((x) => x.party === "Contractor").soleDays, s.finish.delayDays);
  const one = timeImpact(xer(), "Activity ID,Duration,Party\nA1140,+3,Owner\n");
  assert.equal(one.byParty.length, 1);
  assert.equal(one.byParty[0].soleDays, one.finish.delayDays);
  const mixed = timeImpact(xer(), "Activity ID,Duration,Party\nA1140,+3,Owner\nA1150,+2,\n");
  assert.deepEqual(mixed.byParty.map((x) => x.party), ["Owner", "(no party)"]);
  assert.ok(mixed.warnings.some((w) => /name no party/.test(w)));
  assert.equal(timeImpact(xer(), EXAMPLE_FRAGNET).apportionment, null);
});

test("delay by party: a link to the other party's new activity is dropped when run alone", () => {
  const r = timeImpact(xer(), "Activity ID,Name,Duration,Predecessors,Successors,Party\nF1,Owner hold,15,A1030,,Owner\nF2,Rework after hold,4,F1,A1100,Contractor\n");
  const by = Object.fromEntries(r.byParty.map((x) => [x.party, x]));
  // F1 alone has no successor, so it moves nothing
  assert.equal(by.Owner.aloneDays, 0);
  assert.ok(r.finish.delayDays > 0);
});
