# Lossless-JPEG decoder: a camera-written stream, and two passes (2026-11-11)

## Why

DNG files from cameras and from Adobe's converter usually store sensor tiles as lossless JPEG
(ITU T.81 process 14, SOF3). ShootFlow's decoder had only read streams written by its own
test encoder and by ffmpeg, and its speed on a real-size stream was unmeasured
(`portfolio/flagships.yaml`). raw.pixls.us and rawsamples.ch, where real DNGs live, answer 403
from the build sandbox.

A Canon CR2 is a way in: it stores its sensor data as **one lossless JPEG the camera wrote
itself**, in the fourth IFD, after cutting the sensor into vertical slices (tag 0xC640). The
same decoder the DNG reader calls can decode it, and LibRaw's `raw_image` is the answer to
compare with.

## File

`RAW_CANON_5DMARK2_PREPROD.CR2` from rawpy's test folder on GitHub (also used in
`raw-develop-libraw-2026-11-10.md`; not committed). Raw IFD: strip of 23,068,813 bytes;
SOF3 frame 1448 x 3804, four components, 14-bit precision; two DC Huffman tables (identical
code lengths, 2 to 10 bits, sizes 0 to 14), predictor 1, no restart interval; slices
(2, 1936, 1920), so 5792 columns.

## Correctness

`PYTHONPATH=src python tools/cr2_ljpeg_check.py FILE.CR2 --reference` (rawpy 0.28.0, numpy, in
a scratch venv):

| check | result |
| --- | --- |
| our decode, slices put back, vs LibRaw `raw_image` (5792 x 3804) | 0 of 22,032,768 sensels differ |
| new two-pass decoder vs the old one-pass decoder | identical |

## Speed (pure Python 3.11, build container, 4 cores, one used)

| stream | old one-pass | two-pass | |
| --- | --- | --- | --- |
| Canon CR2, 22.0 M samples, camera-written | 16.8-17.2 s | 7.3-7.5 s | 2.2x |
| one DNG-shaped tile, 128 x 256 x 2 (256 x 256 sensels), synthetic smooth, test encoder | 52 ms | 19 ms | 2.75x |

Where the two-pass time goes on the Canon: Huffman pass 5.0-5.9 s, prediction pass 2.3 s
(slicing, `accumulate`, row sums, slice assignment, a min/max range check; all C loops over
22 M Python ints). A 12 MP DNG in 256 x 256 tiles is about 183 tiles, so about 3.5 s of
decoding instead of 9.5 s.

Tried and not kept: a 14- or 16-bit look-up table instead of 12 bits (5.4 s and 5.1 s against
5.1 s: the table width is not the cost, the per-sample interpreter work is); refilling the
bit buffer from a list padded with zero words instead of a bounds check (slower, 236 vs 208 ns
a sample). About 0.2 microseconds a sample is the floor for this design in CPython; going
lower needs native code (numpy cannot vectorise a Huffman stream).

## What changed

`raw_develop._decode_scan` now:

1. cuts the entropy-coded data at its markers (restart intervals one segment each), removes
   the `FF 00` stuffing with `bytes.replace`, and reads it as big-endian 32-bit words;
2. decodes differences through `_combined_lookup`: a 12-bit table whose entries hold the
   whole difference when code plus extra bits fit in 12 bits, the code length and size when
   they do not, and nothing for codes longer than 12 bits (decoded bit by bit, as before);
   tables are cached by content, since DNG tiles repeat them;
3. predicts: predictor 1 as one running sum per component over the image, with each row's
   first difference rewritten so the sum restarts from the sample above (or from the initial
   value on a fresh restart row); predictor 2 as an element-wise add of the row above; any
   other predictor, or restart intervals that do not fall on row boundaries, one sample at a
   time as before. Sums are taken modulo 2^16 at the end, which equals masking every step
   because these predictors only add.

The old decoder stays as `_decode_scan_reference`; `tests/test_ljpeg_fast.py` checks both
against the encoded samples on 345 cases built to reach every branch (see README). Seeded
faults (dropping the row-start rewrite, an off-by-one in the table's fit test, the restart
row test, the size-16 value, the sign rule for extra bits, the long-code bit position) each failed 37 to 308 of
the cases.

## Not covered

A DNG written by a camera or by Adobe's converter (tiles, per-tile tables) is still unread:
the CR2 stream checks the decoder, not the DNG tile layout around it. Reading CR2 files
directly (instead of converting to DNG first) would now be mostly a container job, but needs
per-model colour matrices that the file does not carry.
