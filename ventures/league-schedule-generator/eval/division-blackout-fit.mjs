// Blackout fit on the multi-division page: random leagues of 2-4 divisions sharing courts, every team giving 1 or 2
// dates it cannot play, built with the fit off and on (same seed). Prints makeups moved, unplaced, season end and breaks.
// node eval/division-blackout-fit.mjs [leaguesPerCell] [seed] [fitSeeds, default 4]
import { buildDivisionsWithBlackouts, validateDivisions } from "../divisions.mjs";
import { mulberry32, parseDate } from "../calc.mjs";

const per = Number(process.argv[2] || 8), seed0 = Number(process.argv[3] || 1), fitSeeds = Number(process.argv[4] || 4);
const start = parseDate("2027-01-05");
const cells = [];
for (const divs of [2, 3, 4]) for (const k of [1, 2]) for (const mode of ["spread", "clustered"]) cells.push({ divs, k, mode });
console.log(`division blackout fit, ${per} leagues per cell, seed ${seed0}, ${fitSeeds} fit seed(s); Tue + Thu, 2 times; courts for about half the league's matches a night (at least the biggest round) plus 0-1, so divisions take turns`);
console.log("mode      divs k | moved old -> new | unplaced old -> new | weeks old -> new | breaks old -> new | invalid | ms old/new");
const tot = { mo: 0, mn: 0, uo: 0, un: 0, wo: 0, wn: 0, bo: 0, bn: 0, inv: 0, worse: 0, n: 0 };
for (const c of cells) {
  const t = { mo: 0, mn: 0, uo: 0, un: 0, wo: 0, wn: 0, bo: 0, bn: 0, inv: 0, to: 0, tn: 0 };
  for (let L = 0; L < per; L++) {
    const rnd = mulberry32(seed0 * 100003 + c.divs * 1009 + c.k * 101 + (c.mode === "spread" ? 0 : 7) + L * 13);
    const divisions = Array.from({ length: c.divs }, (_, i) => {
      const n = 4 + Math.floor(rnd() * 9); // 4-12 teams
      return { name: `D${i + 1}`, teams: Array.from({ length: n }, (_, j) => `T${j + 1}`), double: rnd() < 0.3 };
    });
    const times = ["18:00", "19:30"];
    const need = divisions.reduce((a, d) => a + Math.floor(d.teams.length / 2), 0);
    const nCourts = Math.max(1, Math.ceil(need / times.length / 2) + Math.floor(rnd() * 2));
    const courts = Array.from({ length: Math.max(nCourts, Math.ceil(Math.max(...divisions.map((d) => Math.floor(d.teams.length / 2))) / 2)) }, (_, i) => `Court ${i + 1}`);
    const spec = { divisions, courts, times, start, weekdays: [2, 4], skipDays: [], courtClosures: {}, links: [], seed: L + 1 };
    // nights the league could play on (first 40 Tue/Thu)
    const nights = [];
    for (let d = start; nights.length < 40; d++) if ([2, 4].includes(new Date(d * 86400000).getUTCDay())) nights.push(d);
    const pool = c.mode === "spread" ? nights.slice(0, 24) : [nights[4], nights[5], nights[10]];
    const blackouts = {};
    divisions.forEach((d, di) => d.teams.forEach((_, ti) => { const s = new Set(); while (s.size < Math.min(c.k, pool.length)) s.add(pool[Math.floor(rnd() * pool.length)]); blackouts[`${di}/${ti}`] = [...s].sort((a, b) => a - b); }));
    let t0 = performance.now();
    const old = buildDivisionsWithBlackouts({ ...spec, blackoutFit: false }, blackouts, {});
    t.to += performance.now() - t0; t0 = performance.now();
    const neu = buildDivisionsWithBlackouts({ ...spec, blackoutFitSeeds: fitSeeds }, blackouts, {});
    t.tn += performance.now() - t0;
    const wk = (r) => (r.schedule.stats.lastDay - start) / 7 + 1;
    t.mo += old.moves.length; t.mn += neu.moves.length; t.uo += old.errors.length; t.un += neu.errors.length;
    t.wo += wk(old); t.wn += wk(neu); t.bo += old.schedule.stats.homeAwayBreaks; t.bn += neu.schedule.stats.homeAwayBreaks;
    for (const r of [old, neu]) if (!validateDivisions(r.schedule).ok) t.inv++;
    if (neu.errors.length > old.errors.length || (neu.errors.length === old.errors.length && neu.moves.length > old.moves.length)) tot.worse++;
  }
  console.log(`${c.mode.padEnd(9)} ${String(c.divs).padStart(4)} ${c.k} | ${String(t.mo).padStart(4)} -> ${String(t.mn).padStart(4)} | ${String(t.uo).padStart(3)} -> ${String(t.un).padStart(3)} | ${(t.wo / per).toFixed(2)} -> ${(t.wn / per).toFixed(2)} | ${String(t.bo).padStart(5)} -> ${String(t.bn).padStart(5)} | ${t.inv} | ${Math.round(t.to / per)}/${Math.round(t.tn / per)}`);
  for (const k of ["mo", "mn", "uo", "un", "wo", "wn", "bo", "bn", "inv"]) tot[k] += t[k];
  tot.n += per;
}
console.log(`all ${tot.n} leagues: moved ${tot.mo} -> ${tot.mn} (${(100 * (tot.mn - tot.mo) / tot.mo).toFixed(0)}%), unplaced ${tot.uo} -> ${tot.un}, weeks ${(tot.wo / tot.n).toFixed(2)} -> ${(tot.wn / tot.n).toFixed(2)}, breaks ${tot.bo} -> ${tot.bn}, invalid ${tot.inv}, leagues worse on (unplaced, moved): ${tot.worse}`);
