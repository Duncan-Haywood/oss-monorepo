# Pentax PEF read directly, against LibRaw (2026-11-14)

## Why

The developer read DNG, CR2, ARW, NEF, ORF, RW2 and SRW. A Pentax PEF was worse off than any of
them: `.pef` was in none of the extension lists (`ingest.MEDIA_EXTENSIONS`,
`catalog._PHOTO_EXTENSIONS`, `raw_preview.RAW_EXTENSIONS`), so a Pentax card's raws were not
copied at ingest, not catalogued and not scored. The flagship row's buildable item named the one
PEF in the public samples the proxy serves (`github.com/drewnoakes/metadata-extractor-images`,
sparse checkout of `pef/`: `Pentax K-1 Mark II.pef`, 43.9 MB). Pentax shooters are exactly the
people whose camera is least well served by the big editors, and the K-1 Mark II is Pentax's
current full-frame body.

## What was built

`src/shootflow/pef.py`, a C decoder `shootflow_pentax_run` in `ljpeg_native.py` and a pure-Python
reference:

- **Compression 65535** (dcraw's `pentax_load_raw`): the maker note's 0x0220 holds the code
  table (`(v + 12) & 15` codes, 12 skipped bytes, the codes left-aligned in 12 bits, their
  lengths). Code `c` means `c` difference bits follow; a difference whose top bit is clear is
  `d - (2^c - 1)`. Columns 0 and 1 are predicted from the same columns two rows up, the rest from
  two columns left. On the K-1 Mark II the table has 15 codes, lengths 2 to 12, and they fill the
  12-bit space exactly (no unassigned prefix).
- Levels from the maker note ("PENTAX \0II", read by the existing `lens_profiles.pentax_note`):
  BlackPoint 0x0200 and WhitePoint 0x0201, both R, G, G, B. CFA from EXIF CFAPattern 0xA302
  (repeat sizes stored as two big-endian shorts in this little-endian file, so both orders are
  accepted). White level `2^14 - 1`.
- Wired into `raw_develop.parse_raw` (checked before SRW, since a Samsung K-mount body's PEF says
  SAMSUNG), the colour gate, `camera_profiles.camera_of` ("Pentax K-1 Mark II", Adobe's naming),
  `raw_preview` (`.pef` needs a profile, so the grade stage develops it), `ingest` and `catalog`.

## Check

`PYTHONPATH=src python tools/pef_libraw_check.py "pef/Pentax K-1 Mark II.pef" --engines native,python`
with rawpy (LibRaw 0.22.2) and numpy in a venv. Raw row: `eval/pentax-pef-libraw-2026-11-14.jsonl`.

| body | storage | sensels | differing (C / Python) | WB R/G, B/G (ours = LibRaw) | black | white | CFA | read s (C / Python) |
|---|---|---|---|---|---|---|---|---|
| K-1 Mark II | 65535, 14-bit | 36,590,400 | 0 / 0 | 2.0352, 1.6875 | 1024 | 16383 | RGGB | 0.50 / 32.3 |

An end-to-end `shootflow develop IMGP0001.PEF --dcp FOLDER --half` (a placeholder profile built
by `tests/test_arw.make_profile`) chose the profile by camera, applied the crop and took 1.7 s.

`tests/test_pef.py` (13 tests): an exact encoder with a canonical table of its own (not the
camera's codes), at 12, 13 and 14 bits and widths down to 2; the table read in both byte orders;
the camera's own table shown to fill the 12-bit space; streams that leave the value range or hit an
unassigned prefix refused by both decoders; 60 random byte streams on which C and Python agree or
both refuse; and a synthetic PEF through `parse_pef`, `parse_raw`, the profile chooser and the CLI.
Whole venture suite: 1,068 tests, OK (9 skipped).

## Findings

- **The camera's picture area is not centred.** The first version cropped the embedded JPEG's
  7360 x 4912 centred on the stored 7392 x 4950, at (16, 19). `eval/pef_jpeg_alignment.py` slides
  the JPEG over a 2x2-box average of the raw (black subtracted, logs correlated): the best boxes
  tie at (13, 27), (14, 28), (13, 28) and (14, 27), r = 0.876, against r = 0.63 at the centred
  place; the best box in each corner taken alone is (13, 27) in all four, so the JPEG is the raw
  shifted, not rescaled or lens-corrected. A box at (13, 27) is centred on raw (13.5, 27.5), so
  JPEG pixel (0, 0) is raw (14, 28). That is what the reader now uses for this body
  (`pef.MEASURED_CROPS`); an even origin also keeps the crop's CFA phase RGGB. Other bodies fall
  back to the centred JPEG size with a note.
- **LibRaw's crop is wider.** Its per-model table gives 7376 x 4932 at (6, 18). The file's own
  dark border: columns 0-3 and 7384-7391 and rows 0-17 average 1,022 to 1,026 against 1,163+ for
  exposed sensels. Exposed sensels run from column 4 to 7383 and row 18 to the bottom; LibRaw's
  area (columns 6-7381, rows 18-4949) sits inside that, and ours (columns 14-7373, rows 28-4939)
  inside LibRaw's.
- **The black level is in the file twice.** The maker note says 1,024 on every channel; the
  196,388 masked sensels outside LibRaw's margins (below the halfway level) average 1,026.2.
- dcraw's table loop writes `huff[++i]`: index 0 holds the look-ahead width (12) and the codes sit
  one place up. Read naively it looks like an off-by-one; it is not, and the decoder here builds a
  plain 4096-entry lookup instead.

## Not done

Only one real PEF was at hand. Older bodies (K10D, K-5, K-3) use the same compression and maker
note tag, but no file of theirs was checked, nor any big-endian ("AOC\0MM") note. Uncompressed
PEFs and Pixel Shift's four-frame files are refused with a message to convert to DNG. A real
Adobe `.dcp` for a Pentax body (colour checked only through LibRaw's sensor data and balance). The
lens number from the same maker note (`lens_profiles.pentax_lens`) should now reach `--lens-db`
for PEFs too, but that path was not run end to end on the real file in this session.
