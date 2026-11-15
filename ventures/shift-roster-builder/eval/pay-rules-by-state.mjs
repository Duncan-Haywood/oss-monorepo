// One invented café week through every PAY_RULES set (2026-11-15 later): overtime hours, gross and meal-period flags
// per state, to show what changes when a manager sets PAY_RULES. Invented punches, not a real team's.
// node eval/pay-rules-by-state.mjs > eval/pay-rules-by-state.out.txt
import { payWeek, PAY_RULES } from "../payrules.mjs";
const t = (d, h, m = 0) => d * 1440 + h * 60 + m;
const people = {
  // Opener: five 9-hour days with a 30-min lunch at 4 h, plus a short Saturday.
  Ana: { wage: 17, spans: [0, 1, 2, 3, 4].flatMap((d) => [{ a: t(d, 6), b: t(d, 10) }, { a: t(d, 10, 30), b: t(d, 15, 30) }]).concat([{ a: t(5, 7), b: t(5, 11) }]) },
  // Closer then opener: Mon 14-22 and Tue 06-14 (a clopen), then three 8 h closes with a 20-min break.
  Ben: { wage: 16, spans: [{ a: t(0, 14), b: t(0, 22) }, { a: t(1, 6), b: t(1, 14) }].concat([3, 4, 5].flatMap((d) => [{ a: t(d, 15), b: t(d, 19) }, { a: t(d, 19, 20), b: t(d, 23, 20) }])) },
  // Shift lead at $24: four 10-hour days, lunch taken late (6 h in).
  Cleo: { wage: 24, spans: [0, 1, 2, 3].flatMap((d) => [{ a: t(d, 8), b: t(d, 14) }, { a: t(d, 14, 30), b: t(d, 18, 30) }]) },
  // Part-timer: three 6.5-hour shifts, no break.
  Dev: { wage: 15, spans: [1, 3, 5].map((d) => ({ a: t(d, 10), b: t(d, 16, 30) })) },
};
console.log("rules".padEnd(15), "OT h".padStart(6), "2x h".padStart(5), "gross".padStart(10), "flags".padStart(6), "  flagged");
for (const rules of PAY_RULES) {
  let ot = 0, dt = 0, gross = 0, flags = 0; const who = [];
  for (const [name, p] of Object.entries(people)) {
    const r = payWeek(p.spans, { rules, wage: p.wage });
    ot += r.overtimeH; dt += r.doubleH; gross += r.gross; flags += r.flags.length; if (r.flags.length) who.push(`${name} ${r.flags.length}`);
  }
  console.log(rules.padEnd(15), ot.toFixed(2).padStart(6), dt.toFixed(2).padStart(5), ("$" + gross.toFixed(2)).padStart(10), String(flags).padStart(6), " ", who.join(", "));
}
