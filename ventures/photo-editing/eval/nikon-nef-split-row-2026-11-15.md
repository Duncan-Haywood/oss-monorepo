# Nikon NEF: real split rows, the Z 6II's curve, 12-bit black levels (2026-11-15)

## Why

The NEF reader (eval/nikon-nef-reader-2026-11-14.md) had been checked on seven files, none with a
non-zero split row, so the two "after split" code tables ran only on synthetic files. The flagship's
`next:` asked for "a real NEF split row". raw.pixls.us (CC0) holds 235 NEFs from 92 Nikon bodies.

## Finding the files

A probe read the first 512 KB of each of the 235 files (HTTP range requests) and parsed the maker
note's tag 0x0096: 76 lossless (0x46), 66 stepped-curve lossy (0x44 0x20) with split row 0, 12
Z-body lossy (0x44 0x40) with split 0, 9 full-curve lossy (0x44 0x10), 57 where the probe found no tag
0x0096 (it reads only the first 512 KB and the Exif IFD's maker note; bodies such as the D300 do
have one), 4 older maker notes. **Eleven had a non-zero split row**; all
eleven were downloaded (14-35 MB each, not committed):

| body | file (under `https://raw.pixls.us/data/Nikon/<body>/`) | storage | split row |
|---|---|---|---|
| 1 J5 | `20151027-10431071-NIKON_1_J5.nef` | lossy 12-bit, 0x44 0x20 | 1555 |
| D3400 | `DSC_0330_bad.NEF` | lossy 12-bit | 3832 |
| D5000 | `2017-03-30T14-24-27+0800_DSC_3614.NEF` | lossy 12-bit | 1037 |
| D5200 | `_DSC7535.NEF` | lossy 14-bit | 925 |
| D5500 | `DSC_0258.NEF` | lossy 14-bit | 3337 |
| D5600 | `2018-01-20_01-14_0792.NEF`, `..._0793.NEF` | lossy 14-bit, 12-bit | 170, 345 |
| D5 | `LV5_4402.NEF` | lossy 14-bit | 133 |
| D7000 | `DSE61507.nef` | lossy 14-bit | 1268 |
| Z 6_2 | `CZP_0300.NEF`, `CZP_0303.NEF` | lossy 14-bit, 12-bit, 0x44 0x40 | 142, 172 |

## First run: the split rows were right, three other things were not

`PYTHONPATH=src python tools/nef_libraw_check.py FILES --engines native` (rawpy 0.28, LibRaw 0.22.2):

- **Split rows: correct on all nine 0x44 0x20 files.** Every sensel equal to LibRaw's on the D5000,
  D5200, D5500, D5600 x2, D5, D7000, D3400 and the J5's decoded rows. The after-split tables
  (differences scaled by `shl > 0`) work on real data as they did on synthetic.
- **Z 6II (0x44 0x40): 99.3% of sensels wrong** (24,323,927 of 24,498,560). The version fell to the
  full-curve branch, which read the 257 stored points as the first 257 curve entries. LibRaw reads
  0x44 0x40 as 0x44 0x20 with the step and the curve's range quartered when the step exceeds 3.
  Implemented that way; now 0 of 24,498,560 differ on both Z 6II files.
- **12-bit black levels 4x too high** on four files (J5 800 for 200; D3400 and D5600 12-bit 600 for
  150; Z 6II 12-bit 1008 for 252). Maker-note tag 0x003D holds the level on a 14-bit scale whatever
  the file's depth. The seven earlier files were 14-bit or had no stored level, so nothing showed it.
  The cost was large: 82-95% of each frame's sensels sat at or under the wrong level (the Z 6II
  12-bit frame: 93.3%; median sensel 432 against a stored 1008), so a developed 12-bit NEF from any
  body since about 2014 came out nearly black. Now divided by 2^(14 - bits); equal to LibRaw's on
  all four.
