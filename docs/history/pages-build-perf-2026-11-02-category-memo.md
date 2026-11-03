# Pages build: memoise categoryFor and subcategoryFor (2026-11-02)

Perf track. The warm-profile note (`pages-build-perf-2026-11-02-warm-profile.md`)
ranked the per-page category scan first among the "not changed" items.

## Change

`categoryFor(slug)` and `subcategoryFor(slug)` in `platform/pages/build.mjs`
walk their rule lists on every call, and `relatedTools` calls them for every
other surface on every page (pages x surfaces x 2). Both answer from the slug
alone (the stat-ing rule was already memoised), so each now caches per slug.

## Measurement

Microbenchmark: `relatedTools` for every one of the 1,329 `ventures/` slugs
against the full list (`node` script, same machine, rules warmed).

| | Time | Output checksum |
|---|---|---|
| before | 2,696 ms | 149715 |
| after | 220 ms | 149715 |

Full `node platform/pages/build.mjs --out=<dir>` before and after: both exit 0,
sha1 over every file of the 12,519-file tree is identical
(`5417d3d0...`). End-to-end wall time is dominated by I/O, so the whole-build
gain is the 2.5 s the benchmark shows, small against a 98 s warm build.

## Not changed, ranked

1. `markSample` results memoised across cards (about 4.5 s).
2. The `build.test.mjs` floor is the shared build (1.6 min warm), not the tests.
3. Quick-pick-survey simulations job split (P061), needs a `.github/` edit.
