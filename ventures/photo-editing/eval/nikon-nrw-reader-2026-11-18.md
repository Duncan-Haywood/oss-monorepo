# Coolpix NRW and E-series NEF against LibRaw (2026-11-18)

## Why

The flagship's `next:` listed "a Coolpix NRW reader (no public sample yet)". raw.pixls.us (CC0)
has NRW samples for twelve Coolpix bodies; the note was stale. Run through
`tools/nef_libraw_check.py` before any change, every one of them read wrong, silently: the NEF
reader accepted them (a Coolpix raw is a Nikon TIFF with a CFA SubIFD) and decoded their sensors
as D-series data.

## Files

From `https://raw.pixls.us/data/Nikon/<body>/` (CC0), the first raw listed for each body, fetched
2026-11-18: COOLPIX P6000, P7000, P7100, P7700, P7800, P330, P340, P950, P1000, B700, A1000, E8800
and the Coolpix A (DX, Nikon-compressed; a control the reader already read right). Not committed
(13 to 35 MB each); the URLs above fetch them.

## Before (main at 488391ea9)

| body | storage as found | sensels differing from LibRaw | other faults |
|---|---|---|---|
| P6000 | 12-bit in LE 32-bit words | 12,767,049 of 13,457,760 | CFA GBRG (LibRaw and the sensels: RGGB); no balance |
| P7000 | 12-bit in LE 32-bit words | 9,899,495 of 10,046,688 | no balance |
| P7100 | 12-bit in LE 32-bit words | 9,859,786 | no balance |
| P950 | 12-bit in LE 32-bit words | 15,961,381 | black 0 (200) |
| P1000 | 12-bit in LE 32-bit words | 15,829,764 of 16,045,280 | black 0 (200) |
| B700 | 12-bit in LE 32-bit words | 20,117,634 | black 0 (200) |
| A1000 | 12-bit in LE 16-bit words | 15,915,665 | |
| P330 | 16-bit BE words under 34713 | 12,192,718 of 12,192,768 | black 0 (200) |
| P7700 | 16-bit BE words under 34713 | 12,192,667 | black 0 (3200 at 16-bit scale) |
| P7800 | 16-bit BE words under 34713 | 12,192,610 | black 0 (3200) |
| P340 | 12-bit packed under 34713 | 12,192,730 | black 0 (200) |
| E8800 | 12-bit packed, even rows then odd | 8,033,484 | no balance |
| Coolpix A | Nikon compressed lossy 14-bit | 0 | |

## After

`PYTHONPATH=src python tools/nef_libraw_check.py <13 files> --engines native,python` (rawpy
0.28.0, LibRaw 0.22.2): exit 0, every row `ok`. Raw rows: `eval/nikon-nrw-libraw-2026-11-18.jsonl`.

- Sensels: 0 differing on all 13, both decoders. The P330 compares at LibRaw's scale
  (`libraw_scale`): LibRaw shifts its words right 4 bits (load_flags 4) but keeps the P7700's and
  P7800's whole (a per-model override). The three bodies store the same thing, a 12-bit value in a
  word's top bits with the odd half-step 8 in the low nibble (0.004% and 0.010% of words on the P330
  and P7800 files), so all three are kept whole here, white 65,504 and black 3,200.
- Black level, white balance (R/G, B/G), CFA pattern, visible area: equal on 13 of 13.
- Black for the four 4032-wide bodies (no level in the file): 200 on the 12-bit scale, LibRaw's
  per-model value. No sensel of the four files reads below it (lowest 201 to 217; 0.01st
  percentile 205 to 231).
- The P6000's CFA tag says GBRG. Over a 64-row band, the (0,1)/(1,0) sites agree with each other
  (means 709.9 and 710.0, correlation 0.996) far better than (0,0)/(1,1) (507.3 and 500.1), so green
  is on that diagonal: RGGB, as LibRaw reads it. The reader now overrides a tag that disagrees
  with the sensels, in this layout only.
- Read time for the twelve Coolpix-layout files: 0.13 to 0.50 s each, either decoder (numpy present).

Regression: the seven D-series NEFs of `eval/nikon-nef-reader-2026-11-14.md` (metadata-extractor-
images `nef/`) still read equal to LibRaw in every sensel, including the uncompressed D200, which
goes through the new byte-order choice and keeps the plain order.

## How the layout is chosen

Nothing in the file names it. The strips' byte count says 12-bit packed (w x h x 3/2) or 16-bit
(w x h x 2); under compression 34713 those sizes, with no linearisation table in the maker note,
mean the data is not Huffman-coded. The byte order is chosen by decoding a band of 8 rows from the
middle of the frame both ways: the mean difference between same-colour sensels two columns apart
is a small fraction in the right order of what it is in the wrong one (noise), and the other order
must be at least 2x smoother to win, so a D-series file stays on its plain order. The E-series row
interlace follows the model name (E...), as dcraw and LibRaw do; there is one sample.

## Not done

No Coolpix colour profile ships (Adobe's DNG Converter installs them), so a develop needs the
user's `.dcp`. Only one file per body; P7000/P7100 frames at ISO 400 and over (dcraw assumed black
255 there; LibRaw calls it "probably obsolete" and reads the maker note's level, as here) unchecked.
