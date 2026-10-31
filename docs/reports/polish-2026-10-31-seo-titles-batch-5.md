# Polish 2026-10-31: `seo_title:` batch 5, 22 hand-written titles (2026-10-28 and 2026-10-29 posts)

**Weak surface.** `propose_seo_titles.py` reports 246 posts over the 70-character title budget with no clean ": " or "? " cut.

**Change.** Hand-wrote `seo_title:` (70 characters or fewer) for the next 22 newest posts without one. The `h1` and structured data keep the full headline.

**Measured.** `node --test platform/pages/writing.test.mjs`: 21 pass, 0 fail. Full site build not run. Rankings and click-through not measured.

**Still weakest.** About 224 older headlines over budget; continue newest first. Flagship first-screen call-to-action at 390 px and Lighthouse remain open.
