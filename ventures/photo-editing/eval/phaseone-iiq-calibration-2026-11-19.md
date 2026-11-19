# Phase One's sensor calibration (the IIQ `0x110` block), applied and checked against LibRaw (2026-11-19)

## Why

Since 2026-11-18 ShootFlow has read every coded IIQ format sensel for sensel as LibRaw does, but it stopped
there. Every Phase One back also writes a factory calibration into each raw, and Capture One and LibRaw
both apply it. Without it a developed frame keeps what the maker calibrates away. The reader notes
named the gap: the P45+'s channel levels were 1.7% and 2.2% off LibRaw's render, and the iXU180's blue
was 5.2% off. This run measured what the calibration does on ten backs: LibRaw's gain over a 6 x 6
grid of blocks runs from 0.937 to 1.063 on the P45+ (the right readout half is about 4% darker, with
falloff toward the corners) and from 1.018 to 1.115 on the IQ180 (four sensor tiles at different
gains). On the IQ150 it is 0.2-0.7%. The calibration also replaces up to 19,072 defective sensels and
up to 17 dead columns a frame.

## What was built

`src/shootflow/iiq_calibration.py`: it parses the block, plans the steps in the block's own order and
applies them to the decoded sensels with the black level kept. The table and flat-field passes run in a
small C helper, built on first use like the decoders, with a pure-Python reference that must agree bit
for bit (`tests/test_iiq_calibration.py`). `iiq.parse_iiq` applies it by default. `calibrate=False`
leaves it off, and the develop report names what was applied. The module docstring describes each
entry:

