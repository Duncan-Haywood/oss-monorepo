// Blackout fit: does relabelling the round-robin plan around the teams' blackout dates cut makeup matches
// and the season's length? Random leagues on one weekday; every team gives `k` dates it cannot play, drawn
// from the league's own play nights (the dates a coach's sign-up form would list): "spread" draws them from every
// night, "clustered" from three nights only (a school holiday, a tournament weekend: several teams out at once). Each league is built twice
// with the same seed, `blackoutFit: false` (the old placement) and the default, and both are validated.
// Usage: node eval/blackout-fit.mjs [leagues per cell] [seed]
import { buildSchedule, validateSchedule, mulberry32, countBreaks } from "../calc.mjs";

const per = Number(process.argv[2] || 20);
const seed0 = Number(process.argv[3] || 1);
const D = (iso) => Math.round(Date.parse(iso + "T00:00:00Z") / 864e5);
const start = D("2027-01-05"); // a Tuesday
const rnd = mulberry32(seed0);
const lines = [];
const out = (s) => { lines.push(s); console.log(s); };
out(`blackout fit, ${per} leagues per cell, seed ${seed0}; one weekday (Tue), 1 time slot, enough courts`);
out("mode      teams double k | makeups old -> new | weeks old -> new | leagues with 0 makeups old -> new | breaks old -> new | invalid | ms/build");
import { writeFileSync } from "node:fs";
let tot = { mo: 0, mn: 0, wo: 0, wn: 0, bo: 0, bn: 0, inv: 0, L: 0 };
for (const mode of ["spread", "clustered"]) for (const n of [5, 6, 7, 9, 10, 11, 12, 13, 15, 16]) for (const double of [false, true]) for (const k of [1, 2]) {
  let bo = 0, bn = 0, mo = 0, mn = 0, wo = 0, wn = 0, zo = 0, zn = 0, inv = 0, ms = 0;
  const rounds = (n % 2 ? n : n - 1) * (double ? 2 : 1);
  for (let i = 0; i < per; i++) {
    const blackouts = {};
    for (let t = 0; t < n; t++) {
      const set = new Set();
      const hot = [2, Math.floor(rounds / 2), rounds - 2];
      while (set.size < k) set.add(start + 7 * (mode === "spread" ? Math.floor(rnd() * rounds) : hot[Math.floor(rnd() * 3)]));
      blackouts[t] = [...set].sort((a, b) => a - b);
    }
    const spec = { teams: Array.from({ length: n }, (_, j) => `T${j + 1}`), double, start, weekdays: [2], skipDays: [], blackouts, courts: [], times: [], seed: 1 + i, minutes: 60 };
    const old = buildSchedule({ ...spec, blackoutFit: false });
    const t0 = performance.now();
    const neu = buildSchedule(spec);
    ms += performance.now() - t0;
    const mk = (s) => s.rounds.filter((r) => r.makeup).reduce((a, r) => a + r.matches.length, 0);
    const wk = (s) => (s.rounds[s.rounds.length - 1].day - start) / 7 + 1;
    const sb = (s) => countBreaks(s).reduce((a, b) => a + b, 0);
    bo += sb(old); bn += sb(neu); tot.bo += sb(old); tot.bn += sb(neu);
    mo += mk(old); mn += mk(neu); wo += wk(old); wn += wk(neu);
    if (!mk(old)) zo++;
    if (!mk(neu)) zn++;
    if (!validateSchedule(old).ok || !validateSchedule(neu).ok) inv++;
  }
  tot.mo += mo; tot.mn += mn; tot.wo += wo; tot.wn += wn; tot.inv += inv; tot.L += per;
  out(`${mode.padEnd(9)} ${String(n).padStart(5)} ${double ? "yes" : "no "}    ${k} | ${String(mo).padStart(4)} -> ${String(mn).padStart(4)} | ${(wo / per).toFixed(2)} -> ${(wn / per).toFixed(2)} | ${zo}/${per} -> ${zn}/${per} | ${bo} -> ${bn} | ${inv} | ${(ms / per).toFixed(0)}`);
}
out(`total: ${tot.L} leagues, makeup matches ${tot.mo} -> ${tot.mn} (${(100 * (1 - tot.mn / tot.mo)).toFixed(1)}% fewer), mean season ${(tot.wo / tot.L).toFixed(2)} -> ${(tot.wn / tot.L).toFixed(2)} weeks, home/away breaks ${tot.bo} -> ${tot.bn}, invalid ${tot.inv}`);
if (process.argv[4]) writeFileSync(process.argv[4], lines.join("\n") + "\n");
