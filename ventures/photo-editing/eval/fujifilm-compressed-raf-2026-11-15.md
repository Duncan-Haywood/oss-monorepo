# Fujifilm lossless compressed RAF, read directly (2026-11-15)

## Why

Since 2026-11-14 the developer reads Fujifilm RAFs itself (`eval/fujifilm-raf-reader-2026-11-14.md`),
but only uncompressed ones. From the X-Pro2 and X-T2 on (2016), Fujifilm bodies offer "lossless
compressed" raw, which roughly halves the file (the X-T2's 48 MB uncompressed RAF is 22 MB
compressed), and many photographers leave it on. Those files stopped at the grade stage with
"convert to DNG". The flagship row listed "a compressed RAF (X-T2 or later)" as the top open item,
and no session had one.

## Files

raw.pixls.us answered this session (an earlier README line recorded 403 from the sandbox: that has
changed). Its samples are CC0. Downloaded to the session's scratch space, not committed (18-50 MB each):

| file | body | sensor | mode | size |
|---|---|---|---|---|
| `X-T2/20170114_174341_TFW04727.RAF` | X-T2 | X-Trans, 24 MP | lossless compressed | 22 MB |
| `X-H1/fuji_xh1_compressed.RAF` | X-H1 | X-Trans, 24 MP | lossless compressed | 27 MB |
| `X-T3/AFXT2721.RAF` | X-T3 | X-Trans, 26 MP | lossless compressed | 26 MB |
| `X-S10/Fujifilm-X-S10-lossless-compressed.RAF` | X-S10 | X-Trans, 26 MP | lossless compressed | 25 MB |
| `GFX 50S/20170525_0037TEST.RAF` | GFX 50S | Bayer, 51 MP | lossless compressed | 48 MB |
| `X-S10/Fujifilm-X-S10-compressed.RAF` | X-S10 | X-Trans | lossy compressed | 18 MB |
| `X-E4/fuji_xe4_32_lossy.RAF` | X-E4 | X-Trans | lossy compressed | 19 MB |

(All under `https://raw.pixls.us/data/Fujifilm/`.)

## What was built

`src/shootflow/raf_compressed.py` (standard library), and `shootflow_fuji_strip` in the optional C
library `ljpeg_native` (built with the system compiler on first use, as for the NEF, ORF, RW2, SRW and
PEF decoders):

- The 16-byte header after the Fujifilm sub-IFD's data offset: signature 0x4953, a version byte
  (1 lossless, 0 lossy), raw type (16 X-Trans, 0 Bayer), bits, height, rounded width, width, strip
  width (768), strips per row, six-row groups. Then one byte count per strip, padded to 16 bytes.
- Each strip is coded on its own, six rows at a time, through 18 line buffers (five red, eight green,
  five blue, with two lines of history per colour), as six pairs of lines; the module docstring has
  the layout. Predictions come from decoded neighbours, a quantised gradient picks one of 41
  adaptive contexts per set (three sets), and the residual is a unary prefix plus a suffix whose
  length the context's running residual size sets, with an escape to a raw value.
- On X-Trans a line is two thirds of the strip's width (six sensels to four entries); line entries no
  sensel reads are interpolated, not coded. Which ones those are is worked out from the 6x6 layout
  (`_coded_masks`), not tabulated by hand: the red and blue lines of the first row pair code only
  odd entries, and the green lines of the two rows with only two greens in six do the same.
- `raf.decode_sensor` sends a block that starts with the signature here; the lossy version (0) is
  refused with a message naming the lossless and uncompressed camera settings. Strips run in
  parallel on `SHOOTFLOW_THREADS` threads (default up to 4) in C; with no compiler the Python
  decoder runs (the reference).
