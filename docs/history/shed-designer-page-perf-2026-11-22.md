# shed-designer: no wasted live thumbnail on load; build steps on demand (2026-11-22)

Perf track, "what visitors wait on" (`prompts/perf/prompt-0.md`, item 4). Both
open perf backlog items (P063, P064) touch workflow files in
`.github/CODEOWNERS` and wait for the owner. Item 1 of the "not changed" list in
`league-schedule-page-perf-2026-11-22.md` named this page: 384 kB gzip, 55
files, the largest venture page graph.

## Reading (before, `241225222`)

1. **Bytes.** `module-exclusive.mjs` on a throwaway page holding `app.mjs`'s own
   31 imports: 356 kB gzip, 54 files. The largest exclusive subgraphs were
   `picker.mjs` (28 kB with `designfacts`, `designsearch`, `renders`) and
   `instructions.mjs` (19 kB, 60,556 bytes raw). The picker mounts the
   visible strip at load, so it stays; `instructions.mjs` is only used by
   `renderBuild`, which already runs in `renderLate`, after the first frame.
2. **CPU.** A Chrome DevTools-protocol sampling profile of one load (headless
   chromium, local static server, 200 µs samples, until 3 s after the summary
   line showed) put **345 ms of self time in `snapshot` (`render3d.mjs:854`)**,
   more than all of `estimate`, `buildFramed` and the optimiser together.
   Wrapping `HTMLCanvasElement.prototype.toDataURL` showed two snapshots per
   load, each about 157 ms: a 600x400 strip card, then the 720x480 compare
   thumbnail of the open design.
3. **Why the strip card.** Every strip card has a stored picture
   (`renders/manifest.json`, `renders/gallery-*-card.webp`). But `mountPicker`
   draws the strip before the manifest fetch returns, so every card first looks
   unrendered, and `queueShots` (60 ms timer) draws the first card live with a
   new WebGL viewer. The manifest then arrives and `renderStrip` replaces that
   picture with the stored one. The live snapshot was thrown away on every load,
   and it ran before the summary line was drawn. With a throttled network and
   CPU (150 ms latency, 1.6 Mbit/s, 4x CPU) two cards were drawn live and
   discarded.

## Change

- `picker.mjs`: `queueShots` returns until the manifest fetch settles. On
  success `renderStrip` queues as before (cards with no stored picture are
  still drawn live); on a missing manifest or a failed fetch, the queue starts
  then, so the offline fallback draws every card live as before.
- `app.mjs`: `instructions.mjs` loads with a memoised `import()` inside
  `renderBuild` (a failed load clears the memo). A newer render's turn wins, as
  in `renderLate`. The Markdown download awaits the latest build steps. The
  build-pack button stays synchronous (it calls `window.open`); it reads
  `buildSections` as it did before, which was already one frame behind an edit.

## After

| measure (same script, old vs new tree) | before | after |
|---|---:|---:|
| live snapshots on load, unthrottled | 2 | 1 |
| live snapshots on load, throttled (before = tree with only the app.mjs change) | 3 | 1 |
| `snapshot` self time in the load profile | 345 ms | 167 ms |
| time to the summary line, unthrottled, median of 7 | 916 ms | 731 ms |
| time to the summary line, throttled, median of 7 | 7,495 ms | 5,796 ms |
| static module graph from `index.html` | 384 kB gzip, 55 files | 366 kB gzip, 54 files |

Runs alternated old and new tree; the throttled pair ran while the shed-designer test suite was using the same machine, so its absolute times are inflated, but both trees saw the same load (old 6,922 to 8,222 ms, new 5,215 to 6,177 ms, no overlap); timings are wall time from `goto` to the
summary line's "load checks" text. The bytes saving from `instructions.mjs`
alone did not move the throttled time beyond run-to-run noise (an earlier
seven-run pair with only that change: medians 5,843 vs 5,915 ms); the time
saving is the discarded snapshot.

## Verification

- Old vs new page in Playwright: the build-steps HTML after load (19,145 chars)
  and after a length edit (19,339 chars), and the downloaded
  `how-to-build.md` (18,432 bytes), are byte-identical (`cmp`). No console or
  page errors.
- The strip's final image sources (all 11 cards on stored `.webp` renders) are
  identical old vs new (md5 of the list).
- With `renders/manifest.json` blocked, both trees draw all 11 cards live, as
  `data:image/png` (the offline fallback still works).
- `page.test.mjs`: three new tests pin `instructions.mjs` as `import()` only,
  check every name taken from it is exported, and pin the manifest gate with
  both fallbacks. 7/7 pass.
- Full suite: `python3 platform/ci/run_venture_tests.py shed-designer` ->
  SUITE_RESULT.

## Not changed, ranked for the next run

1. **The compare-card thumbnail (one 720x480 snapshot, about 160 ms) on
   load.** `queueThumbs` draws the open design for `#compare-cards` 350 ms
   after `renderLate`, whether or not the compare panel is ever shown. Drawing
   it when the panel first opens, or for a preset, using the stored render,
   would take the last snapshot off the load. It changes when the picture
   appears, so it wants a test of the compare panel first.
2. **PNG encoding in `snapshot()`.** Most of the 157 ms is `toDataURL('image/png')`
   readback and encode on SwiftShader. `toBlob` encodes off the main thread
   but makes `snapshot()` async for seven callers.
3. **`picker.mjs` (28 kB gzip exclusive).** Mostly `designsearch.mjs`
   (39,562 bytes raw), pulled in by `designfacts.mjs` for one function,
   `looksOf`. Moving `looksOf` into its own module would take it out of the
   page graph if nothing else on the page needs the search.
4. P063 and P064 remain owner-gated (workflow files).
