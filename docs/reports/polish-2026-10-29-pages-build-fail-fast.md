# Polish 2026-10-29: the Pages build failed on one post description; it now fails fast

**Weak surface.** `node platform/pages/build.mjs` on `main` (c2ac2c29) threw after the
product loop: `docs/posts/2026-10-29-flagship-tools-now-open-on-a-button.md: description is 170
characters; keep it to 160` (`writing.mjs`, `loadPost`). A build that throws deploys nothing, so
every polish change merged after that post was unpublished until fixed. It is the same class as
#11445.

**Change.**
- Shortened that post's `description` (now under 160; `check_post_frontmatter.py` exits 0).
- `portfolio-pages.yml` runs `platform/ci/check_post_frontmatter.py` (about a second) before
  "Build the site" (7 to 20 minutes), so the next such slip fails at once with the file named.
  The checker already ran on PRs (`portfolio-validate.yml`); this covers the push-to-main path.

**Measured.** Before: build threw as above. After: see PR for the build result. Not measured: how
long the site was stale (deploy history not read).

**Next.** Still weakest from earlier runs: 1,300 generated `llms.txt` files are thin, 16 ventures have
none; a screenshot pass on the hub and Stories at phone width has not been done this week.
