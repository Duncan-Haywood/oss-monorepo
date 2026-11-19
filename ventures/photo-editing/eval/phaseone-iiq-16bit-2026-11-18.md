# 16-bit IIQ L (format 8): the IQ4 150MP and the Trichromatic, against LibRaw (2026-11-18)

## Why

After the IIQ L and IIQ S readers landed today (`eval/phaseone-iiq-reader-2026-11-18.md`,
`eval/phaseone-iiq-s-reader-2026-11-18.md`), one coded format was still refused: format 8, the 16-bit
IIQ L. It is what the IQ4 150MP writes in its "IIQ L 16-bit" and "IIQ L 16 Extended" settings, and what the
IQ3 100MP and its Trichromatic variant write for 16-bit IIQ L. The IQ4 is Phase One's current flagship back,
and owners who buy a 150 MP back for its tonal range are likely to shoot the 16-bit settings. Before today,
every such frame needed Capture One or a DNG conversion before ShootFlow would develop it.

## What was built

Format 8 turned out to be the IIQ L code unchanged (two colour lanes, a length chosen per eight columns
from `8 7 6 9 11 10 5 12 14 13`, a length of 14 meaning a raw 16-bit value, the last `width % 8` columns
raw), with one difference: the value is stored as it is, where formats 3 and 5 store the 14-bit value times
four. Both decoders in `src/shootflow/iiq.py` take that as a shift (2 for formats 3 and 5, 0 for format 8):
the pure-Python reference and the optional C function (`shootflow_iiq_run` gained an `int shift`
argument, so its cache key changes and it rebuilds once). White is 65535 for format 8 (65532 for the
others); the black level (1024 on every file here) and the split-sensor offset tables are applied as for
IIQ L. The layout is LibRaw's `phase_one_load_raw_c` for format 8 (it copies the decoded row as it is
instead of shifting it), read for the layout only, as for the other IIQ formats.

## Check 1: every sensel against LibRaw

`PYTHONPATH=src python tools/iiq_libraw_check.py FILE` with rawpy 0.28.0 (LibRaw 0.22.2), one file at a time.
Files: raw.pixls.us `data/Phase One/` (CC0), fetched with `curl -L`. Rows:
`eval/phaseone-iiq-16bit-libraw-2026-11-18.jsonl`.

| body | file | format | sensels | differing | CFA, WB, crop, orientation | read s |
|---|---|---|---|---|---|---|
| IQ4 150MP | IQ4_150MPIIQ_L_16bit | 8 | 153,954,080 | 0 | = LibRaw | 1.15 |
| IQ4 150MP | IQ4_150MP_L_16_Ex | 8 | 153,954,080 | 0 | = LibRaw | 1.12 |
| IQ3 100MP | Phase_One_IQ3_100MP_IIQ_L_16bit | 8 | 106,011,552 | 0 | = LibRaw | 0.78 |
| IQ3 100MP Trichromatic | Trichromatic-2 | 8 | 106,011,552 | 0 | = LibRaw | 0.77 |
| IQ4 150MP | IQ4_150MP_L_14 | 3 | 153,954,080 | 0 | = LibRaw | 1.21 |

Format 8: 519,931,264 sensels from four files of three bodies, none different. The IQ4's 14-bit IIQ L had
never been through the check (no IQ4 file had been fetched), and matches too. The same run re-read eleven
files from ten bodies already checked (H 25, P45+, P65+, IQ140, IQ150, IQ180, IQ3 100MP, iXM-100,
iXM-RS150F, iXU180; formats 3, 5 and 6): 0 differing, so the shift argument changed nothing for them.
Read times are the C decoder, one thread.

`tests/test_iiq.py` gained `test_format_8_sixteen_bit_codes_stored_as_they_are`: 16-bit codes at widths 40,
37 and 6, with offsets and a split sensor, through both decoders, plus the white and black levels. The
real-file test (`SHOOTFLOW_IIQ_SAMPLES` pointed at the four IQ4 and Trichromatic files) passes: both
decoders agree on the first 24 rows of each. 14 passed, 1 skipped without the samples.

## Check 2: are the two extra bits used?

`PYTHONPATH=src python tools/iiq_low_bits.py FILE`. Rows: `eval/phaseone-iiq-16bit-lowbits-2026-11-18.jsonl`.

| file | low two bits 0 / 1 / 2 / 3 | masked columns: mean, spread (16-bit steps) | 14-bit rounding would add |
|---|---|---|---|
| IQ4 L 16-bit | 24.95 / 25.01 / 25.04 / 25.00% | 1025.2, 6.83 | 1.4% |
| IQ4 L 16 Extended | 24.94 / 24.99 / 25.06 / 25.00% | 1024.4, 6.02 | 1.8% |
| IQ4 L 14-bit (format 3) | 100 / 0 / 0 / 0% | 1023.8, 7.88 | (already rounded) |

