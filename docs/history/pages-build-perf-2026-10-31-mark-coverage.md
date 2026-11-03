# Pages build: rasterise the mark once per size (2026-10-31)

Perf track run. Reading: a cold Pages build took 3 m 22 s here (real). The
previous run ranked `markSample`/`drawMark` second among the "not changed"
items. `drawMark` supersamples 4x4 per pixel with polygon tests, and it ran
again for every one of 2,759 share cards, though the mark is identical on each.

Change: `sharecard.mjs` `drawMark` now caches the mark's per-pixel coverage per
(size, plate) and blits it when `left` and `top` are integers (every card and
icon call). Fractional offsets fall back to the old direct path
(`drawMarkDirect`).

Verification:
- Hash of seven canvases (3 and 4 channels, plate on and off, negative and
  fractional offsets, clipped edges), old code against new: identical SHA-1.
- 2,759 card-sized marks (52 px, 3 channels): 43,009 ms before, 289 ms after
  (CPU, one process, `hrtime`).
- Whole site `diff -rq` of two cold builds, before and after: no differences.
  Wall clock 3 m 22 s before, 2 m 33 s after. The after run shared the machine
  with a test run, so treat the wall-clock gain as noisy; the CPU figure above
  is the reliable one (user time 6 m 07 s to 4 m 25 s).
- `node --test` on the test files that import `sharecard`: 330 pass, 0 fail.

Not changed, ranked: 1. `spawnSync` Python children (3.9 s warm); 2. idle wait
on workers (11 s warm); 3. the card background `field()` and `constellation()`
raster per card.
