# Polish 2026-11-01: `seo_title:` batch 12, the five newest over-budget posts

**Weak surface.** `propose_seo_titles.py` listed 5 posts (all 2026-11-01) over the 70-character title budget; one had a clean cut, four did not.

**Change.** Added hand-written `seo_title:` (70 characters or fewer, asserted) to all five; `h1` and structured data keep the full headline. The script now reports 0 proposed, 0 with no clean cut.

**Measured.** `node --test platform/pages/writing.test.mjs`: 22 of 22 pass. Full site build not run. Rankings and click-through not measured.

**Still weakest.** No over-budget headline remains. Next polish: run `platform/pages/surface-budget.mjs` or screenshot the hub and a flagship at phone width.
