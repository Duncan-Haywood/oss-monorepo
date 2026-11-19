# FF/FL floor flatness calculator

Live: https://marisstella.app/floor-flatness/ · Guide: [ff-fl-for-concrete-contractors.html](ff-fl-for-concrete-contractors.html)

A free browser tool and CLI for concrete floors specified by F-numbers. It
reads elevations taken every 12 inches, as typed sample lines, a grid CSV from
a laser level or total station, or a laser-scan point cloud, and works out:

- **FF flatness and FL levelness** after the ASTM E1155 method: per line, per
  section (all lines pooled) and overall (area-weighted over sections);
- **pass or fail** against specified overall and minimum local values;
- the **largest gap under a straightedge** (10 ft by default) laid along every
  line at every reading, resting on the high points;
- a **heat map** of the grid against its mean and a profile of any line;
- a **grind estimate**: which readings to lower, how deep and roughly how much
  concrete, to lift the section's FF to a target.

Who it is for: flatwork contractors and finishing foremen who want their own
number before the testing agency's report, general contractors reading a
failed report, and scanning/VDC people who hold a point cloud and no
flatness plugin. Commercial tools in this space are survey-instrument
software and paid point-cloud plugins; this one is free, runs offline in a
browser and is MIT licensed.

## Spec sources

- **Method:** ASTM E1155 (inch-pound), *Standard Test Method for Determining
  FF Floor Flatness and FL Floor Levelness Numbers*. The standard is sold by
  ASTM and was **not read** for this build (no copy is open, and the hosts
  serving copies were unreachable from the build session).
- **Equations, from secondary sources that agree:** FF = 4.57 / (3 S_q +
  |q̄|) with q the change in 12-in slope; FL = 12.5 / (3 S_z + |z̄|) with z
  the 10-ft elevation difference; inches throughout. Sources: PDHonline
  course S130 "Concrete Slabs and the Use of the F-Number System" and the
  Iceline estimating reference "Concrete - Slab Flatness and F-numbers", as
  quoted in web search results on 2026-11-19. A third source (an MIT
  repository, Lacrep/floor-inspect `fnumbers.py`) uses 4.57/S_q without the
  factor 3 or the mean; it disagrees with the two above and was not followed.
- **Overall value:** area-weighted mean, sum(A·F)/sum(A), as secondary copies
  of E1155 section 9.15 give it. One web source claimed low sections are
  weighted more; not followed, flagged on the page.
- **Who signs it off:** a testing agency or engineer of record running E1155
  with their own instrument and copy of the standard.
- **Pinned by test:** a 13-reading line worked by hand on the guide page
  (FF 48.3), recomputed independently in `page.test.mjs`; the FF/FL
  equations against hand arithmetic in `flatness.test.mjs`.

## Method details and choices

- Within a line, a missing reading (`-`, `x` or an empty grid cell) splits the
  line into runs; q and d are taken within runs only, never across a gap.
- A section's F-numbers pool every q (and every d) from all its lines; per-line
  values are shown for finding the bad lines, not for acceptance.
- Grids are read along every row and every column (two orthogonal
  directions). The edge band (`--edge`, "Leave out a band at the edges") drops
  readings near the grid's border; specs commonly exclude a band along joints
  and walls, and the width is yours to set (no default from the standard).
- Point clouds are resampled to a 12-in lattice: each node is the median z of
  points within a radius (3 in by default). Nodes with no points are holes.
- Straightedge: in each window of the chosen length, a rigid edge rests on the
  edge of the upper convex hull that straddles its centre; the gap is the
  largest distance from it to any reading under it, overhang included (on a
  crown the gap a tester sees is at the ends). Seen only every 12 in.
- Grind estimate: repeatedly lower the reading that stands highest above the
  mean of its neighbours (along every line through it) to that mean, until FF
  reaches the target. Grinding only lowers; the estimate is a rough lower
  bound on a 12-in lattice, ignores what lies between readings and the FL a
  grind can lose, and is not a grind plan.
- Small samples: fewer than 30 curvatures or 10-ft differences raise a note.
  That threshold is ours, not the standard's minimum sample size, which we
  could not read.
- Metric: readings convert to inches and 12-in spacing is assumed. E1155M
  uses 300 mm spacing with its own constants, not reproduced here.

## Not done (next)

- Run a real survey (profiler export, laser-level grid or scan) through it and
  compare with a testing agency's reported FF/FL for the same floor.
- Read the standard's own text: confirm the equations, 9.15's combination, the
  sample-size minimums, line placement and the 90% confidence intervals.
- Waviness Index (ASTM E1486) and wheel-track properties for defined-traffic
  floors (TR34), both common for very narrow aisle warehouses.
- Native readers for profiler and scanner formats (LAS/LAZ, E57).
- A branded acceptance-report PDF as a paid path, dark until a checkout link
  exists (`portfolio/monetization`).

## Use

Browser: open `index.html` (any static server), press "Load the example bay".

CLI (Node 18+):

```
node cli.mjs --example --edge 2 --ff 35 --fl 25 --ff-local 24 --gap 0.25 --grind 40
node cli.mjs survey.csv --unit mm --area 2400 --ff 35 --fl 25
node cli.mjs lines.txt --format lines --json
node cli.mjs scan.xyz --format xyz --unit m --radius 3
```

Tests: `node --test flatness.test.mjs page.test.mjs`.

The example bay is made up (a seeded sag, trowel ridges and one high spot),
not a measured floor.

## Privacy, licence, no warranty

Nothing leaves the browser: readings are calculated on the device and never
uploaded. An anonymous counter in local storage records which features were
used and the day (never a reading, an F-number or a file name); the page's
box turns it off. MIT licence ([LICENSE](LICENSE)).

**No warranty.** Provided as-is, without warranty of any kind. Not
engineering, construction, legal or financial advice, and not a test to ASTM
E1155 by a qualified testing agency. You are responsible for verifying any
result before relying on it.
