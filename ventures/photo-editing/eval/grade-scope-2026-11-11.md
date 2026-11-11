# Grade only the picks (2026-11-11)

`SHOOTFLOW_GRADE_SCOPE=selected` (or `run-local-pipeline --grade-scope selected`)
makes full-resolution masters only for assets the storyline picks. Every other
asset is graded from its review proxy instead.

## Why this is safe

The storyline (`story.build_storyline_plan`) is a pure function of the
analyses. By the time a grade job runs, its look dependency has succeeded, and
the look depends on the scene stage, which depends on every analysis job. So
every analysis file is already final and checked against its sha256 in
`production_status.json`. The grade stage runs the same function on the same
analyses and gets the picks the story stage will make: the hero reel, the
three reel variants, the carousel and the photo set. The photo set takes every
photo, so in practice only video clips get review grades. As a backstop, the
story stage refuses to run if any pick has a `.review-grade.json` note beside
its master.

## Measurement

`PYTHONPATH=src python3 eval/grade_scope_bench.py` (defaults: `--takes 3
--seconds 10`). The card holds 12 synthetic 1080p30 clips with audio: four
static test-pattern shots, three takes each, 10, 11 and 12 s long. Takes of one
shot share a perceptual hash, the way repeated takes do. It also holds three
6000x4000 JPEGs. The bench ingests the card twice and runs the unattended
pipeline once per scope, `max_concurrency=2`, software encoders (`prores_ks`,
`libx264`), on the 4-core build container.

| scope | grade stage | whole pipeline | review-graded clips | graded .MOV bytes | rendered |
| --- | --- | --- | --- | --- | --- |
| all | 164.4 s | 214.0 s | 0 of 12 | 365.1 MB | yes |
| selected | 87.8 s | 129.5 s | 6 of 12 | 276.3 MB | yes |

The picks were six clips: one per shot in the hero reel, plus what the 45 s
fast-cut variant could fit. The grade stage took 47% less time. The rest of
the pipeline did not change. Disk fell only 24%, because a 960x540 ProRes HQ
file of a static test pattern is not a quarter the size of a 1080p one.

## How much it saves depends on the shoot

The picks are capped: at most 24 clips and 90 s in the hero reel, and 45 s in
each of the other two variants. So at most about 180 s of footage is ever
graded at full resolution, however long the shoot is. A wedding card with 300
ten-second clips (50 minutes) would get full masters for at most about 6% of
its footage. That projection has not been measured. A short shoot where most
clips get picked saves little.

## Not checked yet

- Real camera footage (4K, 10-bit, long GOP) and VideoToolbox on a Mac.
- Whether photographers want masters of every clip anyway, for example for
  their own edit in Resolve or Premiere. That is why the default stays `all`.
