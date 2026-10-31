# Pages build: share-card mark coverage cached (2026-10-31)

Perf track run. Follows `pages-build-perf-2026-10-31-link-siblings.md`, whose
"not changed" list ranked `markSample` (2.0 s self time in a warm build) second.

Change: `drawMark` in `platform/pages/sharecard.mjs` re-ran 16 supersamples per
pixel of the mark, with polygon tests, for every share card. Coverage depends
only on size, the plate flag and the fractional origin, so it is now computed
once per such key (`MARK_COVERAGE`) and every later card blits it.

Verification: `drawMark` output on three canvases (3 and 4 channels, plate on
and off, integer and fractional origins) is byte-identical to the old code.
The pages test files were run (see the run record).

Not measured: whole-build wall clock. The saving is bounded by the 2.0 s
`markSample` reading from the earlier profile, about 4% of a 53 s warm build.
The Pages build could not be timed here (it wrote nothing in this container).

Not changed, ranked: 1. `spawnSync` 3.9 s (Python children); 2. 11 s idle
waiting on workers.
