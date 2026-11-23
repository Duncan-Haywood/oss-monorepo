// Runs the play-off race's slow tables off the page thread (2026-11-23). The page answers the race at once
// with the default search (race-exact.mjs, 20,000 nodes per question). Where that leaves a table unproved,
// a team it shows "alive" may already have clinched or be out. The page posts the table here and this
// worker asks only the questions the status column needs, for the alive teams only, with budgets that grow
// pass by pass (RACE_WORKER_PASSES) until every status is proved or the time box runs out:
//   clinched?  can k or more others finish level with or above the team when it loses out?  (no: clinched)
//   out?       must k or more others finish strictly above it when it wins out?             (yes: out)
//   tie only?  can k or more finish strictly above it when it loses out?            (no: clinched unless tied)
// then the magic number ("more points clinch it") with RACE_WORKER_MAGIC_BUDGET. Each answer is a proof or
// nothing, so "clinched" and "out" stay never wrong; a question that runs out keeps the page's answer.
// After every pass with news it posts the table, so the page improves while the search goes on.
// eval/race-budget.mjs measures it on real seasons.
//
// In { id, teams, results, remaining, spots, options, seconds } (options as playoffRace takes them).
// Out { id, rows, exact, proved, settled, open, pass, final } per update, or { id, error }.
import { playoffRace, matchPoints, matchOutcomes } from "./standings.mjs";
import { extremeCount, exactMagic, monotone, RACE_WORKER_PASSES, RACE_WORKER_MAGIC_BUDGET } from "./race-exact.mjs";

/**
 * The race table for `teams` with every alive team's status asked again under growing budgets.
 * `onUpdate(update)` is called after each pass that changed a row and once at the end (`final: true`).
 * `seconds` caps the wall time (checked between questions; one question can overrun it by its own budget).
 */
export function deepRace({ teams, results, remaining, spots, options = {}, seconds = 30, passes = RACE_WORKER_PASSES, magicBudget = RACE_WORKER_MAGIC_BUDGET, onUpdate = null }) {
  const start = Date.now();
  const table = playoffRace(teams, results, remaining, spots, options);
  const rows = table.map((r) => ({ ...r }));
  const n = teams.length;
  const k = Math.max(1, Math.min(spots, n));
  const { win = 3, draw = 1, loss = 0, setScoring = false, adjustments = {} } = options;
  const scoring = { win, draw, loss, setScoring };
  const outcomes = matchOutcomes(scoring);
  const head = { exact: table.exact, proved: table.proved };
  const done = (extra) => ({ rows: rows.map((r) => ({ ...r })), exact: head.exact, proved: head.proved, ...extra });
  if (head.exact || head.proved || !monotone(outcomes)) {
    const u = done({ settled: 0, open: 0, pass: 0, final: true });
    if (onUpdate) onUpdate(u);
    return u;
  }
  const pts = Array.from({ length: n }, (_, i) => adjustments[i] ?? 0);
  for (const r of results) { const [pa, pb] = matchPoints(r.ga, r.gb, scoring); pts[r.a] += pa; pts[r.b] += pb; }
  const top = Math.max(...outcomes.flat()), bot = Math.min(...outcomes.flat());
  const byIndex = new Map(rows.map((r) => [r.index, r]));
  // per alive team, the questions still open: "clinch", "out", "tie"
  const open = new Map();
  for (const r of rows) if (r.status === "alive") open.set(r.index, new Set(r.clinchedUnlessTied ? ["clinch", "out"] : ["clinch", "out", "tie"]));
  let settled = 0, pass = 0, timedOut = false;
  const outOfTime = () => Date.now() - start > seconds * 1000;
  for (const budget of passes) {
    if (!open.size) break;
    if (outOfTime()) { timedOut = true; break; }
    pass++;
    let news = false;
    for (const [i, qs] of open) {
      if (outOfTime()) { timedOut = true; break; }
      const others = remaining.filter(([a, b]) => a !== i && b !== i);
      const lose = pts.slice(), winOut = pts.slice();
      for (const [a, b] of remaining) {
        if (a === i) { lose[a] += bot; lose[b] += top; winOut[a] += top; winOut[b] += bot; }
        else if (b === i) { lose[b] += bot; lose[a] += top; winOut[b] += top; winOut[a] += bot; }
      }
      const r = byIndex.get(i);
      const opts = { outcomes, skip: i, budget };
      for (const q of ["out", "tie", "clinch"]) {
        if (!qs.has(q)) continue;
        const d = q === "out"
          ? extremeCount(winOut, others, winOut[i] + 1, { ...opts, maximise: false, stopAt: k - 1 })
          : extremeCount(lose, others, q === "clinch" ? lose[i] : lose[i] + 1, { ...opts, maximise: true, stopAt: k });
        if (!d.proved) continue;
        qs.delete(q);
        // reached: the others can push the count that far, so this team is not settled that way. Strictly
        // above is a subset of level-or-above, so a "tie" that can be reached answers "clinch" too.
        if (d.reached) { if (q === "tie") qs.delete("clinch"); continue; }
        news = true;
        if (q === "clinch") { r.status = "clinched"; r.worstRank = Math.min(r.worstRank, k); r.magic = null; r.clinchedUnlessTied = false; qs.clear(); settled++; }
        else if (q === "out") { r.status = "eliminated"; r.bestRank = Math.max(r.bestRank, k + 1); r.magic = null; r.clinchedUnlessTied = false; qs.clear(); settled++; }
        else { r.clinchedUnlessTied = true; }
      }
      if (!qs.has("clinch") && !qs.has("out") && !qs.has("tie")) open.delete(i);
    }
    if (news && onUpdate) onUpdate(done({ settled, open: open.size, pass, final: false }));
  }
  // magic numbers for the teams still alive, safe number as the seed
  let lowered = 0;
  if (magicBudget > 0) {
    for (const r of rows) {
      if (r.status !== "alive" || r.magic == null) continue;
      if (outOfTime()) { timedOut = true; break; }
      const m = exactMagic(pts, remaining, r.index, k, outcomes, { budget: magicBudget, known: r.magic });
      if (m.magic != null && m.magic < r.magic) { r.magic = m.magic; lowered++; }
    }
  }
  const u = done({ settled, open: open.size, pass, lowered, timedOut, final: true });
  if (onUpdate) onUpdate(u);
  return u;
}

if (typeof self !== "undefined" && typeof self.postMessage === "function" && typeof window === "undefined") {
  self.onmessage = (e) => {
    const msg = e.data || {};
    try { deepRace({ ...msg, onUpdate: (u) => self.postMessage({ id: msg.id, ...u }) }); } catch (err) { self.postMessage({ id: msg.id, error: String((err && err.message) || err), final: true }); }
  };
}
