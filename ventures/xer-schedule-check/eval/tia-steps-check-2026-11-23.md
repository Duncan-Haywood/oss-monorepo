# Time impact analysis step by step: planted check, 2026-11-23

`node eval/tia-steps-check.mjs <corpus>/xer --plants 20 --json eval/tia-steps-check-2026-11-23.json`
on the six public XERs from `bash eval/corpus-fetch.sh` (seed 1).

What is checked (the script's header has the detail): `timeImpact().byStep`,
the events inserted one at a time in date order, against answers reached
from plain one-row time impact runs with no event column, never from the
stepwise runs themselves. Two events per fragnet, E1 dated 20 days before
the data date and E2 10 days before (so the dates move nothing), written in
the fragnet newest first about half the time.

1. **Series.** A then B, its only FS-0 successor, both with zero float over
   the driving path; E1 lengthens A, E2 lengthens B. Expect step 1 =
   run(A + a), step 2 = run(B + b), the same newest first, and
   `orderSensitive` false.
2. **Parallel.** E1 lengthens a not-started activity X by a; E2 adds a new
   activity beside X with X's links and X's remaining duration plus b.
   Together they are X made max(a, b) longer. Expect in date order E1 =
   run(X + a), E2 = run(X + max) - run(X + a); newest first E2 = run(X + b),
   E1 = run(X + max) - run(X + b); `orderSensitive` true exactly when the two
   orders differ.

Every check also confirms the steps add up to the total and the last
cumulative figure is the total.

```
CCA_R03_dt_24Oct11SC.xer (CCA R03 dt 24Oct11SC, 14270 open): series 1/1, parallel 6/6 (6 order-sensitive); 54.3 s
Expressway_Project.xer (BEW3, 823 open): series 0/0, parallel 1/1 (1 order-sensitive); 0.8 s
example_xer_file.xer (DEMO-001, 404 open): series 6/6, parallel 5/5 (5 order-sensitive); 1.6 s
hotel-project.xer (HBTF-2, 4217 open): series 0/0, parallel 0/0 (0 order-sensitive); 0.2 s
sample.xer (Task SE, 42 open): series 5/5, parallel 10/10 (10 order-sensitive); 0.2 s
terminal-building-airport.xer (TERMINAL-2, 66 open): series 7/7, parallel 9/9 (9 order-sensitive); 0.2 s
TOTAL: series 19/19, parallel 31/31 (31 of them order-sensitive), fragnets written newest first put in date order 26/26
```

What it shows:

- Series delays split the same in either order (19 of 19): each day lands on
  the finish in turn, so there is nothing to argue about.
- Every parallel plant (31 of 31) splits differently by order. That is the
  arithmetic of a stepwise split, not a fault: when two events delay the
  same path at the same time, whichever goes in second is only charged the
  days by which it exceeds the first. Inserted oldest first, the later event
  is credited with nothing unless it is longer; newest first, the older one
  is. The page and exhibit put both orders side by side and say when they
  disagree, so a reader sees that the split is a choice of order.
- The hotel file has no plain zero-float activity on the project calendar
  for either pattern (its driving path runs over ALAP and other-calendar
  work), as in eval/tia-party-check-2026-11-23.md.

Not yet run on a real claim's dated event list.
