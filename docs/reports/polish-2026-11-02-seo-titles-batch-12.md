# Polish 2026-11-02: `seo_title:` batch 12, the last 6 over-budget posts

**Weak surface.** `platform/pages/propose_seo_titles.py` listed 6 posts (2026-11-01 and 2026-11-02) whose headline is over the 70-character title budget and had no `seo_title:`.

**Change.** Two clean cuts applied by the script; four titles hand-written (70 characters or fewer, asserted). `h1` and structured data keep the full headline.

**Measured.** The script now reports 0 proposed, 0 with no clean cut. `node --test platform/pages/writing.test.mjs`: 24 of 24 pass. Full site build not run. Rankings and click-through not measured.

**Still weakest.** No over-budget posts remain, so each new long headline needs a `seo_title:` when written. Next polish: a check that fails the build on a missing one (writing.mjs enforces the budget only), or a visual pass on a flagship page.