| tag | what | bodies here |
|---|---|---|
| 0x400 | defects: single sensels (type 129), whole columns (131, 137) | all ten |
| 0x401 | float32 flat field, every colour | H 25 |
| 0x410, 0x416 | 16-bit flat field, every colour (per tile, and per-sensel strips along tile seams) | all but H 25 |
| 0x40b | 16-bit flat field, red and blue | all ten |
| 0x419 | right readout half's polynomial, shifted by the sensor temperature (0x210) | P30, P45+ |
| 0x41a | whole-frame polynomial | P30, P45+ (P65+'s is zero) |
| 0x41e | gain per readout quadrant | P65+ |
| 0x41f | per-quadrant linearisation spline | P65+ |
| 0x431 | four-tile combined spline | IQ140, IQ180 |

LibRaw (0.22, `phase_one_correct`) was read for the block's layout and arithmetic only. The code here
was written independently: natural cubic splines by forward elimination, float32 bilinear flat fields
accumulated row by row and column by column, products truncated.

## Check: every sensel against LibRaw's render

LibRaw applies the calibration while it renders, not to `raw_image`. So the check
(`tools/iiq_calibration_check.py`) renders each file in LibRaw with bilinear demosaicing, camera space,
unit white balance, linear 16-bit output and no rotation. Bilinear demosaicing only fills in the two
missing colours, so each sensel's own channel is LibRaw's calibrated value times `65535 / white`,
truncated. ShootFlow's calibrated sensels, scaled the same way, are compared over every sensel above
black in both and below 60000 in LibRaw's. Rows: `eval/phaseone-iiq-calibration-2026-11-19.jsonl`.
rawpy 0.28.0 (LibRaw 0.22.2), files from raw.pixls.us (CC0).

| body | steps | sensels | equal | within 1 | outside dead columns: equal / max | uncalibrated: equal / within 1% | calibrate s |
|---|---|---|---|---|---|---|---|
| H 25 | 0x401, 0x40b, 1,830 px, 3 col | 22.3 M | 99.927% | 99.928% | 100% / 0 | 0.37% / 24.6% | 0.15 |
| P20+ | 0x416, 0x410, 0x40b, 1,862 px, 3 col | 16.8 M | 99.927% | 99.928% | 100% / 0 | 0.17% / 19.6% | 0.21 |
| P25 | 0x416, 0x410, 0x40b, 6,419 px, 6 col | 22.3 M | 99.875% | 99.878% | 100% / 0 | 1.04% / 31.7% | 0.26 |
| P25+ | 0x416, 0x410, 0x40b, 4,563 px, 9 col | 22.3 M | 99.788% | 99.795% | 100% / 0 | 0.55% / 18.8% | 0.27 |
| P30 | 0x419, 0x41a, flats, 2,148 px, 3 col | 32.0 M | 99.935% | 99.966% | 99.970% / 2 | 0.82% / 62.4% | 0.38 |
| P45+ | 0x419, 0x41a, flats, 19,072 px, 17 col | 39.4 M | 99.645% | 99.769% | 99.877% / 3 | 0.30% / 15.6% | 0.61 |
| P65+ | 0x41e, 0x41f, 9 + 8 flats, 4,908 px | 60.5 M | 99.952% | 99.999% | (no dead columns) / 3 | 0.69% / 35.2% | 0.78 |
| IQ140 | 0x431, 10 + 8 flats, 4,164 px | 40.1 M | 99.974% | 99.9994% | (none) / 3 | 0.43% / 18.5% | 0.42 |
| IQ150 | 0x410, 0x40b, 376 px | 51.4 M | 100% | 100% | (none) / 0 | 2.07% / 95.8% | 0.26 |
| IQ180 | 0x431, 10 + 8 flats, 7,513 px | 80.1 M | 99.968% | 99.9991% | (none) / 3 | 0.006% / 1.7% | 0.64 |

**Summary:** 387.3 M sensels. Leaving out the dead columns, five backs equal LibRaw on every sensel and
the other five are within 3 codes everywhere: 99.88-99.97% are equal, and no sensel is off by more
than 1%. The rest is float rounding in the polynomial and spline tables (P30, P45+, P65+, IQ140,
IQ180). Before calibration, 0.006-2.1% of sensels were equal and 1.7-95.8% within 1%.

**Dead columns are ShootFlow's own.** Every sensel more than 1% off LibRaw lies in a column the file
marks dead (H 25 10,297, P45+ 40,571, the rest fewer). LibRaw fills those columns by choosing a
direction for each sensel. Fitting LibRaw's values as a linear combination of same-colour neighbours
leaves a residual of 2% (rms 100 codes on a mean of 5,082), so its fill is not a fixed filter. ShootFlow
uses a fixed fill: 0.0732233 times the four sensels two away diagonally plus 0.3535534 times the two
sensels two away in the same row. To judge the fill against ground truth, 300 good columns a frame were
blanked on four backs and refilled. The fixed fill, the plain left-right mean, a direction-picking
mean (the pair with the smallest difference) and a gradient-weighted mean of the three pairs came out
within 0.002 of each other in rms relative error (P45+ 0.155 / 0.150 / 0.169 / 0.159; P25+ 0.148 /
0.147 / 0.147 / 0.149; H 25 0.202 / 0.199 / 0.202 / 0.201; P30 0.030 / 0.031 / 0.033 / 0.031). Picking
a direction did not help, so the fixed fill stays. These are noisy frames, which is why the errors are
large for every method. The fill is a choice, not a bug: the check reports the comparison with and
without these columns.

## What it changes downstream

- **Levels** (`tools/iiq_libraw_check.py`, each colour's mean after black against LibRaw's linear render):
  P45+ was R/G 0.4089, B/G 0.8242 against LibRaw's 0.4160, 0.8430 (1.7% and 2.2% apart). It is now
  0.4175, 0.846 against 0.4174, 0.8462: 0.02% apart. P25+ and P30 are within 0.03% (both were already
  within 0.7%). The decode is still equal on every sensel.
- **The whole develop** (`tools/iiq_develop_check.py`, chromaticity gap of the mean colour; the second
  arm uses LibRaw's matrix as a stand-in `.dcp`, which isolates the pipeline from the choice of
  matrix):

  | file | calibration off: file's matrix / LibRaw's matrix | on: file's matrix / LibRaw's matrix |
  |---|---|---|
  | P45+ CF125838 | 0.0094 / 0.0063 | 0.0044 / 0.0005 |
  | P25+ CF028662 | 0.0120 / 0.0282 | 0.0157 / 0.0247 |

  With LibRaw's matrix the pipeline gap shrinks on both backs: P45+ 0.0063 to 0.0005, P25+ 0.0282 to
  0.0247. With the file's own matrix the P25+ grows from 0.012 to 0.016. That arm compares two colour
  models, so moving the levels toward LibRaw's can widen it. Both stay under the 0.02 gate. The IQ180
  develop was killed for memory in this container, as on 2026-11-18. (The 2026-11-18 table's P45+ row
  was a different frame, CF125839, made before the BT.709 fix to the check, so it is not comparable.)

## Not done, and what would settle it

- `0x412`, a curve picked by the value nearest `0x21a`: no file here carries it, so it is not applied.
  The tags no reader documents (`0x402`-`0x408`, `0x40f`, `0x413`, `0x414`, `0x418`, `0x41c`,
  `0x420`-`0x439`) are skipped.
- IIQ S and 16-bit files (iXU180, iXM, IQ3 100MP, IQ4) go through the same code, but were not in this
  check. The iXU180's 5.2% blue gap is the next file to rerun.
- Whether Capture One's own render matches LibRaw's calibration: that needs a Capture One export of one
  of these frames, and none is public.
