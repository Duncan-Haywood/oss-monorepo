# Pre-registered: a 4 s reserve for the spent pay floor, on fresh weeks (written 2026-11-16, before the run)

The first test (`eval/pay-floor-spent-prereg.md`, seeds 18-29, `eval/pay-floor-spent.out.txt`) failed its rule by 0.02 s: 10 of
48 weeks reached the pay floor with the budget spent, the 6 s default reserve finished 9 of those 10, and mean build time rose
0.52 s against a 0.5 s cap. So `scoreFloorSpent` stays off by that rule. The same table shows a 4 s reserve finishing the same 9
for +0.48 s. Choosing 4 s from that table would be fitting to it, so it is tested here on weeks no pay-floor test has used.

Method: identical to the first test, seeds 30-41 (`SEEDS="30 ... 41" sh eval/pay-floor-spent.sh`), 48 weeks, "full" and "base".

Decision rule, fixed now:
- Turn `scoreFloorSpent` on by default with a reserve of its own of 4 s when the budget is spent (`scoreFloorSpentReserveMs`,
  default min(4 s, the normal reserve)) only if at least 3 of the 48 weeks are spent weeks, the 4 s try finishes on at least half
  of them, the mean build time over all 48 rises by at most 0.5 s, and the open hours summed over all 48 are not higher.
- Otherwise it stays opt-in and the budget-spent case is closed as measured.
