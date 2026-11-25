---
kind: milestone
date: 2026-11-25
---
# Job Shop Quote (bet #2): tapping operations from the hole sizes the estimator marks threaded

2026-11-25, ventures run. Private PR: Duncan-Haywood/private-monorepo#187 (merged). Claim slug
`geometry-tapping-ops` (ROADMAP item 5, "tapping ops once a shop marks which holes are threaded").

**What landed.** `rfq_parts.tapped_hole_diameters_in` (json, default `[]`) and
`machines.seconds_per_tapped_hole` (migration 0020). `drilledHoleSizes` and
`suggestTappingOperation` in `src/shared/costing.ts`: the sizes are distinct smallest diameters of
drill-sized hole locations (≤ 1 in, matched within 0.0005 in), empty for low-confidence holes;
the op is the ticked locations × seconds per tapped hole, at exactly one machine with the rate,
with setup 0 when roughing or drilling already uses that machine. The RFQ part form shows a
`ThreadedHoles` checkbox row (client imports the shared helpers) and warns when 0 or 2+ machines
have the rate. Rate-card import: a `tap/taps/tapped/tapping` header maps to the new field. The rule
sits before the generic `holes?` rule, which would otherwise take "Seconds per tapped hole", and
the minutes-refusal rule now covers tapping too.

**Choices the next run should keep.**

- Ask, never infer, threads: STEP rarely carries them.
- The tap drill stays in the drilling op; tapping adds only its own cycle.
- A ticked size missing from a re-uploaded model is ignored, not an error.

**Next.** A time per thread size or rigid tapping from pitch and rpm if one time per hole is too
coarse; peck time for deep holes; IGES/STL.

**Verification.** Local (private CI starved: `ci_starvation.py` said 2 of 2 jobs never got a
runner): typecheck, Biome, unit 303, worker 171, build, `drizzle-kit check` and generate (no
drift), Playwright e2e 3/3, jobshop-site unit 42. Plus a browser run on `pnpm demo` with the part's
geometry set in the local D1 (the demo's FakeGeometry measures nothing): ticked 4× Ø0.201,
Confirm, and the quote carried "Tap from CAD: 4 holes × 7 s (4× Ø0.201)" with setup 0.