- White level: X-Trans stays `2^bits - 1` (the X-H1 frame clips there: 62,398 sensels at 16383). A
  Bayer RAF with a Fujifilm sub-IFD (the GFX 50S) now takes 0x3E00, as the older Bayer bodies
  already did and as LibRaw reports; the GFX frame has no clipped highlights to confirm it (18
  sensels at or above 15,872, all isolated).

This is an independent implementation of the format as LibRaw reads it, in this repository's own
structure. No LibRaw source was fetched or copied in this session; the layout and the coding were
written from the agent's own knowledge of the format, which (honestly stated) was learned in part from
open-source decoders such as LibRaw's `fuji_compressed.cpp` (LGPL/CDDL) and rawspeed's, since Fujifilm
publishes no specification. The format itself is an interoperability fact; the code is new. It was
then checked against LibRaw's output, value for value. Two details were found by that check, not
known in advance: which line entries are coded (derived from the layout, above), and that the third
line of each colour takes its edge pads from the second at the start of every six-row group (without
it the second group differed at the strip's right edge).

## Check against LibRaw

`PYTHONPATH=src python tools/raf_libraw_check.py FILE.RAF ...` with rawpy 0.28 (LibRaw 0.22.2) and numpy
in a venv, on four cores. Raw rows: `eval/fujifilm-compressed-raf-libraw-2026-11-15.jsonl`.

| body | sensels | differing | WB R/G, B/G (ours = LibRaw) | black | white | read s |
|---|---|---|---|---|---|---|
| X-T2 | 24,421,824 | 0 | 2.6921, 1.3841 | 1020 | 16383 | 0.61 |
| X-H1 | 24,421,824 | 0 | 1.9603, 1.8411 | 1023 | 16383 | 0.66 |
| X-T3 | 26,697,888 | 0 | 1.9503, 1.9338 | 1022 | 16383 | 0.75 |
| X-S10 | 26,697,888 | 0 | 1.6954, 2.3510 | 1022 | 16383 | 0.54 |
| GFX 50S (Bayer) | 57,231,360 | 0 | 1.6987, 1.7152 | 65 | 15872 | 0.99 |
| X-S10 lossy, X-E4 lossy | refused | | | | | |

- 159.5 M sensels over five bodies, every one equal, and the CFA layout, the 36 (or 4) black levels,
  the balance and the white level equal too.
- The pure-Python decoder, run on the four X-Trans files whole, also gives every sensel equal: 48-56 s
  a file. The C decoder: 0.56 s a file on four threads, 1.6 s on one.
- `shootflow develop --dcp` on the X-T3 file (with a profile holding LibRaw's matrix for that body,
  only to see the picture; no real Fujifilm `.dcp` was at hand): 24 s end to end, 6240 x 4160, the
  directional X-Trans demosaic, and the picture looks right (a yerba mate packet, neutral greys).
- Before the white-level change the GFX row differed only there (ours 16383, LibRaw 15872).

## Tests

`tests/test_raf_compressed.py` (10): a test-only encoder (the coding run backwards) writes streams of
known sensels, X-Trans and Bayer, 12 and 14 bits, three strips with a narrow last one, and residuals
large enough to take the raw-value escape; the Python and C decoders must give them back exactly.
A truncated stream raises on both. Header checks (raw type, strips not covering the width). The
coded-entry masks against the layout. `parse_raf` on a whole synthetic compressed RAF (X-Trans and
Bayer, with the Bayer white), and the lossy refusal. `tests/test_raf.py`'s refusal test now expects
the new message for a short uncompressed block.

## Not done

- **Lossy compressed RAF** (header version 0; the X-S10 and X-E4 files above): read since later the
  same day, every sensel equal to LibRaw's, `eval/fujifilm-lossy-raf-2026-11-15.md`.
- Older compressed bodies with 12-bit data (none found compressed on raw.pixls.us); the 12-bit
  path is tested on synthetic streams only.
- The GFX 50S white level is LibRaw's constant, not measured on a clipped frame.
- Colour on all these bodies needs the camera's `.dcp`; none is in the repository.
