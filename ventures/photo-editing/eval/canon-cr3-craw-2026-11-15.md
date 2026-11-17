# Canon CR3 C-RAW read directly (2026-11-15)

## Why

C-RAW is the smaller of the two raw qualities on every Canon body since 2018: roughly 40% smaller
files (16.9-17.0 MB against 37.6 MB for the same EOS R8 frame size in the public set). Earlier on
2026-11-15 ShootFlow learned to read full-quality CR3 (`eval/canon-cr3-reader-2026-11-15.md`) and
refused C-RAW with "convert to DNG first". Three of the five public CR3 files are C-RAW, so that
refusal hit most of the real files at hand. This run reads them.

## Files

The same public metadata-extractor-images collection (`cr3/`, sparse checkout; its README: "You are
free to use these media files however you wish"), downloaded at check time and not committed.

| file | body | CMP1 version, levels | tile | QP grid |
| --- | --- | --- | --- | --- |
| `IMG_0041.CR3` | EOS R8 | 0x200, 3 | one, 3094 x 2060 per plane | 387 x 1030 |
| `_MG_0045.CR3` | EOS R8 | 0x200, 3 | one | 387 x 1030 |
| `Canon EOS R3.cr3` | EOS R3 | 0x200, 3 | one, 3096 x 2076 per plane | 387 x 1038 |

All three carry a 0xFF11 tile header (with a QP stream) and 0xFF13 subband headers (a step multiplier
and base per subband). None has several tiles or the old 0xFF03 per-line quantisation.

## Result

`tools/cr3_libraw_check.py` against LibRaw 0.22 (rawpy), output in
`canon-cr3-craw-libraw-2026-11-15.jsonl` (the two full-quality files rerun in the same pass):

| file | sensels differing (C / Python) | of | balance R/G, B/G (ours = LibRaw) | black ours / LibRaw | CFA | white | read C / Python |
| --- | --- | --- | --- | --- | --- | --- | --- |
| IMG_0041 | 0 / 0 | 25,494,560 | 1.3779, 2.3652 | 2047-2048 / 2047-2048 | RGGB = | 16383 = | 0.66 s / 27.8 s |
| _MG_0045 | 0 / 0 | 25,494,560 | 1.3779, 2.3652 | 2047-2048 / 2047-2048 | RGGB = | 16383 = | 0.57 s / 28.3 s |
| Canon EOS R3 | 0 / 0 | 25,709,184 | 1.8555, 2.0566 | 2048 / 2047 | RGGB = | 16383 = | 0.74 s / 24.7 s |
| IMG_0036 (RAW) | 0 / 0 | 25,494,560 | unchanged | | | | 0.50 s / 31.2 s |
| _MG_0039 (RAW) | 0 / 0 | 25,494,560 | unchanged | | | | 0.44 s / 28.3 s |

Every sensel of all three C-RAW files equals LibRaw's, with both decoders. Black is measured in the
optical-black rectangle, as for the RAW quality, and stays within 1 of LibRaw's stated level.

A half-size develop against LibRaw's render (`tools/cr2_develop_check.py`, which runs on CR3
unchanged, with a profile built from LibRaw's own matrix for each body):

| file | median / 99th percentile difference (8-bit steps) | linear R, G, B ratio to LibRaw |
| --- | --- | --- |
| Canon EOS R3 | 0.24 / 1.37 | 0.999, 0.999, 0.998 |
| IMG_0041 (R8) | 2.32 / 30.4 | 1.031, 0.955, 0.971 |

The R3 frame was shot near daylight, where the two colour models agree, and develops to within a
quarter of a step. The R8 frame is the same tungsten scene as the full-quality R8 files, with the same
gap that `eval/canon-cr3-reader-2026-11-15.md` traced to the colour model (DNG's white adaptation in
XYZ against dcraw's channel scaling), not to the data, which is equal sensel for sensel.

## How the codec was pinned down

Written independently from the format as LibRaw's `crx.cpp` decodes it (LGPL-2.1/CDDL; read for the
format, no code copied), in `src/shootflow/cr3_wavelet.py`, with the C twin
`shootflow_craw_plane` in `src/shootflow/ljpeg_native.py`. The pieces:

1. **Layout.** One tile header, then per plane a plane header and ten subband headers (LL, then HL,
   LH, HH for each of three levels, deepest first). The tile's data starts with the QP stream, then
   an extra block (1 or 4 bytes here), then the planes; each subband's bytes end with padding its
   header states.
2. **Quantisation.** The QP grid (one value per 8 plane columns and 2 rows) is coded with the same
   median edge predictor as the lossless bands and a Golomb code capped at K 7, plus 4. Each level
   averages it down (2 rows for the middle level; 4 rows, summed and shifted, for the deepest). A
   QP becomes a step through six values per octave; a coefficient is multiplied by
   `base + (step * mult >> 3)`, clamped to 1..0x168000. On these files the LL bands have step 1
   (base 1, multiplier 0), the middle levels multiplier 4 and the finest 8 (HH 16).
3. **The LL band** is coded exactly as a lossless band (the existing `cr3.decode_band`).
4. **Every other band** uses no value prediction: run mode (a run of zeros) wherever the left, above
   and above-right coefficients are zero, a value right after a run coded one step toward zero, and
   a Rice parameter nudged up when the column above was coded with a parameter more than one higher.
5. **The inverse.** The standard reversible 5/3 lifting with symmetric edges, rows then columns, per
   level. LibRaw runs it as a line-by-line streaming state machine; here each band is decoded whole
   and the inverse is done a level at a time, which is simpler and gives the same integers.

The first full decode of plane 0 matched LibRaw at every sensel, so no detail had to be found by
brute force this time; the lossless run's run-flag finding (`canon-cr3-reader-2026-11-15.md`) is
shared code.

## Speed

The pure-Python reference reads a 25.5 MP C-RAW in 25-28 s. The C path decodes each plane whole on
its own thread (ctypes lets go of the GIL): 0.57-0.74 s a file on this container, close to the
0.44-0.50 s of the lossless setting.

## Tests

`tests/test_cr3_wavelet.py`, 13 tests: a forward 5/3 written in the test (columns then rows) undone
exactly by the inverse on odd and even sizes down to 1; subband sizes for a real R8 plane; the QP-to-step
table and the per-level averaging (including C's truncation for negative QPs); dequantisation with its
clamp; an encoder written as the high-pass decoder's mirror round-tripping sparse bands with runs to
the line's end, values in the last column right after a run and values past the 41-zero escape; and
a whole synthetic C-RAW CR3 (each plane run through the forward transform, LL coded like a lossless
band, the rest with the high-pass code) read back sensel for sensel at 3 and 1 levels on both
engines. Four hand mutations of the decoder (the Rice nudge, the inverse's edge rounding, the step
formula's shift, the after-run value mapping) each fail 1-18 tests.

Tests that changed: `test_cr3.py` and `test_ffmpeg_pipeline.py` used a synthetic C-RAW file as the
example of a CR3 that is refused. They now use an unknown codec version (0x300) and a tiled sensor,
and the tiled refusal names Adobe's DNG Converter as the C-RAW one did.

## Reproduce

    python3 -m venv /tmp/v && /tmp/v/bin/pip install rawpy numpy
    git clone --depth 1 --filter=blob:none --sparse https://github.com/drewnoakes/metadata-extractor-images.git mei
    (cd mei && git sparse-checkout set cr3)
    PYTHONPATH=src /tmp/v/bin/python tools/cr3_libraw_check.py mei/cr3/*.*3 --engines c,python
    PYTHONPATH=src:tests /tmp/v/bin/python tools/cr2_develop_check.py "mei/cr3/Canon EOS R3.cr3"

## Not done

- **Several tiles.** Bodies with wide sensors (the R5 at 8192 columns) may store two tiles side by
  side; tiles add edge coefficients (LibRaw's `exCoefNumTbl`) and change the lifting at the seams.
  Refused, naming the DNG Converter. No test file.
- **Old-style subband headers** (0xFF03 with a per-line `qParam` update) and tiles with no QP stream:
  refused, no test file.
- **Other bodies.** Two bodies (R8, R3) only; the format is the same CRX codec across bodies, but
  only these were checked.
