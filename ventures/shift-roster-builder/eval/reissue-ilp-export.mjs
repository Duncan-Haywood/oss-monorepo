// Dump posted-week call-outs as hard-rule data for eval/reissue-ilp-check.py, which finds by an independent ILP the fewest
// late changes to other people at the least open hours. Sources:
//   (default)       the 41 call-outs of eval/reissue-posted.mjs (sample café 19, café with a spare part-timer 22), variants
//                   rebuild, keep/shift 1, keep/shift 20;
//   templates       the page's four templates, every person posted Wednesday to Sunday, as eval/reissue-scale.mjs;
//   P S [cases] [cap]  the seeded Mon-Fri weeks of eval/reissue-scale.mjs (Wed-Fri, every k-th posted person, cap a day).
// The last two export the variants rebuild and keep/shift 1 (VARIANTS="a,b" picks others from reissue-posted.mjs).
// Each week carries: the slots, who may work each (availability with the caller's day off and the started shifts pinned,
// from buildContext), the hour caps, rest gap and days-in-a-row limit, the posted owner of every slot, the caller, and the
// engine's own reissue for each variant (default options, minRestHours 10, exact check on), with its open hours, its
// changes to others as scheduleChanges counts them and its proof status.
//   node eval/reissue-ilp-export.mjs > /tmp/r.json && python3 eval/reissue-ilp-check.py /tmp/r.json   (pip install scipy)
//   node eval/reissue-ilp-export.mjs 40 112 2 4 > /tmp/r40.json
// About 25 s for the 41 café weeks x 3 variants on one 4-core machine; the seeded 60 x 168 weeks take about 10 min.
import { parseStaff, parseShifts, buildContext, buildRoster, rosterCsv, scheduleChanges, keepFromCsv, sampleStaff, sampleShifts, TEMPLATES, DAYS } from "../calc.mjs";
import { pinPast, VARIANTS } from "./reissue-posted.mjs";
import { seededWeeks } from "./reissue-scale.mjs";

const staffOf = (text) => { const p = parseStaff(text); if (p.errors.length) throw new Error(p.errors[0]); return p.staff; };
export const ILP_VARIANTS = { rebuild: {}, "keep/shift 1": { keepShift: 1 }, "keep/shift 20": { keepShift: 20 } };

// One call-out: `person` (an index into the parsed staff) off `day`, the change made at 5pm the evening before.
export function exportCase({ set, text, slots, staff, posted, person, day, variants, base }) {
  const p = staff[person];
  const postedCsv = rosterCsv(posted);
  const keep = keepFromCsv(postedCsv);
  const changedAt = (day - 1) * 1440 + 17 * 60;
  const offText = text.split("\n").map((l, n) => (n === 0 && !/\boff\b/i.test(l) ? l + ", off" : l.startsWith(p.name + ",") ? l + `, off: ${DAYS[day]}` : l)).join("\n");
  const offStaff = staffOf(offText);
  const pinned = pinPast(slots, posted, staff, changedAt);
  const ctx = buildContext(offStaff, pinned, base);
  const w = {
    set, case: `${p.name} ${DAYS[day]}`, caller: person, names: offStaff.map((s) => s.name),
    slots: pinned.map((s) => [s.start, s.end, s.day]), started: pinned.map((s) => (s.fixed ? 1 : 0)), elig: ctx.elig,
    maxH: offStaff.map((x) => x.maxHours), maxDaily: offStaff.map((x) => x.maxDaily || 0), rest: ctx.restMin,
    maxConsec: ctx.o.maxConsecDays, posted: posted.owner, engine: {},
  };
  const opt = { changedAt, noticeHours: 336, premiumHours: 1, exempt: [p.name] };
  for (const [name, extra] of Object.entries(variants)) {
    const t = Date.now();
    const r = buildRoster(offStaff, pinned, { ...base, ...extra, ...(extra.keepShift || extra.keepValue ? { keep } : {}) });
    const c = scheduleChanges(postedCsv, rosterCsv(r), opt).changes.filter((x) => x.person !== p.name);
    w.engine[name] = { open: r.unfilledHours, changes: c.length, status: r.optimality?.status, owner: r.owner, pay: r.cost, ms: Date.now() - t };
  }
  return w;
}

// Every posted person on each day in `days` (or every k-th, at most `cap` a day), as eval/reissue-scale.mjs picks them.
export function exportWeek(set, text, shiftsText, { days = [2, 3, 4, 5, 6], cap = Infinity, variants = ILP_VARIANTS, base = { minRestHours: 10 }, onCase = null } = {}) {
  const staff = staffOf(text);
  const slots = parseShifts(shiftsText).slots;
  const posted = buildRoster(staff, slots, base);
  const out = [];
  for (const day of days) {
    const callers = staff.map((p, i) => i).filter((i) => posted.owner.some((o, s) => o === i && slots[s].day === day));
    const step = Math.max(1, Math.ceil(callers.length / cap));
    for (let k = 0; k < callers.length; k += step) {
      const w = exportCase({ set, text, slots, staff, posted, person: callers[k], day, variants, base });
      out.push(w);
      if (onCase) onCase(w);
    }
  }
  return out;
}

export function weeks({ variants = ILP_VARIANTS, base = { minRestHours: 10 } } = {}) {
  const shifts = sampleShifts();
  return [["sample", sampleStaff()], ["spare", sampleStaff() + "\nHal, 15, 24, 0, any"]].flatMap(([set, text]) => exportWeek(set, text, shifts, { variants, base }));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const arg = process.argv.slice(2);
  const pick = (dflt) => Object.fromEntries((process.env.VARIANTS || dflt).split(",").map((k) => [k, VARIANTS[k]]));
  const log = (w) => process.stderr.write(`${w.set} ${w.case}: ${Object.entries(w.engine).map(([k, v]) => `${k} ${v.open} h ${v.changes} changes ${v.status} ${v.ms} ms`).join("; ")}\n`);
  let out;
  if (!arg.length) out = weeks();
  else if (arg[0] === "templates") out = Object.entries(TEMPLATES).flatMap(([k, t]) => exportWeek(k, t.staff(), t.shifts(), { variants: pick("rebuild,keep/shift 1"), onCase: log }));
  else {
    const [P, S, cases = 2, cap = 4] = arg.map(Number);
    out = seededWeeks(P, S, cases).flatMap(({ staff, shifts }, c) => exportWeek(`${P}x${S}w${c}`, staff, shifts, { days: [2, 3, 4], cap, variants: pick("rebuild,keep/shift 1"), onCase: log }));
  }
  console.log(JSON.stringify(out));
}
