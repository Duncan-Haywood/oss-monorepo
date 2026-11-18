# Pages tests: /compare/ and /guides/ share one fixture build (2026-11-04), backlog P062

**Reading.** Warm card cache (`PAGES_CARD_CACHE` set), 4-core sandbox,
`node --test --test-reporter=spec build.test.mjs`: 380 s total, 304 tests pass.
Per-test: the first test, which pays for the shared `site()` build, 171 s;
`/compare/` 63 s; `changing the worker itself` 33 s; `/guides/` 28 s; nothing
else over 12 s. The `/compare/` and `/guides/` tests each ran a full
`buildSite` on a tiny fixture ventures directory. Their time is fixed cost
(hub, posts, research, cards), not fixture size.

**Change.** One memoised fixture build (`hubFixtureSite()` in
`build.test.mjs`) holds the union of both fixtures. Both tests assert against it
unchanged; the temp dir is removed in an `after` hook.

**Measured.** Both tests run together (`--test-name-pattern`): 66.6 s, against
63 + 28 = 91 s as two builds. Saves about 25 s of 380 per `build.test.mjs` run.
Both pass.

**Not changed / next, ranked.**
1. The 171 s first-test build: profile it warm (it is the shared build).
2. `changing the worker itself` (33 s): `addOfflineSupport` over a full copy of the
   site; a smaller copy would do if the cache name only depends on the worker.
3. Build-determinism and custom-domain remain separate builds (part 2 not viable).
