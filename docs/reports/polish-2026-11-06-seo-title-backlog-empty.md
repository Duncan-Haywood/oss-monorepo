---
kind: polish
topics: [seo]
date: 2026-11-06
tagged: auto
---
# Polish 2026-11-06: seo_title backlog is empty

**Change.** `propose_seo_titles.py --apply` wrote one `seo_title:` (the 2026-11-06 Christian-belief-models post, 98-character headline cut to 62).

**Measured.** `propose_seo_titles.py` now reports 0 over-budget headlines with no clean cut. `node --test platform/pages/writing.test.mjs`: 28 pass, 0 fail. `missing_llms_txt.py`: nothing missing. No site build, no screenshots, no ranking data.

**Still weakest.** Both script-fixable backlogs (titles, llms.txt) are empty. Undone: 390 px screenshots of the research index and Stories page, flagship first-screen call to action, Lighthouse.
