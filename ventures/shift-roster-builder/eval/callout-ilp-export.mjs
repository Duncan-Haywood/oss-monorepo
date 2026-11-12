// Dump the call-out study's weeks (eval/callout-cover-study.mjs: every person working every day of the sample café
// calls out in turn, with and without a spare part-timer) as hard-rule data for eval/callout-ilp-check.py, which
// finds the least open hours by an independent ILP. With ENGINE=1 each week is also built with the default exact
// check and its open hours, floor and proof status are dumped beside it (about 2 min; the two weeks bounded on pay take
// about 28 s each).   node eval/callout-ilp-export.mjs > /tmp/w.json && python3 eval/callout-ilp-check.py /tmp/w.json
import { parseStaff, parseShifts, buildContext, buildRoster, sampleShifts, DAYS } from "../calc.mjs";
import { SAMPLE, WITH_SPARE } from "./callout-cover-study.mjs";

export function weeks(engine = false) {
  const slots = parseShifts(sampleShifts()).slots;
  const out = [];
  for (const [set, text] of [["sample", SAMPLE()], ["spare", WITH_SPARE()]]) {
    const staff = parseStaff(text).staff, r = buildRoster(staff, slots, {});
    for (let p = 0; p < staff.length; p++) for (let d = 0; d < 7; d++) {
      if (!r.owner.some((x, i) => x === p && slots[i].day === d)) continue;
      const off = text.split("\n").map((l) => (l.startsWith(staff[p].name + ",") ? `${l}, off: ${DAYS[d]}` : l)).join("\n").replace("min hours, availability", "min hours, availability, off");
      const st = parseStaff(off).staff;
      const ctx = buildContext(st, slots, {});
      const w = { set, case: `${staff[p].name} ${DAYS[d]}`, slots: ctx.slots.map((s) => [s.start, s.end, s.day]), elig: ctx.elig,
        maxH: st.map((x) => x.maxHours), maxDaily: st.map((x) => x.maxDaily || 0), rest: ctx.restMin, maxConsec: ctx.o.maxConsecDays };
      if (engine) { const r2 = buildRoster(st, slots, {}); Object.assign(w, { engineOpen: r2.unfilledHours, engineFloor: r2.optimality.forcedOpenHours, status: r2.optimality.status }); }
      out.push(w);
    }
  }
  return out;
}

if (import.meta.url === `file://${process.argv[1]}`) console.log(JSON.stringify(weeks(!!process.env.ENGINE)));
