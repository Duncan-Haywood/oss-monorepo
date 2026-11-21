# CI perf 2026-11-21: the hub's real-post test stops measuring strings already short enough

Perf track, prompt 0. Both open perf backlog items (P063, P064) touch
workflow files and wait for the owner. The "not changed" list in
`ci-perf-2026-11-21-research-archive-fixture-template.md` ranked
`platform/distribution/hub/content.test.mjs` (6.2 s in the serial pool
reading) second and noted it had never been profiled, so this run took it.

## Reading and profile

`node --test hub/content.test.mjs`: 5.8 s wall on this 4-core container.
Per-test durations: `every real post: kits quote the post verbatim and fit
every limit` 4.05 s, `hub kit --slug prints the kit for a real post` 1.0 s,
the other 19 tests under 5 ms each.

The real-post test runs in the test runner's child process, so `--cpu-prof`
on `node --test` profiles only the parent. A scratch script did the same work
(load 6,718 posts, `kit()` each, `blocks()` each, `variant()` per draft
platform) under `node --cpu-prof`; summing self and inclusive time per
function:

- `glen` 702 ms inclusive, `longPost` 620 ms, `clipWords` 337 ms.
- Instrumenting `glen` counted **580,051 calls over 104 MB of strings**:
  50 MB from `clipWords`, 24 MB from `longPost`'s two "drop a limit / a
  finding until it fits" loops, 15 MB from `score`.
- 3,616 of those strings fell to `Intl.Segmenter` (1.48 M characters),
  because they held a character outside `SIMPLE`, the class measured by
  index: σ, ≈, √, ⁻⁵, Cyrillic names, ₹, CJK in research posts.

## Change

`platform/distribution/hub/content.mjs` and `compose.mjs`:

1. **`fits(s, max)`**: a grapheme is at least one UTF-16 unit, so
   `s.length <= max` proves `glen(s) <= max` without measuring. `clipWords`,
   `thread`'s last post, `longPost`'s two loops, the list-item check in
   `extract` and `compose.mjs`'s `clip` and `shortPost` now ask `fits`. Same
   answer in every case: when the length check fails it measures as before.
2. **`SIMPLE` widened** to Greek, Cyrillic (not its combining marks
   0483-0489), Arabic-Indic digits, Latin Extended Additional, super- and
   subscripts, currency, letterlike and number forms, arrows, maths and
   technical symbols, box drawing, shapes, CJK ideographs and full-width forms
   (not the sound marks FF9E-FF9F), leaving out unassigned code points.
   Segmenter fallbacks: 3,616 strings → 79.

## Verification

- **Byte-identical output.** A scratch script wrote, for every one of the
  6,718 posts, `JSON.stringify(kit())`, `kitMarkdown()`, `variant()` for every
  platform and `glen`/`clipWords`/`graphemes` of the body and description at
  five limits: 288,872,693 bytes. `cmp` of the files from `HEAD` (via `git
  stash`) and from the change: identical.
- **New tests** in `content.test.mjs`: every BMP code unit `SIMPLE` matches is
  checked against `Intl.Segmenter` (alone between letters, doubled, the whole
  class concatenated, and no Hangul, whose syllable + jamo joins a pair test
  cannot see), 0.25 s; `fits` is checked against measuring for short, long,
  combining-mark and emoji strings.
- **Fault seeding:** adding U+0300-036F to `SIMPLE` fails the class test
  (`U+300`); `fits` off by one (`max + 1`) fails both the `fits` test and the
  real-post test.
- `node --test '*.test.mjs' 'hub/*.test.mjs'` in `platform/distribution`:
  277 tests, 277 pass.

## Numbers

| | before | after |
|---|---|---|
| real-post test (runner's duration_ms) | 4.05 s | 2.89 s |
| kit phase of the scratch script | 2.5-2.9 s | 2.1-2.6 s |
| `longPost` inclusive | 620 ms | 65 ms |
| `glen` inclusive | 702 ms | 72 ms |
| whole file, 5 serial runs (sorted) | 4.51 4.87 4.97 5.04 5.27 s | 4.26 4.55 4.69 4.72 5.35 s |

The whole-file gain is smaller than the real-post test's because the new
`SIMPLE` test costs 0.25 s and the container is noisy (±0.5 s between runs).

## Not changed, ranked for the next run

1. **`extract()` itself, 1.1 s**: `blocks()`/`plain()` over 33 MB of posts,
   once per post (already memoised per item since
   `ci-perf-2026-11-14-hub-content-memo.md`). `plain()` makes five regex
   passes per text segment; a single tokenizer would have to be shown equal
   on all 6,718 posts with the dump script above.
2. **The test's own `blocks(p.body)` oracle, ~0.8 s**: it re-parses every
   post to check verbatim quoting. Reusing extract's parse would make the
   check circular; leave it.
3. **`hub kit --slug`, 0.9 s**: two `main()` calls each run `loadPosts` over
   all 6,718 posts to find one slug. A slug lookup in `writing.mjs` would cut
   it, but the test is checking the CLI as it runs.
4. Carried over: `check_tag_balance.py` (4.8 s), `desktop.test.mjs` (4.3 s),
   `ios.test.mjs` (3.6 s).
