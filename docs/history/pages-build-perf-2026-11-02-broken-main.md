# Pages build failed on main: a 73-character seo_title (2026-11-02)

Perf track run. Starting a cold `node platform/pages/build.mjs` on `main` at
5b432f89 exited 1 after 46 s: `docs/posts/2026-11-02-pricing-a-league-schedule-pack.md`
had a 73-character `seo_title` (limit 70), and `writing.mjs` throws on it.
`python3 platform/ci/check_post_frontmatter.py` reported the same, so the
deploy would have failed on the next three-hourly run.

Fix: a 60-character `seo_title`. After: the build exits 0 in 2 m 04 s
(bash `time`, one run, shared container), and the checker exits 0.

Timing reading for the next run: cold build 123 s wall, 3 m 56 s user, so the
main thread still idles about half the time (see
`pages-build-perf-2026-11-01-deflate-level.md`).

Not changed: the post-front-matter check is not a required check on the PR
that adds posts, which is how this reached `main`. Worth confirming it runs
on every `docs/posts/**` change.
