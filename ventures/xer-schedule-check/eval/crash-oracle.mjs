// Brute-force oracle for crash.mjs (joint acceleration). Builds random
// finish-to-start networks on whole working days, enumerates every
// combination of whole-day shortenings within each activity's room, and
// compares the greedy cut's cumulative cost at each gain with the least
// cost of that gain.
//   node eval/crash-oracle.mjs [seeds] [nMax] [roomMax] [density]
import { pathToFileURL } from "node:url";
import { parseXer } from "../xer.mjs";
import { crashAnalysis } from "../crash.mjs";

// Mon-Fri 08:00-12:00, 13:00-17:00 (8 h/day), no holidays.
const WEEK = "(0||CalendarData()((0||DaysOfWeek()((0||1()())(0||2()((0||0(s|08:00|f|12:00)())(0||1(s|13:00|f|17:00)())))(0||3()((0||0(s|08:00|f|12:00)())(0||1(s|13:00|f|17:00)())))(0||4()((0||0(s|08:00|f|12:00)())(0||1(s|13:00|f|17:00)())))(0||5()((0||0(s|08:00|f|12:00)())(0||1(s|13:00|f|17:00)())))(0||6()((0||0(s|08:00|f|12:00)())(0||1(s|13:00|f|17:00)())))(0||7()())))(0||Exceptions()())))";
function xerText(tables) {
  const lines = ["ERMHDR\t20.12\t2025-12-01\tProject\tadmin\tAdmin\tdb\tProject Management\tUSD"];
  for (const [name, rows] of Object.entries(tables)) {
    const fields = [...new Set(rows.flatMap((r) => Object.keys(r)))];
    lines.push(`%T\t${name}`, `%F\t${fields.join("\t")}`);
    for (const r of rows) lines.push(`%R\t${fields.map((f) => r[f] ?? "").join("\t")}`);
  }
  lines.push("%E");
  return lines.join("\r\n");
}
const task = (id, hours) => ({ task_id: id, proj_id: "1", wbs_id: "10", clndr_id: "C1", task_type: "TT_Task", status_code: "TK_NotStart", task_code: id, task_name: `Activity ${id}`, remain_drtn_hr_cnt: hours, target_drtn_hr_cnt: hours });
let linkN = 0;
const link = (succ, pred, type = "PR_FS", lag = 0) => ({ task_pred_id: String(++linkN), task_id: succ, pred_task_id: pred, proj_id: "1", pred_proj_id: "1", pred_type: type, lag_hr_cnt: lag });
const project = (tasks, preds) => parseXer(xerText({
  PROJECT: [{ proj_id: "1", proj_short_name: "TEST", clndr_id: "C1", last_recalc_date: "2025-12-01 08:00", plan_start_date: "2025-12-01 08:00" }],
  CALENDAR: [{ clndr_id: "C1", default_flag: "Y", clndr_name: "Standard", day_hr_cnt: 8, clndr_data: WEEK }],
  SCHEDOPTIONS: [{ schedoptions_id: "1", proj_id: "1", sched_float_type: "FT_FF", sched_calendar_on_relationship_lag: "rcal_Predecessor", sched_retained_logic: "Y", sched_progress_override: "N" }],
  TASK: tasks, TASKPRED: preds,
}));

// Oracle: brute force over every combination of whole-day shortenings on
// small FS networks (its own longest-path recursion, no shared code), the
// least cost of each gain. The greedy cut never lengthens what it shortened,
// so it may pay more; this records how often and by how much.
function rng(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32); }

