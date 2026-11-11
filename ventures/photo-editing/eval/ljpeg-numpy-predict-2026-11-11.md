# Lossless-JPEG prediction pass on numpy (2026-11-11)

## Why

`eval/ljpeg-decoder-2026-11-11.md` split the decoder into a Huffman pass and a prediction
pass and named "a numpy prediction pass" as open: on the Canon CR2's camera-written stream the
prediction pass was 2.3 s of 7.4 s, all of it C loops over 22 million Python ints. numpy is
already the optional develop engine (`raw_develop_np`), so the decoder can use it the same way:
optional, same samples, pure Python stays the reference.

## What changed

* `raw_develop_np.predict_rows` does predictors 1 and 2 (restart intervals on row boundaries,
  the layouts `_predict_rows` takes) as array sums. Predictor 1: each row is a running sum along
  x starting from its first column, and the first column is a running sum down y restarted on
  every fresh row. Predictor 2: a fresh row is `initial` plus a running sum along x, every other
  row adds to the row above, so each column is a running sum down y with the same restarts.
  Sums run in int64 and are reduced modulo 2^16 once, which is what masking each step gives
  because both predictors only add.
* `raw_develop._decode_scan` calls it when numpy is importable and the scan has at least 1,024
  pixels (below that, setup costs more than it saves: a 16 x 16 scan is 0.18 ms either way).
  `raw_develop.DECODE_ENGINE` is `"auto"`, `"python"` (the reference) or `"numpy"` (required).
* The numpy pass returns an `array('H')`; `parse_raw` copies it into the raw image without a
  per-sample step. The public `decode_lossless_jpeg` still returns a list.
* `tools/cr2_ljpeg_check.py --decode-engine auto|python|numpy`.

## Correctness

| check | result |
| --- | --- |
| `tests/test_ljpeg_fast.py` every case again on numpy (size floor 0, engine pinned to numpy) | 345 subtests pass; a spy confirms predictors 1 and 2 take the numpy path and 4 does not |
| `test_raw_develop` DNG storage variants (strips, tiles, two components, restarts) through `parse_raw` on numpy | pass |
| Canon CR2 (`RAW_CANON_5DMARK2_PREPROD.CR2`, rawpy test file), numpy pass, unsliced, vs LibRaw 0.28 `raw_image` | 0 of 22,032,768 sensels differ |
| same, vs the one-pass reference decoder | identical |

Seeded faults in `predict_rows`, each run against the numpy test class: dropping `initial` on
fresh rows in predictor 1 (41 cases fail) or predictor 2 (40), not subtracting the previous
segment in the restarted sum (48), ignoring restart rows (48), skipping the row sum (39);
handing `parse_raw` byte-swapped samples fails the DNG test. Dropping the final `& 0xFFFF` fails
nothing, and should not: the cast to uint16 already wraps.

## Speed

Python 3.13.18, numpy 2.5.3, build container (4 cores, one used). This container ran the pure
decoder slower than the one the earlier note was measured on (9.5-10 s against 7.4 s), so the
comparison is only within this table, three interleaved runs each:

| Canon CR2, 22.0 M samples | pure prediction | numpy prediction |
| --- | --- | --- |
| whole decode, as `parse_raw` uses it (array out) | 9.45-9.8 s | 6.55-7.33 s |
| of which after the Huffman pass | 3.84-4.09 s | 1.11-1.48 s |
| whole decode, public list API | 9.3-9.63 s | 7.26-7.8 s |

| synthetic DNG-shaped tile, two components | pure | numpy |
| --- | --- | --- |
| 128 x 256 x 2 (one 256 x 256 sensel tile) | 26.8-29.7 ms | 18.5-21.4 ms |
| 32 x 64 x 2 | 1.41-1.43 ms | 1.11-1.16 ms |
| 16 x 16 x 2 | 0.18 ms | 0.18-0.19 ms |

What is left in the numpy pass is mostly getting 22 M Python ints into an array (`np.fromiter`
as int32, 0.55 s); the sums are about 0.2 s. The Huffman pass (5.5-6 s here) is now about
85% of decoding and stays the floor without native code.

## Not covered

Predictors 3 to 7 and restart intervals that cut rows stay on the per-sample path (DNG writers
use predictor 1). A camera- or Adobe-written lossless DNG is still unread from this sandbox.
