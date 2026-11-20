// Breaks and shortest rematch gap, plain mirrored return leg vs reversed (node eval/reverse-leg.mjs)
import { buildSchedule, countBreaks, rematchReport, parseDate } from "../calc.mjs";
const names = (n) => Array.from({ length: n }, (_, i) => `T${i + 1}`);
const build = (n, reverseLeg) => buildSchedule({ teams: names(n), double: true, reverseLeg, start: parseDate("2026-01-06"), weekdays: [2], courts: Array.from({ length: 12 }, (_, i) => `C${i + 1}`), times: ["18:00"], seed: 1 });
const sum = (a) => a.reduce((x, y) => x + y, 0);
console.log("teams | breaks mirrored | breaks reversed | worst team mirrored/reversed | shortest rematch days mirrored/reversed");
for (let n = 4; n <= 20; n++) {
  const p = build(n, false), r = build(n, true);
  const bp = countBreaks(p), br = countBreaks(r);
  console.log(`${n} | ${sum(bp)} | ${sum(br)} | ${Math.max(...bp)}/${Math.max(...br)} | ${rematchReport(p).shortest}/${rematchReport(r).shortest}`);
}
