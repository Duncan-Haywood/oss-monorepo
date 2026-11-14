# Samsung SRW read directly, against LibRaw (2026-11-14)

## Why

The developer read DNG, CR2, ARW, NEF, ORF and RW2; a Samsung NX file had to go through Adobe's
DNG Converter first. The flagship row's buildable item named the public samples the proxy serves
(`github.com/drewnoakes/metadata-extractor-images`, sparse checkout of `srw/`: four camera files).
Samsung left the camera business in 2015, but NX bodies (NX1, NX500, NX3000, NX mini) are still
bought used and shot, and their owners are the people for whom Adobe's support is frozen.

## What was built

`src/shootflow/srw.py`, with three C decoders in `ljpeg_native.py` and a pure-Python reference for
each:

| compression | body here | scheme |
|---|---|---|
| 32770 + row table (raw IFD tag 0xA010) | Galaxy NX (EK-GN120) | per-row offsets; blocks of 16 with a direction bit, four adaptive bit lengths, then a 2x2 swap |
| 32770, no table | NX20 | 12-bit packed, little-endian 24-bit groups (low 12 bits first) |
| 32772 | NX3000 | one bit stream of fixed-table Huffman differences, per-parity running values |
| 32773 | NX1 | 16-byte-aligned rows, interleaved blocks of 16, prediction modes, magnitude scale, per-site bit-length history |

Levels from the maker note (an IFD whose offsets count from the note's start), decrypted by
subtracting the first four values of the 0xA020 key: black from 0xA028, as-shot balance from 0xA021.
Crop from the maker note's 0xA010 picture rectangle. White level `2^bits - 1`. Wired into
`raw_develop.parse_raw`, the colour gate, `camera_profiles.camera_of`, `raw_preview` (`.srw` is a
RAW and needs a profile, so the grade stage develops it), `ingest` and `catalog`.

## Check

`PYTHONPATH=src python tools/srw_libraw_check.py srw/*.srw --engines native,python` with rawpy
(LibRaw 0.22) and numpy in a venv. Raw rows: `eval/samsung-srw-libraw-2026-11-14.jsonl`.

| body | storage | sensels | differing (C / Python) | WB R/G, B/G (ours = LibRaw) | black | read s (C / Python) |
|---|---|---|---|---|---|---|
| Galaxy NX | 32770 rows | 20,597,844 | 0 / 0 | 2.3320, 1.9766 | 0 | 0.25 / 17.2 |
| NX1 | 32773 | 28,166,656 | 0 / 0 | 1.8438, 1.4062 | 128 | 0.49 / 27.7 |
| NX20 | packed 12 | 20,951,040 | 0 / 0 | 2.4922, 1.7773 | 0 | 0.17 / 0.14 |
| NX3000 | 32772 | 20,798,400 | 0 / 0 | 2.0078, 2.0547 | 0 | 0.28 / 18.0 |

All 90.5 M sensels equal on both decoders; white level and CFA equal LibRaw's on all four. An
end-to-end `shootflow develop --dcp FOLDER --half` of all four files (placeholder profiles built by
`tests/test_arw.make_profile`) chose each profile by camera, applied the crop and took 3.3 s in all.

`tests/test_srw.py` (12 tests): an exact encoder per scheme (the 32770 one with a width that is not
a multiple of 16 and random vertical blocks; the 32773 one for all eight option bytes and every
prediction mode), random byte streams on which the C and Python decoders agree or both refuse, and a
synthetic SRW through `parse_srw`, `parse_raw`, the profile chooser and the CLI.

## Findings

- **The CFAPattern tag is wrong on two of four bodies.** The Galaxy NX writes (1, 71, 21, 224);
  the NX3000 writes GBRG. Checked against the camera's own embedded JPEG (each file's picture
  area, 2x2-binned, against the JPEG box-resized to the same size; correlation of log chroma
  ratios): on the NX3000 the sensel at row 0, column 1 tracks the JPEG's red (r = 0.934) more than
  its blue (0.697), and the sensel at row 1, column 0 the blue (0.914 vs 0.737), so it is GRBG, as
  LibRaw reads it (LibRaw overrides the tag from a per-model table). NX20 and Galaxy NX give the
  same answer (0.879 / 0.873 and 0.703 / 0.646). The NX1 frame has too little colour to say
  (0.18 vs 0.03), and its tag already says GRBG. The reader uses GRBG and notes when the tag
  differs.
- **The maker note's crop is the camera's.** On all four the 0xA010 picture rectangle is exactly
  the embedded JPEG's size (5448 x 3648 Galaxy NX, 6480 x 4320 NX1, 5472 x 3648 NX20 and NX3000).
  LibRaw's per-model margins differ by 4 to 102 sensels (NX20: 5530 x 3694 at (44, 2), ours
  5472 x 3648 at (78, 16)), so the crop is reported, not gated, by the check.
- **The levels are encrypted, trivially.** Every file carries the same 0xA020 key
  (305, 72, 737, 456, ...); 0xA028 minus it gives LibRaw's black (128 on the NX1, else 0) and
  0xA021 minus it gives LibRaw's `camera_whitebalance` exactly.
- **32770's horizontal predictor is relative to the block, not the sensel.** dcraw's
  `col + (c | -2)` is `col - 2` for every even `c`, not `col + c - 2`; the first implementation
  read it the second way and matched only the first 18 columns.
- The raw IFDs have no Photometric tag, so the raw IFD is found by its CFAPattern.

## Not done

A real Adobe `.dcp` for a Samsung body (colour checked only through LibRaw's sensor data and
balance); the NX1's 14-bit samples at 0x7FFF-scale whites on other firmware; uncompressed and
32769 SRWs (no test file); Samsung's lens name from the maker note (0xA003 lens type) for lensfun.