The 16-bit files really do use their two extra bits: each low-bit value is in a quarter of the sensels,
where a padded 14-bit file would have them all 0. But the read noise in the IQ4's masked columns (mean at
the 1024 black level, so they are optical black) is 6.0-6.8 of the 16-bit steps, 1.5-1.7 of the 14-bit
steps, and rounding to 14 bits adds 4 / sqrt(12) = 1.15 steps of quantisation noise in quadrature: 1.4-1.8%
more noise in the deepest shadows at this exposure, under a tenth of a stop. The 16-bit files are 25%
larger (211 MB against 168 MB). The three frames are different exposures of one scene, so this is a
statement about the read noise, not a same-frame comparison. The IQ3 100MP and Trichromatic left margins
are not masked here (their mean is 30,390, image data), so the noise column does not apply to them; their
low bits are spread evenly too.

## Check 3: the colour, and a disagreement this check cannot settle

The whole-develop check (`tools/iiq_develop_check.py`) needs both full-size renders in memory and was killed
on 81-154 MP frames in earlier runs. A new check, `tools/iiq_matrix_check.py`, develops the same sensels
twice through ShootFlow (the file's own matrix; LibRaw's matrix for the body as a stand-in `.dcp`), with
`--rows 3000` reading only the first 3,000 image rows (the directory's heights are rewritten in memory, so
the rows are the file's own), and reports the mean-colour chromaticity gap. Because that gap depends on the
scene, it also takes the 24 ColorChecker Classic patches (X-Rite's post-2014 L\*a\*b\* D50 values, as
tabulated by colour-science) through LibRaw's matrix into camera space and back out through the file's,
and gives the CIE76 delta E\*ab. Rows: `eval/phaseone-iiq-matrix-2026-11-18.jsonl`.

| body | file's matrix | mean-colour gap | ColorChecker delta E: mean, max (patch), neutrals max |
|---|---|---|---|
| IQ4 150MP (3 files) | the shared CMOS matrix | 0.089-0.094 | 15.97, 58.1 (cyan), 0.57 |
| IQ3 100MP (L 16-bit, S) | the shared CMOS matrix | 0.007-0.008 | 0.00, 0.01, 0.00 |
| IQ3 100MP Trichromatic | the shared CMOS matrix | 0.003 | 0.00, 0.01, 0.00 |
| IQ150 | CCD matrix A | 0.009 | 3.09, 9.5 (yellow), 0.30 |
| IQ140 | CCD matrix A | 0.011 | 12.40, 33.9 (blue), 1.17 |
| P65+ | CCD matrix A | 0.009 | 12.40, 33.9 (blue), 1.17 |
| IQ180 | own | 0.016 | 11.67, 34.0 (blue), 1.26 |
| P45+ | own | 0.008 | 12.01, 54.1 (yellow), 0.39 |
| H 25 | own | 0.021 | 7.95, 21.1 (yellow), 0.44 |
| iXM-100, iXM-RS150F, iXU180 | | LibRaw has no matrix for these | |

What it shows:

- **The file's matrix is per sensor family, not per body.** Every CMOS back here (IQ3 100MP, Trichromatic,
  IQ4 150MP, iXM-100, iXM-RS150F) carries the same nine numbers at `0x106`; the IQ140, IQ150 and P65+ share
  another.
- **For the IQ3 100MP family LibRaw's matrix is the file's** (delta E 0.00: LibRaw has no table entry and
  converts the file's matrix, as dcraw's `romm_coeff` does). So the 0.003-0.008 mean-colour gap on those
  rows is this check's own floor: the same matrix reaches the DNG colour model through two calibration
  illuminants (D50 for the file's, D65 for the stand-in).
- **For the IQ4 LibRaw carries its own matrix, and the two disagree badly** on saturated colours, though
  both keep neutrals neutral (0.57). On the IQ4 frames (a clear winter sky over conifers) the file's matrix
  gives a cyan-blue sky and LibRaw's a lavender one (a side-by-side render was looked at in this run, not
  committed: 150 MP sample renders are large). To the eye the file's sky is the more plausible of the two,
  but that is a judgement, not a measurement.
- **The mean-colour gate passes bodies whose matrices disagree by delta E 8-12** (IQ140, IQ180, P45+, P65+,
  H 25). Those frames are mostly neutral scenes, where a matrix difference hardly moves the mean. The gate
  checks levels and white balance well; it does not check colour accuracy.

**Decision.** The file's own matrix stays the IQ4's default: neither matrix is ground truth, and replacing
Phase One's with a refusal would trade an unmeasured risk for a sure loss (no develop without a `.dcp`).
`--dcp` (or a profile in `color/camera-profiles/`) overrides it for anyone with Adobe's. An earlier draft of
this run planned to refuse the IQ4's file matrix after the 0.09 gap; the ColorChecker numbers and the
render showed the gap measured LibRaw's matrix as much as Phase One's, so that was dropped.

**What would settle it:** a photographed colour target. raw.pixls.us has one for a Phase One body,
`H 25/H25_IT8.7-2_Card.TIF` (an IT8.7/2 card), which would say for the H 25 which matrix is closer, and
would be a model for doing the same on an IQ4 if a target frame turns up.

## Not done

- Phase One's flat-field, defect and split-sensor corrections from the `0x110` metadata block (the iXU180
  and P45+ level gaps), as before.
- The uncompressed formats 1 and 2: no public file.
- A whole-frame develop of the 100-150 MP files against LibRaw's render (memory); the row-cropped matrix
  check stands in for its colour half, and Check 1 for its sensel half.
