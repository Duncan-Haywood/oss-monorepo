# Shed designer, round 3, lane 5: the HOA packet

## Brief

The owner and a builder, 2026-10-29, for a real shed under 100 sq ft: the HOA wants to see the shed on all sides, with dimensions, and where it goes, as a PDF.

## What landed

- **`hoa.mjs`** builds the packet:
  - `sidingLook(type)`: the siding's direction and line spacing. Vinyl, fiber cement and any type named lap, Hardie, plank or clapboard draw level; T1-11, board and batten and panels draw upright.
  - `sidingFinish(d)`: the siding's colour as a name and a hex value. A `#rrggbb` siding, roof or trim colour is accepted, ready for a "match the house" colour.
  - `elevationSvg(shed, wall)`: one coloured elevation with its dimensions.
  - `packetSummary(shed)`: the label and value rows.
  - `packetHtml(shed, { perspective })`: the four pages.
  - `encodeDesign` and `decodeDesign`: the `#d=` link format the designer already uses.
- **`hoa-packet.html`** and **`hoa-page.mjs`**: the page.
  - It reads `#d=` or `#preset=<name>`.
  - It renders the 3D view off-screen with `createViewer` and `snapshot()`, and a box turns it off.
  - It prints Letter landscape with `@page`.
  - Its sample links cover every key in `PRESETS`.
  - It counts `hoa-packets` in `usage.mjs`, on device only, with the designer's opt-out.
- **Plans tab:** an "HOA packet (PDF)" button opens the page with the current design (`app.mjs`, one listener).
- **Site plan:** the packet reuses the plan set's own site sheet, from PR #11542 (round 2, lane 5), by looking for `buildSheets(shed)` sheet id `site`. It rebuilds nothing. Until #11542 merges, the packet shows a box to sketch the site plan in. I checked against #11542's `model.mjs` and `drawings.mjs` patched into a scratch copy: the site sheet appears in the packet, and `hoa.test.mjs` passes both ways.

## Verification

- `hoa.test.mjs`, 20 tests, for every preset:
  - all four views are in the packet;
  - each view has its wall length or width, the ground to wall top and ground to peak heights, and the pitch, and a gable end also has eave to eave;
  - each view has every door, window and vent on its wall, labelled with its size;
  - the summary gives the area, peak, pitch, siding, roofing and trim colours.
- It also checks:
  - the chain adds up to the wall;
  - lap siding draws level, and T1-11 draws upright;
  - the colours are the ones chosen;
  - the 3D view appears only when asked for;
  - the site page is the site sheet when one exists;
  - there is no "permit-ready" or "approved" claim, and the disclaimer is on every page;
  - the link survives the round trip;
  - the page's ids, script and disclaimer are present.
- After merging `main` (2026-10-30), the whole suite (`node --test *.test.mjs`) ran 190 tests: 189 pass, 0 fail, 1 skipped. `node platform/pages/typecheck.mjs shed-designer` gives 0 diagnostics.
- In headless Chromium, the 8x12, the 12x16 and a gray fiber-cement 8x12 on a typed lot were rendered and printed to PDF with `page.pdf`, and checked by eye. There were no console errors.

## Open, and the next step

- **When #11542 merges,** the site page fills in by itself. The site sheet's own title block then prints inside the packet page; a cropped version without the title block would look cleaner.
- **Gallery designs:** if a round 3 lane adds pre-optimised gallery designs as a new export rather than `PRESETS`, add them to the sample links in `hoa-page.mjs`. It is one line.
- **Lap siding as a type:** the owner wants horizontal lap siding painted to match a HardieBoard house. The packet already draws fiber cement as lap. A new siding type with "lap" in its name draws correctly with no change here, and a `#rrggbb` colour field would let the swatch match the house's paint.
- **Sitemap:** `hoa-packet.html` is not in `sitemap.xml`, which `make-size-pages.mjs` writes, and PR #11524 is moving that to the site build. Add it there once that settles.
- **Possible addition:** a dimensioned roof plan (top view with the overhangs). Some HOAs ask for one.
