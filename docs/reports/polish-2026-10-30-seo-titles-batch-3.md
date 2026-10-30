# Polish 2026-10-30: `seo_title:` batch 3, the next 25 long headlines

**Weak surface.** 491 posts in `docs/posts/` had a headline over the 70-character title budget and no
`seo_title:` (counted from front matter, 2026-10-30, after batch 2).

**Change.** Added `seo_title:` (70 characters or fewer, enforced by `writing.mjs`) to the 25 newest of them
(the 2026-10-30 babysitting, hydraulics, bookkeeper and scheduling posts). The `h1` and structured data keep the full headline.

**Measured.** `node --test platform/pages/writing.test.mjs`: 21 pass, 0 fail. Full site build not run.
Rankings and click-through not measured.

**Still weakest.** About 466 older headlines over budget. A script that proposes titles for an agent to edit
would beat hand batches. First-screen call-to-action on flagship pages at 390 px and Lighthouse remain open.
