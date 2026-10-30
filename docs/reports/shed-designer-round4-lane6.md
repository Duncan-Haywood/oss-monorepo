# shed-designer round 4, lane 6: cutting layouts, plans and the HOA packet

2026-10-30. This lane was built from the "Open" and "Next step" sections of the round2-lane5, round3-lane5, round3-looks and round3b-renders reports.

## Landed

| PR | What |
|---|---|
| #11854 | **Cutting layout sheet.** `cutlayout.mjs` rebuilds the estimate's sheet packings with positions: `sheetCount2d`'s four strategies, and `sidingUpperSheets`' head-to-toe nesting of sloped gable pieces. `cutting-sheets.mjs` draws every 4x8 the list buys (floor, roof, loft or attic deck, and siding or lap sheathing above the lower panels) as a plan sheet, for print, SVG and DXF. `cutlayout.test.mjs` holds the drawn count equal to the bought count, with no overlaps, across the presets, the gallery and 60 seeded designs. |
| #11857 | **Worked-example facts can't drift.** `workedfacts.mjs`: `node workedfacts.mjs --write` rewrites every `data-fact` span on `shed-plans-with-cut-list.html` and the "N pieces from M boards" in `llms.txt`. `make-size-pages.mjs`, which the site build runs through `generated-pages.mjs`, calls the same refresh. `marketing.test.mjs` stays strict and names the command. |
| #11865 | **Site plan:** door wall faces the street or the left, right or rear lot line (a quarter turn; the eaves and the eave setback check follow it); a north arrow in 8 directions; an easement strip with a note and a warning when the shed is in it. **HOA packet:** the site sheet is drawn without its title block (`sheetSvg` `meta.bare`); a 3D corner select whose "auto" shows the door (`cornerFor`); sample packets for the 11 gallery designs; samples from the front-right corner use the stored render (hero, else card); and a fix for negative-width shingle tabs, which logged 18 SVG errors per packet. |
| this PR (#11851) | **Share picture.** `share.mjs` makes a page's own relative `og:image` absolute and copies it to `twitter:image`. `check.mjs` allows `.jpg`. `make-renders.mjs` draws `renders/og-8x12-share.jpg`, 1200x630, via `EXTRA_VIEWS` (kept out of `VIEWS` so no stored picture is re-hashed). The three venture pages name it. `build.test.mjs` now accepts a venture's own `og:image` when it lies under the venture's directory and the file exists. |

Posts: `2026-10-30-a-shed-link-that-shows-the-shed.md`, `2026-10-30-every-shed-sheet-drawn.md`, `2026-10-30-a-shed-site-plan-an-hoa-can-read.md`.

## Deviations

- **Site-plan defaults.** The new fields (`siteFacing`, `northDeg`, `easementSide`, `easementFt`, `easementNote`) default in `normalize`, not `defaultDesign()`. Adding them to `defaultDesign()` would change every preset's `designKey` and mark all stored renders stale. The `Design` typedef carries them as `Partial<SiteExtras>`.
- **"Reuse triangle offcuts":** done for the pieces above the lower siding panels, which is where the count already nested them. The triangle cut off a full-height gable panel's top, when it is clipped to the rake, is not reused. Only designs with strips above 8 ft panels have such pieces, and the count does not assume it.
- **PR 1's CI:** two red checks come from `main`, not this lane: `research_live_links` (`research/marine-path/README.md`) and `faq-visible` (`shift-roster-builder`). PRs were merged on local verification, as CLAUDE.md allows.

## Open, next steps

- **Barn roof packing.** The 10x10 barn's roof buys 6 sheets for 4.78 sheets of area. A quick try by hand found no 5-sheet layout that keeps each piece's strength axis across the rafters. A small exact search over guillotine layouts would settle it.
- **Street name** on the site plan is still a hand-filled blank, on purpose: the tool asks for no address.
- **North arrow** has 8 directions. A free angle would need a number field; nobody has asked for one.
- **Share picture freshness.** `og-8x12` re-hashes whenever the default 8x12 changes, like every stored render. The Pages build redraws it. Run `make-renders.mjs` when batching a refresh.
- **Tool card.** The platform's drawn tool card for shed-designer is still drawn but no longer named by the page. `two tools never render the same share card` still passes.
- **Local `build.test.mjs` runs rewrite `ventures/shed-designer/gallery-data.mjs`** (lane 3's deploy-time search). Don't `git commit -a` after one. I did once and reverted it.

## Verification

Every PR: `main` merged in, then `node --test *.test.mjs` in the venture (final runs 409 to 438 tests, 0 failures, 3 skips), `typecheck.mjs shed-designer` with 0 diagnostics, and `make-renders.mjs --check`. Platform: `share.test.mjs` with `check.test.mjs` (124/124), `generated-pages.test.mjs` (3/3), and `build.test.mjs` share-card tests (7/7). Browser: `hoa-packet.html` and `index.html` in Playwright with 0 console errors, and screenshots of the cutting and site sheets.
