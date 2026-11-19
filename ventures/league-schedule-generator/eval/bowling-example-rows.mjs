// Print the worked example's rows on bowling-league-schedule.html from bowlingSchedule() (the test
// in bowling.test.mjs checks the page against the same call).
// node eval/bowling-example-rows.mjs
import { bowlingSchedule, laneReport } from "../bowling.mjs";
import { dayLabel, toDay } from "../calc.mjs";
const teams = ["Pin Pals", "Alley Cats", "Split Happens", "Gutter Gang", "Lucky Strikes", "Ten Pin Titans", "Spare Me", "Rolling Thunder"];
const s = bowlingSchedule({ teams, weeks: 16, start: toDay(2026, 9, 8), positionWeeks: [16] });
for (const wk of s.weeks) {
  const cells = s.labels.map((_, p) => { const m = wk.matches.find((x) => x.pair === p); return wk.kind === "round" ? `${s.teams[m.a]} v ${s.teams[m.b]}` : `${m.a} v ${m.b}`; });
  console.log(`      <tr><td>${wk.week}</td><td>${dayLabel(wk.day)}</td>${cells.map((c) => `<td>${c}</td>`).join("")}</tr>`);
}
console.log("");
const r = laneReport(s);
for (const row of r.rows) console.log(`      <tr><td>${row.name}</td>${row.counts.map((v) => `<td>${v}</td>`).join("")}</tr>`);
console.log(`\nrepeats ${r.repeats}`);
