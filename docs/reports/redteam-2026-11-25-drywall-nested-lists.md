---
kind: note
topics: [redteam]
date: 2026-11-25
---
# Red team 2026-11-25: drywall takeoff (drywall.mjs)

Target: `ventures/wall-framing-takeoff/drywall.mjs` (bet: construction; the drywall order feeds the budget and the bid letter).

- Campaign: 8 mutants, 4 caught (50%). All 4 escapes were gaps, each now pinned by a test in `drywall.test.mjs` and caught on rerun (100%):
  the 1000 ft top of the tape roll range, the 250 ft default roll, two runs sharing the first sheet's offcut (`k < 0` to `k < 1` in `pack`), and the seam length with `jointsOnStuds`.
- Real defects (all patched, tests first):
  1. A `drywall.ceiling` that was not a list (`{}`, `"x"`) or held `null`, or a ceiling `steps` of the same shapes, crashed `cli.mjs` with a raw TypeError and stack trace (in `validateDrywall` and in the CLI's length pre-parse). The page's saved-plan restore crashed on the same input. Now refused with a message.
  2. `compoundPailGal` was never checked: `-1` printed "-1 pails of -1 gal", `0` gave an Infinity (null in JSON) pail count. Now more than 0 and at most 10 gal.
  3. `price` was never checked: `-5` gave a negative sheet cost, text gave a silent null. Now a number of 0 or more. `faces` (only `"inside"`/`"both"`) and `openingBead` (boolean) were also silently accepted with any value; `openingBead: "no"` kept the bead on.
- Guard added: `hostile-nested-lists.test.mjs` walks every list inside a plan built from each module's sample section (plus the smallest valid hvac, plumbing, wall tile, flooring, drilling and dormer sections), swaps each for `{}`, `"x"`, `[null]` and `[5]`, and runs `main()` with all 25 report flags. It fails on the pre-fix code (drywall.ceiling, ceiling steps) and found nothing else on its first run. `cli-fuzz.test.mjs` only swaps top-level values, which is why it never reached these.

Next run: the sweep only goes as deep as the samples. Sections with no `sample*()` export (insulation, trim, siding, eaves, gutters, electrical...) are covered only by the minimal inputs above or not at all; adding a sample export for each would widen it for free.
