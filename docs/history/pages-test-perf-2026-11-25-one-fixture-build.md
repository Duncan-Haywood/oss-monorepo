# Pages tests: one two-venture fixture build, not two (2026-11-25)

Perf track. Takes item 1 of "Not changed" in
[`pages-build-perf-2026-11-25-related-top-k.md`](pages-build-perf-2026-11-25-related-top-k.md):
`build.test.mjs` is still the suite, and "the lever is fewer distinct full
builds; that count has not been redone since". This run redid the count.

## Reading

Pool (`python3 platform/ci/ci_profile.py --runs 600 --top 25`, 2026-11-25
11:42Z to 12:39Z): 701 jobs, 988.7 job-minutes, checkout 363.3. The largest
consumers are CodeQL (295.5 min), Portfolio Pages (184.9 min, heaviest step
"Test the site builder", 73.8 min) and Security gate (170.6 min). The
checkout-heavy ones (Security gate, CI policy, Conflict markers) are `priv-*`
workflows, and both open perf backlog items (P063, P064) touch workflow
files: all owner-gated. So the target is the site-builder suite itself.

Bet #1's front door was checked first and has nothing to win: the
`pay-app-guides` suite takes 2.1 s (235 tests), and its built pages are
8.6 to 12.5 KB gzip of HTML plus `pf-chrome.css` (12.3 KB gzip) and
`pf-site.js` (7.8 KB gzip).

Full builds (`buildSite`) the suite runs, counted by grepping the test files
for `buildSite(` and for children that import `build.mjs`:

| build | where | what it is for |
|---|---|---|
| shared full build | `build.test.mjs` `site()` | most tests |
| child full build, same config | `build.test.mjs` `childSite()` | the determinism (cache name) test |
| two-venture fixture, origin root `https://example.test/` | `build.test.mjs` `hubFixtureSite()` | 2 tests: `/compare/` and `/guides/` end to end |
| two-venture fixture, origin root `https://catalogue.test/` | `custom-domain.test.mjs` `site()` | 5 tests: no stale origin after a custom-domain build |

The two fixture builds are the same build in all but name: both build only
`alpha-calculator` and `beta-calculator` (both with a `vs-jobber.html`), both
at an origin root, both `disableWorker: true, cards: false`. `buildSite` does
the same fixed work for each whatever the ventures directory holds (every
post, research page and hub section; about 8,500 files and 350 MB). Alone,
the custom-domain file takes 36 s, and its CPU profile is flat output writing
(`writeFileUtf8` 5.0 s self, GC 3.4 s, `mkdir` 1.3 s).

## Change

One fixture. `custom-domain.test.mjs`'s fixture gains the two pages the hub
tests needed (`alpha-calculator/how-much-to-charge.html`, linked from its
index, and `beta-calculator/vs-jobber.html`), keeps `buildSite`'s
`comparisons` result, and now holds the two `/compare/` and `/guides/` tests.
Their assertions are unchanged apart from the origin (`APEX` instead of
`https://example.test/`, both origin roots). `build.test.mjs` loses
`hubFixtureSite()`, its child process and its cleanup.

Moving the tests into the custom-domain file, not the other way round, also
takes a child build out of `build.test.mjs`, the suite's long pole.

## Verification

Whole suite, `node --test "*.test.mjs" "cloudflare/*.test.mjs"` in
`platform/pages`, timed with bash `time`, 4-core container, warm card cache,
one run each:

| | wall | CPU (user + sys) | tests |
|---|---:|---:|---:|
| before (main at 2e95fb407) | 358.4 s | 1,090.3 s | 2,098 pass |
| after | 339.6 s | 1,030.1 s | 2,098 pass |

60 s of CPU and 19 s of wall per run, and 350 MB less temporary disk at the
peak. An earlier baseline run the same session took 366 s wall, so the wall
number carries about ±8 s of noise; the CPU saving matches one fixture build
(about 35 to 60 s of CPU with output writing). On CI's 4-vCPU runners the
suite is CPU-bound, so the CPU number is the one that moves the step.

`node --test custom-domain.test.mjs` alone: 7 pass, 34.7 s (was 5 tests,
36.0 s).

## Not changed, ranked for the next run

1. **The child full build for determinism** (`childSite()`) is now the only
   duplicate full build left. It is the claim itself (same tree, different
   process and path, same cache name), so it can only go if that claim moves
   to something cheaper, such as hashing the cache-name inputs in two
   processes without writing the site.
2. **The shared build** (the first test to await it reads 286 s in the
   parallel suite) is flat: output writing dominates, as every earlier pass
   found.
3. `clauses.test.mjs` takes 8.1 s alone; the other test files that import
   `build.mjs` (`check`, `surface-budget`, `launched`, `lastmod`,
   `assistant`, `only-slugs`, `published-base-url`) take 0.2 to 2.6 s each.
   Nothing there.
4. P063 and P064 remain owner-gated (workflow files).
