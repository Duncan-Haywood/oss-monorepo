# Sony ARW read directly, against LibRaw (2026-11-14)

## Why

The developer read DNG and Canon CR2 only; every Sony file had to go through Adobe's DNG
Converter first (README, "What it reads"), so a
photographer on an A7-series camera could not use the develop or the pipeline's grade stage on
their own files. Every listed `next:` item for photo-editing needs a file or tool we do not hold;
this one needed only public sample files, which the proxy serves (`github.com` clone of
`drewnoakes/metadata-extractor-images`, sparse checkout of `arw/`).

## What was built

`src/shootflow/arw.py`: compressed RAW (16-byte blocks, 11-bit max/min, positions, fourteen 7-bit
deltas, shift, Sony tone curve from tag 0x7010), uncompressed, and lossless (tiles of
four-component lossless JPEG, one sample per 2x2 cell), on the standard library and numpy;
black level, white level and as-shot balance from the raw IFD or the encrypted SR2 sub-IFD
(key from SR2Private 0x7221, four UNDEFINED bytes in the file's byte order); DefaultCrop passed
through. Wired into `raw_develop.parse_raw`, the colour gate (a profile is required, as for CR2),
`camera_profiles.camera_of` (camera name "Sony ILCE-7M3", as Adobe's profiles spell it), the CLI's
`--dcp FOLDER` and the pipeline's grade stage.

## Check

`PYTHONPATH=src python tools/arw_libraw_check.py arw/*.arw --engines numpy,python` with rawpy
(LibRaw 0.22.2) and numpy in a venv. Raw rows: `eval/sony-arw-libraw-2026-11-14.jsonl`.

| file | storage | sensels | differing (numpy / python) | WB R/G, B/G (ours = LibRaw) | read s (numpy / python) |
|---|---|---|---|---|---|
| DSLR-A500 | compressed | 12,255,104 | 0 / 0 | 2.3945, 1.1914 | 0.66 / 3.50 |
| NEX-5N | compressed | 16,144,128 | 0 / 0 | 2.5508, 1.5586 | 0.73 / 4.14 |
| NEX-7 | compressed | 24,337,152 | 0 / 0 | 2.4297, 1.6289 | 1.46 / 6.15 |
| ILCE-5000 | compressed | 20,122,624 | 0 / 0 | 2.7500, 1.6445 | 1.34 / 5.24 |
| ILCE-7M3 | compressed | 24,337,152 | 0 / 0 | 1.6602, 2.9648 | 1.28 / 6.17 |
| ILCE-7M4 | lossless tiles | 36,700,160 | 0 / 0 | 2.3574, 1.6807 | 0.38 / 5.28 |

Black level 512 on all four channels and CFA RGGB on all six, both equal to LibRaw. The four
older bodies have no level or balance in the raw IFD: both came from the decrypted SR2 sub-IFD.
An end-to-end `shootflow develop --dcp FOLDER --half` of the A7 IV and A7 III files (with a
placeholder profile from `tests/test_arw.py`) chose each profile by camera name, applied the
A7 IV's DefaultCrop (7008 x 4672 of 7168 x 5120) and the A7 III's orientation, in 9 s for both.

## Findings

- The SR2 sub-IFD's WhiteLevel (0x787F) reads 15360 on all six, but compressed frames hold
  sensels up to 16,372 (the curve's top; 1,232 sensels above 15360 on the A500 frame). Using it
  would clip highlights the camera kept, so the reader uses the raw IFD's WhiteLevel (A7 III:
  16380) or 16383. LibRaw reports 16383 except on the A500 (16596, its observed maximum).
- The decoded compressed values are on a 14-bit scale (the curve output is not divided by four),
  matching LibRaw 0.22's `raw_image`.
- The SR2 key is UNDEFINED-typed in real files, not LONG as some descriptions give it.

## Not done

A real Adobe `.dcp` for a Sony body (colour is checked only through LibRaw's sensor data and
balance, not a rendered colour against Adobe's); trimming the older bodies' masked right-hand
columns (no tag names them; LibRaw uses a per-model table: 32, 32, 8 and 24 columns on the A500,
A5000, NEX-5N and NEX-7/A7 III); Sony's in-file lens correction parameters; ARW 1.0 and SR2/SRF.
