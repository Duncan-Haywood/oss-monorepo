# Shed designer, round 3, lane 9: looks and rendering

Goal: it must look good to the homeowner and the HOA (owner and builder walk-through, 2026-10-29).

## Landed

### PR 1: colours, textures, lawn and sky, presentation mode
- `looks.mjs` (new): generic paint colours for siding, trim and door. Any `#rrggbb` from a picker is accepted for siding, trim and door, but not the roof, because shingles come in families. There are eight asphalt shingle families, each with a tab-to-tab blend amount. `paletteOf(design)` is the one place the 3D view (and later the drawings) gets colours. Older saved names (pink, hot pink, gold and so on) still load.
- `model.mjs`: `doorColor` ('stained' by default, or 'match siding', 'match trim', a paint or a hex). The pick lists come from `looks.mjs`.
- `render3d.mjs`:
  - shingle courses and blended tabs; a lap siding shadow line; T1-11 grooves;
  - a lawn with a contact shadow and a sun shadow, and a sky gradient;
  - `setOutlines` and `setScenery`;
  - **one shader variant per material class** (plain, siding, roof, lawn).
- `index.html` and `app.mjs`: a colour picker beside the siding, trim and door lists; a door colour list; and the Presentation button (no outlines or dimensions, a lower three-quarter view with sky). There are also "Board outlines" and "Lawn and sky" toggles.

Frame time, headless Chromium, SwiftShader. Mean of 60 orbit steps, each awaiting two rAFs, on the default 8x12. The script is in the scratchpad and described below.

| | main before | single shader | shipped (variants) |
|---|---|---|---|
| default view, 1366x900 | 54 ms | 80 ms | 45 ms |
| default view, 412x915 @2.6x | 54 ms | 84 ms | 48 ms |
| presentation, 412x915 @2.6x | (none) | 66 ms | 34 ms |

Why: software GL runs every branch for every pixel, so shader length is the cost. Removing only the shingle block saved about 13 ms.

How to measure: serve the venture folder and open the page with Playwright (`--use-gl=swiftshader`). Then dispatch 61 `ArrowLeft` keydowns on `#view3d`, awaiting `requestAnimationFrame` twice after each, and average the gaps.

Checks: `node --test` on all non-browser tests passed 150 of 150. `browser.test.mjs` passed 13 of 13, including axe, and gained a new presentation and colour test. `tsc --checkJs` (non-strict) on the changed modules gave 0 errors, the same as main. The size pages are unchanged after `make-size-pages.mjs`.

### PR 2: shade, shadow and texture on the HOA elevations (`hoa.mjs`, from r3 lane 5)
- Colours come from `paletteOf`, so the packet and the 3D view agree. That covers LP primer grey, vinyl white and hex codes. Names read generically: "gray-brown blend colour family", "sage green paint", "custom colour #...". There is a new "Door finish" row and a door swatch.
- The door is drawn in its paint colour unless it is stained.
- Shade and shadow at 45 degrees: a band under the eave as deep as the overhang plus the fascia, and a narrower band under the rake.
- Lap siding: a soft shadow strip under each butt line.
- Shingles: blended tabs 9" to 15" wide, staggered from course to course and shaded by the family's blend, with a seeded pattern so the same design prints the same drawing.
- I tried an earth hatch below grade and dropped it: it ran into the overall dimension text.
- Checks: non-browser tests passed 210 of 210, including a new elevation test in `hoa.test.mjs`. Browser tests passed 22, with axe skipped because no AXE path was set in that run.

## Open, next steps
- Hatching and texture on the elevation drawings (lap lines, shingle courses, T1-11 grooves) for the HOA sheets of r3 lane 5.
- Colours on the elevation drawings, from `paletteOf`.