- **Two picture columns cut** on the D3400 and the 14-bit D5600 (`visible_ours` [2, 6014] against
  LibRaw's [0, 6016]). See below.
- **J5: the last two rows "differ"**: LibRaw's Nikon loader decodes rows 0 to its per-model height
  (3,724) and never writes the 2 rows under it, which are 0 in a fresh process and leftover memory
  after other files. Ours carry picture (each correlates 0.89-0.91 with the same-colour row two
  above, as every row above does), so they are kept. The checker now leaves rows LibRaw does not
  decode out of the sensel and visible-height gates and reports them
  (`rows_libraw_leaves_undecoded`: 2 on the J5, 0 elsewhere).

## The edge rule's correlation bar

`masked_margins` called a varying edge column picture only when it correlated 0.8 or more with the
same-colour column two further in. On these busy, lossy frames the first picture column correlates
0.70-0.80 (D3400 column 0: 0.799; D5600 0792: 0.701), so column 0 failed, column 1 passed, and the
left margin rounded up to 2.

Measured over all 18 files (the seven earlier ones and these eleven), each edge column labelled by
LibRaw's visible area: every masked column but one varies by under a quarter of the sd floor
(0.02-0.22 of it), so the sd test alone rejects it; the one that passes the sd test (the D70's last
column, 1.05x the floor) correlates -0.005. So the bar is now 0.5 (`nef.PICTURE_CORR`). The D200's
masked columns correlate up to 0.99 but sit beyond its first picture column on the scan, as before.

## Check

All 18 files, native decoder; then the Python reference on the J5, D3400, D5200, D5600 12-bit and
both Z 6II files. Rows: `eval/nikon-nef-split-row-libraw-2026-11-15.jsonl` (18 native rows, then 6
rows with both engines).

| body | sensels | differing (C / Python) | black ours = LibRaw | visible (left, width, height) = LibRaw | white ours / LibRaw |
|---|---|---|---|---|---|
| D800E, D300, D5100, D70, D810, D90, D200 | 130.6 M | 0 / - | yes | yes | as 2026-11-14 |
| 1 J5 | 20,805,984 | 0 / 0 (2 rows LibRaw does not decode) | 200 | 0, 5584, 3726 (LibRaw 3724) | 4095 / 4095 |
| D3400 | 24,160,256 | 0 / 0 | 150 | 0, 6016, 4016 | 4095 / 4095 |
| D5000 | 12,481,536 | 0 | 0 | 0, 4310, 2868 | 4095 / 4095 |
| D5200 | 24,264,720 | 0 / 0 | 0 | 0, 6036, 4020 | 16383 / 16383 |
| D5500 | 24,160,256 | 0 | 600 | 0, 6016, 4016 | 16380 / 16383 |
| D5600 (14-bit) | 24,160,256 | 0 | 600 | 0, 6016, 4016 | 16380 / 16383 |
| D5600 (12-bit) | 24,160,256 | 0 / 0 | 150 | 0, 6016, 4016 | 4095 / 4095 |
| D5 | 20,817,152 | 0 | 400 | 0, 5584, 3728 | 16382 / 16383 |
| D7000 | 16,373,760 | 0 | 0 | 0, 4948, 3280 (44 right) | 16383 / 16383 |
| Z 6II (14-bit) | 24,498,560 | 0 / 0 | 1008 | 0, 6064, 4040 | 16380 / 16383 |
| Z 6II (12-bit) | 24,498,560 | 0 / 0 | 252 | 0, 6064, 4040 | 4092 / 4095 |

18 of 18 pass (exit 0). The white level is reported, not gated, as before: ours is the top of the
file's curve, LibRaw's a per-model value up to 3 levels higher.

End to end: `shootflow develop --half --dcp FOLDER` (placeholder profiles from
`tests/test_arw.make_profile`) wrote 3032 x 2020 and 3008 x 2008 masters of the Z 6II 12-bit and
D3400 frames in 2.1 s for both, black 252 and 150. Colour from a real profile is not checked here.

## Does the lower bar cut picture?

`eval/nef_visible_area_stress.py` (now takes extra files) on all 18, each as the picture alone and as
stored, at 0, 3 and 6 stops under: `eval/nikon-nef-split-row-stress-2026-11-15.out.txt`.

- Picture only: **53 of 54 left whole**. The one cut: the Z 6II 12-bit frame at 6 stops under, 2
  columns each side. There the middle of the frame varies by 11.5 levels and the edge columns by
  1.7, under the 2-level sd floor; the 0.8 bar cut the left 2 columns too. Raising the flatness
  floor from 8 to 12 or 16 removes it but stops the D300 at 3 stops under being trimmed (a 32-column
  masked band left in), a worse result than 2 columns of 6,064 lost on an extreme frame, so the floor
  stays 8.
- Stored: every trim at 0 stops equals LibRaw's table (D800E 46, D300 32, D5100 44, D70 1, D90 42,
  D200 2 + 3, D5000 42, D7000 44, the rest none); darker, the rule keeps a margin rather than cut,
  as before (D300, D90, D200, D5000 at 6 stops; D70 at 3), apart from the Z 6II case above.

## Tests

`tests/test_nef.py` (21 tests, 3 new): a Z-body 0x44 0x40 stream at 12 and 14 bits, with and without
a split row, on both decoders, and its curve against the quartered construction; the 12-bit black
level read on a 14-bit scale (1008 stored, 252 used); a busy picture edge correlating 0.68 kept whole.

## Not done

- A Z-body 0x44 0x40 file with step 3 or less (the else branch, a full curve): none of the 12 seen.
- High-efficiency NEF (TicoRAW) is still refused.
- 57 of the 235 files the probe could not classify; a split row among them would have been missed.
