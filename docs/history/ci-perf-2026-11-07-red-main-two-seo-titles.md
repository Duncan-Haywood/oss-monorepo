# Perf run 2026-11-07: reading the site-builder suite, and two red-main posts

Reading: `node --test "*.test.mjs" "cloudflare/*.test.mjs"` in `platform/pages`
on a cold card cache, one container: 7m34s wall, 20m user, 1458 pass, 1 fail.
The slow entries (first callers of the shared builds, 70 to 285 s) are the
known lazily-shared builds from `pages-test-perf-2026-11-06-reading-top-two-tests.md`;
a cold, contended local run says nothing new about them. Nothing changed there.

The one failure was real: `no committed post is over the title budget without
a seo_title` named `the-jar-in-the-vestry-cupboard` and `the-hole-that-was-wider`
(both 2026-11-07). Fix: a short `seo_title` on each. Suite file re-run: passes.

Not changed: P063 (ventures-tests sparse checkout) edits `.github/`, which
CODEOWNERS holds for the owner; the 30+ one-line steps in portfolio-validate
(about 1 to 3 s each of step overhead) are the same kind of edit.
