# Pre-registration: the cover repair stops at the budget's end (2026-11-16)

Written and committed before the comparison run.

**Finding that motivates it** (`eval/stage-overrun-ab.jsonl`, the "new" builds of the cover walk's deadline test): 5 of 48
builds still reached the pay floor more than 50 ms past the 20 s budget (65-249 ms), and on all five the stage that crossed
it was the cover repair. Only one of the five started inside the last 200 ms (at 19,985 ms, where `Math.max(200, ...)` gave
it 200 ms anyway); the other four started 600-1,500 ms before the end and still ran 65-196 ms over. The repair reads the
clock only between rounds, and one round may search up to 200,000 nodes; then a gain is polished for pay.

**Change under test:** `coverRepair` takes a `deadline` (the budget's end), read every 1,024 nodes inside a round as well as
between rounds; a round stopped by it keeps the best assignment it had found (which already beats the round's start). The
200 ms minimum is dropped when the deadline is on. `coverRepairDeadline: false` keeps the old limit.

**Run:** seeds 54-65 (not used by any earlier overrun or pay-floor test), 60 x 168 and 70 x 196, weeks 0-1, each built
twice at the default 20 s budget: "new" (defaults with the change) and "old" (`coverRepairDeadline: false`),
`sh eval/repair-deadline-ab.sh`, two builds at a time on one machine, written to `eval/repair-deadline-ab.jsonl`, scored
by `eval/stage-overrun-summary.py` on that file.

**Rule (all must hold to keep it on by default):**
1. Builds whose cover repair is the stage that crosses the budget and that reach the pay floor more than 50 ms past it
   fall by at least half, old to new (if old has fewer than 4 such builds, the clause is read as "new has none more than
   50 ms past from the repair").
2. Total open hours over the 48 weeks are not more than 2 higher under "new".
3. Mean build time is not higher under "new" by more than 0.05 s.

If any clause fails, the change ships off by default (`coverRepairDeadline: true` turns it on) with the numbers in the
README.
