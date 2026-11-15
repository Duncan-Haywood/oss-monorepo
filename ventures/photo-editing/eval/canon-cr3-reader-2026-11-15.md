# Canon CR3 read directly (2026-11-15)

## Why

Every Canon body since 2018 writes CR3. Until today ShootFlow scored those files from their preview
and stopped them at the grade stage with "convert to DNG first". CR2 had been read directly since
2026-11-12, but no Canon body sold in the last seven years writes CR2. The flagship's `next:` listed
"newer CR2s (ColorData8-11)" from raw.pixls.us. That host still answers 403 from this container
(`CONNECT tunnel failed, response 403`, checked today). So this run took the format those newer
bodies actually write, using the files that can be reached.

## Files

The public metadata-extractor-images collection on GitHub (`cr3/`, sparse checkout; its README:
"You are free to use these media files however you wish"). The files are downloaded at check time
and not committed.

| file | body | CMP1 version, wavelet levels | quality |
| --- | --- | --- | --- |
| `IMG_0036.CR3` | EOS R8 | 0x100, 0 | RAW (lossless) |
| `_MG_0039.CR3` | EOS R8 | 0x100, 0 | RAW (lossless) |
| `IMG_0041.CR3` | EOS R8 | 0x200, 3 | C-RAW |
| `_MG_0045.CR3` | EOS R8 | 0x200, 3 | C-RAW |
| `Canon EOS R3.cr3` | EOS R3 | 0x200, 3 | C-RAW |

## Result

`tools/cr3_libraw_check.py` against LibRaw 0.22 (rawpy), output in `canon-cr3-libraw-2026-11-15.jsonl`:

| file | sensels differing (C / Python) | balance R/G, B/G (ours = LibRaw) | black ours / LibRaw | CFA | white | read |
| --- | --- | --- | --- | --- | --- | --- |
| IMG_0036 | 0 of 25,494,560 / 0 | 1.3838, 2.3818 | 2047-2048 / 2047 | RGGB = | 16383 = | 0.53 s C |
| _MG_0039 | 0 of 25,494,560 / 0 | 1.3818, 2.3760 | 2048 / 2047-2048 | RGGB = | 16383 = | 0.51 s C, 34.6 s Python |

The three C-RAW files are refused with "C-RAW (the smaller, wavelet-coded quality) is not supported
yet; shoot RAW, or convert to DNG with Adobe's free DNG Converter".

A full develop with `shootflow develop IMG_0036.CR3 --dcp` takes 2.7 s, from the file to a 6000 x 4000
16-bit TIFF master (numpy, four cores). The profile was built from LibRaw's own matrix for the
R8, as `tools/cr2_develop_check.py` does, because no Adobe R8 profile was at hand. Against LibRaw's
half-size render (`tools/cr2_develop_check.py` runs on CR3 unchanged) the median difference is 2.3
8-bit steps (99th percentile 31-32). In linear light red is 3% higher and green and blue 3-5% lower.
The frames were shot at about 3,400 K, where `eval/cr2-brightness-gap-2026-11-12.md` found the two
colour models part most: DNG adapts the white in XYZ, while dcraw scales the camera channels and
then applies a D65 matrix. With every sensel, the balance and the black level equal, the gap is the
colour model, not the data. Saying which model is closer still needs a colour chart under that light,
the item already open for CR2.

## How the codec was pinned down

The decoder follows the format as LibRaw's `crx.cpp` decodes it. It was written independently,
and LibRaw's raw values served as the oracle, line by line, on plane 0 of IMG_0036. Two details
had to be found that way:

1. **The run flag counts as one sample.** In run mode, a first bit of 0 means no run. A first bit of
   1 starts the count at 1 (not at 1 << J[s]), and each further 1 adds 1 << J[s] and moves the run
   index up. The first reading tried (JPEG-LS's, where the first 1 already adds 1 << J[s]) decoded
   lines 0-2 exactly and then went wrong at the end of line 3, where a run reached the line's end.
   Brute-forcing the run index there showed that the bits stayed aligned and the run length was
   what was off.
2. **Black is not "every column left of the crop" on the R8.** The CR2 rule read 2053-2054 against
   LibRaw's 2047. Column medians show the masked area ends near column 154, while SensorInfo's
   crop starts at 168. IAD1 (in the raw track's CDI1 box) lists the crop, the left optical black
   (columns 0-155), the top optical black and the active area. Measuring inside the left optical
   black gives 2047-2048.

## Tests

`tests/test_cr3.py`, 12 tests. A CRX encoder written in the test as the decoder's mirror round-trips
random bands through both decoders. The bands include zero runs on the top line, lines equal to
the one above (runs to the line end), flat lines and jumps past the 41-zero escape. A whole
synthetic CR3 (ftyp, Canon uuid with CMT1-CMT3, a CRAW entry with CMP1 and CDI1/IAD1, a CTMD
track with ColorData11) checks every inferred tag. The other tests cover: exposed columns left of
the crop kept out of black by IAD1 (and let in without it, with a note); an unknown ColorData
length; C-RAW and tiled sensors refused; and a develop with a profile (and the "CR3 carries no
colour matrix" error without one); and the profile chooser refusing a C-RAW file before it asks
for a profile. Putting back the JPEG-LS run reading fails 7 tests, so the tests catch it.

**Pipeline tests that changed.** The planner and pipeline tests had used `IMG_0001.CR3` as their
example of a raw the grade stage does not develop. A CR3 is developed now, so its graded output is
named `.CR3.tif`, as a CR2's is, and those tests now expect that (`test_assembly`,
`test_production`, `test_production_adapter`, `test_production_scheduler`). The test that a raw
stops at the grade stage with the DNG route named now uses a synthetic C-RAW CR3 with a preview
appended. It checks for the C-RAW refusal, which also names Adobe's DNG Converter. The full
photo-editing suite passes (`platform/ci/run_venture_tests.py photo-editing`: 0 failed, 8 skipped,
151.5 s).

## Reproduce

    python3 -m venv /tmp/v && /tmp/v/bin/pip install rawpy numpy
    git clone --depth 1 --filter=blob:none --sparse https://github.com/drewnoakes/metadata-extractor-images.git mei
    (cd mei && git sparse-checkout set cr3)
    PYTHONPATH=src /tmp/v/bin/python tools/cr3_libraw_check.py mei/cr3/*.*3 --engines c,python

## Not done

- **C-RAW** (CMP1 version 0x200, three wavelet levels): per-tile quantisation tables, quantised
  subbands and an inverse 5/3 wavelet. Three real files are at hand to check it against.
- **Several tiles**: refused, with no test file. Bodies with very wide sensors (the R5 at 8192
  columns) may store two tiles side by side.
- **Bodies other than the R8**: the R8 is the only full-quality body in the public set. The R3 file
  is C-RAW.
- **An Adobe R8 profile and a colour chart**: needed to judge colour, as for CR2.
