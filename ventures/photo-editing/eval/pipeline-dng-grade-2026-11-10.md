# DNG stills through the overnight pipeline (2026-11-10)

What changed: the grade stage (`ffmpeg-grade-production-local`) develops a DNG still from its
sensor data (`raw_develop.develop_file`) into a scratch 16-bit TIFF and grades that into
`graded/<job>/<name>.DNG.tif`. A DNG with no embedded JPEG preview gets its review proxy and its
analysis scores from a half-size development (`raw_develop.still_for_review`) instead of
failing. Other RAW formats are still scored from their preview and stop at the grade with
"convert CR2 to DNG (Adobe's free DNG Converter)".

## Real sensor data

File: rawpy's `test/iss030e122639.NEF` (a NASA photo from the ISS, Nikon, 12 MP, RGGB), its
sensor data and metadata written into an uncompressed DNG by `tools/libraw_differential.py
--keep` (so the DNG has no embedded preview, the harder case). Card: that DNG as
`ISS_0001.DNG` plus one 1 s synthetic clip. Command: `tools/real_dng_pipeline.py` (ingest,
`run_local_pipeline`, then compare), one run on the shared build container.

| check | result |
|---|---|
| pipeline | rendered, nothing for review, 74.5 s wall (full develop about 37 s, two half develops about 12 s each) |
| graded master | 4284x2844, rgb48le (16-bit TIFF) |
| master vs `shootflow develop` TIFF of the same DNG | bit-identical (max difference 0 of 65535), so grading with no LUT adds no loss |
| master vs LibRaw's render (8-bit PNG from `--keep`) | mean 0.29/0.29/0.29 of an 8-bit step, p99 0.78, max 1.46; 11,138 pixels (0.09%) over one step |
| proxy | 1024x680 JPEG from the half-size development |
| analysis | `frame_metrics` (measured scores, not the sha256 stand-in) |
| deliverables | reel, three reel variants, carousel slide and photo-set image |

The gap to LibRaw is larger than the 0.09 to 0.12 mean in `raw-develop-libraw-2026-11-10.md`
because the reference here is LibRaw's render as `--keep` saves it, an 8-bit PNG, compared with
a 16-bit master: rounding the reference alone is up to half a step. The bit-identical row is
the one that tests this change.

## Tests

`tests/test_ffmpeg_pipeline.py`:

- `test_dng_still_is_developed_into_a_16_bit_graded_master`: a synthetic DNG of a red scene
  (linear 0.40/0.10/0.08, through a camera matrix, mosaicked, no preview) goes through the
  whole pipeline; the master is rgb48le at full size and its centre is the scene's sRGB value
  (170/89/80) within 3 steps; the proxy is half size; the analysis is measured.
- `test_non_dng_raw_with_a_preview_stops_at_grade_naming_the_dng_route`: a CR2 with an
  embedded preview passes proxy and analysis and stops at the grade with the DNG message.

Full suite: 539 tests, the same two failures as on `main` before the change
(`test_real_photo_calibration` needs a working Pillow, the system one is broken here;
`test_workspace_health` unreadable-file check cannot fail as root).

Not checked: a DNG written by a camera or by Adobe's converter (the DNG here is written by our
tool), a shoot LUT on a 16-bit master with real colours (the LUT path is the same ffmpeg
`lut3d` filter the JPEG path uses, tested with an inverting LUT), and a shoot of many DNGs
(each full develop is tens of seconds of pure Python, so 500 DNGs is hours: fine overnight).
