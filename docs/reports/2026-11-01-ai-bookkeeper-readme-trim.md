# ai-bookkeeper README trimmed (2026-11-01)

The README's "Next" section had grown to about 56 KB of dated records of slices that had already landed (gap probes, trade fixtures, property tests, sources read). A run that opened the README paid for all of it. The records moved verbatim to `ventures/ai-bookkeeper/HISTORY.md`; the README went from about 173 KB to 117 KB and keeps a pointer.

Checked: `python3 platform/ci/run_venture_tests.py ai-bookkeeper` passes (the 11 test files that read the README included).

Also checked while looking: the gaps the ninth probe listed (Wahl Clipper filed as transit, and others) are fixed and pinned by `probe9.test.mjs`.

For the next run: the keyword-probe chore has no further value without a real export. Real inputs are listed in `portfolio/flagships.yaml`.
