# Pre-registered: the pay floor once the time budget is spent (written 2026-11-16, before the run)

README "The pay floor's reserve, sized from the full solve" left one case open: when the stages before the pay floor
(`cliqueScoreFloor`) run past the 20 s time budget, `buildRoster` skips it (`!over()`), whatever its reserve. On 29 of that run's
48 weeks the pay floor never tried, and its log could not say why (proven, no clique LP, no warm basis, or the budget spent).
This run adds `optimality.scoreFloorSkip` (the reason) and `scoreFloorSpent: true` (try anyway, warm, for the reserve alone),
then asks whether turning that on by default finishes enough tries to pay for the wait.

Method: fresh weeks never used before, the generator of `eval/pay-floor-reserve.mjs`, seeds 18-29, 60 x 168 and 70 x 196,
weeks 0-1: 48 weeks. Each is built twice at the default 20 s budget, two builds at a time (`sh eval/pay-floor-spent.sh`):
"full" (`scoreFloorSpent: true`, `scoreFloorReserveMs: 60000`, so a spent try always finishes and reports its warm time T) and
"base" (today's default, the 6 s reserve, spent weeks skipped). A spent week is one whose "full" build reached the pay floor
with the budget spent (`tried.spent`). On it, a spent try with reserve R finishes iff T <= R; then the build is the "full"
one, otherwise the "base" one plus R of waiting. Every other week is the "base" build under either setting.
`eval/pay-floor-spent-summary.py` scores R in {1, 2, 3, 4, 6} s and reports the skip reasons in both arms.

Decision rule, fixed now:
- Turn `scoreFloorSpent` on by default (at the default reserve, 6 s at a 20 s budget) only if at least 3 of the 48 weeks are
  spent weeks, the 6 s try finishes on at least half of them, and the mean build time over all 48 rises by at most 0.5 s.
- Otherwise it stays off (opt-in), and the budget-spent case is closed as measured.
A changed default is then checked by building the spent weeks with the new default itself.

Not claimed in advance: anything about open hours. The pay floor bounds and guides; it does not itself cover shifts.
