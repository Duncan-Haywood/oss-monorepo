// League schedule generator, rounds.mjs: Circle-method rounds: single and double round robins with home and away built in, and their breaks.
// Split out of calc.mjs on 2026-11-23 (quality audit round 87); calc.mjs re-exports every public name.

import { parseTime } from "./dates.mjs";
import { mulberry32 } from "./rng.mjs";

// ---------------------------------------------------------------- rounds (circle method)

/**
 * Round-robin rounds by the circle method. Team n-1 (or the phantom bye team when n is odd)
 * stays fixed and the rest rotate. Home/away is built in rather than patched afterwards:
 * the fixed team alternates, and the pair at distance k from the rotating team puts the
 * "ahead" side at home for odd k. That gives every even-n league the minimum n-2 home/away
 * breaks (a break is two consecutive home games or two consecutive away games) and every
 * team a home/away split within one game. A double round robin plays the same rounds again
 * with every venue reversed. With `reverseLeg` the return leg plays leg one's rounds in reverse
 * order (still venues reversed): every team flips home/away across the halfway line, so an even
 * league has 2(n-2) breaks in place of 3(n-2) and an odd one none in place of n, at the price of
 * the pairs in leg one's last round meeting again the very next round.
 */
export function roundRobin(n, { double = false, reverseLeg = false } = {}) {
  if (!Number.isInteger(n) || n < 2) throw new Error("A round robin needs at least two teams.");
  const N = n % 2 === 0 ? n : n + 1;
  const first = [];
  for (let r = 0; r < N - 1; r++) {
    const pairs = [r % 2 === 0 ? [r, N - 1] : [N - 1, r]];
    for (let k = 1; k < N / 2; k++) {
      const a = (r + k) % (N - 1);
      const b = (r - k + (N - 1)) % (N - 1);
      pairs.push(k % 2 === 1 ? [a, b] : [b, a]);
    }
    let bye = null;
    const matches = [];
    for (const [h, a] of pairs) {
      if (h >= n) bye = a;
      else if (a >= n) bye = h;
      else matches.push([h, a]);
    }
    first.push({ leg: 0, matches, bye });
  }
  if (!double) return first;
  const second = (reverseLeg ? [...first].reverse() : first).map((r) => ({ leg: 1, matches: r.matches.map(([h, a]) => [a, h]), bye: r.bye }));
  return [...first, ...second];
}

/**
 * A one-day tournament timetable: the circle-method round robin, each round played to completion
 * before the next starts (the rule the "how long does a round robin take" table uses), a round's
 * matches spread over `courts` courts in waves, and every wave given a clock time. Nothing here
 * can put a team in two matches at once because a round never repeats a team.
 */
