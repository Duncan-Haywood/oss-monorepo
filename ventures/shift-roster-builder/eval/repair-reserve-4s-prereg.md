# Pre-registered: a 4 s repair reserve against the 2 s default on fresh seeds 25-36 (written 2026-11-16, before the run)

Since "The repair reserve on the biggest weeks" (README), weeks of 300 or more shift copies reserve 2 s of the 20 s budget for the
flow-bounded repair. On the pre-registered fresh seeds 13-24 the repair then ran 0.5-1.2 s (`timings.coverRepair`,
eval/repair-reserve-big-fresh.jsonl): the last plateau walk starts with just over 2 s left and eats most of it. So a longer
reserve may give the repair the time the 2 s one was meant to. It also takes two more seconds from the plateau walks.

Test: the same four weeks that end above their floors (90 x 252 weeks 0-1, 100 x 280 weeks 0-1), fresh search seeds 25-36, 48
paired builds, `flow2000` (the default) against `flow4000`, default 20 s budget, two builds at a time
(eval/repair-reserve-4s.sh).

Decision rule, fixed now: raise the default reserve to 4 s (at most a fifth of the budget) on weeks of 300 copies or more only if,
on these 48 builds, the 4 s reserve has fewer open hours on more builds than it has more, with a one-sided sign test p < 0.05, and
a net gain in hours covered. Otherwise the default stays at 2 s and the 4 s question is closed as measured.
