# Canon CRW (CIFF) read directly, against LibRaw 0.22 (2026-11-16)

## The gap

Canon's raw format from 2000 to 2004 is the CRW: the EOS D30, D60, 10D and 300D (Digital
Rebel), and the PowerShot G2 to G6, Pro1 and S30 to S70. Since this morning's card-format work
(`eval/leica-rwl-and-card-formats-2026-11-16.md`) the card copy kept these files and culled
them from their embedded JPEG, but the grade stopped at them with "convert to DNG". This was the
`next:` item "a Coolpix NRW or Canon CRW reader (copied, not developed)". No public NRW was at
hand, while raw.pixls.us (reachable from this container today, though earlier sessions logged
403s) holds CRWs from 18 Canon bodies, so this run took the CRW.

## What was built

`src/shootflow/crw.py`, standard library only (numpy speeds the low-bits step when present):

- the CIFF heap walk (records, sub-heaps, the in-record value class);
- Canon's block coder: 64-sensel blocks in raster order, two Huffman trees per block (the
  three tree pairs as dcraw and LibRaw list them; they are the format's own tables, kept as data
  in the module), run-length symbols, a carried first coefficient, two running values reset to
  512 at each row, 0xFF 0x00 stuffing;
- the 12-bit bodies' stored low bits (four sensels to a byte), found the way dcraw finds them;
- the picture area from SensorInfo (0x1031), the black level from SensorInfo's masked
  rectangle (its fields 9 to 12, e.g. columns 2340-2343 on the G2: the columns left of the
  picture are not all masked on the PowerShots, so the CR2 reader's left-column rule read
  40-680 instead of 32-128 there);
- the as-shot white balance from ColorBalance (0x10A9, D60/10D/300D), ColorInfo2 (0x102C, G2,
  S30, S40) or ColorInfo1's preset table (0x0032, the later PowerShots), picked by ShotInfo's
  white-balance index;
- the rotation from ImageSpec (0x1810) as the TIFF orientation;
- `parse_raw`, the profile chooser (`camera_of`), `is_developable_path` and the "carries no colour
  matrix" refusal all take CRW, so `shootflow develop` and the grade stage develop it with the
  camera's `.dcp`.

The four-colour bodies (PowerShot G1, Pro70, Pro90 IS: cyan, magenta, yellow and green filters)
are refused with the reason; the developer has no four-colour path.

## Against LibRaw

`PYTHONPATH=src python tools/crw_libraw_check.py FILE.CRW ...` on every CIFF CRW on raw.pixls.us
(21 files; the other 30 `.CRW` files there are mostly CHDK dumps, a headerless packed format with
the same extension) plus the 10D file in drewnoakes/metadata-extractor-images: 20 Bayer files from
15 bodies (16 model names; the Digital Rebel is the 300D sold in North America), and the G1 and Pro70. Rows:
`eval/canon-crw-libraw-2026-11-16.jsonl`. Exit 0.

