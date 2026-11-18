# Point-transform scans predict in C; the raw plane is one buffer (2026-11-14)

Two items left open by `eval/native-destuff-2026-11-13.md` and
`eval/parallel-tile-placing-2026-11-13.md` ("Not done").

## 1. C prediction for point-transform scans

A lossless-JPEG scan may carry a point transform `Pt`: the stored samples are the real ones
shifted right by `Pt`, and the decoder shifts them back left. Since 2026-11-13 the C reader
turned differences into samples (`shootflow_predict`) only when `Pt` was 0. Any other scan fell
back to the numpy pass (predictors 1 and 2) or the one-sample-at-a-time Python pass
(predictors 3-7), followed by a Python list comprehension for the shift, all holding the GIL.

Now `shootflow_predict` takes `pt` (0-15). It predicts on the stored values exactly as before,
then shifts every sample left by `pt` in a second pass, so the predictors still read unshifted
neighbours (what `_predict_scan` does). If a stored sample has any of its top `pt` bits set, the
shift would not fit in 16 bits; C then returns -1 and the Python pass decides, keeping the wide
value as it always has (a corrupt or hostile file; a valid one never has these).

### Same samples

- `tests/test_ljpeg_native.py::NativePredictionTests` pins the prediction to C
  (`DECODE_ENGINE = "native"`, which raises on any fall-back) and runs every encoder case of
  `tests/test_ljpeg_fast.py`, including the `pt = 2` cases that used to stay in Python.
- `test_c_prediction_is_taken_with_a_point_transform`: a spy confirms the C pass is taken and
  succeeds for `pt` 1, 2, 4 and 15 at predictors 1 and 6.
- `test_point_transform_shift_matches_python_and_declines_overflow`: for `pt` 1, 3 and 8 the
  C output equals the Python pass's `v << pt`; one stored sample one bit too wide makes C
  decline; `pt = 16` is declined.
- `eval/point-transform-c.py` below: the new route, the old route and the pure reference
  decoder give identical samples, equal to the encoded source.

### Time

`PYTHONPATH=src:tests python3 eval/point-transform-c.py` (output in
`eval/point-transform-c.out.txt`): a synthetic 1,000 x 750, two-component, 14-bit, `Pt = 2`
scan of smooth content, seven decodes each, this container (4 CPUs, Python 3.13, numpy 2.5.3):

| predictor | before (median) | after (median) | speed-up |
| ---: | ---: | ---: | ---: |
| 1 | 0.098 s | 0.023 s | 4.3x |
| 4 | 0.756 s | 0.025 s | 30.8x |
| 6 | 0.779 s | 0.014 s | 54.0x |

"Before" is `main`'s route for `Pt != 0` (C Huffman reader, then numpy or Python prediction
and a Python shift), reproduced by making `ljpeg_native.predict` decline.

**How much this matters:** we have not seen a real camera DNG with `Pt != 0`. The Pixel 3 XL
file and the Canon CR2 streams in `eval/` all write `Pt = 0`. This closes a slow path that a file
can reach, and lets such tiles decode off the GIL on the thread pool like any other. It does
not speed up any file we have measured.

## 2. The raw plane is allocated once

`parse_raw` built the output plane as `array("H", bytes(n))`: a zeroed `bytes` object, then a
copy of it into the array. It is now `array("H", [0]) * count`, one zeroed buffer. Measured
with `tracemalloc` on the Pixel 3 XL's 12,192,768-sensel plane: peak 50.3 MB before, 24.4 MB
after. Time: 2.7 ms to 1.7 ms (best of 5), too small to see in a whole read. The same change
is in `ljpeg_native.predict`'s per-tile output buffer.

## Not done

- The serial `_normalised_plane` (about 0.2-0.4 s on the Pixel file) is the subject of an open
  pull request (PR #15457, sensor normalisation in threaded bands), not this one.
- The IFD walk is still on the calling thread.
- A real DNG with a non-zero point transform, to confirm the path on a camera's own file.
