# Canon CR2 through the overnight pipeline's grade stage (2026-11-12)

## Why

`portfolio/flagships.yaml` (photo-editing `next:`), first item: "CR2 in the pipeline's grade
stage (a per-camera `.dcp` setting; `shootflow develop` already reads CR2)". Since the morning
of 2026-11-12 `shootflow develop` read a CR2 with `--dcp`, but the overnight pipeline still
stopped every CR2 at the grade stage with "convert CR2 to DNG". A Canon shooter running the
pipeline unattended got proxies and scores and no masters.

## What changed

- `src/shootflow/camera_profiles.py` picks a `.dcp` per file from a folder, by the camera
  that took it (Make and Model read from IFD0 alone, spelled as a DNG's UniqueCameraModel
  would be). The rule, in order: a file named `<camera>.dcp` (the photographer's explicit
  choice; case and repeated spaces ignored); else the one profile whose own UniqueCameraModel
  tag names the camera; else, among several, the one whose ProfileName or file name says
  "Adobe Standard" (Lightroom's and Camera Raw's default, and Adobe's DNG Converter installs
  several per body); else the file is refused naming the candidates. With no profile for the
  camera, the refusal lists which cameras the folder has profiles for. Symlinks and files that
  are not profiles are skipped.
- The grade stage (`ffmpeg-grade-production-local`) develops a CR2 like a DNG, with the
  profile from the workspace's `color/camera-profiles/` (beside the shoot LUT,
  `color/shoot_look.cube`), into `graded/<job>/IMG_0001.CR2.tif`. A symlinked `color/` or
  `color/camera-profiles/` is refused. With no profile it stops for review with the message
  above, naming the folder.
- `shootflow develop --dcp FOLDER` does the same per CR2 for a batch from mixed bodies, and
  reports `camera_profile` and `camera_profile_rule` for each file.
- Other RAW formats (NEF, ARW, CR3, ...) still stop at the grade with the DNG message.

## Real file

`RAW_CANON_5DMARK2_PREPROD.CR2` from rawpy's test folder (Canon EOS 5D Mark II, 21 MP, ISO
3200), with one 1 s synthetic clip, through ingest and `run_local_pipeline`
(`tools/real_cr2_pipeline.py`, one run on the shared build container, Python 3.13, numpy and
the native Huffman reader). The workspace's `color/camera-profiles/` held two profiles: one for
the 5D Mark II written at run time from LibRaw's matrix for the camera (never committed), and a
decoy tagged "Canon EOS 7D" with half that matrix.

| check | result |
| --- | --- |
| pipeline | rendered, nothing for review, 7.1 s wall |
| profile picked | the 5D Mark II one (by its tag); the decoy was not used |
| graded master | 5616x3744, rgb48le (16-bit TIFF), 125.5 MB |
| master vs `shootflow develop --dcp` with the same profile | bit-identical (max difference 0 of 65535) |
| proxy | 1024x683 JPEG from the camera's embedded preview |
| analysis | `frame_metrics` (measured scores) |
| deliverables | reel, three reel variants, carousel slide and photo-set image |

How close that render is to LibRaw's is in `eval/cr2-direct-2026-11-12.md` (median 0.61 of an
8-bit step at half size); this run checks only that the pipeline adds nothing to it.

## Tests

`tests/test_camera_profiles.py`, 12 tests: one tagged profile chosen; a file named for the
camera beats a tagged one (a renamed regional profile); Adobe Standard chosen among three;
two with no Adobe Standard refused, naming both; none for the camera refused, naming the
cameras present, with a non-profile `.dcp`, a `.txt` and a dangling symlink skipped; a
symlinked profile ignored; a missing folder; the camera read from a CR2 and refused for a
NEF; `develop --dcp FOLDER` gives the same bytes as `--dcp` with that profile alone, and
refuses a folder with nothing for the camera; a synthetic CR2 with an embedded preview through
the whole pipeline renders, its master the same pixels as `shootflow develop`; and with no
profile it stops at the grade naming `camera-profiles`. The old test that a CR2 stops at the
grade now uses a NEF. Full suite: 670 passed, 3 skipped (Python 3.13, numpy); mypy clean.

## Not done

- A real Adobe `.dcp` (not in the container), so the "Adobe Standard" rule is tested on
  synthetic profiles only.
- A CR2 with no embedded preview still fails its proxy (real Canon bodies always write one).
- Regional model names (600D / Rebel T3i / Kiss X5) are matched only by renaming the profile
  file; no alias table.
- Other Canon bodies on real files (raw.pixls.us and rawsamples.ch 403 from cloud).

## Reproduce

    python3 -m venv /tmp/v && /tmp/v/bin/pip install rawpy numpy
    curl -LO https://raw.githubusercontent.com/letmaik/rawpy/main/test/RAW_CANON_5DMARK2_PREPROD.CR2
    PYTHONPATH=src:tests /tmp/v/bin/python tools/real_cr2_pipeline.py RAW_CANON_5DMARK2_PREPROD.CR2 /tmp/work
