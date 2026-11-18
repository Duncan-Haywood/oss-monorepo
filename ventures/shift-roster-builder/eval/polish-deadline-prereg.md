# Pre-registration: the pay polish stops at the budget's end (2026-11-16)

Written and committed before the comparison run.

**Finding that motivates it** (`eval/repair-deadline-ab.jsonl`, the "new" builds of the repair's deadline test): 7 of 48
builds still reached the pay floor 22-48 ms past the 20 s budget. On three the cover repair crossed it after a gain
(22, 44, 48 ms) and on four the cover walk crossed it (30, 37, 37 ms, and 1 ms); in each case the walk or the repair had
stopped at the deadline and the pay polish that follows any gain (`polishPay`, max(20,000, copies x 1,000) moves, untimed)
ran past it. Timed alone on generated 60-70 person weeks (230-267 copies), one polish takes 28-47 ms.

**Change under test:** `polishPay` takes a `deadline`, read every 1,024 moves; past it, the polish returns the roster it has
(every move it kept lowered the score and left no covered shift open, so stopping early never adds open hours). Under a
time budget, the polish after a cover walk gets that walk's deadline and the polish after a repair gain the budget's end.
`payPolishDeadline: false` keeps the untimed polish.

**Run:** seeds 66-77 (not used by any earlier overrun, repair or pay-floor test), 60 x 168 and 70 x 196, weeks 0-1, each
built twice at the default 20 s budget: "new" (defaults with the change) and "old" (`payPolishDeadline: false`),
`sh eval/polish-deadline-ab.sh`, two builds at a time on one machine, written to `eval/polish-deadline-ab.jsonl`, scored by
`eval/polish-deadline-summary.py`.

**Rule (all must hold to keep it on by default):**
1. Builds that reach the pay floor more than 20 ms past the budget fall by at least half, old to new (if old has fewer than
   4 such builds, read as "new has none more than 20 ms past").
2. Total open hours over the 48 weeks are not more than 2 higher under "new".
3. The pay part of the final score (score less 100,000 per open hour), summed over the weeks whose open hours match, is not
   higher under "new" by more than 0.1% (a polish cut short may leave pay the pay floor does not win back).
4. Mean build time is not higher under "new" by more than 0.05 s.

If any clause fails, the change ships off by default (`payPolishDeadline: true` turns it on) with the numbers in the README.
