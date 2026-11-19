# Phase One calibration on IIQ S, 16-bit and aerial backs, and where the iXU180's 5.2% went (2026-11-19)

## Why

The calibration check earlier today (`eval/phaseone-iiq-calibration-2026-11-19.md`) covered ten backs, all
IIQ L at 14 bits. It left out the files the reader had learned to decode the day before: IIQ S (format 6),
16-bit IIQ L (format 8) and the aerial bodies (iXU180, iXM-100, iXM-RS150F). It also named one open gap.
The iXU180's channel levels were 1.8% (R/G) and 5.2% (B/G) off LibRaw's render, and the reader notes
guessed the calibration was the cause. This run checked the calibration on all 13 remaining public Phase
One files and traced the iXU180's gap.

## Two fixes to the check before it could be trusted

The first pass reported the iXU180 as almost entirely wrong: 0.001% of sensels equal, with LibRaw's
values 4-21% above ours. Two things in the check, not in the calibration, caused that:

1. **LibRaw skips the black offset tables on IIQ S.** An IIQ can carry two tables of black offsets, one
   per row (left and right of the split column) and one per column (above and below the split row).
   ShootFlow adds both to every sensel. So do LibRaw's IIQ L and uncompressed loaders, through
   `phase_one_subtract_black`. LibRaw 0.22's IIQ S loader (`phase_one_load_raw_s`, read for its behaviour
   only) never reads the tables. On IIQ S, LibRaw's input to the calibration is therefore missing them.
   The check now decodes format 6 files with the tables zeroed (`offsets_zeroed` in the rows), so it
   compares the calibration code alone. The tables are measured separately below.
2. **LibRaw's maximum adjustment.** By default `postprocess` lowers its white point to the frame's data
   maximum when that is above 75% of the nominal one (`adjust_maximum_thr`). On the iXU180 that scaled
   LibRaw's render by a uniform 3.3%, which the check read as a calibration difference. The check now
   passes `adjust_maximum_thr=0`. This scale is uniform, so it never touched colour ratios, and the ten
   earlier backs had matched without the flag.

## Check: every sensel against LibRaw's render

`tools/iiq_calibration_check.py` as described in the earlier note, with the two changes above.
Rows: `eval/phaseone-iiq-calibration-newer-backs-2026-11-19.jsonl`. rawpy 0.28.0 (LibRaw 0.22.2), files
from raw.pixls.us `data/Phase One/` (CC0), fetched with `curl -L`.

| body | file | format | steps | sensels | equal | outside dead columns: equal / max | uncalibrated: equal / within 1% | LibRaw gain range | s |
|---|---|---|---|---|---|---|---|---|---|
| iXU180 | cap_22908 | S | 0x431, 15 + 8 flats, 40,211 px, 4 col | 80.1 M | 99.950% | 99.988% / 2 | 0.15% / 7.7% | 1.010-1.075 | 0.65 |
| IQ180 | 230214_9562 | S | 0x431, 10 + 8 flats, 7,513 px | 80.1 M | 99.954% | (none) / 3 | 0.006% / 1.7% | 1.018-1.115 | 0.60 |
| IQ180 | 230214_9561 | L | the same | 80.1 M | 99.968% | (none) / 3 | 0.006% / 1.7% | 1.018-1.115 | 0.58 |
| IQ3 100MP | IIQ_S | S | 0x410, 0x40b, 499 px | 101.1 M | 100% | (none) / 0 | 1.3% / 85.0% | 1.004-1.010 | 0.44 |
| IQ3 100MP | IIQ_L | L | the same | 101.1 M | 100% | (none) / 0 | 1.3% / 85.0% | 1.004-1.010 | 0.46 |
| IQ3 100MP | IIQ_L_16bit | 16-bit L | the same | 101.1 M | 100% | (none) / 0 | 1.6% / 85.3% | 1.004-1.010 | 0.47 |
| IQ3 100MP Trichromatic | Trichromatic-2 | 16-bit L | 0x410, 0x40b, 409 px | 101.1 M | 100% | (none) / 0 | 1.1% / 64.7% | 1.003-1.013 | 0.44 |
| IQ4 150MP | L_14 | L | 0x410, 0x40b, 8,583 px | 150.8 M | 100% | (none) / 0 | 4.1% / 92.0% | 1.006-1.009 | 0.71 |
| IQ4 150MP | IIQ_L_16bit | 16-bit L | the same | 150.4 M | 100% | (none) / 0 | 3.9% / 91.9% | 1.006-1.009 | 0.76 |
| IQ4 150MP | L_16_Ex | 16-bit L | the same | 150.5 M | 100% | (none) / 0 | 4.0% / 91.9% | 1.006-1.009 | 0.69 |
| iXM-100 | _849 | S | 0x410, 0x40b, 1,328 px | 86.3 M | 100% | (none) / 0 | 51.3% / 96.5% | 0.994-1.013 | 0.48 |
| iXM-100 | _848 | L | the same | 85.9 M | 100% | (none) / 0 | 50.8% / 96.4% | 0.994-1.015 | 0.48 |
| iXM-RS150F | RGB_86_0_4 | S | 0x410, 0x40b, 24,958 px | 151.2 M | 100% | (none) / 0 | 1.2% / 69.6% | 1.007-1.011 | 0.71 |

