# Pre-registered: the 2 s repair reserve on fresh seeds 13-24 (written 2026-11-16, before the run)

Seeds 4-12 on the eight 80-100 person bench weeks (eval/repair-reserve-big.out.txt): the 2 s reserve has fewer open hours on 17
builds and more on 8, net 31 h of the 244 h above the proven floors, two-sided sign test p = 0.108. A second no-reserve run tied
on 22 of 24 builds, so the builds are close to deterministic and the reserve's differences are its own, not timing noise.

Test: the four weeks that end above their floors (90 x 252 weeks 0-1, 100 x 280 weeks 0-1), fresh search seeds 13-24, 48 paired
builds, `flow` (no reserve) against `flow2000`, default 20 s budget, two builds at a time (`SEEDS="13 ... 24"`, eval/repair-reserve-big-fresh.sh).

Decision rule, fixed now: turn the 2 s reserve on by default for weeks of 300 copies or more only if, on these 48 fresh builds alone,
the reserve has fewer open hours on more builds than it has more, with a one-sided sign test p < 0.05, and a net gain in hours
covered. Otherwise the default stays off and the question is closed as "a small, unproven gain".
