// Float the late dates miss: P6's backward pass against the calendar-slack
// option (cpm.mjs options.calendarSlack), checked by forward what-ifs.
//
//   node eval/calendar-slack.mjs <dir-or-files...> [--sample 60] [--seed 1] [--json out.json]
//
// For every open activity, total float with and without the option. Where
// the option gives more, a sample of not-started activities is checked by
// scheduling the file again (forward pass only) with the activity's start
// floored at its early start plus the float:
//   finish holds - delayed by the option's float, the project finish holds;
//   sound   - and no open activity finishes past its late finish (the
//             option's) by working time on its own calendar, unless it did;
//   tight   - delayed by one more working hour, some activity does, or the
//             project finish moves;
//   P6 sound - the same test delayed by P6's float against P6's late dates;
//   past P6's late start - the option's delay starts it after P6's late start.
// eval/calendar-slack-2026-11-20.md
import { readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseXer, decodeXer, formatDate } from "../xer.mjs";
import { schedule, buildModel, lagCalendar } from "../cpm.mjs";

const args = process.argv.slice(2);
const val = (k, d) => (args.includes(k) ? args[args.indexOf(k) + 1] : d);
const sampleN = Number(val("--sample", 60));
let seed = Number(val("--seed", 1));
const jsonOut = val("--json", null);
const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648), seed / 2147483648);
const files = [];
for (const a of args.filter((a, i) => !a.startsWith("--") && !["--sample", "--seed", "--json"].includes(args[i - 1]))) {
  if (statSync(a).isDirectory()) for (const f of readdirSync(a).sort()) { if (/\.xer$/i.test(f)) files.push(join(a, f)); }
  else files.push(a);
}

const out = [];
for (const f of files) {
  const name = f.split("/").pop();
  const xer = parseXer(decodeXer(readFileSync(f)));
  const model = buildModel(xer);
  const t0 = Date.now();
  const base = schedule(xer, { model });
  const cs = schedule(xer, { model, calendarSlack: true });
  const ms = Date.now() - t0;
  const open = [...model.tasks.values()].filter((t) => !t.span && t.status !== "TK_Complete" && base.tasks.get(t.id)?.lf !== undefined);
  const gains = [];
  let earlyDiff = 0, lessFloat = 0;
  for (const t of open) {
    const b = base.tasks.get(t.id), c = cs.tasks.get(t.id);
    if (b.es !== c.es || b.ef !== c.ef) earlyDiff++;
    const g = Math.round((c.tf - b.tf) * 100) / 100;
    if (g < 0) lessFloat++;
    if (g > 0) gains.push({ t, gain: g, tfP6: b.tf, tf: c.tf });
  }
  // the links where the slack enters: an FF or SF link whose successor may
  // finish later than its late finish (lfAbs > lf), where that gives the
  // predecessor working time (calslack.mjs)
  const entries = [];
  for (const t of open) {
    const c = cs.tasks.get(t.id);
    if (c.lfAbs === undefined || c.lfAbs === c.lf) continue;
    for (const rel of t.preds) {
      if (rel.type !== "PR_FF" && rel.type !== "PR_SF") continue;
      const p = model.tasks.get(rel.predId);
      if (p.span || p.status === "TK_Complete") continue;
      const lc = lagCalendar(model, rel);
      const back = (v) => p.cal.prevEnd(lc.subWork(v, rel.lag));
      const w = p.cal.workBetween(back(c.lf), back(c.lfAbs));
      if (w > 0) entries.push({ pred: p.code, succ: t.code, type: rel.type, lag_h: rel.lag / 60, lagCal: lc.name, succCal: t.cal.name, gap_h: w / 60, lf: formatDate(c.lf), lfAbs: formatDate(c.lfAbs) });
    }
  }
  const projOf = (t) => base.projects.get(t.proj);
  const bound = (c) => c.lfAbs ?? c.lf;
  // late = finishes past its late finish by working time on its own calendar
  // (a finish at Saturday 08:00 on a Friday-off calendar is not past Thursday
  // 16:00); lateP6 against the stored-style late dates
  const lateBy = (r, res) => {
    const s = new Set();
    for (const t of open) {
      const x = r.tasks.get(t.id), c = res.tasks.get(t.id);
      if (x && t.cal.workBetween(bound(c), x.ef) > 0) s.add(t.id);
    }
    return s;
  };
  const late = (r) => lateBy(r, cs);
  const baseFwd = schedule(xer, { model, forwardOnly: true });
  const lateBase = late(baseFwd);
  const lateBaseP6 = lateBy(baseFwd, base);
  const cand = gains.filter((g) => g.t.status === "TK_NotStart" && !g.t.cstr.some((c) => c.type === "CS_ALAP") && g.tf >= 0);
  for (let i = cand.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [cand[i], cand[j]] = [cand[j], cand[i]]; }
  const picks = cand.slice(0, sampleN);
  let sound = 0, tight = 0, p6short = 0, p6sound = 0, finHolds = 0;
  const rows = [];
  for (const g of picks) {
    const t = g.t, b = base.tasks.get(t.id), cal = t.cal;
    const run = (minutes, p6 = false) => {
      const floor = cal.nextStart(cal.addWork(b.es, minutes));
      const r = schedule(xer, { model, forwardOnly: true, levelStart: new Map([[t.id, floor]]) });
      const l = p6 ? lateBy(r, base) : late(r);
      let newLate = 0;
      for (const id of l) if (!(p6 ? lateBaseP6 : lateBase).has(id)) newLate++;
      return { floor, newLate, finMoved: r.projects.get(t.proj).finish !== projOf(t).finish && r.projects.get(t.proj).finish > projOf(t).finish };
    };
    const full = Math.round(g.tf * 60);
    const a = run(full);
    const z = run(full + 60);
    const q = run(Math.round(g.tfP6 * 60), true);
    const p6Sound = q.newLate === 0 && !q.finMoved;
    if (p6Sound) p6sound++;
    if (!a.finMoved) finHolds++;
    const isSound = a.newLate === 0 && !a.finMoved;
    const isTight = z.newLate > 0 || z.finMoved;
    const short = a.floor > b.ls;
    if (isSound) sound++;
    if (isTight) tight++;
    if (short) p6short++;
    rows.push({ code: t.code, tfP6: g.tfP6, tf: g.tf, gain: g.gain, finHolds: !a.finMoved, sound: isSound, p6Sound, tight: isTight, pastP6LateStart: short });
  }
  const maxGain = gains.reduce((m, g) => Math.max(m, g.gain), 0);
  const rec = { file: name, open: open.length, gains: gains.length, maxGain_h: maxGain, lessFloat, earlyDiff, entries: entries.length, checked: picks.length, finHolds, sound, tight, p6short, p6sound, ms, entryLinks: entries.slice(0, 20), rows };
  out.push(rec);
  console.log(`${name}: ${open.length} open; ${gains.length} gain float (max ${maxGain} h), ${lessFloat} lose, ${earlyDiff} early dates differ; ${entries.length} entry links; checked ${picks.length}: finish holds ${finHolds}, sound ${sound} (P6's float sound ${p6sound}), tight ${tight}, past P6's late start ${p6short} (${ms} ms for both runs)`);
  for (const e of entries.slice(0, 5)) console.log(`   ${e.pred} -${e.type.slice(3)} ${e.lag_h}h (${e.lagCal})-> ${e.succ} (${e.succCal}): finish ${e.lf} may be ${e.lfAbs}, ${e.gap_h} h more for the predecessor`);
}
if (jsonOut) writeFileSync(jsonOut, JSON.stringify(out, null, 1) + "\n");
