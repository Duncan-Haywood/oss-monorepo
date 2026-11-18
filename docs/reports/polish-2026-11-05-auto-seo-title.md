---
kind: polish
topics: [seo]
date: 2026-11-05
tagged: auto
---
# Polish 2026-11-05: long post headlines get a results-page title automatically

**Weak surface.** Three `seo_title:` batches in a week (see `polish-2026-11-05-seo-titles-batch-15.md`): new posts kept landing over the 70-character title budget and turned `writing.test.mjs` red on main.

**Change.** `writing.mjs` now derives the title from a "Claim: detail" or "Question? detail" headline (`autoSeoTitle`, same rule as `propose_seo_titles.py`) when a post sets no `seo_title`. `propose_seo_titles.py --check` (and so the test) now fails only for headlines with no clean cut, which still need a hand-written `seo_title`. h1 and structured data keep the full headline.

**Measured.** `node --test platform/pages/writing.test.mjs`: 28 of 28 pass (one new test). Full site build not run. Rankings not measured.

**Next.** Posts without a clean cut still need a person; consider a clearer error message pointing at the headline rule. Weakest untouched surfaces: not re-surveyed this run.
