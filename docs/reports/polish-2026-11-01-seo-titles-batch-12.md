# Polish 2026-11-01: `seo_title:` batch 12, 21 titles (2026-10-22/24 and 2026-11-01 posts)

**Weak surface.** `propose_seo_titles.py` still listed posts over the 70-character title budget: 1 clean cut (applied) plus the newest 20 with none.

**Change.** Added `seo_title:` (25 to 70 characters, asserted) to 21 posts; `h1` and structured data keep the full headline.

**Measured.** `node --test platform/pages/writing.test.mjs`: 22 of 22 pass. Full site build not run. Rankings and click-through not measured.

**Still weakest.** About 12 older headlines over budget; rerun the script's no-clean-cut count and continue newest first.
