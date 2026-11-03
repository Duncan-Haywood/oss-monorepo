# Polish 2026-10-31: `seo_title:` batch 7, 22 hand-written titles (2026-10-27 and 28 posts)

**Weak surface.** `propose_seo_titles.py` reported 202 posts over the 70-character title budget with no clean ": " or "? " cut.

**Change.** Hand-wrote `seo_title:` (70 characters or fewer) for the next 22 newest posts without one (2026-10-27 and 2026-10-28). The `h1` and structured data keep the full headline. Also shortened the over-budget `seo_title` (78 characters) of `2026-10-31-framing-a-gable-dormer-from-four-numbers.md`, which failed `writing.test.mjs` on `main`.

**Measured.** `node --test platform/pages/writing.test.mjs`: 21 pass, 0 fail (2 failed before the dormer fix). Full site build not run. Rankings and click-through not measured.

**Still weakest.** About 180 older headlines over budget; continue newest first. The recurring over-budget `seo_title` on new posts suggests a pre-merge check on a post's own PR. Flagship first-screen call-to-action at 390 px and Lighthouse remain open.
