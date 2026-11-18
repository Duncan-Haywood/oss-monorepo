# Nikon NEF: the edge columns that hold no picture, found from the sensels (2026-11-15)

## Why

The NEF reader (eval/nikon-nef-reader-2026-11-14.md) decoded every stored sensel and handed the
developer the whole stored width. On five of seven real bodies that width includes columns that are
not picture: optically masked sensels, then padding the camera fills with one value. A developed
D800E came out with a grey band, a one-pixel white line and fifteen black columns down its right
edge; a D90 with a 21-pixel grey band (half-size renders). The README listed this under "Not done"
("masked columns LibRaw trims by a per-model table are developed").

Nothing in the file marks the edge. The maker note's CropHiSpeed (0x001B) names the stored size
(D800E: 7424 x 4924 for both sensor and crop), the raw IFD has no DNG ActiveArea or DefaultCrop, and
dcraw and LibRaw both trim by a hand-kept table of models. A table only knows the bodies someone
added; a rule read from the data works on bodies nobody listed.

## What was built

`shootflow.nef.masked_margins(values, width, height, white)`, called by `parse_nef`, whose result
becomes the synthetic IFD's ActiveArea (the developer already honours ActiveArea for CR2 and CR3):

- a column is **picture** when its sensels vary down the rows at least a tenth as much as the middle
  of the frame (median of 16 middle columns) and correlate at 0.8 or more with the same-colour
  column two further in; or when it sits at 90% of white and is not one constant value (a clipped
  edge is picture; the D800E pads with columns of exactly 16,382);
- scanning in from each edge, the first picture column ends that margin; the left margin is rounded
  up to even so the file's CFA phase still applies;
- it does nothing on a frame too flat to tell (middle columns varying by under 8 levels), on a frame
  under 256 columns wide, or on a side with no picture column within 64 columns.

Even rows only (one colour per column), about 1,200 of them; pure Python, 4-17 ms per file.

## Check against LibRaw

`PYTHONPATH=src python tools/nef_libraw_check.py nef/Nikon*.nef --engines native,python` (rawpy,
LibRaw 0.22.2), which now also gates on the visible area: our ActiveArea (left, width, height)
against LibRaw's `sizes.left_margin`, `width`, `height`. Rows: `nikon-nef-visible-area-libraw-2026-11-15.jsonl`.

| body | stored width | not picture (ours) | LibRaw's table | what the edge holds |
|---|---|---|---|---|
| D800E | 7,424 | 46 right | 46 right | 14 masked (~600), 2 at 16,382, 30 at 1 |
| D300 | 4,352 | 32 right | 32 right | masked, noise of 1 level |
| D5100 | 4,992 | 44 right | 44 right | 36 masked (~597), 8 at 0 |
| D70 | 3,040 | 1 right | 1 right | one dark column |
| D810 | 7,380 | 0 | 0 | none |
| D90 | 4,352 | 42 right | 42 right | masked (~256) |
| D200 | 3,904 | 2 left, 3 right | 2 left, 3 right | one masked column left (rounded to 2), 3 right |

Seven of seven equal, and every sensel still equal on both decoders. The first rule tried treated any
column at 90% of white as clipped picture and kept the D800E's two 16,382 columns and the padding
outside them (7,394 wide, not 7,378); constant columns are now never picture.

Margins of safety on these files: picture edge columns correlate 0.93-1.00 with their neighbour
against the 0.8 bar; masked columns vary by 1-5 levels against a floor of 4.2-551 (a tenth of the
middle's variation), and the most any masked column correlates is 0.76 (D5100), so either test alone
separates them on six bodies. The closest call is the D70's last column: it varies by 4 levels
against a floor of 4.2, and its correlation of 0.03 is what marks it.

## Does it ever cut picture?

`masked_margins` run on the picture alone (each file's LibRaw-visible region, so the right answer
is no trim) and on the stored frame, each at 0, 3 and 6 stops darker (sensels scaled toward the black
level; the padding is scaled too, so the darker rows are a harder case than a real dark frame).
Script `nef_visible_area_stress.py`, output `nikon-nef-visible-area-stress-2026-11-15.out.txt`.

- **Picture only: 21 of 21 left whole** (seven scenes, both edges, three exposures).
- Stored frame: 17 of 21 trimmed exactly as LibRaw; 4 (D300, D90, D200 at 6 stops, D70 at 3) left
  whole because the middle of the darkened frame falls under the flatness floor or the D70's one
  column no longer stands apart. The failure is a margin kept, never picture cut.

## End to end

`shootflow develop --half --dcp FOLDER` of the D800E and D90 (placeholder profiles from
`tests/test_arw.make_profile`): 3,689 and 2,155 wide (were 3,712 and 2,176); the last three columns
average 41.7 and 56.4 against 41.1 and 55.9 just inside them (before: 63, then 255, then 0 for the
D800E; 81 for the D90's band). The report's notes say how many columns were left out and on which side.

## Tests

`tests/test_nef.py` `VisibleAreaTests` (7): masked plus padding columns on the right; padding at white
is not a clipped edge; picture only left whole; an odd left margin rounds up to even; flat and narrow
frames left whole; no picture column within the search leaves that side whole; `parse_nef` writes the
ActiveArea and the note.

## Not done

Top and bottom rows (LibRaw trims none on these seven); a body whose masked columns sit on the left
with real picture of very low contrast beside them; Nikon Z bodies' high-efficiency NEF is still
refused; the other readers (ORF, PEF, RW2, SRW, RAF) still pass the stored width and could use the
same rule where their files carry no crop.
