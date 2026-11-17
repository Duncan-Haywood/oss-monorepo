# The whole numpy develop in threaded bands, and packed raws unpacked in numpy (2026-11-13)

`eval/warp-kernel-fast-cubic-2026-11-13.md` put the lens warp's bands on a thread
pool. The rest of the numpy develop (demosaic, colour matrix, profile look, tone
curve and encode) still ran on one thread, and a profile of the Leica T frame
showed the file read itself was the largest single stage: 4 s in a pure-Python
bit unpacker. This change threads the rest of the develop and vectorises the
unpacker. Neither changes a byte of output.

## What changed

1. **`raw_develop_np._run_bands`.** Calls `fn(y0, y1)` for each band of
   `_BAND_ROWS` (256) rows on a thread pool, at most one thread per band, the
   count from `SHOOTFLOW_THREADS` (default: every CPU), as the warp does. Each
   band reads shared inputs and writes only its own output rows.
2. **Demosaic and encode.** `_bilinear` (full-size Bayer, both the encode path
   and the linear sink a warp reads), `_half` (2x2 binning, now banded too) and
   the LinearRaw and post-warp encodes (`_encode_image`) run through
   `_run_bands`. Every output sample depends only on its own pixel's inputs (the
   bilinear reads its neighbours from a padded copy of the whole plane), so the
   band edges and thread count cannot change it.
3. **`raw_develop_np.unpack_bits`.** Uncompressed DNGs whose samples are packed
   9 to 15 bits wide (the Leica T writes 12-bit packed strips) were unpacked one
   sample at a time in Python. Sample `i` of a row starts at bit `i * bits`, so
   the three bytes from its first byte, read big-endian, hold all of it
   (`bits + 7 <= 24`): the sample is that 24-bit word shifted right and masked,
   for every sample at once. Bytes past the end of a short chunk read as 0, as in
   the loop. `raw_develop._decode_chunk` uses it when numpy is importable and
   keeps the loop otherwise.

## Same bytes

SHA-256 (first 16 hex) of the 16-bit develop of the Leica T DNG, numpy engine,
before (`main` at ee9e63ca3) and after, at 1, 2 and 4 threads:

| render | before | after, 1 | after, 2 | after, 4 |
|---|---|---|---|---|
| default (opcodes on, cubic warp) | a68c6ac0001c4f91 | a68c6ac0001c4f91 | a68c6ac0001c4f91 | a68c6ac0001c4f91 |
| no opcodes | 8f0006a926fbe3df | 8f0006a926fbe3df | 8f0006a926fbe3df | 8f0006a926fbe3df |
| half size | f267f42466dd7b57 | f267f42466dd7b57 | f267f42466dd7b57 | f267f42466dd7b57 |
| half size, warp | fc54d121fe1087dc | fc54d121fe1087dc | fc54d121fe1087dc | fc54d121fe1087dc |

The first two match the hashes in the fast-cubic note. Tests
(`tests/test_raw_develop_engines.py`): `BandedThreadsTests` develops Bayer
(two phases, an odd active-area offset, full and half) and LinearRaw images at
band heights 1, 3, 4, 7 and 256 and 1, 2 and 3 threads and compares each with
the pure-Python engine byte for byte; `UnpackBitsTests` compares the numpy
unpacker with the loop for every width 9-15, five row shapes, padded rows and
four chunk truncations, and reads a 12-bit packed DNG both ways.

## Time

Leica T (Typ 701) DNG, 4928 x 3264, this container (4 CPUs), best of 2 (develop)
or 3 (read), numpy engine.

| stage | before, 1 thread | before, 4 | after, 1 | after, 2 | after, 4 |
|---|---:|---:|---:|---:|---:|
| read the file | 3.97 s | 3.97 s | 0.23 s | 0.23 s | 0.23 s |
| develop, default | 8.99 s | 4.81 s | 9.23 s | 5.28 s | 3.48 s |
| develop, no opcodes | 2.08 s | 2.16 s | 2.15 s | 1.41 s | 1.09 s |
| develop, half size | 0.61 s | 0.66 s | 0.61 s | 0.50 s | 0.42 s |
| develop, half size, warp | 2.11 s | 1.32 s | 2.06 s | 1.58 s | 1.25 s |

Read plus default develop on four CPUs: 8.8 s before, 3.7 s after (2.4 times
faster). Read plus an unwarped develop: 6.1 s to 1.3 s. On one thread the
develop is unchanged within run-to-run noise (about 3%); the read is 17 times
faster on any machine with numpy.

Where the 1.1 s of the four-thread unwarped develop still goes: about 0.2 s in
`_normalised_plane` (one thread), the rest in the banded demosaic and encode,
which scale about 2x on four threads, not 4x (memory bandwidth on float64
planes). Compressed DNGs and CR2s spend their read time in the lossless-JPEG
decoder (`ljpeg_native`), which this change does not touch.

## Reproduce

    curl -LO "https://raw.githubusercontent.com/drewnoakes/metadata-extractor-images/master/dng/Leica%20T%20(Typ%20701).dng"
    for t in 1 2 4; do SHOOTFLOW_THREADS=$t PYTHONPATH=src python3 -m shootflow.cli develop "Leica T (Typ 701).dng" --out out$t; done

or time `raw_develop.read_raw` and `raw_develop.develop(raw, DevelopSettings(engine="numpy"))`
and hash the output array, as the tables above did.