**Summary:** 1,419.8 M sensels from 13 files of seven bodies, none of them in the earlier check except
the IQ180 (whose IIQ S frames it had not read). Nine files equal LibRaw on every sensel. The two IQ180
frames are within 3 codes everywhere, from the same float rounding in the four-tile spline seen on the
IQ140 and the IQ180 L file earlier today. The iXU180 is within 2 codes outside the four columns its file
marks dead. Those columns are filled with ShootFlow's own fixed weights, as on every back, and hold all
21,488 sensels that are more than 1% off. Calibration takes 0.44-0.76 s a frame for frames up to 151 MP.
Together with the earlier ten backs, the calibration has now been checked on 1.8 billion sensels from 16
bodies, in all three formats the reader decodes (IIQ L, 16-bit IIQ L and IIQ S).

## Where the iXU180's 5.2% went

`tools/iiq_offsets_check.py` (rows: `eval/phaseone-iiq-offsets-2026-11-19.jsonl`) gives each colour's mean
after black as R/G and B/G, in four arms, next to LibRaw's linear render:

| file | tables on | tables on + calibration | tables zeroed | zeroed + calibration | LibRaw |
|---|---|---|---|---|---|
| iXU180 (S) | 0.6568, 0.4483 | 0.6527, 0.4473 | 0.6726, 0.4737 | **0.6688, 0.4729** | **0.6689, 0.4729** |
| IQ180 9562 (S) | 0.6767, 0.4916 | 0.6799, 0.4916 | 0.6767, 0.4916 | 0.6799, 0.4916 | 0.6799, 0.4916 |
| IQ180 9561 (L) | 0.6764, 0.4919 | 0.6796, 0.4919 | 0.6765, 0.4920 | 0.6796, 0.4919 | 0.6796, 0.4919 |

So the gap was almost all the offset tables, not the calibration. The calibration moves the iXU180's B/G
by 0.2%, while the tables move it by 5.6%. With the tables zeroed and the calibration on, ShootFlow's
levels equal LibRaw's to the fourth decimal. The IQ180's tables span only -4 to +8 codes, so on its files
the two readers agree either way. The IQ3 100MP and the iXM files carry no tables.

**What the iXU180's tables look like.** The row table is not noise. It is a symmetric ramp: about -29 codes
in the top band of rows, falling linearly to -333 at the split row (3,888, the middle of the sensor), and
back to -24 at the bottom. Left and right halves are within 6 codes of each other. The column table spans
only -3 to +26. Its row-to-row detail is under 0.4 codes rms, so the table is a smooth black-level field
that peaks at the centre, not a per-row fix for banding. On a black level of 1024, applying it lowers the
middle of the frame by up to a third of the pedestal relative to the edges.

**Which arm is right is still open.** ShootFlow keeps applying the tables on IIQ S, as LibRaw does on every
other IIQ format, because the file stores them and nothing marks them as IIQ L-only. LibRaw's omission
looks like a gap in its IIQ S loader, not a decision. But this run could not prove it on this frame,
which is a bright aerial scene with no dark areas:

- In both arms the darkest 0.1% of each inner band of rows sits 390-700 codes above black. The scene sets
  that level, and in neither arm does it trace the ramp clearly.
- The steps across the split column and split row are under 10 codes in both arms, the same as control
  pairs 1,000 sensels away.
- The margins outside the crop are filler near 32,768, not masked black sensels, so they say nothing.

A dark frame (lens cap on) from an iXU180, a second iXU180 file with shadows, or a Capture One export of
cap_22908 would settle it. None is public. Until then, an iXU180 IIQ S frame developed by ShootFlow has
about 5% less blue relative to green than the same frame developed by LibRaw-based tools (darktable,
RawTherapee). The difference is largest in the middle rows. Its shadows will also sit lower.

## Not done

- The ten earlier backs were not rerun with `adjust_maximum_thr=0`. They matched LibRaw without it, so
  the adjustment did not engage on them, or engaged by less than one code.
- `0x412` and the undocumented tags stay unapplied. None of these 13 files carries `0x412`.
