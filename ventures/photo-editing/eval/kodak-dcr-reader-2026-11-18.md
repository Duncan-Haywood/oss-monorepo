# Kodak DCR reader, checked against LibRaw (2026-11-18)

**Question.** Can ShootFlow develop Kodak DCS Pro DCR files directly, without Adobe DNG Converter, and
are the sensor values exactly the ones LibRaw decodes?

**Answer.** Yes for the one public DCR at hand. On the DCS Pro SLR/n file every one of the 13,601,232
stored sensels equals LibRaw 0.22's `raw_image`, and the CFA (GRBG), white level (3700), black (0) and
as-shot white balance (to LibRaw's float32 precision) agree. The C decoder and the pure-Python reference
give identical arrays.

## Input

* `dcr/Kodak DCS Pro SLRn.dcr` from github.com/drewnoakes/metadata-extractor-images (commit
  `7b56b649039c57903bcd5cbe9846ab81eb518ec4`, sparse checkout; Apache-2.0 repository of sample files),
  13,956,876 bytes, sha256 `62cd6300b4e745a2b4e094d7633f64163863cf9a07c6bd08b8cc8a69f07a3aa4`.
  Kodak DCS Pro SLR/n, firmware 4.5.0.121515, 2003-12-30, ISO 160, 1/125 s, f/9.5, 70 mm.
* That collection holds no other DCR or KDC, and raw.pixls.us refused connections from this session,
  so this is one file from one body.

## What the file holds

A big-endian TIFF. IFD0 and its first SubIFD are 375 x 250 thumbnails; the second SubIFD is the sensor,
4516 x 3012, 12 bits, compression 65000, CFAPattern (1, 0, 2, 1). IFD0's tag 33424 points to Kodak's own
IFD (395 entries) at byte 12. Entries read: 2317 (1024 16-bit values, 0..3700: equal to the code up to 300,
then steps of 2 rising to steps of 10 at the top), 1021 (72 bytes; words at byte 40: 772, 952, 626) and 1020 (index 5;
entry 2125 holds 4725, 5888, 3986, which LibRaw does not use when 1021 is present, and neither does the
reader).

## Results

`PYTHONPATH=src python tools/dcr_libraw_check.py "Kodak DCS Pro SLRn.dcr"` (rawpy 0.28, LibRaw 0.22.2):

```
{"file": "Kodak DCS Pro SLRn.dcr", "camera": "Kodak DCS Pro SLR/n", "seconds": 0.13, "seconds_python": 5.133, "c_equals_python": true, "libraw_white": 3700, "libraw_crop": [8, 6, 4500, 3000], "size": [4516, 3012], "shape_match": true, "sensels_differ": 0, "cfa": ["GRBG", "GRBG"], "wb": [[1.233161, 1.520767], [1.233161, 1.520767]], "white": 3700, "black": [[0.0, 0.0, 0.0, 0.0], [0, 0, 0, 0]], "ok": true}
```

`PYTHONPATH=src:tests python tools/dcr_develop_check.py "Kodak DCS Pro SLRn.dcr"` (stand-in profile:
LibRaw's `rgb_xyz_matrix` for the body as ColorMatrix1; LibRaw rendered with the sRGB curve,
`gamma=(2.4, 12.92)`, so both are compared in linear light):

```
{"file": "Kodak DCS Pro SLRn.dcr", "camera": "Kodak DCS Pro SLR/n", "size": [3012, 4516], "develop_s": 1.56, "mean_ours": [0.2651, 0.1775, 0.1392], "mean_libraw": [0.2706, 0.1785, 0.1418], "unclipped_share": 0.9913, "chroma_gap": 0.0023, "ok": true}
```

* 0 of 13,601,232 sensels differ. LibRaw develops a 4500 x 3000 crop (8 columns, 6 rows in); the reader
  hands the developer the whole sensor, as the other readers do.
* White balance: R/G 1.233161 and B/G 1.520767 from both; the raw gap is about 1e-7, LibRaw's multipliers
  being 32-bit floats, so the check gates at 1e-6.
* Time on this container: C decoder 0.13 s, pure Python 5.1 s for the frame; develop 1.6 s.
* Colour: the means differ by 0.0023 in chromaticity (gate 0.02). Brightness differs by a few percent
  because LibRaw scales to its own white; this is a decoding and colour-model check, not a picture-quality
  score.

## Limits

* One file, one body. The DCS Pro 14n, 14nx and SLR/c are expected to use the same compression and IFD
  entries (LibRaw reads them with the same code), but none was checked.
* Other Kodak compressions (262 of the DC-series, 32867, the KDC layouts) are refused with the reason.
* No Adobe `.dcp` for the body is in the tree, so a real development needs the user's profile.

## Next

* Any second DCR (14n, 14nx, SLR/c) through `tools/dcr_libraw_check.py`.
* A DCR with a plain (uncompressed-in-block) block: the real file has none (0 of its 54,216 blocks), so that path is checked only on synthetic files (`tests/test_kodak.py`).
