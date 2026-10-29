# Shed Designer overnight, lane 2: plans, drawings and cut sheet

Session: https://claude.ai/code/session_01XpHqycCR7esoCNZ2PusK5P (2026-10-29). Read-only audit while PR #11268 was open, then three PRs after it merged.

## What landed

| PR | What | Evidence |
|---|---|---|
| #11311 | `optimize.mjs` solves the cutting-stock LP by column generation (revised simplex over patterns, branch-and-bound knapsack pricing), rounds its patterns and packs the rest, and keeps the cheaper plan. The summary compares the cut sheet (not lumber with spares) with the bound. | 51 designs, 257 cut lists: orders $36,041.76 to $35,766.03; bound $33,648.81 to $35,614.35 (gap 7.1% to 0.4%); 171 proven optimal. Brute force on 60 small cases: 60/60 optimal (old 55/60), and the bound is never above the optimum. |
| #11314 | Plans print (they were blank), fit the page (overall wall length was under the title block), rafter cut length dimensioned long point to long point, connector-seat roof line, every part mark lettered on some sheet. New `plans.test.mjs`. | 6 of its 7 tests fail on the pre-fix code. ezdxf 1.4.5 audits the DXF from all 7 presets with 0 errors. |
| #11319 | The cut sheet counts identical boards together (the default shed's printed cut sheet goes from 6 pages to 2), keeps its colours in print, gives trim offcuts the kerf, and the CSV gets one row per set of boards. The site-built door's build step names its marks. | Tests in `estimate.test.mjs` and `instructions.test.mjs`; PDFs printed in headless Chromium. |

| #11320 | Floor and roof sheet counts rip narrow rows from shared sheets (`sheetCount2d`, the lower of that and plain length packing). Also fixed three red checks that #11322 and #11315 left on `main`: a run record without `pr`, a `money()` signing inside the `$`, and the size-page index with no JSON-LD; and regenerated the size pages. | Default roof 6 to 4 sheets, 8x12 classic roof 6 to 5, 10x12 floor 5 to 4; no count below the area; no size page's total went up. |

## Tools left in the scratchpad pattern (rebuild them if needed)

- Print check: load the page in Playwright, click a results tab, set `document.body.dataset.print` to `plans`, `cuts` or `build`, then `page.pdf({ preferCSSPageSize: true })`. Count the pages, and run `pdftotext` to confirm there is text.
- Optimizer comparison: for every preset and `generateCandidates` variant, feed each material's cut pieces to the old and new `optimizeCuts` at `examplePrices()`.

## Open, for the next run

- **Size pages drift on every pricing change.** `size-pages.test.mjs` compares the committed `how-much-lumber-for-a-*-shed.html` pages with what the engine prints now, so any PR that moves a whole-shed total (#11315's nail count did) turns `changed-ventures` red for the next PR until someone runs `node ventures/shed-designer/make-size-pages.mjs`. Either print only figures that change rarely (pieces, boards, lumber) on those pages, or build them in the Pages workflow instead of committing them. The second is the "software for the routine" answer.
- **shift-roster-builder `page.test.mjs` #171** ("call-out page's table is what the engine returns for the sample cafe") fails on `main` as of 2026-10-29 06:20 UTC. It is not shed-designer's; reproduced locally.

- **Spares rule** (`estimate.mjs`, "Spare boards"): one spare per material in the most common length. A better cut plan can switch which length is most common and make the spare dearer. On the default design it ate the $3.06 the 2x6 cut plan saved, plus $0.60. A spare in the cheapest length that holds the longest piece of that material would be steadier. This is a pricing choice, not a bug.
- **Optimizer gap:** 86 of 257 cut lists are not yet proven optimal (0.4% in all). Iterated LP rounding (re-solve on the leftovers, fix the strongest pattern, repeat) closed only $32 of it and made 5 more proven optimal, at up to 240 ms per list. That is too slow for the design searches, so it is not shipped. Branch-and-price would close the rest. It is not worth it at these sizes unless prices change the picture.
- **Auto overhang:** with exact packing the default design's automatic overhang went from 9" to 6", because 9" now costs $2.87 more in 2x6. If a longer overhang is wanted, make the rule "longest within $X" rather than "no more lumber".
- **Stud centre labels:** on the wall sheets they are 7 px and touch when a king and a jack stand 1-1/2" apart. They are readable on a landscape print. The build instructions list the same centres in text.
- **Sheet goods:** floor and roof sheets are now counted with narrow rows ripped side by side from shared sheets (`sheetCount2d`, fourth PR). Strips of different widths are not mixed, and offcuts of full sheets are not ripped for strips, so a full 2-D cutting layout could still save a sheet now and then. Siding is still counted 1-D.
