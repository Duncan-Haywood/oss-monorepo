# Store packagers: sync reads in the catalogue-wide plans (2026-11-22)

Perf track, prompt 0. Both open perf backlog items (P063, P064) touch
workflows and wait for the owner. The "not changed" lists in
`ci-perf-2026-11-21-csv-split-ratchet-once.md` and
`ci-perf-2026-11-21-research-archive-fixture-template.md` named the
`platform/distribution` node suites `desktop.test.mjs` and `ios.test.mjs` as
never profiled. No workflow names them, so `platform/ci/unwired_checks.py`
runs them, with `android.test.mjs` and `webext.test.mjs`, in every
ventures-tests job.

## Reading (before)

Per-test durations (`node --test --test-reporter=spec`). The first, cold-cache
run gave desktop 10.4 s, with 7.7 s in one test. Warm:

| test | warm |
|---|---|
| desktop: `plan has no duplicate identifiers across the real catalogue…` | 2.4 to 2.6 s |
| desktop: `buildDesktop bundles the page…` (one fixture venture) | 1.9 s |
| ios: `plan has no duplicate bundle ids across the real catalogue` | 2.9 to 3.1 s |
| ios: `buildIos bundles the page…` | 1.0 s |

Both `plan` tests call the module's `plan()`, which runs `buildExtension`
(`webext.mjs`) over all 1,428 ventures, one at a time. `node --cpu-prof` of
desktop's `plan()` on its own (2.6 s): **1,082 ms `(idle)`**, then `fstat`,
`openFileHandle`, `read` and `close` at 130 to 160 ms each. That is the
`fs.promises` file-handle round trip, four thread-pool hops per file. The regex
work was about 0.5 s. `strace -e openat` counted 6,056 opens under `ventures/`
for one `plan()`. `buildExtension` also read every imported module twice: once
in `importedFiles` to follow imports and check for network calls, and again to
fill `files`.

`renderIcon` is already memoised (`ci-perf-2026-11-14-icon-memo-unwired-pool.md`).
The two one-venture fixture tests pay the first draw of each icon size, which
happens once per process.

## Tried

- **Concurrency.** `mapLimit` from `platform/pages/share.mjs` over
  `buildExtension`, limits 4 to 64: 2,444 ms serial, 1,764 ms at 16, 1,663 ms
  at 64. That is about 30% off, and it would add a pool to four modules.
- **Synchronous reads** (chosen). `share.mjs` already notes that
  `fs.promises` costs more per call than the work on small files. In this
  case the speed-up was larger than with concurrency, and the code got simpler.

## Change

- `webext.mjs`: a `readText(file)` helper (`readFileSync`, `null` on error),
  used for `index.html`, `LICENSE`, script `src` files and the import walk.
  `importedFiles` now returns `bodies` beside `files`, and `buildExtension`
  fills `files` from those bodies and from the script-src bodies it had
  already read, so it no longer reads each file twice.
- `android.mjs`: `buildAndroid` reads `index.html` and `LICENSE` with
  `readText`.
- `ios.mjs`: `buildIos` re-reads `index.html` with `readFileSync`. The
  extension build has already confirmed that the file exists.
- `discover()` in all four modules: `existsSync` instead of an awaited
  `fs.stat` per venture directory. Both are false on any stat failure.

The functions stay `async`, so callers do not change.

## Verification

A throwaway dump script (not committed) recorded `plan()` of webext, desktop, ios and android, every
venture's `buildExtension` result with each file body's SHA-256, and the `ci`
and `learning` desktop suites, file by file. Written before the change and
after: `cmp` shows the two are **byte-identical** (1.98 MB of JSON).

All suites that import these modules pass: desktop 11, ios 8, android 6,
webext 9, published-host 4, vscode 5, wordpress 7.

## After

`plan()` alone, warm, same dump script:

| plan() | before | after |
|---|---|---|
| webext | 2,360 ms | 843 ms |
| desktop | 2,330 ms | 707 ms |
| ios | 3,561 ms | 1,825 ms |
| android | 963 ms | 579 ms |

Whole suite, warm, `node --test <file>`, three runs each, same container, 4 cores
(before taken with `git stash`):

| suite | before | after |
|---|---|---|
| desktop.test.mjs | 4.42, 4.28, 4.22 s | 2.82, 2.97, 3.08 s |
| ios.test.mjs | 3.75, 3.65, 3.82 s | 2.07, 2.22, 2.09 s |
| android.test.mjs | 1.39, 1.40, 1.29 s | 0.84, 0.82, 0.83 s |
| **sum** | **≈ 12.0 s** | **≈ 7.6 s** |

## Not changed, ranked for the next run

1. **The first draw of each icon size is about 1 s per process.** It hits
   desktop's one-venture fixture test (1.9 s: the 16 to 1024 px set for
   `.ico`/`.icns`) and ios's 1024 px opaque icon (`drawMarkDirect`/`markSample`
   in `sharecard.mjs`, 0.8 s self). Committing the rendered PNGs, as
   `ci-perf-2026-11-05-shed-renders-committed.md` did, would need a test
   that compares them to the drawing code.
2. **The regexes in `buildExtension`** (IMPORT_RE, NETWORK_RE, SCRIPT_RE, the
   inline-handler and remote-src checks) are about 0.5 s over the catalogue
   and are real work.
3. **`npm.mjs` and `pypi.mjs` `closure`/`buildPackage`** still use
   `fs.promises` per file in their own serial plans. Their tests run in
   `distribution-versions-ci.yml`, which was not measured here.
4. **Each suite runs its own catalogue walk.** desktop, ios, android and
   webext each walk all ventures, about 4 s of the remaining pool time in
   total. Sharing one walk across files would need a cache that the tests
   trust.
