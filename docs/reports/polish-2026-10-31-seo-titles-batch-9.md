# Polish 2026-10-31: `seo_title:` batch 9, 22 hand-written titles (2026-10-26/27 posts)

**Weak surface.** `propose_seo_titles.py` reported 158 posts over the 70-character title budget with no clean cut; the newest remaining were from 2026-10-26 and 2026-10-27.

**Change.** Hand-wrote `seo_title:` (70 characters or fewer) for 22 of them; `h1` and structured data keep the full headline. Also added the missing `description:` to `2026-10-31-shed-dormer-roof-opening.md`, which made `writing.test.mjs` fail on main (PR #12089).

**Measured.** `node --test platform/pages/writing.test.mjs`: all pass after the fix (2 failures before, both from the missing description). Full site build not run. Rankings and click-through not measured.

**Still weakest.** About 136 older headlines over budget; continue newest first.
