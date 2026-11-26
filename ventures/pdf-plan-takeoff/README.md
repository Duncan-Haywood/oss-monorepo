# PDF plan takeoff

Measure lengths, areas and counts on a construction drawing PDF in the
browser, with clicks that snap to the drawn line work. It reads each view's
printed scale note, checks the notes against the sheet's own dimension
strings, and says when a set was printed at half size. The takeoff exports
as CSV. Runs in the browser with no upload, or as a CLI scale report. MIT
licensed, no dependencies.

Live: https://marisstella.app/pdf-plan-takeoff/

## Why someone would use it

Estimators, subcontractors and owners' reps measure quantities off PDF plans
every day: linear feet of wall, square feet of flooring, counts of fixtures.
What they use today:

- **Bluebeam Revu** (about $260 to $440 a seat a year), **PlanSwift**,
  **On-Screen Takeoff**, **STACK** and similar: full takeoff and estimating
  products with a per-seat licence. Most read the scale only when you set it,
  page by page, and none of them tells you a sheet was printed at half size.
- **AI takeoff services** (Togal.AI and others) that detect rooms for you, on a
  subscription, with the plans uploaded to the vendor.
- **A free PDF viewer's measure tool** (Acrobat's, a browser's): you calibrate
  every page by hand and keep the numbers on paper.

What this does differently: free, nothing uploaded, an open algorithm, and a
**scale check** none of those do. A takeoff is a measured line times a scale;
the two common ways a scale goes wrong are a sheet with several views at
different scales and a set printed smaller than drawn (an 11x17 of a 22x34
set still says `1/4" = 1'-0"`, but every length is half and every area a
quarter). This tool picks each view's own note for a measurement, and divides
each dimension string's written value by the length of the line it labels to
find the scale the sheet is really at. It is not an estimating system
(pricing, assemblies, a project database); it is the measuring step, with a
CSV for the estimate you already keep.

## What it does

