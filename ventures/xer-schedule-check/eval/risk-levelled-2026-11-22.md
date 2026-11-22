# Resource levelling inside every risk run, 2026-11-22

**Question.** With `risk.mjs`'s new `level` option, every Monte Carlo run is
levelled by `level.mjs` before its finish is read, and also scheduled without
levelling on the same draws. Is the levelled run sound, and what does it show
on real P6 exports?

**Data.** The public XER files of `eval/cpm-vs-p6-2026-11-19.md`, fetched
with `bash eval/corpus-fetch.sh DIR` (not committed). CCA is left out: one
levelling of it takes 188 s (`eval/level-check-2026-11-19.md`), so a risk run
over it is not practical.

**Method.** `node eval/risk-levelled.mjs DIR --n N --crew ... --json out.json`,
seed 7, the default ranges (90 / 100 / 125% of remaining duration). For each
file:

1. **Identity:** every limit x1e6. The levelled run must equal the plain run
   exactly: every percentile and every activity's criticality index.
2. **At the file's limits** and at crew multiples: levelled and unlevelled
   percentiles; the resource delay run by run (levelled minus unlevelled
   finish; its minimum must be >= 0, since levelling only adds start floors);
   the share of runs whose driving path ran through a resource wait; runs in
   which a wait's blocker could not be named (`pathCut`); level.mjs's
   self-check summed over each run (hours a placed activity is over a limit).

**Result.** Days are working days from the data date (P10 / P50 / P80 / P90).

| File | Runs | Identity (x1e6) | Crew | Unlevelled | Levelled | Delay per run: mean (min, P80) | Resource-driven | Path cut | Self-check | Time |
|---|---|---|---|---|---|---|---|---|---|---|
| example (24.12) | 100 | equal; 80 / 80 criticality | x1 | 218.3 / 223 / 225.3 / 227 | 244.8 / 251.3 / 255.1 / 257.2 | 28.4 (18.4, 33.2) | 100% | 0 | 0 h | 5.8 s |
| | | | x2 | same | 244.6 / 250.5 / 253.1 / 255 | 27.1 (11.8, 31) | 100% | 0 | 0 h | 4.8 s |
| | | | x4 | same | 218.3 / 223 / 225.3 / 227 | 0.1 (0, 0; none in 94%) | 6% | 0 | 0 h | 4.0 s |
| sample (20.12) | 100 | equal; 30 / 30 | x1, x2, x4 | 154.5 / 157.1 / 159.1 / 160.4 | equal (no resources) | 0 | 0 | 0 | 0 h | < 0.1 s |
| terminal (5.0) | 100 | equal; 46 / 46 | x1, x2, x4 | 314.2 / 320.3 / 324 / 327.1 | equal (no limits) | 0 | 0 | 0 | 0 h | 0.1 s |
| Expressway (7.0) | 40 | equal; 25 / 25 | x4 | 1,343.5 / 1,379.3 / 1,399.2 / 1,406.2 | 6,154.7 / 6,351.7 / 7,699.3 / 11,359.6 | 5,886 (4,061, 6,274) | 90% | 17.5% | 0 h | 187 s |
| hotel (6.0) | 40 | equal; 496 / 496 | x4 | 702 / 719.2 / 729.8 / 732.9 | 982.6 / 995.7 / 1,005.3 / 1,011.3 | 277.4 (250.6, 285.6) | 100% | 0 | 0 h | 550 s |

**Reading.**

- The identity holds exactly on every file run: the levelling path and the
  resource-aware driving path add nothing when nothing is over a limit.
- The identity check found one bug before this landed: on hotel the first
  run gave equal percentiles but 0 of 498 equal criticality indices. The
  levelled path was walked on level.mjs's full run, whose backward pass moves
  as-late-as-possible work and cut the walk to 1 activity (79 in the plain
  run). It now walks a forward-only run with the levelling floors, as the
  plain run does: 496 of 496 equal.
- No run finished earlier levelled than unlevelled, and no run's levelling
  left a placed activity over a limit.
- **example**: its 26 labour resources sit at P6's default limit of 1 per hour
  and are used at up to 11.4 at once. The limits add 28 to 30 working days at
  P80 and in every run; doubling every crew still costs 27 days a run; at x4
  the delay is gone in 94% of runs. One levelled date at x2 (240.2 days)
  would not say how close x2 is to x1 under uncertainty.
- **hotel**: three labour and equipment resources at limits of 1 to 1.5 per
  hour, used at up to 10.5 at once. Even with crews four times the file's
  limits, the limits add 251 to 286 working days in every run (P80 729.8 ->
  1,005.3 days), and every run's driving path passes through a crew wait.
- **Expressway**: every labour resource at the default limit of 1, used at up
  to 43 at once; even at x4 the levelled runs reach 17 to 31 years. That is the
  file's limits, not the method (`eval/level-check-2026-11-19.md`), and the
  page's default-limit warning appears in the run's warnings. In 17.5% of its
  runs the path met a floored activity whose blocker could not be named (up to
  409 activities per run are left over-allocated past the 30-year horizon, so
  the waits there are not clean finish-to-start hand-overs); the path stops
  there, and the share is reported as `pathCut` rather than guessed.

**Not checked.** No public file carries a commercial tool's levelled risk run
(Primavera Risk Analysis, Safran), so the levelled percentiles are not compared
with one. Each run costs one levelling: about 50 ms on the example file, 4.7 s
on Expressway and 14 s on hotel at x4.
