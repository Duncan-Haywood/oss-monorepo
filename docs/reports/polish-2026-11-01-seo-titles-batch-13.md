# Polish 2026-11-01: `seo_title:` batch 13, 17 titles (newest posts over budget)

**Weak surface.** Posts whose headline is over the 70-character title budget and has no `seo_title:`.

**Change.** `propose_seo_titles.py --apply` wrote 2 clean cuts; 15 more were hand-written (70 characters or fewer), newest first, back to 2026-10-20.

**Measured.** `node --test platform/pages/writing.test.mjs`: 22 pass, 0 fail. Full site build not run. Rankings and click-through not measured.

**Still weakest.** Older headlines over budget remain; rerun the script's listing and continue newest first.
