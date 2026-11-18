# Pages builder tests failed on main: three over-long post fields (2026-11-02)

Perf track run. `node --test "*.test.mjs"` in `platform/pages` on `main` at
59aa043b: 1396 tests, 168 failed, 66 s. One cause: `loadPosts()` threw on
`2026-11-02-a-framing-calculator-that-froze-on-one-typo.md` (`seo_title` 76
characters, limit 70), so the first test that builds the site spent 53.8 s
before failing and the other 167 failed behind it. The deploy would have
failed on the next three-hourly run.

`python3 platform/ci/check_post_frontmatter.py` also flagged
`2026-11-02-japan-invoice-credit-drops-to-50-percent.md` (`seo_title` 80,
`description` 163 chars, limit 160).

Fix: shorter `seo_title` on both posts and a trimmed description. The checker
exits 0 afterwards.

Not changed, ranked:
1. This is the second time in a day (see `pages-build-perf-2026-11-02-broken-main.md`).
   `portfolio-validate.yml` runs the checker on `docs/posts/**`, so the PRs
   merged anyway (starved runners or merged without waiting). A cheap
   guard: an authoring-time check run by whatever creates posts. A workflow
   edit belongs in its own small control-plane PR.
2. A pre-flight `loadPosts()` as the first test would fail in under a second
   instead of 54 s plus 167 cascaded failures.

Third post: `2026-11-02-a-wall-that-meets-a-door.md` had a title over budget
and no `seo_title`; `writing.test.mjs` caught it via
`propose_seo_titles.py --check`. Added one. After the fix the full suite ran
1396 tests, 1394 pass (508 s wall, shared container, versus 66 s of mostly
cascaded failures before). The remaining failure, "an identical build
produces an identical cache name", compared hashes while I was editing docs
under the running suite, so it is a self-inflicted race; CI is the check.

Postscript: while this PR was open another session fixed the first two posts on main; the merge kept main's versions, and this PR's remaining change is the third post's seo_title plus this note.
