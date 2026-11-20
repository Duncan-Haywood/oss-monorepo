// Milestones on a 24-hour calendar (cpm.mjs options.milestones24h,
// milestones.mjs) against P6's reading, checked by forward what-ifs.
//
//   node eval/milestone-calendars.mjs <dir-or-files...> [--sample 1000] [--seed 1] [--json out.json]
//
// For every open activity: early dates and total float both ways. Then, for
// a sample of not-started, non-ALAP activities that gain float, the file is
// scheduled again (forward pass, milestones on 24 h) with the activity's start
// floored at its early start plus a delay:
//   finish holds - delayed by the 24 h reading's float, the finish holds;
//   sound   - and no open activity finishes past its late finish (the 24 h
//             reading's) by working time on its own calendar, unless it did;
//   tight   - delayed by one more working hour, some activity does, or the
//             project finish moves.
// Also: the same delay run with P6's rules (milestones on their calendars),
// to show the float is not there unless the milestones move.
// eval/milestone-calendars-2026-11-20.md
import { readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseXer, decodeXer } from "../xer.mjs";
import { schedule, buildModel } from "../cpm.mjs";
import { milestoneCalendars } from "../milestones.mjs";

const args = process.argv.slice(2);
const val = (k, d) => (args.includes(k) ? args[args.indexOf(k) + 1] : d);
const sampleN = Number(val("--sample", 1000));
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
  const alt = schedule(xer, { model, milestones24h: true });
  const rep = milestoneCalendars(xer, { model, base });
  const ms = Date.now() - t0;
  const open = [...model.tasks.values()].filter((t) => !t.span && t.status !== "TK_Complete" && base.tasks.get(t.id)?.lf !== undefined);
  const isMs = (t) => t.type === "TT_Mile" || t.type === "TT_FinMile";
  let earlier = 0, later = 0, lessFloat = 0;
  const gains = [];
  for (const t of open) {
    const b = base.tasks.get(t.id), a = alt.tasks.get(t.id);
    if (!isMs(t)) { if (a.es < b.es || a.ef < b.ef) earlier++; if (a.es > b.es || a.ef > b.ef) later++; }
    const g = Math.round((a.tf - b.tf) * 100) / 100;
    if (g < 0) lessFloat++;
    if (g > 0) gains.push({ t, gain: g, tfP6: b.tf, tf: a.tf });
  }
  const lateBy = (r, res) => {
    const s = new Set();
    for (const t of open) {
      const x = r.tasks.get(t.id), c = res.tasks.get(t.id);
      if (x && t.cal.workBetween(c.lf, x.ef) > 0) s.add(t.id);
    }
    return s;
  };
  const altFwd = schedule(xer, { model, forwardOnly: true, milestones24h: true });
  const baseFwd = schedule(xer, { model, forwardOnly: true });
  const lateAlt0 = lateBy(altFwd, alt), lateBase0 = lateBy(baseFwd, base);
  const cand = gains.filter((g) => g.t.status === "TK_NotStart" && !isMs(g.t) && !g.t.cstr.some((c) => c.type === "CS_ALAP") && g.tf >= 0);
  for (let i = cand.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [cand[i], cand[j]] = [cand[j], cand[i]]; }
  const picks = cand.slice(0, sampleN);
  let sound = 0, tight = 0, finHolds = 0, p6Breaks = 0;
  const rows = [];
  for (const g of picks) {
    const t = g.t, cal = t.cal;
    const run = (minutes, ms24) => {
      const b = (ms24 ? alt : base).tasks.get(t.id);
      const floor = cal.nextStart(cal.addWork(b.es, minutes));
      const r = schedule(xer, { model, forwardOnly: true, milestones24h: ms24, levelStart: new Map([[t.id, floor]]) });
      const l = lateBy(r, ms24 ? alt : base);
      let newLate = 0;
      for (const id of l) if (!(ms24 ? lateAlt0 : lateBase0).has(id)) newLate++;
      const pf = (ms24 ? alt : base).projects.get(t.proj).finish;
      return { newLate, finMoved: r.projects.get(t.proj).finish > pf };
    };
    const full = Math.round(g.tf * 60);
    const a = run(full, true), z = run(full + 60, true);
    // the same delay with the milestones left on their calendars
    const q = run(full, false);
    const isSound = a.newLate === 0 && !a.finMoved, isTight = z.newLate > 0 || z.finMoved;
    if (!a.finMoved) finHolds++;
    if (isSound) sound++;
    if (isTight) tight++;
    if (q.newLate > 0 || q.finMoved) p6Breaks++;
    rows.push({ code: t.code, tfP6: g.tfP6, tf: g.tf, gain: g.gain, finHolds: !a.finMoved, sound: isSound, tight: isTight, breaksWithP6Rules: q.newLate > 0 || q.finMoved });
  }
  const maxGain = gains.reduce((m, g) => Math.max(m, g.gain), 0);
  const rec = { file: name, open: open.length, milestonesHolding: rep.milestones.length, successorsHeld: rep.milestones.reduce((n, m) => n + m.successors.length, 0), earlier, later, gains: gains.length, maxGain_h: maxGain, lessFloat, leavesCritical: rep.leavesCritical, finishMoved: rep.finishes.filter((x) => x.moved).length, checked: picks.length, finHolds, sound, tight, p6Breaks, ms, milestones: rep.milestones, rows };
  out.push(rec);
  console.log(`${name}: ${open.length} open; ${rep.milestones.length} milestones hold ${rec.successorsHeld} successors; ${earlier} activities earlier, ${later} later; ${gains.length} gain float (max ${maxGain} h), ${lessFloat} lose, ${rep.leavesCritical} leave critical; finish moved in ${rec.finishMoved} project(s); checked ${picks.length}: finish holds ${finHolds}, sound ${sound}, tight ${tight}, breaks with P6's milestone rule ${p6Breaks} (${ms} ms)`);
}
if (jsonOut) writeFileSync(jsonOut, JSON.stringify(out, null, 1) + "\n");
