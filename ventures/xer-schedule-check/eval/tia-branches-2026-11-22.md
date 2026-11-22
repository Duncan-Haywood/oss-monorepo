# Probabilistic branches in the time impact analysis, checked (2026-11-22)

`node eval/tia-branches-check.mjs DIR/xer --plants 8 --seed 1 --json eval/tia-branches-2026-11-22.json`
on the six public XERs from `bash eval/corpus-fetch.sh DIR` (147 s, most of it
the 16,000-activity CCA file at about 1.7 s per schedule).

No public job publishes a fragnet with alternatives, so each plant is seeded:
two pairs A -> B (A's only successor, finish-to-start with no lag, both on the
project calendar; the lowest-float pairs, so the branches reach the finish).
Group G1 inserts the same activity ID between A1 and B1 on two or three
branches with different durations (1-25 days, probabilities summing to 100%),
the last branch sometimes with a rework activity only it has; group G2 is a
hold of 1-20 days between A2 and B2 at 10-79%, the rest "none of these".

| File | Outcome = plain TIA of its rows | Expectation | Single run = most likely branches | One branch at 100% = no branch columns |
|---|---|---|---|---|
| CCA_R03_dt_24Oct11SC | 40/40 | 8/8 | 8/8 | 8/8 |
| Expressway_Project | 42/42 | 8/8 | 8/8 | 8/8 |
| example_xer_file | 44/44 | 8/8 | 8/8 | 8/8 |
| hotel-project | 40/40 | 8/8 | 8/8 | 8/8 |
| sample | 36/36 | 8/8 | 8/8 | 8/8 |
| terminal-building-airport | 42/42 | 8/8 | 8/8 | 8/8 |
| **Total** | **244/244** | **48/48** | **48/48** | **48/48** |

- *Outcome = plain TIA*: each outcome's finish equals a TIA of exactly that
  outcome's rows, written by the check with no branch columns (so the
  branch-only rework row and the shared activity ID go through the ordinary
  fragnet path).
- *Expectation*: the reported expected delay equals the sum of probability x
  plain delay, to 0.1 day, and the outcome probabilities add to 1.
- *Single run*: the finish and fragnet table of the main result are the plain
  TIA of the most likely branch of each group.
- 156 of the 244 outcomes moved the finish; 32 of 48 plants had outcomes with
  different delays (the rest put every branch inside float).

What this does not show: that the probabilities a contractor writes are
right (a judgment the file cannot supply), or how a reviewer reads an exhibit
with branches. Next: a real TIA with alternatives.
