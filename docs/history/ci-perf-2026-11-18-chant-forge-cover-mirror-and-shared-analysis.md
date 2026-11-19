# Venture suites: chant-forge's cover glow is mirrored, and the studio page's release check reuses its analysis (2026-11-18)

Perf track, prompt 0. Both open perf backlog items (P063, P064) change
workflow files and wait for the owner, so this run took item 3 of "Where to
look": a slow venture test file.

## Reading

`python3 platform/ci/suite_file_times.py <slug> --top N`, this container (4
cores), one file at a time:

| suite | summed s | slowest file | taken up? |
|---|---:|---|---|
| ai-bookkeeper | 75.2 | `fuzz.test.mjs` 2.2 s (341 files) | no: flat, start-up bound, as the 2026-11-16 note says |
| sales-agent | ~6 | `page.test.mjs` 1.1 s | no: nothing to win |
| einvoice-preflight | 34.9 | 0.8 s (268 files) | no: flat |
| wall-framing-takeoff | 44.1 | `cli-sweep` 3.8 s, `sheathing-fuzz` 3.7 s | read, see "Not changed" |
| clothing-design-studio | 37.9 | `drape.test.mjs` 5.5 s | no: two passes this week |
| chant-forge | 115.1 | `sing.test.mjs` (about 15 s), `ep-queue.test.mjs` 15.9 s, `render-limit` 8.9 s, `ep-page` 7.7 s | **yes** |

## Profile

`node --cpu-prof ep-queue.test.mjs`, self time per function, 15.6 s total:
`truePeak` 2.95 s, `kWeightedEnergy` 2.62 s, `coverPixels` **1.87 s**,
`renderMidi` 1.84 s, zlib 1.52 s, `analyze` 0.70 s.

Grouped by caller chain, two costs were repeat work:

1. `coverPixels` ran 0.92 s per 3000 px cover (one for the CLI build, one for
   the page build). It computes `Math.hypot` and `** 1.6` for each of 9
   million pixels, but the glow depends only on `|x - cx|` and `|y - cy|`.
2. On the studio-page path (`releaseKit` in `ep-core.mjs`), each track's
   render was analysed for the report (`analyze(t.wav)`), then
   `checkReleaseWith` fetched the same in-memory object through `io.wav` and
   analysed it again: about 1.3 s for the two tracks here
   (`truePeak` 0.46 + `kWeightedEnergy` 0.25 + `analyze` 0.56 under
   `checkReleaseWith < releaseKit`).

The CLI path (`ep.mjs`) also analyses twice, but not the same signal: the
report reads the float render, the check reads the 16-bit WAV file back. Those
can differ in the last digits, so it is left as it is.

## Change

- `ventures/chant-forge/ep-core.mjs`, `coverPixels`: column `x > cx` copies
  column `size - x` (exact: `x - cx` is the exact negative of
  `(size - x) - cx` for any integer size, and `hypot` takes absolute values);
  when `cy = size * 0.47` is a whole number (3000, 1400 and 600 px), row
  `y > cy` copies row `2 cy - y` with `copyWithin`. A quarter of the pixels
  are computed at 3000 px. The staff, notes and rules are drawn after, as
  before.
- `ventures/chant-forge/release-core.mjs`: `io` may carry
  `analysis(path)`; when it returns a value the check uses it instead of
  `analyze(w)`. `releaseKit` keeps a map from WAV path to the analysis it
  already made for the report and offers it. `folderIo` (the CLI) has no such
  method, so nothing changes there.

Same output:

- `ep-core-shortcuts.test.mjs` (new) holds the old `coverPixels` verbatim and
  compares bytes at sizes 600, 1400, 512, 101, 7, 2, 1 with three note sets.
  Mutations caught: column mirror from `x >= cx - 1`, row mirror from
  `y >= cyi - 1` (each fails the test).
- The same file checks `checkReleaseWith` with an offered analysis deep-equals
  the plain check, the hook is asked once per track, and an `undefined`
  answer falls back to analysing.
- A separate scratch comparison against the old module at 3000 px plus eight
  other sizes and four note sets: 36 of 36 byte-identical.
- `ep-queue.test.mjs` itself still asserts every file of the page build equals
  the CLI build's and the two checks agree; it passes.

Both savings reach visitors: the studio page (`index.html`) builds a release
with `releaseKit` and draws the cover with `coverPixels` in the browser.

## After

| measure | before | after | how |
|---|---:|---:|---|
| `coverPixels` at 3000 px | 904, 917 ms | 258, 261 ms | two calls each, same process, old module vs new |
| `ep-queue.test.mjs` | 15.6 s (`--cpu-prof` run), 15.9 s (`suite_file_times`) | 12.7, 12.8 s | `node --test ep-queue.test.mjs`, twice |
| `ep-page.test.mjs` (builds a cover too) | 7.7 s | 4.9 s | `suite_file_times.py chant-forge` |
| chant-forge suite, summed | 115.1 s (53 files) | 111.5 s (54 files, with the new 1.4 s pin test) | `suite_file_times.py chant-forge`, one file at a time, nothing else running |

`sing.test.mjs` moves between about 14.7 and 18.5 s from run to run in this
container and dominates the suite's noise, so the summed figure understates
the per-file savings above.

## Not changed, ranked for the next run

1. `sing.test.mjs` and `render-limit.test.mjs` (8.9 s, one test): the
   limiter loop in `render.mjs` re-reads `integratedLufs` on a changing
   signal, so nothing there may be cached; a cheaper loudness search would be
   an algorithm change, not a memo.
2. `ep.mjs` analyses the float render for the log/report and the check
   analyses the file. Analysing the decoded file once and using it for both
   would save about 0.7 s per track but change the report's printed figures
   in the last digit; a product decision, not a perf edit.
3. zlib level 9 on the 3000 px cover, 0.75 s per build: a lower level changes
   the PNG bytes (and the page's CompressionStream path uses its own level).
4. wall-framing-takeoff `sheathing-fuzz.test.mjs` (3.7 s): its time is the
   cut-stock knapsack (`boundedKnapsackMulti`, 1.7 s self over 32,264 calls).
   Hoisting `takeoff` out of the orientation loop does nothing (the stock
   memo already hits); bounding each chunk's fill by the running weight sum
   would skip only 13% of the cells (counted: 473 M of 543 M). Not taken.
