---
kind: polish
topics: [seo]
date: 2026-11-03
tagged: auto
---
# Polish 2026-11-03: `seo_title:` batch 15

**Weak surface.** `platform/pages/propose_seo_titles.py` reported two new posts (gap probes 20 and 21) over the 70-character title budget with no clean cut.

**Change.** Hand-wrote `seo_title:` for both (68 and 66 characters), query-shaped, leading with "AI bookkeeper test".

**Measured.** Checker: 0 proposed, 0 with no clean cut. Full site build not run. Rankings not measured.

**Still weakest.** New posts arrive daily; re-run the checker first. The test `no committed post is over the title budget` in `writing.test.mjs` already guards this, so the larger lever is answer-first leads beyond the pilot.
