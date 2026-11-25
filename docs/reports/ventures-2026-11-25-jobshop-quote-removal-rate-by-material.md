---
kind: milestone
date: 2026-11-25
---
# Job Shop Quote (bet #2): removal rate per material for "Rough from CAD"

2026-11-25, ventures run. Private PR: Duncan-Haywood/private-monorepo#192. Claim slug
`geometry-removal-rate-by-material` (ROADMAP item 5, "a per-material removal rate instead of one
per machine").

**What landed.** `removal_rates` (migration 0022, renumbered after PR 191 took 0021: machine × material, unique pair, cascade on
delete), `PUT/DELETE /rate-card/removal-rates`, `removalRates` on `RateCardDto`, a "Removal rates
by material" card, and `suggestRoughingOperation(part, blank, machines, material, rates)` in
`src/shared/costing.ts`. It mirrors the cut-speed design (PR #176): rows for the line's material
among the active machines win, exactly one must remain; with none, the single default rate applies.
`ROUGHING_MACHINE_KINDS` (mills, lathe, mill-turn, Swiss) lives in `src/shared/enums.ts`; a machine
of another kind with a default rate is also accepted.

**Choices the next run should keep.** No assumed rates (they depend on tooling and strategy). The
material name is resolved from all material rows, retired included, as for cut speeds.

**Next.** Removal rates from a CSV in the rate-card import (copy `cut-speed-import.ts`); peck
time; IGES/STL.

**Verification.** Typecheck and Biome clean; unit 306 pass; worker tests for removal rates,
geometry, cut speeds, routing suggestions and win/loss pass on the tree merged with main. Full
`jobshop-quote-ci` locally: see this run's record.