export function oneDayTimetable(teams, { courts = 1, start = "09:00", matchMinutes = 30, changeoverMinutes = 0, double = false, minRest = 0 } = {}) {
  const n = teams.length;
  if (n < 3) throw new Error("A one-day round robin needs at least three teams.");
  if (!Number.isInteger(courts) || courts < 1) throw new Error("Courts must be a whole number of at least 1.");
  const t0 = parseTime(start);
  if (!t0) throw new Error("Start time is not a time (try 09:00 or 9am).");
  if (!Number.isFinite(matchMinutes) || matchMinutes < 5 || matchMinutes > 600) throw new Error("Match length must be between 5 and 600 minutes.");
  if (!Number.isFinite(changeoverMinutes) || changeoverMinutes < 0 || changeoverMinutes > 120) throw new Error("Changeover must be between 0 and 120 minutes.");
  const hhmm = (mins) => `${String(Math.floor(mins / 60) % 24).padStart(2, "0")}:${String(mins % 60).padStart(2, "0")}`;
  const step = matchMinutes + changeoverMinutes;
  let clock = Number(t0.slice(0, 2)) * 60 + Number(t0.slice(3));
  if (!Number.isInteger(minRest) || minRest < 0 || minRest > 6) throw new Error("Rest slots must be a whole number from 0 to 6.");
  const slots = [];
  if (minRest === 0) {
    roundRobin(n, { double }).forEach((r, ri) => {
      for (let i = 0; i < r.matches.length; i += courts) {
        const matches = r.matches.slice(i, i + courts).map(([h, a], k) => ({ court: k + 1, home: h, away: a }));
        slots.push({ round: ri + 1, time: hhmm(clock), end: hhmm(clock + matchMinutes), bye: i === 0 && r.bye !== null ? r.bye : null, matches });
        clock += step;
      }
    });
  } else {
    // Rest mode: ignore round order and fill each time slot with matches whose teams have sat out
    // at least minRest slots, most-constrained teams (most games still to play) first. Greedy fills
    // are retried with seeded random tie-breaks and the best kept (most rest, then fewest slots). A
    // slot where nobody is rested enough is left empty (a break), so the asked-for rest is always met.
    const all = roundRobin(n, { double }).flatMap((r) => r.matches.map(([h, a]) => [h, a]));
    const restOf = (plan) => {
      const seenAt = Array(n).fill(-1);
      let r = Infinity;
      plan.forEach((ms, si) => ms.forEach(([h, a]) => { for (const t of [h, a]) { if (seenAt[t] >= 0) r = Math.min(r, si - seenAt[t] - 1); seenAt[t] = si; } }));
      return r;
    };
    const fill = (rand) => {
      const pending = all.map((m) => m.slice());
      const last = Array(n).fill(-Infinity);
      const left = Array(n).fill(0);
      for (const [h, a] of pending) { left[h]++; left[a]++; }
      const plan = [];
      while (pending.length) {
        const slot = plan.length;
        const order = pending.map((m, idx) => ({ m, idx, g: Math.min(slot - last[m[0]], slot - last[m[1]]) - 1, w: left[m[0]] + left[m[1]], r: rand ? rand() : idx }))
          .sort((x, y) => (Math.min(y.g, minRest) - Math.min(x.g, minRest)) || (y.w - x.w) || (y.g - x.g) || (x.r - y.r));
        const busy = new Set();
        const chosen = [];
        for (const c of order) {
          if (chosen.length === courts) break;
          if (busy.has(c.m[0]) || busy.has(c.m[1])) continue;
          if (c.g < minRest) continue;
          busy.add(c.m[0]); busy.add(c.m[1]); chosen.push(c);
        }
        for (const c of chosen) { last[c.m[0]] = slot; last[c.m[1]] = slot; left[c.m[0]]--; left[c.m[1]]--; }
        for (const c of [...chosen].sort((x, y) => y.idx - x.idx)) pending.splice(c.idx, 1);
        plan.push(chosen.map((c) => c.m));
      }
      return plan;
    };
    const rng = mulberry32(20261020);
    let best = fill(null);
    let bestRest = restOf(best);
    for (let i = 0; i < 300 && !(bestRest >= minRest && best.length === Math.ceil(all.length / courts)); i++) {
      const plan = fill(rng);
      const r = restOf(plan);
      if (Math.min(r, minRest) > Math.min(bestRest, minRest) || (Math.min(r, minRest) === Math.min(bestRest, minRest) && plan.length < best.length)) { best = plan; bestRest = r; }
    }
    best.forEach((ms, si) => {
      slots.push({ round: si + 1, time: hhmm(clock), end: hhmm(clock + matchMinutes), bye: null, matches: ms.map(([h, a], k) => ({ court: k + 1, home: h, away: a })) });
      clock += step;
    });
  }
  const seen = Array(n).fill(-1);
  let restSlots = Infinity;
  slots.forEach((s, si) => s.matches.forEach((m) => {
    for (const t of [m.home, m.away]) { if (seen[t] >= 0) restSlots = Math.min(restSlots, si - seen[t] - 1); seen[t] = si; }
  }));
  return { teams, courts, slots, finish: slots[slots.length - 1].end, games: slots.reduce((s, x) => s + x.matches.length, 0), restSlots: restSlots === Infinity ? 0 : restSlots, minRest };
}

export function oneDayText(tt) {
  const lines = [];
  for (const s of tt.slots) {
    lines.push(`${s.time}-${s.end}  Round ${s.round}`);
    for (const m of s.matches) lines.push(`  Court ${m.court}: ${tt.teams[m.home]} v ${tt.teams[m.away]}`);
    if (s.bye !== null) lines.push(`  Bye: ${tt.teams[s.bye]}`);
    if (!s.matches.length) lines.push("  Break: no game, so teams can rest");
  }
  lines.push(`Last game ends ${tt.finish} (${tt.games} games, ${tt.slots.length} time slots).`);
  if (tt.minRest > 0) lines.push(tt.restSlots >= tt.minRest ? `Every team rests at least ${tt.restSlots} slot${tt.restSlots === 1 ? "" : "s"} between games.` : `Could not give every team ${tt.minRest} slot${tt.minRest === 1 ? "" : "s"} of rest: the shortest break is ${tt.restSlots}. Add courts or fewer teams per day, or lower the rest.`);
  return lines.join("\n");
}

/** Home/away breaks per team over the rounds as given; a bye or an idle round resets the streak. */
export function countBreaks(schedule) {
  const n = schedule.teams.length;
  const last = Array(n).fill(null);
  const breaks = Array(n).fill(0);
  for (const round of schedule.rounds) {
    const today = Array(n).fill(null);
    for (const m of round.matches) { today[m.home] = "H"; today[m.away] = "A"; }
    for (let t = 0; t < n; t++) {
      if (today[t] === null) { last[t] = null; continue; }
      if (last[t] === today[t]) breaks[t]++;
      last[t] = today[t];
    }
  }
  return breaks;
}
