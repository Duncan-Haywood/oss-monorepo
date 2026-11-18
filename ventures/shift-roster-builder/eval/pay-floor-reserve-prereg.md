# Pre-registered: the pay floor's reserve size (written 2026-11-16, before the run)

"A warm-sized gate for the pay floor" (README) left the 1.5 s reserve (`scoreFloorReserveMs`) untuned: on its 14 weeks two tries
ran out of time (after 2.2 and 2.7 s) and two finished only because of the reserve. The question: does a longer reserve finish
more weeks than it costs in waiting, or does a shorter one lose nothing?

Method: fresh weeks never used for the gate, `eval/warm-gate-e2e.mjs`'s generator, seeds 6-17, 60 x 168 and 70 x 196, weeks 0-1:
48 weeks. Each is built twice at the default 20 s budget, two builds at a time (`sh eval/pay-floor-reserve.sh`):
"full" (`scoreFloorReserveMs: 60000`, so the warm pay floor always finishes and reports its whole time T and the time left L at
its start) and "off" (`scoreFloor: false`, which is the path a try takes when it runs out of time: no bound, no LP guide). For a
reserve R the try finishes iff T <= max(0, L) + R; then the build is the "full" one, otherwise the "off" one plus
max(0, L) + R of waiting. Weeks the pay floor never reaches (proven earlier, no clique LP) are the same under every R.
`eval/pay-floor-reserve-summary.py` scores R in {0.5, 1, 1.5, 2, 3, 4, 6, 8} s: tries finished, open hours, score, gap, and mean
and largest build time.

Decision rule, fixed now:
- Raise the default above 1.5 s only to an R that finishes at least 3 more of the 48 builds than 1.5 s while its mean build time
  over all 48 is at most 0.5 s above 1.5 s's; among those, the one finishing most, ties to the smaller R.
- Lower it below 1.5 s only to an R that finishes every build 1.5 s finishes (so it only cuts waiting); the smallest such R.
- Otherwise 1.5 s stays, and the reserve's size is closed as measured.
A changed default is then checked by building the weeks it changes with the new default itself.
