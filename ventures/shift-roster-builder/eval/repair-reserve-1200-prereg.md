# Pre-registered: a 1.2 s repair reserve against the 2 s default on fresh seeds 37-48 (written 2026-11-16, before the run)

"A 4 s repair reserve: measured and refused" (README) found the flow-bounded repair stops on its node budget (3M nodes), not the
clock: under the 2 s default it ran 1,143 ms on average, under 4 s 1,208 ms. A second of plateau walk covered more open hours than
a second of repair. So a reserve sized to what the repair actually uses (1.2 s) may hand the last ~0.8 s back to the plateau walks
and cover more. It may also cut the repair short on the builds where it needs its full second (the 4 s run's repair ran up to
about 1.3 s).

Test: the same four weeks that end above their floors (90 x 252 weeks 0-1, 100 x 280 weeks 0-1), fresh search seeds 37-48 (never
used for a reserve test), 48 paired builds, `flow2000` (the default) against `flow1200`, default 20 s budget, two builds at a time
(eval/repair-reserve-1200.sh), summary by eval/repair-reserve-1200-summary.py.

Decision rule, fixed now: lower the default reserve to 1.2 s on weeks of 300 copies or more only if, on these 48 builds, the 1.2 s
reserve has fewer open hours on more builds than it has more, with a one-sided sign test p < 0.05, and a net gain in hours
covered. Otherwise the default stays at 2 s and the reserve size is closed as measured on both sides (1.2 s and 4 s).
