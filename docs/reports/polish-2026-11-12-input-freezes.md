# Polish 2026-11-12: three pages that froze on an extra zero

**Why.** Item 1 of "Still weakest" in `polish-2026-11-12-finding-headings-varied.md`: one field set
to 100000 blocked dining-room-table-mix-optimizer, greenhouse-bench-planner and
u-pick-farm-profit-planner for over 4 s.

**Measured** (local full build, Chromium, third-party blocked; script in the run's scratchpad, method
in the post `docs/posts/2026-11-12-one-extra-zero-hung-three-planners.md`): with example data, set the
field to 100000, press the page's button, and time a trivial `evaluate` (cut-off 30 s, 200 ms floor).

| page / field | before | after | cause | fix |
|---|---|---|---|---|
| u-pick / openDays | >30 s | 217 ms | `seasonOdds` rebuilt log C(n,k) per k: O(n²) | incremental recurrence, O(n), same numbers (test to 1e-12) |
| greenhouse / hold | >30 s | 203 ms | one candidate per hold week, each scanning a window growing with k: O(H²) per crop | `MAX_SHIFT_WEEKS = 52` for hold and per-crop late weeks, with a note in the plan |
| dining room / partiesPerService | >30 s | 206 ms | Monte Carlo cost ∝ parties (Node: 300 → 1.6 s, 1,000 → 5.1 s) | `MAX_PARTIES = 600`: refuse with a message, never simulate a different number |

Other fields at 100000 in Node: greenhouse bench, germ, density, hold cost, late penalty ≤ 1 ms;
crop grow weeks 2000 → 18 ms; flex 2000 → 13 ms (now capped anyway). Dining room: area 100000 → 1.7 s
(search stops once demand is met), window 100 h → 0.2 s, patience 100000 → 1.1 s.

## Still weakest, and what I would do next

1. **The vary sweep stops at 40 states per page.** Pages with more controls have untried fields. Run
   `rendered-headings.mjs --max-states=400` on the 20 pages with the most inputs, looking only for
   time-outs.
2. **Dining room at 600 parties takes ~3 s in Node**, more on a phone. A Web Worker with a progress
   line would keep the tab live up to the cap; it is product work.
3. Carried over: the ticker's third line at 320 px (`polish-2026-11-12-hub-short-phones.md`); 1,000 to
   1,100 px sideways sweep and shared `input{min-width:0}` (`polish-2026-11-12-mid-width-sideways.md`);
   browser checks in the nightly (control-plane PR).
