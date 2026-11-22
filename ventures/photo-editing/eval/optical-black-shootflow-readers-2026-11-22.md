# The optical-black area through shootflow's own readers (2026-11-22)

The morning's eval/optical-black-floor-2026-11-22.md read the masked sensels through LibRaw. It found 8 of 57
public raws with a usable masked margin. Its first "Next" was to read them through shootflow's own parsers,
which "set ActiveArea from SensorInfo, IAD1 and `nef.masked_margins`, which should cover the Nikon bodies LibRaw
trims". This run did that. Shootflow's readers turn out to add no coverage. The work also found that the first run's
masked-line test was too loose, which takes the real count from 8 to **6 of 57**, and both readers agree on those 6.

## Method

`tools/optical_black_floor.py --reader shootflow` (tests: `tests/test_optical_black_floor.py`, 8, three new)
reads each file with `raw_develop.parse_raw`: the full sensor as each reader keeps it, the ActiveArea, the
DefaultCrop, the BlackLevel and WhiteLevel, and the CFA phase relative to the ActiveArea's corner. Its
Linearization table, where there is one, is applied. Same files as the morning run: the 57 non-RAF raws of
`drewnoakes/metadata-extractor-images` (commit 7b56b64, sparse checkout); rawpy 0.28.0, numpy 2.5.3.

**What the readers give.** The CR2 reader sets an ActiveArea inside the sensor, as LibRaw does. The NEF reader
does too (`nef.masked_margins`). The ORF, RW2, ARW, SRW and PEF readers keep the whole sensor as the ActiveArea
and put the camera's picture in DefaultCrop. So the tool takes the DefaultCrop, where there is one, as the
picture and reads the margins around it.

**Two fixes to the masked-line test**, both now the default for both readers:

1. *The black test was too loose.* The first run kept a line whose median sat within 0.5% of white - black of
   the black level. Outside the camera's crop, Olympus and Samsung bodies keep mostly **lit border lines**, and
   dim ones fall inside that tolerance. Examples: an E30's crop border 13-17 DN above black with a 29-36 DN
   spread; the 70D's columns 72-84, 48-70 DN above black. Every truly masked line inspected sits within 4 DN of
   black. The tolerance is now 0.1% of white - black, with a 2 DN floor (`--black-tol 0.005` gives the old one).
2. *A quiet-line test.* Each depth line's spread is read from same-colour differences with the next-but-one
   line, which cancels line banding. A line is kept only within 1.5x of the file's quietest decile
   (`QUIET`; `--no-quiet` turns it off). This drops transition rows, such as the 70D's top-strip rows 22-24 at
   14-31 DN between 6.5 DN neighbours.

The tool also now skips **black level 0**. With black at 0, the masked sensels are clipped at 0, so their spread
understates read noise by construction. This covers Nikon NEFs, the older Olympus compacts, Samsung SRWs and the
Leica and Pentax QS1 DNGs in this set.

Rows: `optical-black-shootflow-readers-2026-11-22.jsonl` (shootflow), `optical-black-libraw-strict-2026-11-22.jsonl`
(LibRaw with the same tests); both summaries: `optical-black-shootflow-readers-2026-11-22.txt`.

## Results

| file | LibRaw, first run (DN) | LibRaw, strict (DN) | shootflow, strict (DN) | why it changed |
|---|---:|---:|---:|---|
| Canon EOS 350D.CR2 | 2.82 | 2.82 | 2.83 | |
| Canon EOS 600D.CR2 | 6.85 | 6.85 | 6.86 | |
| Canon EOS 7D.cr2 | 4.90 | 4.90 | 4.90 | |
| Canon EOS 70D.cr2 | 7.54 | 7.15 | 7.15 | dim lit columns 72-84 and transition rows dropped |
| LG Nexus 5X.dng | 1.75 | 1.64 | 1.64 | quieter lines only |
| Pentax K-1 Mark II.pef | 29.16 | 29.16 | 28.64 | shootflow reads its border around the camera crop (7360x4912 at 14, 28) |
| Olympus PEN E-P3.orf | 2.86 | (0.00, skipped) | (0.00, skipped) | its "masked" columns are a near-constant fill of 66 plus dim picture lines |
| Samsung NX3000.srw | 1.66 | (skipped) | (skipped) | black level 0: clipped |
| first run's shootflow path, before the fixes: Olympus E30.orf | - | - | (5.77, then dropped) | all dim picture lines; its real masked columns are its last 4 (3.5 DN), inside the 4-sensel edge skip |

- **Coverage: 6 of 57** through either reader. Shootflow's readers find no masked margin that LibRaw misses. The
  Nikon right-edge columns `nef.masked_margins` finds are padding (the D300's 32 columns read a constant 255) or
  carry a black level of 0. On the bodies whose picture sits in a DefaultCrop, the border is lit picture or fill,
  not masked sensels.
- **Agreement:** on the 6, the two readers' masked sigma in DN agrees within 2% (K-1 II 28.64 vs 29.16; its
  margins differ). The normalised values differ on three Canons because the white levels differ: shootflow
  takes 16383 for the 600D and 70D, LibRaw 13584 and 15303. That is a separate question this run did not chase.
- **The morning's headline holds:** the frame line's read term is clamped to 0 on 4 of the 6 (shootflow) or 3 of
  6 (LibRaw). A masked floor would raise sigma at 1% of white by 11-123% on 5 of 6 (K-1 II 2.23x).

## A second check: does develop's frame noise read see the border?

Develop reads `--noise-from-frame` from the whole ActiveArea. On the ORF, RW2, ARW, SRW and PEF readers, that
includes the border outside the camera's crop. `tools/frame_noise_crop_area.py` fits the patch-PCA model
(develop's Bayer default, `eig="mpcw"`) three times on each of the 30 files with a DefaultCrop inside the
ActiveArea: on the active area, on the crop, and on a control. The control is the crop inset until it loses the
border's share of area, so it shows how far the estimator moves on any smaller sample of the picture. Rows:
`frame-noise-crop-area-2026-11-22.jsonl`, `.txt`.

| sigma ratio | median abs(log), 1% / 10% / 50% of white | off by over 5% (of 30), 1% / 10% / 50% |
|---|---|---|
| active / crop (the border's effect) | 0.022 / 0.015 / 0.017 | 10 / 7 / 9 |
| inset / crop (control) | 0.036 / 0.027 / 0.030 | 11 / 9 / 11 |

- Across the set, the border moves the model **less than the control does**. Reading from the crop instead is not
  a general fix, and develop's area is left as it is.
- On 3 files the border alone lifts deep-shadow sigma well past the control: Panasonic GF7 1.38x (control 1.03),
  Samsung NX20 1.49x (0.94) and Sony A7M4 1.37x (0.99, a 10.8% border). Those borders hold lit edge lines and
  zero fill that the line fit reads as extra read noise.
- The control is itself a finding. Patch PCA moves over 5% on about a third of these files when about 2% of the
  picture is removed, up to 0.50x at 50% of white on a GF1. The model is less stable to its sample than its
  held-out dB scores suggest.

## Next

1. A score, not more coverage: the floor (6 bodies) and the crop-area read (GF7, NX20, A7M4) both need a real
   low/high-ISO pair of one static scene before either goes into develop.
2. The patch-PCA sampling spread: how much it varies over random 98% subsets of one frame. If it is as large as
   the control suggests, average over subsets or report an interval.
3. The CR2 white level: shootflow and LibRaw differ on the 600D (16383 vs 13584), 70D (16383 vs 15303) and 7D
   (12649 vs 13584), which changes every normalised level on those bodies.
