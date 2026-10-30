# Polish 2026-10-29: the site build was failing on post front matter

**What happened.** Starting a polish run, `node platform/pages/build.mjs` on `main` stopped at
`docs/posts/2026-10-29-a-wandering-series-is-not-a-staircase.md: seo_title is 73 characters; keep it to 70`.
A build that throws means the Pages deploy does not publish, so no merged page went live while it stood.

**Cause.** `seo_title` (added the same day, `polish-2026-10-29-seo-title.md`) is held to `TITLE_BUDGET` = 70.
Parallel runs wrote posts with long `seo_title`s before that rule reached their branches. In total six posts had a
`seo_title` over 70 characters (73, 79, 77, 76, 74, 81) and two had a description of 161 characters (limit 160).

**Fix.** Shortened the six titles and two descriptions; no post body changed. `node --test
platform/pages/writing.test.mjs`: 21 pass, 0 fail (it fails on exactly these before the edit, via "every committed
post loads"). The check already existed; the posts merged while the rule was new, so nothing new to add.

**Next.** Posts written in parallel with a front-matter rule change can break `main` until the next run; running
`node --test platform/pages/writing.test.mjs` before merging a post is the cheap guard (seconds, not the 20-minute
build). Remaining weakest surfaces are unchanged from `polish-2026-10-29-flagship-cta-row.md`. Lighthouse not run.
