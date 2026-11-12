// Dump the 41 posted-week call-outs of eval/reissue-posted.mjs (sample café 19, café with a spare part-timer 22) as
// hard-rule data for eval/reissue-ilp-check.py, which finds by an independent ILP the fewest late changes to other
// people at the least open hours. Each week carries: the slots, who may work each (availability with the caller's day
// off and the started shifts pinned, from buildContext), the hour caps, rest gap and days-in-a-row limit, the posted
// owner of every slot, the caller, and the engine's own reissue for each variant (default options, minRestHours 10,
// exact check on), with its open hours and its changes to others as scheduleChanges counts them.
//   node eval/reissue-ilp-export.mjs > /tmp/r.json && python3 eval/reissue-ilp-check.py /tmp/r.json   (pip install scipy)
// About 25 s for the 41 weeks x 3 variants on one 4-core machine.
import { parseStaff, parseShifts, buildContext, buildRoster, rosterCsv, scheduleChanges, keepFromCsv, sampleStaff, sampleShifts, DAYS } from "../calc.mjs";
import { pinPast } from "./reissue-posted.mjs";

const staffOf = (text) => { const p = parseStaff(text); if (p.errors.length) throw new Error(p.errors[0]); return p.staff; };
export const ILP_VARIANTS = { rebuild: {}, "keep/shift 1": { keepShift: 1 }, "keep/shift 20": { keepShift: 20 } };

export function weeks({ variants = ILP_VARIANTS, base = { minRestHours: 10 } } = {}) {
  const slots = parseShifts(sampleShifts()).slots;
  const out = [];
  for (const [set, text] of [["sample", sampleStaff()], ["spare", sampleStaff() + "\nHal, 15, 24, 0, any"]]) {
    const staff = staffOf(text);
    const posted = buildRoster(staff, slots, base);
    const postedCsv = rosterCsv(posted);
    const keep = keepFromCsv(postedCsv);
    for (let day = 2; day <= 6; day++) {
      const changedAt = (day - 1) * 1440 + 17 * 60; // 5pm the evening before, as reissue-posted.mjs
      for (const p of staff) {
        if (!posted.owner.some((o, i) => o >= 0 && staff[o] === p && slots[i].day === day)) continue;
        const offText = text.split("\n").map((l, n) => (n === 0 && !/\boff\b/i.test(l) ? l + ", off" : l.startsWith(p.name + ",") ? l + `, off: ${DAYS[day]}` : l)).join("\n");
        const offStaff = staffOf(offText);
        const pinned = pinPast(slots, posted, staff, changedAt);
        const ctx = buildContext(offStaff, pinned, base);
        const w = {
          set, case: `${p.name} ${DAYS[day]}`, caller: staff.indexOf(p), names: offStaff.map((s) => s.name),
          slots: pinned.map((s) => [s.start, s.end, s.day]), started: pinned.map((s) => (s.fixed ? 1 : 0)), elig: ctx.elig,
          maxH: offStaff.map((x) => x.maxHours), maxDaily: offStaff.map((x) => x.maxDaily || 0), rest: ctx.restMin,
          maxConsec: ctx.o.maxConsecDays, posted: posted.owner, engine: {},
        };
        const opt = { changedAt, noticeHours: 336, premiumHours: 1, exempt: [p.name] };
        for (const [name, extra] of Object.entries(variants)) {
          const r = buildRoster(offStaff, pinned, { ...base, ...extra, ...(extra.keepShift ? { keep } : {}) });
          const c = scheduleChanges(postedCsv, rosterCsv(r), opt).changes.filter((x) => x.person !== p.name);
          w.engine[name] = { open: r.unfilledHours, changes: c.length, status: r.optimality?.status, owner: r.owner };
        }
        out.push(w);
      }
    }
  }
  return out;
}

if (import.meta.url === `file://${process.argv[1]}`) console.log(JSON.stringify(weeks()));
