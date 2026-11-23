# Time impact analysis by party: planted check, 2026-11-23

`node eval/tia-party-check.mjs <corpus>/xer --plants 20 --json eval/tia-party-check-2026-11-23.json`
on the six public XERs from `bash eval/corpus-fetch.sh` (seed 1).

What is checked (the script's header has the detail): answers reached from
the logic and from plain one-row time impact runs with no party column, never
from the split's own runs.

1. **Series.** A then B, its only FS-0 successor, both with zero float over
   the driving path; Owner lengthens A, Contractor lengthens B. Expect 0
   concurrent and each party's sole delay equal to its row run alone.
2. **Parallel.** Owner lengthens a not-started activity X by a; Contractor
   adds a new activity with X's predecessors and successors and X's remaining
   duration plus b. Expect total = run(X + max(a, b)), concurrent =
   run(X + min(a, b)), the larger party's sole = the difference, the smaller's 0.
3. **One party.** Every row names the same party: sole = total, 0 concurrent.

```
CCA_R03_dt_24Oct11SC.xer (14270 open): series 1/1, parallel 6/6, one party 5/5; 52.7 s
Expressway_Project.xer (823 open): series 0/0, parallel 1/1, one party 5/5
example_xer_file.xer (404 open): series 6/6, parallel 5/5, one party 5/5
hotel-project.xer (4217 open): series 0/0, parallel 0/0, one party 5/5
sample.xer (42 open): series 5/5, parallel 10/10, one party 5/5
terminal-building-airport.xer (66 open): series 7/7, parallel 9/9, one party 5/5
TOTAL: series 19/19 (each party's days landed as added on 18/19), parallel 31/31, one party 30/30
```

Notes from the run:

- A first version expected the parallel totals to equal a and b in working
  days. Four of 31 came out one day more on both sides (owner alone and
  contractor alone alike): the finish lands on work on another calendar and
  is measured on the project calendar. The engine was consistent; the
  arithmetic was too simple, so expectations now come from plain one-row
  runs. The series count of "days landed as added" (18/19) keeps the
  arithmetic visible.
- A first series pick had B with only start-to-start successors (terminal
  BA-P4-20), so B's added days reached nothing; tia.mjs warns about such a
  row. The check now skips them, as eval/tia-check.mjs does.
- Few series pairs exist (hotel and Expressway have none with both on the
  driving path at zero relative float); the parallel and one-party checks
  cover every file but hotel.

Open: a real claim's fragnet with parties and the expert's split to compare.