- **Reads the sheet's vector line work** (every stroked or filled path,
  curves flattened, Form XObjects entered) and its text with positions, with
  the PDF reader shared by the sibling ventures (`pdf-parser.mjs`,
  `pdf-text.mjs`). Pages with `/Rotate` (most Revit exports) display upright.
  A plan exported as image tiles is drawn from its decoded pixels (Flate
  images in node and the browser, JPEG through the browser's own decoder).
- **Scale notes** (`scale.mjs`): architectural (`3/16" = 1'-0"`,
  `1 1/2" = 1'-0"`), engineering (`1" = 20'`), full-size and enlargement
  (`3" = 1"`), metric (`1:100`) and `NTS`, joined from the separate text runs
  most CAD exports write them in. A measurement takes the note of the view it
  falls in: the note below it and at or left of it with the smallest drop
  (view titles sit under the view, at its left), else the nearest note.
- **Dimension check**: each feet-and-inches string (`24' - 0"`) is matched to
  the painted segment parallel to it, just below it, whose middle third its
  centre projects onto; fill edges are skipped (Revit draws an opaque mask
  behind each dimension's text). The span is measured between the witness
  lines that cross the dimension line on either side of the text, not to the
  line's ends, which Revit carries a little past them (on one sheet this alone
  moved the implied scales from 47.1-48.1 to 48.0). A dimension agrees with a
  scale when the line, scaled, is within 1% or half an inch of the written
  value (drafters round to the inch).
- **Verdict per sheet** (`sheetVerdict`): *confirmed* (at least 3 dimensions,
  and a quarter of those matched, agree with a printed note), *half size*
  (they agree with twice a note's ratio; measurements are then valued at the
  corrected scale, with a switch to undo it), *inferred* (no note, but the
  dimensions name a standard scale), *mismatch* (they name a scale no note
  gives) or *unchecked*.
- **Measuring**: length (polyline), area (polygon, with perimeter), count, and
  calibrate (two clicks and a typed length, feet-inches or metres). Clicks snap
  to segment ends, then midpoints, then the nearest point on a line
  (`measure.mjs`). Labels group measurements; the CSV gives one row each with
  the scale used and where it came from (the view's note, a chosen note, the
  dimensions, a calibration), then totals by label. Measurements are kept in
  the browser's storage for that file name and size.
- **Fill area** (`rooms.mjs`, experimental): rasterises the line work around a
  click at 2 px per point and flood-fills the region it closes. Curves are
  ignored (door swings, fixtures, furniture), so a door drawn with its leaf
  closes its opening and its swing does not cut the room; islands inside the
  region (furniture, tags) are filled back in; half of each boundary pixel is
  counted. The filled region is drawn over the sheet so you see what was
  measured. A region that runs off the 1,800-point window is refused as open.

## Use it

Browser: open `index.html` over http (`python3 -m http.server`), choose a PDF
or press **Try a sample plan**. The sample is a made-up 36' x 24' plan at
1/4" with a 1/2" wall section on the same sheet, and the same sheet printed at
half size on page 2.

CLI scale report:

```
node cli.mjs set.pdf            # every page: notes, dimensions matched, verdict
node cli.mjs set.pdf --json
```

Tests: `node --test engine.test.mjs page.test.mjs pdf-parser-sync.test.mjs`.

## How it was checked

Test sets: OpeningDesign's public architecture projects on GitHub, the 14
whole drawing sets the drawing-set-index venture fetches
(`sh ../drawing-set-index/eval/fetch.sh DIR`, pinned commits in its
`eval/sets.tsv`), 180 pages of mostly Revit sheets. Nothing from them is
stored here.

**Scale notes and the dimension check** (`node eval/scale-check.mjs
DIR/sets/*.pdf`, output `eval/scale-check-2026-11-23.txt`): 397 scale notes
on 142 of the 180 pages; 1,385 dimension strings matched to a line, 520 of them
agreeing with a note on their sheet. Most of the rest are elevation level
marks and schedule cells, which are feet-and-inches text that labels no line.
Verdicts: 44 pages confirmed, 3 inferred (no note; the dimensions say 1/8",
1/8" and 3/16"), 133 unchecked (3D views, schedules, details with fewer than
three dimensions). No page was called half size or mismatch.

**Half-size prints**: the same 180 pages with every coordinate and text size
times 0.5, as an 11x17 print of a 22x34 set. 43 of the 44 confirmed pages
were called half size, and the 3 inferred pages inferred twice their earlier
ratio (the true scale of the shrunk paper). The miss (og-20190309 p16) has
views at 1/4" and 1/2" on one sheet: a half-size 1/2" view measures exactly
like a full-size 1/4" one, so its dimensions confirm the 1/4" note. No
original page was called half size.

**Which note governs a spot**: on the 15 sheets with more than one scale, of
81 dimensions that agree with some note on their sheet, the below-left rule
picks that note for 61 and the nearest-note rule for 62. Neither is good
enough to trust blindly on multi-scale sheets, so the page names the note each
measurement used and lets you pick another.

**Fill area against Revit's room tags** (`node eval/room-areas.mjs
DIR/sets/*.pdf`, output `eval/room-areas-2026-11-23.txt`): every `NNN SF`
text on a sheet is a room tag Revit computed from its own room boundary; the
tool is clicked at the tag. Of 298 tagged rooms on 7 sets, 237 gave an area and
61 were refused (open, or the tag sat on a line), and only 3 came within 1%,
5 of 298 within 2% and 8 within 5%. The reason is visible in the sets: their
plans are exported as image tiles (walls are pixels, with floor patterns and
door openings with no leaf), and the vector dimension and grid lines cross
the rooms. Skipping the dimension pen's width (`annotationWidths`) made it
worse (141 measured, 4 within 2%,
`eval/room-areas-skip-annotation-2026-11-23.txt`), because the rooms then leak
through door openings. On the sample's vector office (12' x 10' clear, door
drawn with leaf and swing) it gives 120.5 SF. So: trace rooms with the Area
tool on raster or annotation-heavy sheets; Fill is for outlines the line work
truly closes.

**Reading speed** (2026-11-26): the same 14 sets, before and after one
perf pass, outputs hashed identical. The densest, a 19-sheet set with 28 MB
of drawing instructions, reads in 1.4 s in Chromium, down from 2.1 s; a
25-sheet set in 0.8 s, down from 1.25 s. Notes:
`docs/history/pdf-plan-takeoff-perf-2026-11-26.md`.

## Limits

- The scale check needs feet-and-inches dimension strings: metric dimensions
  (bare millimetre numbers) are not matched yet, so metric sheets are
  checked against notes only when calibrated.
- Two scales on one sheet in a 2:1 ratio cannot be told from a half-size print
  by dimensions alone (above).
- Fill area is weak on raster plans and on open plans (above).
- Snapping uses vector line work only; on an image-tile plan clicks land where
  you put them.
- A drawing marked `NTS` or with no scale needs a calibration, and scaled
  measurements never override written dimensions.

## Next

- Close door openings for Fill area: find door leaves and openings in the
  wall line work, then score again on the 298 tagged rooms (and find a public
  set with vector walls and room tags).
- Metric dimension strings (millimetres along a dimension line) for the check.
- Per-view scale regions from the view's crop box when the PDF carries one
  (Revit writes view boundaries as clip paths), instead of the below-left rule.
- Display the original raster tiles in colour; the line view shows ink only.
- Sheet-to-sheet comparison of the same measurement across revisions.

## Files

- `geometry.mjs` reads pages: segments (with paint kind, pen width, curve
  flag), image placements and decoding, text runs.
- `scale.mjs` scale notes, feet-inches, phrases, dimension matching, verdicts.
- `measure.mjs` snapping, values, CSV.
- `rooms.mjs` fill area.
- `index.html` the page; `usage.mjs` anonymous local counters.
- `cli.mjs` scale report.
- `read-once.test.mjs` pins the 2026-11-26 reading speed-ups to the code
  they replaced.
- `sample.mjs` the sample plan PDF.
- `pdf-parser.mjs`, `inflate-browser.mjs` vendored byte for byte from the
  sibling PDF ventures (`pdf-parser-sync.test.mjs` keeps the five copies
  equal); `pdf-text.mjs` copied from drawing-set-index with its tokenizer and
  page helpers exported.
- `eval/` the scripts and their outputs.

## Disclaimer

Provided free and as-is, without warranty of any kind. It is not legal,
construction, engineering, estimating or professional advice. It can misread a
scale, snap to the wrong line or mismeasure; drawings are often not to scale,
and written dimensions govern over scaled ones. You are responsible for
verifying its output before relying on it.

## Licence

FSL-1.1-MIT, see `LICENSE`.
