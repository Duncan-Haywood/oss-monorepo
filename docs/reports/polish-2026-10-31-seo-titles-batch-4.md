# Polish 2026-10-31: `seo_title:` batch 4, 22 hand-written titles for headlines with no clean cut

**Weak surface.** `propose_seo_titles.py` reported 268 posts over the 70-character title budget with no ": " or "? " cut.

**Change.** Applied the script's one new proposal, then hand-wrote `seo_title:` (70 characters or fewer) for the 22 newest posts without one
(2026-10-29 and 2026-10-30). The `h1` and structured data keep the full headline.

**Measured.** `node --test platform/pages/writing.test.mjs`: 21 pass, 0 fail. Full site build not run. Rankings and click-through not measured.

**Still weakest.** About 246 older headlines over budget; the same hand batch, newest first, continues. First-screen call-to-action on
flagship pages at 390 px and Lighthouse remain open.
