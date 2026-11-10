# DNG developer against LibRaw on real camera files (2026-11-10)

Tool: `tools/libraw_differential.py` (rawpy 0.28.0, LibRaw 0.22.2, numpy, in a scratch venv). Files: rawpy's
GitHub test folder (`test/iss030e122639.NEF`, `test/RAW_CANON_5DMARK2_PREPROD.CR2`; not committed here).
LibRaw reads each file's sensor data and metadata; the tool writes them into an uncompressed DNG; ShootFlow
develops that DNG; LibRaw develops the original with bilinear demosaic, camera white balance, highlight clip,
no auto-brightening, sRGB primaries and the sRGB curve, 16 bit. Differences are in 8-bit steps (16-bit / 257),
skipping a 4-pixel border.

| file | size | output | mean abs diff R/G/B | p99 | max | pixels over 1 step | ShootFlow s | LibRaw s |
|---|---|---|---|---|---|---|---|---|
| Nikon NEF iss030e122639 (NASA ISS photo) | full | 4284x2844 | 0.088 / 0.102 / 0.101 | 0.4 | 0.51 | 0 | 37.1 | 0.36 |
| Nikon NEF iss030e122639 (NASA ISS photo) | half | 2142x1422 | 0.081 / 0.102 / 0.092 | 0.4 | 0.46 | 0 | 11.7 | 0.07 |
| Canon 5D Mark II CR2 (pre-production body) | full | 5634x3752 | 0.107 / 0.119 / 0.107 | 0.46 | 0.6 | 0 | 65.1 | 0.8 |
| Canon 5D Mark II CR2 (pre-production body) | half | 2817x1876 | 0.086 / 0.122 / 0.091 | 0.46 | 0.53 | 0 | 23.3 | 0.13 |

Metadata as LibRaw reports it: Nikon RGGB, black [0, 0, 0, 0], white 4095, camera WB [576.0, 256.0, 432.0];
Canon GBRG, black [1027, 1026, 1027, 1026], white 15600, camera WB [2521.0, 1024.0, 1402.0].

Before the clamping fix (same day): the Canon at half size had 522,190 pixels (10%) over one step, mean
difference 0.34 of a step in the 0-16 level band against 0.09 at 16-64, i.e. all in the deep shadows; the
Nikon full size had a worst pixel 75.7 steps out at highlight edges. Cause: ShootFlow clamped below-black
noise and blown sensels after demosaicing, LibRaw clamps each sensel before. After clamping each sensel at
0 and at its white-balanced clip level before demosaicing, both files agree at every pixel (table above).

Not checked here: ShootFlow's reading of a DNG written by a camera or by Adobe's converter (these DNGs are
written by the tool), and camera-written lossless-JPEG tiles (the decoder is checked against ffmpeg's ljpeg
encoder in tests/test_raw_develop.py). Timings are one run each on the shared build container.
