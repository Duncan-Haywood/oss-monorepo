// The planner's one-week look-ahead (2026-11-13 later). eval/plan-order.mjs found column generation first (fresh builds'
// order) 3-5x faster on multi-week plans but 2-3 open hours worse on 2 of 122, because the tie it posts can leave the next
// week less room. planWeeks now builds the next week from the posted tie and from a relaxation (carried rest gaps and streaks
// left out); only when they differ does it rebuild the week in the old order and post whichever tie leaves the next week best.
// Same plans as plan-order.mjs (five teams x 12 drawn time-off patterns, plus the guide page's plan), each built three ways:
// old order (deferCover false), column generation first with no look-ahead, and the new default.
//   node eval/plan-lookahead.mjs              (readings: eval/plan-lookahead.out.txt)
import { planWeeks, slotKey } from "../calc.mjs";
// Week-to-week churn: person-shifts in one week and not the next, plus the reverse (copies of a shift share a key).
const pairs = (r) => new Set(r.assignments.filter((a) => a.person).map((a) => `${a.person}@${slotKey(a.slot)}`));
const churn = (p) => p.weeks.slice(1).reduce((t, w, k) => { const a = pairs(p.weeks[k].roster), b = pairs(w.roster); return t + [...a].filter((x) => !b.has(x)).length + [...b].filter((x) => !a.has(x)).length; }, 0);
import { sets } from "./real-rate-week.mjs";

const all = sets();
const PATTERNS = Number(process.env.PATTERNS || 12);
const start = "2026-11-16";
const date = (k, d) => { const t = new Date(Date.UTC(2026, 10, 16 + 7 * k + d)); return t.toISOString().slice(0, 10); };
let seed = 20261113;
const rnd = (n) => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return (seed >> 8) % n; };

const KINDS = [["old", { deferCover: false }], ["cg", { lookahead: false }], ["look", {}]];
const g = { plans: 0, looks: 0, picks: 0, retries: 0, steadied: 0, checked: 0, fellBack: 0 };
for (const [kind] of KINDS) for (const v of ["", "k"]) Object.assign(g, { [`${v}open_${kind}`]: 0, [`${v}pay_${kind}`]: 0, [`${v}ms_${kind}`]: 0, [`${v}worse_${kind}`]: 0, [`${v}better_${kind}`]: 0, [`${v}churn_${kind}`]: 0 });
for (const name of Object.keys(all)) {
  const [staffText, shiftsText] = all[name];
  const people = staffText.split("\n").slice(1).map((l) => l.split(",")[0].trim()).filter(Boolean);
  for (let p = name === "cafe" ? -1 : 0; p < PATTERNS; p++) {
    const offs = [];
    // p = -1: the guide page's plan (keep-a-consistent-schedule-when-someone-is-off.html), Ana off Tue 1 Dec, Ben off Fri 4 Dec.
    if (p < 0) offs.push(["Ana", "2026-12-01"], ["Ben", "2026-12-04"]);
    else { const n = 1 + rnd(2); for (let j = 0; j < n; j++) offs.push([people[rnd(people.length)], date(1 + rnd(2), rnd(7))]); }
    let text = staffText;
    for (const [who, d] of offs) text = text.replace(new RegExp(`^(${who},[^\\n]*)$`, "m"), `$1, off: ${d}`);
    const o = { weeks: 4, weekStart: start, minRestHours: 10, memo: false }; // memo off: no plan kind reuses another kind's builds
    g.plans++;
    const line = [];
    for (const v of ["", "k"]) {
      const res = {};
      for (const [kind, extra] of KINDS) {
        const t0 = Date.now();
        const r = planWeeks(text, shiftsText, { ...o, ...(v ? { keepValue: 0.1 } : {}), ...extra });
        const ms = Date.now() - t0;
        res[kind] = r;
        g[`${v}open_${kind}`] += r.totalOpenHours; g[`${v}pay_${kind}`] += r.totalCost; g[`${v}ms_${kind}`] += ms; g[`${v}churn_${kind}`] += churn(r);
        if (kind === "look" && r.lookahead) { g.looks += r.lookahead.looks; g.picks += r.lookahead.picks; g.retries += r.weeks.filter((w) => w.tiePick).length; g.steadied += r.lookahead.steadied; if (r.lookahead.fellBack !== undefined) g.checked++; if (r.lookahead.fellBack) g.fellBack++; }
      }
      for (const kind of ["cg", "look"]) {
        if (res[kind].totalOpenHours > res.old.totalOpenHours) g[`${v}worse_${kind}`]++;
        else if (res[kind].totalOpenHours < res.old.totalOpenHours) g[`${v}better_${kind}`]++;
      }
      const wk = (r) => r.weeks.map((w) => w.roster.unfilledHours).join("/");
      const ties = res.look.weeks.filter((w) => w.tiePick).map((w) => `wk${w.week} ${w.tiePick.order} next ${w.tiePick.defaultNextOpenHours}->${w.tiePick.nextOpenHours} (relaxed ${w.tiePick.relaxedNextOpenHours})`);
      line.push(`${v ? "keep 0.1" : "plain"} ${wk(res.old)} | ${wk(res.cg)} | ${wk(res.look)}${ties.length ? ` [tie check: ${ties.join("; ")}]` : ""}`);
    }
    console.log(`  ${name} ${offs.map(([w, d]) => `${w} off ${d}`).join(", ")}: open h old | cg | look-ahead: ${line.join("; ")}`);
  }
}
for (const v of ["", "k"]) {
  console.log(`\n${v ? "keep usual shifts 0.1" : "plain"}: ${g.plans} four-week plans`);
  for (const [kind] of KINDS) console.log(`  ${kind.padEnd(4)} open ${g[`${v}open_${kind}`]} h, pay $${g[`${v}pay_${kind}`]}, ${(g[`${v}ms_${kind}`] / 1000).toFixed(1)} s, ${g[`${v}churn_${kind}`]} person-shift changes week to week${kind === "old" ? "" : ` (more open than old on ${g[`${v}worse_${kind}`]}, fewer on ${g[`${v}better_${kind}`]})`}`);
}
console.log(`\nlook-ahead: ${g.looks} weeks looked ahead, ${g.retries} rebuilt in the old order (next week short of its relaxation), ${g.picks} posted a different tie; ${g.steadied} weeks posted an earlier week's tie (or one closer to it) over column generation's; ${g.checked} plans also built in the old order (a week still short after its look-ahead), ${g.fellBack} returned it`);
