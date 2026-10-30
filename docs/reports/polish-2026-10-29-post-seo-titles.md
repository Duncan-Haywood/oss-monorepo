# Polish 2026-10-29: query-shaped `seo_title` for 14 long recent posts

**Weak surface.** 482 of the posts in `docs/posts/` have a headline over the 70-character title budget
(counted from front matter, 2026-10-29), so the results page cuts the words after the first clause.

**Change.** Added the optional `seo_title:` front-matter field (each 70 characters or fewer, enforced
by `writing.mjs`) to the 14 longest headlines dated 2026-10-29. The `h1` and structured data keep the
full headline. `node --test platform/pages/writing.test.mjs`: 21 pass. Full site build not run here.

**Not measured:** rankings or click-through.

**Still weakest.** About 468 older headlines over budget. A build-time check could list them by
length; writing titles by hand is the judgment part, so do the newest first.
