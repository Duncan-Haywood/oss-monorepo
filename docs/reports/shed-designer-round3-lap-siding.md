# Shed Designer round 3, lane 4: horizontal lap siding

2026-10-30. Session https://claude.ai/code/session_01XpHqybdbfUS98SKSQvtQEW.

## What landed (this PR)

- **`ventures/shed-designer/lap.mjs`** (new). It holds:
  - the two lap products, with install figures cited to James Hardie HS11119 (Dec 2019, the newest readable) and LP LPZB0515 (12/2023);
  - the plank lengths sold;
  - `layoutFace` (courses, the butt joints on studs, staggering, notches round openings, rake cuts);
  - `backed()`;
  - `lapSteps()`, the build steps.
- **Model.** `sidingType` takes `fiber cement` (now real HardiePlank-type 8-1/4" lap; it used to be a per-square-foot guess) and the new `LP SmartSide lap`.
  - Under lap, the 4 ft columns are `wall sheathing` (7/16" OSB), so the round-1 nailer logic still backs the OSB joints.
  - Lap pieces are `lap siding` panels. Each one leans out at its butt edge in 3D and carries a `face` polygon for the elevations.
  - The model warns when the siding starts less than 6" above the ground.
- **Checks** (`connections.mjs`). Under lap, "Siding joints on framing" becomes "Wall sheathing joints on framing". Two new checks: "Lap butt joints on studs" and "Lap joints staggered" (two bays for Hardie at 16" o.c., one at 24"; one bay for LP).
- **Estimate.** The lap pieces are packed by the cut optimizer into the plank lengths the design may buy, honouring the ticked board lengths, so 16 ft LP can be left off. Starter strips are ripped from planks. The order adds OSB by column, house wrap, tape, cap nails, siding nails (one per stud per course, plus 10%) and joint-flashing coil when there are joints. The plan is on the Cut sheet tab and in the CSV.
- **Elsewhere:**
  - the build steps: sheathing, wrap, trim first, starter, story pole, nailing, every joint by place, gables, clearance;
  - the cover sheet and elevation notes;
  - the swaps (panels to lap, lap to panels, between the two lap products; "no trim" is hidden for lap);
  - the budget search, which from lap only weighs the other lap product, so it never undoes the look the owner chose;
  - labour minutes and cut counts.
- **Prices** (seen 2026-10-30; all from search-result copies, since the stores block automated reads):

  | Item | Home Depot | Lowe's |
  | --- | --- | --- |
  | Hardie HZ10 8.25 x 12 | $12.48 ($10.61 at 25+, cached) | none found |
  | LP 38 lap 8 x 12 | $11.28 | none found |
  | LP 38 lap 8 x 16 | $15.48 | $15.28 |
  | Everbilt house wrap 3 x 100 | $38.93 | none found |
  | Tyvek tape | $14.97 | $14.97 |
  | PRO-FIT cap nails, 2,000 | $22.45 | none found |
  | Amerimax 10 in x 50 ft flashing coil | $43.68 | none found |
- **Tests:** `lap.test.mjs` (8 tests). The fuzz test now draws `LP SmartSide lap` too.
- **Post:** `docs/posts/2026-10-30-lap-siding-on-a-small-shed.md`.

## Findings

On the default 8x12, painted white, with even courses, lap adds to the whole shed over T1-11:
- fiber cement: $293;
- engineered wood: $314.

The planks alone are cheaper than the T1-11 panels ($499 against $515). The difference is the OSB ($128), its 8d nails ($54), and the wrap kit ($115). There are no butt joints on the default 8x12, and 0 of 224 sizes and spacings fail a lap or sheathing check.

*Correction:* PR #11567 first reported +$207 and +$248. Those counted only the siding section of the list and missed the OSB nails; the true figures at that commit were +$261 and +$302.

## Open, for a person to check

- **Stale prices.** Several came from cached copies months or years old: Hardie $12.48 with its bulk price, LP 16 ft. No Lowe's listing was found for Hardie HZ10, the LP 12 ft plank, house wrap or cap nails. In a freeze-thaw climate Hardie sells HZ5, at $17.98 (Home Depot) or $14.98 (Lowe's); the tool prices HZ10 and says so in the note.
- **Trim.** LP asks for 5/4 (540 Series) trim so lap does not stand proud; the tool still uses 3/4" primed 1x4 and the build step says so. HardieTrim and LP 540 trim prices were found ($23.48 HardieTrim smooth 12 ft at Home Depot; LP 540 5/4x4x16 at $35.75 Home Depot and $24.98 Lowe's), but they are not wired in.

## Follow-up PR: even courses

`evenExposure()` in `lap.mjs` sets the exposure the way an installer's story pole does. It is never over the maker's figure, and it is even, so the top course on the long walls is a full plank meeting the plate. The default 8x12 now lays 14 courses at 6-1/2" instead of 13 at 7" plus a 1/2" bare strip under the eave. Cost: three more fiber cement planks. The build step says to mark each course from the bottom, so rounding does not add up.

## Follow-up PR: stud spacing the siding allows

At r3 lane 8's request (relayed by the parent), each lap product now carries `maxStuds` in `lap.mjs`, cited to its guide:
- **James Hardie (HS11119 p.1):** 24" o.c. both over OSB and direct to studs.
- **LP (LPZB0515 p.3):** 24" over 7/16" sheathing, 16" direct to studs for the 38 Series.

`lapStudLimit(d)` reads that figure, `sidingSpan()` in `simplify.mjs` uses it, and the built shed exposes it as `shed.sidingStudLimit`. Lane 1's right-sizing can take studs to 24" o.c. whenever lap is chosen. T1-11 and the 3/8" LP panel stay at 16".

## Next steps

1. **Lap direct to studs, braced another way.** Hardie allows studs up to 24" o.c.; LP's 3/8" lap allows 16". That saves the OSB ($128 on the 8x12) but needs let-in bracing or OSB only at the corners. It needs a racking check: see the r2 structure PR #11543 on racking.
2. **A 5/4 trim option** for LP lap, priced.
