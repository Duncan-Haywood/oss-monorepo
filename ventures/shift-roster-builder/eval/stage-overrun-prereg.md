# Pre-registration: the cover walk stops at the budget's end (2026-11-16)

Written and committed before the comparison run.

**Finding that motivates it** (`eval/stage-overrun.jsonl`, seeds 18-29, 60 x 168 and 70 x 196, weeks 0-1, today's
defaults before the change, the new `timeline` field): 27 of 48 builds reached the pay floor with the 20 s budget already
spent. On 17 the stage that crossed the budget was the cover walk (`coverPass`, 88-729 ms over), on 9 the cover repair
(41-126 ms over), on 1 the pay floor was reached within budget. The walk checks the clock only between walks, and one walk
of 3.1M steps takes most of a second on these weeks.

**Change under test:** `coverPass` takes a `deadline`, read every 1,024 steps; `buildRoster` passes the budget's end (less
the repair reserve after the first walk). `coverPassDeadline: false` keeps the old check alone.

**Run:** seeds 42-53 (no earlier pay-floor or overrun test used them), 60 x 168 and 70 x 196, weeks 0-1, each built twice
at the default 20 s budget: "new" (today's defaults with the change) and "old" (`coverPassDeadline: false`),
`sh eval/stage-overrun-ab.sh`, two builds at a time on one machine, written to `eval/stage-overrun-ab.jsonl`.

**Rule (all must hold to keep it on by default):**
1. Builds that reach the pay floor more than 50 ms past the budget fall by at least half, old to new.
2. Total open hours over the 48 weeks are not more than 2 higher under "new" (the two builds of a week differ by timing
   noise of about +-1 h on a few weeks, README "The pay floor once the budget is spent").
3. Mean build time is not higher under "new".

If any clause fails, the change ships off by default (`coverPassDeadline: true` to turn it on) with the numbers in the
README.
