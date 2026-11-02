# Polish 2026-11-02: `seo_title:` batch 13, the last over-budget headline

**Weak surface.** `platform/pages/propose_seo_titles.py` reported one post over the 70-character title budget with no clean cut (the 2026-11-02 excavator regeneration post, 72 characters).

**Change.** Hand-wrote `seo_title:` (62 characters) for it. The checker now reports 0 proposed, 0 with no clean cut.

**Measured.** `node --test platform/pages/writing.test.mjs`: 24 pass. Full site build not run. Rankings and click-through not measured.

**Still weakest.** New posts arrive daily; the next run should re-run the checker first. Bigger levers remain: answer-first leads beyond the pilot and missing `llms.txt` files.
