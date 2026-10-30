# Polish 2026-10-30: `seo_title:` for the 25 newest long headlines, and a red test fixed

**Weak surface.** 489 posts in `docs/posts/` had a headline over the 70-character title budget and no
`seo_title:` (counted from front matter, 2026-10-30), so search results cut the title mid-phrase.

**Change.** Added `seo_title:` (each 70 characters or fewer, enforced by `writing.mjs`) to the 25 newest
of them, dated 2026-10-29 and 2026-10-30. The `h1` and structured data keep the full headline. Also
shortened one post description (stair stringer calculator, 180 characters, limit 160) that made
`writing.test.mjs` fail on `main` and would have failed the site build.

**Measured.** `node --test platform/pages/writing.test.mjs`: 21 pass, 0 fail (19 pass, 2 fail before the
description fix). Full site build not run. Rankings and click-through not measured.

**Still weakest.** About 464 older headlines over budget; list them with the front-matter count above and
do the newest first. Earlier "next" items still open: first-screen call-to-action on flagship pages at
390 px (`ai-bookkeeper`), Lighthouse not run.
