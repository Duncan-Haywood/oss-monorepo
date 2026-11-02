# Pages build and test: a warm-cache profile (2026-11-02)

Perf track run, no code change. Question: what does the site-builder test step
(27.9 of 182 job-minutes in `ci_profile.py --runs 200`) wait on now?

## Measurements (4-core cloud container, 3,014 share cards)

| Run | Wall | User | Sys |
|---|---|---|---|
| `node --test build.test.mjs` (cold card cache) | 11 m 10 s | 14 m 37 s | 3 m 08 s |
| `build.mjs --out=<dir>`, half-warm card cache | 3 m 05 s | 6 m 09 s | 0 m 54 s |
| `build.mjs --out=<dir>`, warm card cache | 1 m 38 s | 1 m 10 s | 0 m 34 s |

Two warm builds produced identical file trees (sha1 over every file).

The per-test durations in the spec reporter mislead: the first tests that call
`site()` all wait on the one shared build, so "no test payload ... is
published" shows 250 s and "identical build ... cache name" 107 s. Those are
build wait, not test work. Read the build, not the tests.

## Profile of the warm build (`--cpu-prof`, inclusive time)

No single hot spot. The largest inclusive items: `spawnSync` Python/git
children 5.8 s, `completeShareTags` 5.9 s, `addOfflineSupport` 5.0 s,
`drawMark`/`markSample` 4.5-4.9 s (mark pixels, not cached across pages),
`relatedTools`/`categoryFor` 3.4-3.9 s (a per-page category scan), `gzipBytesOf`
2.9 s. The rest of the wall time is idle waiting on file I/O (sys 34 s of 98 s).

## Not changed, ranked

1. `categoryFor`/`inCategory`/`relatedTools` rescan per page; a memo by tool
   slug is the cheapest candidate (about 7 s of 98 s).
2. `markSample` results per mark could be memoised across cards (about 4.5 s).
3. The CI test step runs `build.test.mjs` cold-ish; its tests share one build,
   so the build (1.6 min warm) is the floor, not the 300 tests.