| body | storage | sensels | differing | balance R/G, B/G ours / LibRaw | black (RGGB) ours / LibRaw | white ours / LibRaw | read, s |
|---|---|---|---|---|---|---|---|
| EOS 10D | 12-bit, table 0 | 6,518,336 | 0 | 2.0938, 1.4916 / 2.0938, 1.4916 | 128, 126, 128, 126 / 127, 126, 127, 126 | 4095 / 4000 | 3.4 |
| EOS 10D | 12-bit, table 2 | 6,518,336 | 0 | 1.8184, 1.3530 / 1.8173, 1.3522 | 125, 126, 125, 126 / 124, 125, 124, 125 | 4095 / 4000 | 3.6 |
| EOS 10D | 12-bit, table 2 | 6,518,336 | 0 | 1.9759, 1.1221 / 1.9748, 1.1214 | 128, 128, 128, 128 / 127, 128, 127, 128 | 4095 / 4000 | 3.6 |
| EOS 10D (m-e-i) | 12-bit, table 1 | 6,518,336 | 0 | 2.1624, 1.1654 / 2.1456, 1.1563 | 129, 128, 129, 128 / 128, 128, 128, 128 | 4095 / 4000 | 3.2 |
| EOS 300D | 12-bit, table 0 | 6,518,336 | 0 | 1.9579, 1.2632 / 1.9579, 1.2632 | 125, 124, 125, 124 / 125, 124, 125, 124 | 4095 / 4000 | 3.3 |
| EOS 300D | 12-bit, table 2 | 6,518,336 | 0 | 2.2309, 1.1738 / 2.2349, 1.1759 | 125, 124, 125, 124 / 124, 124, 125, 124 | 4095 / 4000 | 3.0 |
| EOS D30 | 12-bit, table 1 | 3,238,144 | 0 | none / none | 128, 128, 128, 129 / 128 x 4 | 4095 / 4095 | 1.7 |
| EOS D60 | 12-bit, table 0 | 6,518,336 | 0 | 2.6275, 1.0991 / 2.6240, 1.0976 | 127 x 4 / 127, 127, 127, 126 | 4095 / 4000 | 3.5 |
| EOS Digital Rebel | 12-bit, table 0 | 6,518,336 | 0 | 1.6095, 1.6766 / 1.6261, 1.6940 | 259 x 4 / 261, 260, 261, 260 | 4095 / 4000 | 3.7 |
| PowerShot G2 | 10-bit, table 0 | 4,105,728 | 0 | 1.8097, 1.3644 / same | 32 x 4 / 32 x 4 | 1023 / 1023 | 2.2 |
| PowerShot G3 | 12-bit, table 1 | 4,105,728 | 0 | none / none | 128, 129, 129, 129 / 128 x 4 | 4095 / 4095 | 2.3 |
| PowerShot G5 | 12-bit, table 1 | 5,258,496 | 0 | none / none | 129 x 4 / 129 x 4 | 4095 / 4095 | 3.3 |
| PowerShot G6 | 12-bit, table 0 | 7,407,040 | 0 | none / none | 129, 130, 129, 129.5 / 129 x 4 | 4095 / 4095 | 4.2 |
| PowerShot Pro1 | 12-bit, table 1 | 8,306,496 | 0 | none / none | 130 x 4 / 129 x 4 | 4095 / 4095 | 4.4 |
| PowerShot S30 | 10-bit, table 0 | 3,344,640 | 0 | 1.6660, 1.3649 / same | 32 x 4 / 31, 32, 31, 31 | 1023 / 1023 | 1.9 |
| PowerShot S40 | 10-bit, table 0 | 4,105,728 | 0 | 2.0048, 1.3273 / 2.0194, 1.3370 | 32 x 4 / 32 x 4 | 1023 / 1023 | 2.2 |
| PowerShot S45 | 12-bit, table 0 | 4,105,728 | 0 | none / none | 129, 129, 128, 128 / 128 x 4 | 4095 / 4095 | 2.2 |
| PowerShot S50 | 12-bit, table 0 | 5,258,496 | 0 | none / none | 128, 129, 128, 128 / 128, 129, 129, 129 | 4095 / 4095 | 3.0 |
| PowerShot S60 | 12-bit, table 1 | 5,258,496 | 0 | 2.1430, 1.1366 / same | 131 x 4 / 130 x 4 | 4095 / 4095 | 2.7 |
| PowerShot S70 | 12-bit, table 0 | 7,407,040 | 0 | none / none | 129, 129, 130, 130 / 129 x 4 | 4095 / 4095 | 4.0 |
| PowerShot G1, Pro70 | refused: four-colour filter | | | | | | |

- **Sensels**: 114,048,448 read, 0 differ, on all three tree pairs, 10-bit and 12-bit.
- **CFA**: RGGB at the picture's corner on all 20, as LibRaw.
- **White balance**: ours divides by the mean of the two greens, LibRaw by the first one (the
  "LibRaw" column above); compared on the same footing they agree to 1e-4 on all eleven files
  that record one. On the nine that do not (the camera on Auto: the later PowerShots and the
  D30 keep no levels for the shot), we apply none, as LibRaw does, and say so in the report.
- **Black**: within 2 of LibRaw everywhere (ours is the median of the masked rectangle, LibRaw's
  the mean of its own margins).
- **White** (reported, not gated): the EOS bodies clip near 4,000; LibRaw takes 4,000 from a
  per-model table. None of these frames has a clip pile (at least 64 sensels on the maximum), so
  ours stays at the stream's 4,095. A blown highlight on a 10D will render slightly off-white
  until a frame with one is at hand to measure.
- **Picture area** (reported, not gated): ours is SensorInfo's (3072 x 2048 at (72, 16) on the
  10D, the camera's own JPEG size); LibRaw's per-model margins keep 16 more columns and 8 more rows.

## Through the developer

`shootflow develop` on three real files (10D from m-e-i, G2, S60) with stand-in profiles named
for each camera (no Adobe profile here, so colour is not judged): each chose its profile by tag,
wrote a master (2048 x 3072 for the 10D, turned upright from its 270-degree ImageSpec; 2272 x
1704; 1944 x 2592) and both pictures looked as expected, upright and with clean detail, at
thumbnail size. 15 s for the three with numpy.

## Speed

Pure Python, 1.7 to 4.4 s a file (3.2 to 8.3 MP). No C decoder was written: these are small
frames, and the reader's time is under the develop's.

## Tests

`tests/test_crw.py` (16 tests): an encoder writes a known sensor through Canon's coding into a
small CIFF file; every sensel decodes exactly on all three tree pairs, 10-bit and with low bits,
with a 4-row last group as on the 10D; the tags, the preset balance by index, no balance record,
the rotation, an odd picture corner, the four-colour refusal, a corrupt stream, `parse_raw`, the
profile chooser and the "needs a profile" refusal.

## Not done

- A real Adobe `.dcp` for a CRW body (colour not judged).
- The EOS white level from a frame with a real clip pile.
- The D30's preset balance when not on Auto (its layout is known from LibRaw; no file at hand).
- The four-colour G1, Pro70 and Pro90 IS.
- Coolpix NRW: still no public sample found.
