# Pages tests: the worker cache-name test no longer copies the site (2026-11-04), backlog P062

**Reading.** Warm card cache, 4-core sandbox, per-test timings in
`docs/history/pages-test-perf-2026-11-04-hub-fixture-shared.md`: `changing the
worker itself changes the cache name` took 33 s. It copied the whole shared
build, ran `addOfflineSupport` over the copy (icons, injection into every page,
gzip sizing) and asserted one inequality on `cacheName`.

**Change.** The hash that makes the name moved out of `addOfflineSupport` into an
exported `offlineCacheName(outDir, codeVersion)` (`build.mjs`, same code, called
from the same place). The test now calls it three times over the shared build,
read-only: same input gives the same name, a different `codeVersion` gives a
different one, and both differ from the real build's name. A one-page tree
(the pattern of the kill-switch test) checks `addOfflineSupport` still passes
`codeVersion` through.

**Measured.** The single test plus its shared build passes in 128 s wall
(`--test-name-pattern`), against about 176 s for the build alone plus the old
33 s copy when the first run was taken cold; the 33 s copy and rewrite are gone.
The build output is untouched (the function body is a move, not an edit).

**Not changed / next, ranked.**
1. The shared first-test build (about 170 s warm) is the remaining cost in `build.test.mjs`.
2. `build-determinism.test.mjs` runs two sequential full builds by design.
3. `custom-domain.test.mjs` needs its own baseUrl, so it cannot share a build.
