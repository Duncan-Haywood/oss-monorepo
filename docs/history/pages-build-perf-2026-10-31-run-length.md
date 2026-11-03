# Pages build: run-length shortcut in `quantize` (2026-10-31)

Perf track run. Reading: a cold Pages build took 2 m 33 s here (real, 4 cores;
3 m 29 s user). The previous pass (`pages-build-perf-2026-10-31-quantize.md`)
left the histogram and index passes of `quantize` ranked first in "not
changed": each pixel does a random read or write in a 64 MB (`HIST`) or 32 MB
(`INDEX`) table, and share cards are mostly flat colour.

Change (`platform/pages/sharecard.mjs`): both passes remember the previous
pixel's colour. A repeat adds to a run counter (histogram) or reuses the last
index (index pass), so the big tables are touched once per run, not per pixel.
The histogram flushes the run before any new colour is looked up, so counts and
first-seen order, hence the palette, are unchanged.

Verification:
- Old module against new: `quantize` on 1200x630 noise, flat, gradient and
  mixed (flat panel plus light noise) images at n = 256, 16, 2, 1: identical
  SHA-1 of palette and indices (16 cases).
- 30 `renderCard` option sets, 8 `renderMarkIcon` variants and `renderSiteCard`:
  byte-identical PNGs (SHA-1 compared). `node --test share.test.mjs`: 26 pass.
- Timing (`hrtime`, one process, mixed image, mean of 30 calls): about 6.4-9.4 ms
  before, 4.0-6.8 ms after (runs were noisy, the new code was lower in both
  pairs, roughly 30%). Over ~2,800 cards that is a few seconds of CPU, about 1 s
  of wall clock on 4 threads: small, and I did not re-time the whole build.

Not changed, ranked: 1. `zlib.deflateSync` level 6 (~8 ms per card; a level
change alters bytes, so it needs a size decision); 2. `field()` per accent
(11 ms, cached); 3. `spawnSync` Python children (3.9 s); 4. the main thread
idles about 60% of a cold build waiting on the card worker pool.
