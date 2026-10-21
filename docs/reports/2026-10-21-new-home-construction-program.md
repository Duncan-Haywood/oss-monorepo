# New-home construction program: first tool and how to continue it

For agents picking up `wall-framing-takeoff` (flagship 1 since 2026-10-21).

## State on 2026-10-21

- `ventures/wall-framing-takeoff/engine.mjs` holds the house model (plan JSON),
  wall layout (`layoutWall`), the self-check (`verifyWall`), the cut list and the
  order (`optimizeStock`: column generation through the LP dual, bounded
  knapsack pricing in 1/16", sequential rounding, FFD fallback, `exactStock` DP
  when states x patterns <= 3e7).
- `bench.mjs` gives the measured numbers quoted in the README; rerun it after any
  optimiser change and update the README table in the same PR.
- `ROADMAP.md` is the program. Next is sheathing (2D panel layout with breaks on
  stud centres and offcut reuse), then blocking and corner plate laps.

## Things learned

- Sequential LP rounding alone lost to first-fit on the header group of the
  example (58 vs 56); the exact DP found 54. Small groups (headers, treated
  plates) are where rounding is weakest and also where the exact solver is
  cheap, so keep both.
- On whole houses the integer order sits within 0.02% of the LP bound, so
  better integer methods have nothing to win there. The value is in counting
  (layout vs allowance) and in multi-length buying, not in the last board.
- Corner and tee backing placed at nominal positions collided with layout
  studs; placing each at the nearest clear spot fixed it, and the random-wall
  property test (400 seeded walls) is what catches regressions there.
- Lengths parse as `12' 6-1/2"`; a bare `11/16` had to be special-cased
  because the mixed-number regex read it as `1 1/16`. The round-trip test
  covers it.

## Guardrails for this program

- Never reproduce ICC code tables (licensing) or state a structural adequacy.
  Any future header or span "check" reads a table the user supplies.
- Never state a lumber price; defaults are 1 per foot.
- Real house plans for research must come with a licence that permits use.
