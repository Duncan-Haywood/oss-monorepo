# Polish 2026-11-02: `seo_title:` batch 13, and a build-breaking post on main

**Weak surface.** `propose_seo_titles.py` listed 2 new over-budget posts. Separately, `docs/posts/2026-11-02-ghana-zambia-tanzania-e-invoicing.md` (PR #12461) had a 186-character description and a 75-character `seo_title`, so `writing.test.mjs` failed on `main` (2 of 24) and the site build would have refused it.

**Change.** One clean cut applied by the script, one title hand-written (concrete-order fuzz, aerolog rough air). The e-invoicing post's description is cut to 160 or fewer and its `seo_title` to 68 characters, keeping the facts.

**Measured.** `node --test platform/pages/writing.test.mjs`: 24 of 24 pass (22 of 24 before). The script reports 0 proposed. Full site build not run. Rankings not measured.

**Still weakest.** Authors keep adding over-length fields and finding out only at merge. PR #12397 adds the missing-`seo_title` check; a pre-commit-style hook running `writing.test.mjs` on `docs/posts/` changes would catch the rest.
