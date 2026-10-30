# Shed designer, round 3 lane 8: structural utilisation, visible

2026-10-30. Owner's note from the walkthrough: most members check at about 15%, the ridge beam at 79%, so "it's overbuilt".

## What landed

- `utilisation.mjs`: every checked member's utilisation and governing check, sorted, with the check written out in plain words (inputs, each formula, numbers). The breakdown is re-derived independently and compared with `structuralChecks`. On a mismatch the member keeps the Structure tab's ratio and shows no breakdown, so the page never displays arithmetic that is not what was checked. Rows it does not know (for example new checks from r2 PR #11531 or #11543) still appear with their ratio.
- `marginReport(shed, target)`: lists members over capacity, members above the target, and members under target/2 with a reason. The reasons are: simply oversized, the next size down misses the target, the next size down fails (size step), stiffness, a code or rating minimum, the minimum size the tool frames, and nailing surface. Each lighter option is built and must pass every load and connection check.
- `utilisation-sheets.mjs`: floor, roof and four wall framing plans coloured by band, via `sheetSvg`. `drawings.mjs` is untouched.
- `render3d.mjs`: `solidsOf(shed, heat)` heat mode (framing only, coloured), `pickMember` (ray against each member's faces) and `viewer.pick(x, y)`.
- `utilisation-ui.mjs`, `index.html` and `app.mjs` (three lines): the Structure tab section, the target box (kept in localStorage), the "Colour by structural use" switch, the legend and tap-to-inspect. Usage event: `utilisation-opened`.
- Tests: `utilisation.test.mjs` has hand calculations for the floor joist (15.0%, bending) and the wall stud (15.4%, governed by D+0.6W, with the roof alone under 5%), a check that every preset is verified, and a sweep of more than 1,000 variations. `utilisation.browser.test.mjs` has 3 Playwright tests.
- Post: `docs/posts/2026-10-30-why-a-shed-joist-runs-at-15-percent.md`.

## The to-do list for r2 lane 1 (right-sizing) and r3 lane 3

The default 8x12 at a 70% target:

| Member | Use | Finding | Action for the right-sizing lanes |
|---|---|---|---|
| Ridge beam 2-ply 2x10 | 79% | above target; 2x8 fails at 118%, 2x12 at 59% | a ridge board with ties, or a 2x12 if a 70% margin is wanted |
| Ridge-beam posts 2-ply 2x4 | 25% | minimum practical size (bearing width of the 2-ply beam) | none |
| Rafters 2x6 at 24" | 18% | simply oversized: 2x4 passes at 39% | the simplify search already tries 2x4 rafters; consider them for the presets (check hanger fit) |
| Wall studs 2x4 at 16" | 15% | the T1-11 siding rating holds 16" (wind governs) | 24" o.c. needs LP 7/16" or lap over sheathing (23% at 24") |
| Floor joists 2x6 at 16" | 15% | simply oversized: 2x4 at 16" is 32%, at 24" is 48% | `levers.mjs` floorMoves (r2 lane 1, now on main) already tries 2x4 joists and 24"; the defaults and presets still use 2x6 at 16" |
| Headers 2-ply 2x6 | 4-12% | the smallest header the tool frames | single or flat headers on short openings, and no header on gable walls under a ridge board (r2 lane 1's opening framing) |

On ridge-board presets, the heel-joint nailing (70-97%) is the member doing the work.

## Open

- The Subfloor row from `levers.mjs` (joist spacing over the panel's span rating, 67% at 16" on a 24 oc panel) is listed and written out but has no members to colour; it is a panel.

- When PR #11531 merges (SYP species for treated joists), `beamWords` must pass the species and design values through, or the floor-joist breakdown will go unverified (the test catches this).
- 3D picking only works when the switch is on. r2 lane 3's "where is this used" highlighting could share `viewer.pick`.
- The coloured plans are screen and print only. A DXF version is not done.
- Cost per lighter option is not shown. r3 lane 3 or r2 lane 1's searches are the place for it.

## Next step

Feed `marginReport(...).far` items with reason `oversized` into the cheaper-build search as candidate moves (2x4 floor joists especially), and show the saving beside each.
