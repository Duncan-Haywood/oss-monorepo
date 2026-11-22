# Round 7: the weekly drift watch beside the daily watch, on fresh shops of a different make (pre-registered 2026-11-22, before any round-7 shop ran)

## Why this round

Round 6 (`eval/slow-climb.prereg.md`, output `eval/slow-climb-sim.out.txt`) found that no slow-climb check passed its
bars on its own, but that the drift watch on weekly totals (**DW**), run beside the shipped daily watch (**Q**), lifted
catches of x1.9 climbs from 57 to 82 (sd 0.36) and from 51 to 90 (sd 0.2) for 0.06 to 0.08 more false alerts per 100
days. Those were round 6's own shops, read after the fact, so it was not a test. Its README "Next" asked for a
pre-registered round on fresh shops with DW beside Q as the arm and bars on x1.9 catches by 8 weeks. This is that
round. The shops are of a different make from rounds 3 to 6 so a pass does not rest on one generator.

## Simulation (`eval/weekly-beside-sim.mjs`, seed 20261124, fixed now)

371 days from 2024-01-01 (a Monday). Each shop draws, in this order:

- a size: none (**N**), x1.3 (**R30**) or x1.9 (**R90**), by group; a climb start in days 200 to 300 and a length of 28
  to 56 days, linear in the log level (as round 6);
- a base level, log-uniform from 500 to 50,000 a day;
- weekday factors `exp(0.25 * N(0,1))` for each of the seven weekdays; then with probability 0.5 one weekday, drawn
  uniformly, is shut every week (factor 0);
- a day-noise scale `s`, uniform from 0.15 to 0.45;
- five single-day closures (days 7 to 370, never on the shut weekday), as round 6.

Each day: an AR(0.5) level wobble with innovations of sd 0.05 (as round 6), and day noise `s * t5`, where `t5` is a
Student-t with 5 degrees of freedom scaled to unit variance (heavier tails than rounds 3 to 6). Value =
`base * exp(wobble + climb) * factor * exp(s * t5)`, rounded to cents; 0 on shut days and closures.

450 shops: 150 N, 150 R30, 150 R90, drawn in that order.

Arms, as shipped and as round 6 ran them, nothing tuned:

- **Q**: `replayWatch(v, labels, { model: 'mean', period: 7, from: 74 })` on the daily series;
- **Q+DW**: Q's alerts together with DW, `replayWatch(W, WL, { model: 'mean', detector: 'drift', from: 11 })` on whole
  Monday-to-Sunday weekly totals labelled by their Monday, each DW alert sent on the Sunday of the week it was checked.

**Caught by 8 weeks**: an alert dated from 7 days before the climb's first day to the climb's end, and sent from the
climb's first day to 56 days after it. **False alerts**: all alerts on N shops per 100 days of Q's daily checks (the
two arms watch the same days).

## Bars

- **K1 (DW beside Q hears more big climbs in time):** on R90, Q+DW catches by 8 weeks at least Q + 15 of 150.
- **K2 (for little more noise):** on N, Q+DW's false alerts per 100 days are at most Q's + 0.15 (about half an alert a
  year more).
- **K3 (not one noise level only):** K1's gain, Q+DW minus Q on R90, is at least 5 in each half of the shops, `s` below
  0.30 and `s` of 0.30 or more.

## What follows

If K1, K2 and K3 pass, the watch gets an opt-in that makes the weekly watch one command on the same daily export:
`--weekly` sums the daily rows into whole Monday-to-Sunday weeks (a partial last week is left out until it is whole)
before watching, and the README says to run it with `--detector drift` beside the daily watch. If any bar fails,
nothing ships and the README says which. Descriptive only (no bar): R30 catches by 8 weeks for both arms, catches with
a shut weekday against without, median delays, and the same counts by round 6's 14-days-after-the-end rule.
