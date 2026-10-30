# Polish 2026-10-30: `seo_title:` batch 2, the next 25 long headlines

**Weak surface.** 512 posts in `docs/posts/` had a headline over the 70-character title budget and no
`seo_title:` (counted from front matter, 2026-10-30, after batch 1), so search results cut titles mid-phrase.

**Change.** Added `seo_title:` (70 characters or fewer, enforced by `writing.mjs`) to the 25 newest of
them, all dated 2026-10-30. The `h1` and structured data keep the full headline.

**Measured.** `node --test platform/pages/writing.test.mjs`: 21 pass, 0 fail. Full site build not run.
Rankings and click-through not measured.

**Still weakest.** About 487 older headlines over budget; list them with the front-matter count above and
do the newest first (a script that proposes titles for a human or agent to edit would beat hand batches).
Earlier open items: first-screen call-to-action on flagship pages at 390 px, Lighthouse not run.