// One network: d (whole days), room (days), cost (per day), preds (indices).
// Returns the greedy's step points scored against the brute-force optimum.
export function oracleCase({ d, room, cost, preds, giveBack = true }) {
  const n = d.length;
  const longest = (dur) => { const ef = []; for (let j = 0; j < n; j++) ef[j] = Math.max(0, ...preds[j].map((i) => ef[i])) + dur[j]; return Math.max(...ef); };
  const L = longest(d);
  const best = new Map();
  const v = new Array(n).fill(0);
  const rec = (k) => {
    if (k === n) { const g = L - longest(d.map((x, i) => x - v[i])); const c = v.reduce((a, x, i) => a + x * cost[i], 0); if (!best.has(g) || c < best.get(g)) best.set(g, c); return; }
    for (let s = 0; s <= room[k]; s++) { v[k] = s; rec(k + 1); }
  };
  rec(0);
  const x = project(d.map((h, i) => task(`T${i}`, h * 8)), preds.flatMap((ps, j) => ps.map((i) => link(`T${j}`, `T${i}`))));
  const data = new Map(d.map((_, i) => [`T${i}`, { roomDays: room[i], costPerDay: cost[i] }]));
  const r = crashAnalysis(x, { data, giveBack });
  const maxG = Math.max(...best.keys());
  const misses = [];
  let points = 0, optimal = 0, worst = 0;
  for (const s of r.steps) {
    if (!Number.isInteger(s.cumulativeDays)) continue;
    // cheapest way to gain at least this much
    let opt = Infinity; for (const [g, c] of best) if (g >= s.cumulativeDays && c < opt) opt = c;
    points++;
    if (Math.abs(s.cumulativeCost - opt) < 1e-6) optimal++;
    else { worst = Math.max(worst, s.cumulativeCost / opt - 1); misses.push({ kind: "cost", days: s.cumulativeDays, cost: s.cumulativeCost, opt }); }
    if (s.cumulativeCost < opt - 1e-6) throw new Error("greedy below the oracle");
  }
  const reachOk = r.gainedDays === maxG;
  if (!reachOk) misses.push({ kind: "reach", got: r.gainedDays, max: maxG });
  return {
    points, optimal, worst, reachOk, misses, maxGain: maxG,
    givenBack: r.steps.filter((s) => s.givenBack.length).length,
    steps: r.steps.map((s) => `${s.activities.map((a) => a.code).join("+")}${s.givenBack.length ? ` (give back ${s.givenBack.map((a) => a.code).join("+")})` : ""} ${s.shortenHours} h: ${s.cumulativeDays} d for ${s.cumulativeCost}`),
  };
}

export function oracleRun({ seeds = 300, nMin = 4, nMax = 7, dMax = 6, roomMax = 2, density = 1.6, from = 1, giveBack = true } = {}) {
  const misses = [];
  let givenBack = 0, points = 0, optimal = 0, worst = 0, reach = 0, reachOk = 0;
  for (let seed = from; seed < from + seeds; seed++) {
    const rand = rng(seed);
    const n = nMin + Math.floor(rand() * (nMax - nMin + 1));
    const d = Array.from({ length: n }, () => 2 + Math.floor(rand() * (dMax - 1)));
    const room = d.map((x) => Math.min(x, Math.floor(rand() * (roomMax + 1)))); // never below zero
    const cost = d.map(() => 1 + Math.floor(rand() * 5));
    const preds = Array.from({ length: n }, () => []);
    for (let j = 1; j < n; j++) for (let i = 0; i < j; i++) if (rand() < density / j) preds[j].push(i);
    const o = oracleCase({ d, room, cost, preds, giveBack });
    givenBack += o.givenBack; points += o.points; optimal += o.optimal; worst = Math.max(worst, o.worst);
    reach++; if (o.reachOk) reachOk++;
    for (const m of o.misses) misses.push({ seed, ...m });
  }
  return { givenBack, points, optimal, worst: Math.round(worst * 1000) / 1000, reach, reachOk, misses };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [seeds = 300, nMax = 7, roomMax = 2, density = 1.6] = process.argv.slice(2).map(Number);
  const o = oracleRun({ seeds, nMax, roomMax, density });
  console.log(JSON.stringify({ ...o, misses: o.misses.slice(0, 20), missCount: o.misses.length }));
}
