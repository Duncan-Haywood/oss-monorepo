# Fujifilm lossy compressed RAF, read directly (2026-11-15)

## Why

Earlier the same day the developer learned to read Fujifilm's lossless compressed RAFs
(`eval/fujifilm-compressed-raf-2026-11-15.md`). The other compressed setting, plain "compressed"
(lossy), was refused with "convert to DNG". X-S10, X-E4 and other recent bodies offer it, and it
makes the smallest files (18-19 MB against 25 MB lossless for the same 26 MP sensor). It was the
first item on this flagship's `next:` row, with its test set named: the two lossy files on
raw.pixls.us.

## Files

CC0 samples from raw.pixls.us, downloaded to the session's scratch space and not committed:

| file | body | mode | size |
|---|---|---|---|
| `X-S10/Fujifilm-X-S10-compressed.RAF` | X-S10 | lossy compressed | 18.7 MB |
| `X-E4/fuji_xe4_32_lossy.RAF` | X-E4 | lossy compressed | 19.9 MB |

(Under `https://raw.pixls.us/data/Fujifilm/`; the server answers a 301 first, so `curl -L`.) The
X-T2 and GFX 50S lossless files from the earlier eval were downloaded again to rerun them after the
change.

## What was built

In `src/shootflow/raf_compressed.py` and the C strip decoder `shootflow_fuji_strip` in
`ljpeg_native` (one new argument, the strip's bases, NULL for lossless):

- **Layout.** After the 16-byte header and the block sizes (padded to 16 bytes), a lossy stream
  holds `(line groups + 15) & ~15` bytes per strip: one quantisation base `q` per six-row group of
  that strip. The strips follow. On both files the header, sizes, bases and strips add up to the
  data block's last byte exactly (15,834,640 and 15,844,336 bytes).
- **Main quantiser per group** (`main_qtable`): residual step `2q + 1`; gradient thresholds
  `q, 3q + 0x12, 5q + 0x43, 7q + 0x114` (each clamped to the range and kept increasing); `(top + 2q)
  / (2q + 1) + 1` residual codes, and an escape of as many bits as that needs. Whenever `q` changes
  (and at a strip's first group) the 41 adaptive contexts of all three sets restart, from
  `max(2, (codes + 32) >> 6)`.
- **Side quantisers** (`side_qtables`): three fixed tables with bases 0, 1 and 2, gradient weight 3
  instead of 9, and five contexts each per set, kept for the whole strip. An entry uses side table
  `t` (the first that fits) when the group's `q` is above `t` and its neighbours' summed differences
  (two of them, as for the gradient) are at most 5, 6 or 7.
- **Reconstruction.** prediction plus or minus `code x (2q + 1)`, wrapped by `codes x (2q + 1)`
  outside `-q .. top + q`, clamped to `0 .. top`.

As with the lossless decoder this is an independent implementation, written in this repository's
own terms from the agent's knowledge of the format as open-source decoders (LibRaw's
`fuji_compressed.cpp`, rawspeed) read it; no LibRaw source was fetched or copied, and Fujifilm
publishes no specification. The real files then decided it: the first version desynchronised in the
second line pair, and the cause was a bug of ours (a variable named `step` reused for the
quantiser step inside the loop over steps), not the format. Once fixed, the first 30 groups of
strips 0 and 8 matched, then every sensel.

## Check against LibRaw

`PYTHONPATH=src python tools/raf_libraw_check.py FILE.RAF ...` with rawpy 0.28 (LibRaw 0.22.2) and
numpy in a venv, four cores. Rows: `eval/fujifilm-lossy-raf-libraw-2026-11-15.jsonl`.

| body | mode | sensels | differing | WB R/G, B/G (ours = LibRaw) | black | white | read s |
|---|---|---|---|---|---|---|---|
| X-S10 | lossy | 26,697,888 | 0 | 1.6954, 2.3510 | 1022 | 16383 | 0.69 |
| X-E4 | lossy | 26,697,888 | 0 | 1.9702, 1.7815 | 1022 | 16383 | 0.71 |
| X-T2 | lossless (rerun) | 24,421,824 | 0 | 2.6921, 1.3841 | 1020 | 16383 | 0.69 |
| GFX 50S | lossless (rerun) | 57,231,360 | 0 | 1.6987, 1.7152 | 65 | 15872 | 1.40 |

The CFA layout is equal on all four. The pure-Python decoder, run on both lossy files whole, also
gives every sensel equal: 73.4 and 74.5 s a file.

## What the files say about the format

The bases, read from the two files (one per strip and six-row group, 6,273 each):

| body | bases used | mean step `2q + 1` | bits per sensel |
|---|---|---|---|
| X-S10 | 0-9 (most 2-3) | 5.7 counts | 4.74 |
| X-E4 | 0-13 (most 4-6) | 11.2 counts | 4.75 |

Both land at the same size per sensel, so the camera holds a bit budget and lets the step float:
the X-E4 frame, harder to code, got steps twice as coarse. If the camera rounds each residual to
the nearest step (our test encoder does; the camera's encoder is not known), no sensel is more than
`q` from what the sensor gave, at most 13 counts on a 1,022-16,383 scale (under 0.1%). Without the
same frame shot uncompressed that bound is not measured here.

## Tests

`tests/test_raf_compressed.py` now has a lossy test encoder (the same coding run backwards, each
residual rounded to the group's step; the frame it reconstructs is what a decoder must return):
X-Trans 14-bit with bases 0-6 changing between groups on three strips (every side table used), a
12-bit Bayer stream, a lossy stream with base 0 throughout that must come back exactly, the side
and main quantiser constants, truncated bases, and `parse_raf` on a whole synthetic lossy RAF. Python
and C must agree on all of them. 15 tests in the file, 29 with `tests/test_raf.py`.

## Not done

- The camera's own rounding (the error bound above) needs the same scene shot lossy and
  uncompressed.
- Colour on these bodies needs the camera's `.dcp`; none is in the repository.
