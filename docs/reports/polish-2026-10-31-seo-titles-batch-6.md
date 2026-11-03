# Polish 2026-10-31: `seo_title:` batch 6, 22 hand-written titles (2026-10-28 posts)

**Weak surface.** `propose_seo_titles.py` still reports 224 posts over the 70-character title budget with no clean ": " or "? " cut.

**Change.** Hand-wrote `seo_title:` (70 characters or fewer) for the next 22 newest posts without one, all from 2026-10-28. The `h1` and structured data keep the full headline. Also shortened the description and `seo_title` of `2026-10-31-what-the-walls-of-a-house-lose-in-a-winter.md`, which broke `writing.test.mjs` on `main` (169-character description, 78-character `seo_title`).

**Measured.** `node --test platform/pages/writing.test.mjs`: 21 pass, 0 fail (2 failed before the wall-heat-loss fix, from that post). Full site build not run. Rankings and click-through not measured.

**Still weakest.** About 202 older headlines over budget; continue newest first. A check that fails a post's own PR on an over-budget description would have caught the wall-heat-loss post before merge. Flagship first-screen call-to-action at 390 px and Lighthouse remain open.
