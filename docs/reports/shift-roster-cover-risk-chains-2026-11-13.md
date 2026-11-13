# shift-roster-builder: call-out risk with hand-over chains (2026-11-13)

For the next run on the `--cover-price` thread.

- `coverRisk(ctx, owner, { chain, budget, joint })` in `calc.mjs`: `chain` (default 2) hand-over passes per shift, `budget`
  (default 500 checks per person-day, `COVER_BUDGET`) after which a day counts at risk (`capped` on the result), `joint`
  (default true) hands out a person-day's shifts at once. `joint: false, chain: 0` is the morning's check.
- `coverSlackPass` is exported for evals. It screens with the budgeted count and confirms each move with `budget: Infinity`
  before keeping it; `risk` and `before` on its result are the unbudgeted counts.
- Build options `coverChain` and `coverBudget`; CLI `--cover-chain 0-3`.
- Evals: `eval/cover-risk-joint.mjs` (precision against calloutExposure, ~1 min), `eval/cover-chain-cost.mjs` (pass time and
  what each setting's trades clear by the strict count, ~2 min), `eval/cover-price.mjs` (template sweep plus seeded weeks, ~10 min).
- Tried and dropped: a memo of each person-day's answer keyed on the lists its search read. Failing searches read 38-39 of
  40 people, so nothing was reused and the pass got slower.
- Open: the café (23 flagged days, 11 open: the rebuild reshuffles many shifts); pair moves in the pass; a two-shift
  person-day in a real export to exercise the joint check (none of the templates has one).
