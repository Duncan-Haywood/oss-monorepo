# Perf: shed-designer's auto probes skip the 3/12 comparison framing (2026-11-15)

Perf track, prompt 0. Both open perf backlog items (P063, P064) are workflow
edits held by CODEOWNERS, so this run read the venture suites for a landable
lever.

## Reading

- `platform/ci/venture_suite_times.json` (2026-11-15T00:25Z, 4 jobs on 4
  cores): league-schedule-generator 627 s, shift-roster-builder 571 s,
  changepoint-detector 569 s, shed-designer 472 s, ai-bookkeeper 116 s,
  wall-framing-takeoff 90 s. The first three have had several perf passes this
  week.
- Each test file timed on its own (`xargs -P 4`, this container):
  - ai-bookkeeper: 324 files, 101 s summed, none over 4.1 s. It is about
    0.16 s of `node --test` process start per file, not a hot spot.
  - wall-framing-takeoff: 142 files, 71 s summed. `engine.test.mjs` takes 8 s,
    3.5 s of it in `exactStock`, which already has a bitset DP (2026-11-11).
  - shed-designer: 56 files, 679 s summed (gallery 110 s, fuzz 91 s,
    designsearch 48 s, costlevers 12 s). Every one of them goes through
    `buildShed`.
- `node --cpu-prof` on `leverOptions(defaultDesign())`, the page's "what each
  choice costs" table: GC 1.1 s, `buildFramed` 0.54 s self, then estimate and
  cut optimisation. With a counter on `buildFramed`, one table made **1,444
  framings for 41 rows**. 722 of them came from one line.

## The finding

When a design's peak is over the height limit, `buildFramed` writes a warning
that quotes the peak a second shed would have (the lowest walls that frame the
openings, a 3/12 roof), and it frames that whole second shed to get the number.
`buildAuto` frames many probe sheds: every pitch its binary search tries and
13 overhangs from 6" to 18", each priced. Probes over the limit each paid for
the second framing, and every probe but the returned one was then thrown away.
The default design has all three autos on with a 96" limit, so every edit on
the page pays for this too.

## Change (`ventures/shed-designer/model.mjs`)

- `buildFramed(d, lapNailers, deferPeak)`: with `deferPeak`, the warning goes
  in as a placeholder, and a non-enumerable `pendingPeak` holds its index, the
  3/12 design (normalised at the same point as before) and the text function.
  The lap-nailer rebuild passes the flag on.
- `buildAuto` passes `deferPeak` for its pitch probes, its base build and its
  overhang sweep, and calls `finishPeakWarning(s)` on the shed it returns. That
  frames the 3/12 shed, writes the warning at its index and deletes
  `pendingPeak`.
- Nothing downstream of a probe reads `warnings` (`estimate`, `optimize` and
  `prices` were checked), and the property is non-enumerable, so a probe
  serialises the same as before.

## Verification

- **Same answers.** `eq.mjs` (scratch): the fuzz generator's `randomDesign`
  with extra weight on auto pitch, auto overhang and a 72" to 152" limit. For
  each design, `buildShed` with and without `examplePrices`, hashing
  sha256 over the shed's JSON, its own property names and its estimate total,
  plus 12 `leverOptions` tables. Old and new trees:
  - seed 1, 150 designs: `4f40107e1fcba2a1` both
  - seed 2, 150 designs: `e38ffd6036d27af1` both
  - seed 1, 300 designs: `d0d8a4ead05d0794` both
  - seed 3, 300 designs: `0df22eba89ad6989` both

  That is 1,880 sheds; 956 carry the over-limit warning.
- **New test** `peakwarning.test.mjs` (7 tests): six over-limit designs (all
  autos, pitch only, overhang only, lean-to, lap siding). For each, the auto
  shed's warning must equal the plain build's, with no placeholder or
  `pendingPeak` left. Before this, no test read that warning. It passes on the
  old code, and a mutant that skips `finishPeakWarning` fails 6 of 7.
- **Suite.** `run_venture_tests.py shed-designer`: ok, 524 tests, 151.0 s.

## Numbers

| What | Before | After | How |
|---|---|---|---|
| `buildFramed` calls, one lever table (default design) | 1,444 | 760 | counter in a scratch copy |
| Lever table, 8x10 + 12x16 + default | 2,025 ms | 1,560 ms | median of 8 interleaved rounds, one process, cache defeated by renaming |
| `buildShed`, 4 designs (2 auto) | 78.7 ms | 58.4 ms | median of 30 interleaved rounds |
| shed-designer `node --test`, whole suite | 161 s | 159 s | one run each, sequential; noise |

The suite barely moves: few tests build over-limit auto designs, and
gallery, fuzz and designsearch spend their time elsewhere. The gain is on the
page: a quarter less work for each edit to an auto design, and for the
cost-lever table.

An earlier cold reading of 4.6 s for the lever table was taken while a
background sweep loaded the machine. Interleaved in-process medians are the
numbers to trust.

## Not changed, ranked for the next run

1. **The overhang sweep frames 13 sheds per auto design** in order to price
   them. The cost may only need the roof parts. That is a bigger lever, but it
   needs proof that everything below the roof is independent of the overhang
   (vents, the peak and framed openings feed into the choice).
2. **GC is a third of the lever-table profile.** `rectGeom` and `addM`
   allocate per member. Probes could skip geometry nobody reads, but that
   changes the shed's shape, so it needs the same hash harness.
3. **gallery.test.mjs, 110 s** on its own: the largest shed-designer file
   (P064's gallery search is the CI side of it).
4. **ai-bookkeeper's 324 test files** spend about 0.16 s each on process
   start. Only `--experimental-test-isolation=none` would cut that, and it
   changes isolation semantics, so it is not a free change.
