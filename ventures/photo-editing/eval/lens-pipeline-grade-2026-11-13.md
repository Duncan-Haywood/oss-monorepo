# Lens correction in the pipeline's grade stage, on a real CR2 (2026-11-13)

## Why

The flagship's `next:` (`portfolio/flagships.yaml`, photo-editing) listed "the grade stage reading a
workspace lens database". Lensfun distortion, lateral colour and vignetting had landed for
`shootflow develop --lens-db` only. The overnight pipeline, which is how a photographer gets a
whole shoot's masters, never corrected a lens.

## What changed

- `color/lens-profiles/` in the shoot workspace (`lens_profiles.LENS_PROFILES_DIR`). With lensfun XML
  files in it, `production_adapter._materialize_ffmpeg_grade_production_outputs` passes the parsed
  database to `DevelopSettings(lens_db=...)` for every DNG and CR2, with the CLI's defaults (fill
  zoom, TCA and vignetting on).
- `<master>.lens.json` beside each such master: `corrected`, `lens`, `notes`, and the folder's file
  count. An unknown lens is graded uncorrected with the reason in `notes`, not stopped.
- `DevelopReport.lens` and `DevelopReport.lens_notes` (also in `shootflow develop`'s JSON): the lens
  whose correction ran and the notes about it, separated from the develop's other notes.
- The parsed database is cached per process under a lock (grade jobs run on several threads), keyed
  by each XML file's name, size and modification time.
- Refusals follow `color/camera-profiles/`: a symlinked `color/` or `color/lens-profiles/` stops the
  grade; a symlinked XML file is skipped; an unreadable XML stops the grade naming it.

## Real-file check

Inputs, downloaded at check time and not committed:

- `RAW_CANON_5DMARK2_PREPROD.CR2` from the rawpy repository's test folder (the file of
  `eval/cr2-pipeline-grade-2026-11-12.md`), 5616 x 3744, lens named only in the Canon maker note
  (`EF50mm f/1.2L USM`), FocalLength 50, FNumber 1.2;
- lensfun's `data/db` at commit `52cf1a7b0e82` (2026-11-04), 56 XML files, CC BY-SA 3.0.

`PYTHONPATH=src:tests VENV/bin/python tools/real_cr2_pipeline.py RAW_CANON_5DMARK2_PREPROD.CR2 WORK --lens-db lensfun/data/db`
(rawpy and numpy in the venv only to write the check profile from LibRaw's matrix, as before):

| | without `color/lens-profiles/` | with lensfun's 56 files |
| --- | ---: | ---: |
| rendered, nothing for review | yes | yes |
| master | 5616 x 3744 rgb48le | 5616 x 3744 rgb48le |
| master against `shootflow develop` on the same file, profile (and database) | max difference 0 | max difference 0 |
| whole pipeline (card of one CR2 and one clip, 2 workers, 4 CPUs) | 10.9 s | 14.1 s |

The lens note:

```json
{
 "corrected": true,
 "graded_output": "graded/grade_asset_00001/IMG_0001.CR2.tif",
 "kind": "lens_correction",
 "lens": "Canon EF 50mm f/1.2L USM",
 "lens_database": "color/lens-profiles/ (56 XML files)",
 "notes": [
  "no vignetting correction: Canon EF 50mm f/1.2L USM has no vignetting calibration near 50 mm f/1.2 for crop factor 1",
  "lens correction from lensfun: Canon EF 50mm f/1.2L USM [slr-canon.xml], ptlens, calibrated at 50 mm; crop factor 1, zoom 0.9954 to fill the frame"
 ]
}
```

The corrected and uncorrected masters differ in 92.2% of samples, by a median 1,240 of 65,535
(p99 9,592): the fill zoom of 0.9954 and the ptlens warp move nearly every pixel a little. Loading
the database takes 0.27 s (1,580 lenses, 1,059 cameras), once per process.

## Tests

`tests/test_lens_pipeline.py`, 8 tests (about 18 s, ffmpeg needed for four of them):

- a synthetic CR2 (`test_cr2.make_cr2(lens_name=..., focal=50, fnumber=1.2)`, now able to write
  FNumber and FocalLength) through ingest, proxy, analysis and grade with a made-up database: master
  equal to `shootflow develop --dcp --lens-db`, unequal to the uncorrected develop; the note names the
  lens and the vignetting; notes only beside raws; no temporary files left;
- a lens the database lacks: master equal to the uncorrected develop, note `corrected: false` with
  the reason;
- no folder: no note, master unchanged;
- unreadable XML: the grade stops for review naming `color/lens-profiles: canon.xml`;
- the cache returns the same database until a file changes; symlinks; a folder with no XML.

Faults seeded by hand while writing them, each failing at least one test: the adapter not passing
`lens_db`; the note not written; the cache key without modification time.

## Not checked

- A real DNG with no lens warp of its own through the pipeline (the code path is the same
  `develop_file` call; the synthetic tests are CR2 only).
- A real lens with a vignetting calibration through the pipeline: the 5D Mark II's 50 mm f/1.2 has
  none in lensfun at f/1.2 (the synthetic test covers vignetting).
- A per-workspace switch to turn single corrections off (TCA, vignetting). Today it is all three or
  none, by the folder's presence.
