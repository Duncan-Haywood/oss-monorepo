# Phase One IIQ S read directly, against LibRaw (2026-11-18)

## Why

The IIQ reader that landed earlier today (`eval/phaseone-iiq-reader-2026-11-18.md`) read IIQ L and
refused IIQ S, Phase One's smaller compressed setting. That refusal covered more than a corner case: on
raw.pixls.us, six of the Phase One files are IIQ S, and for the iXU180, iXM-100 and iXM-RS150F aerial
cameras and half of the IQ180's files it is the setting their owners shot. Aerial mapping and survey
flights shoot thousands of frames a day, and every one had to go through Capture One or Adobe DNG Converter
before ShootFlow would develop it.

## What was built

`src/shootflow/iiq.py` now decodes format 6 too, as a pure-Python reference (`_decode_s_python`) and a
second function in the same optional C library (`shootflow_iiq_s_run`). The layout, in this module's
words (its docstring has the full description):

- Each row is coded on its own in 32-bit little-endian words read most significant bit first, starting at
  the row table's offset. A 16-bit row header carries the row's base precision `q` in its low three bits.
- Blocks of eight columns follow, the even and odd columns being two lanes. A block header gives each
  lane's scale `k` (a 2-bit step of -1, 0 or +1 from the last, or `00` and a fresh value as a 2-5 bit
  prefix code; 9 means raw 14-bit samples), then one refinement `r` shared by both lanes (`1` for 0, or
  `0` and two bits for 1-4).
- Each of the eight samples is `q + r` bits `b`: the value is `last + (b << (k - r)) - (2**(q + k - 1) - 1)`.
  The last `width % 8` columns are raw 14-bit values. Stored values are the value times four, clamped to
  16 bits (as in LibRaw's `raw_image`), and the row and column black offsets of the split sensor are added
  as for IIQ L.

**Provenance.** No public specification exists. The layout was learned from LibRaw 0.21+'s `decode_S_type`
(LGPL-2.1/CDDL, which itself credits Daniel Vogelbacher's work), read for the layout only, as the CR3 and
RW2 format 8 readers were. The code here is written independently and structured differently: the scale
codes are a table of prefix codes built at import, not LibRaw's 32-entry lookup tables, and there is no
copied code.

**One case LibRaw leaves to C.** A refinement above the lane's scale makes `k - r` negative. In LibRaw
that becomes an unsigned shift count, which is undefined behaviour in C. It occurs in real files: the
first run of the reader, which refused it, stopped on three of the six (both IQ180 IIQ S frames and the
iXU180). `tools/iiq_s_shift_check.py` then counted it with the reference decoder's bit reader (rows:
`eval/phaseone-iiq-s-shift-2026-11-18.jsonl`):

| file | rows with it | samples | sample bits | sensels differing from LibRaw on those rows, read as: right shift / zero / 32-bit wrapped left shift |
|---|---|---|---|---|
| IQ180 230214_9564 | 11 | 276 | all 0 | 0 / 0 / 0 of 57,376 |
| IQ180 230214_9562 | 58 | 232 | all 0 | 0 / 0 / 0 of 602,040 |
| iXU180 cap_22908 | 93 | 372 | all 0 | 0 / 0 / 0 of 965,340 |

Every one of the 880 samples carries zero bits, so the step is 0 whatever the shift means. The reader
accepts exactly that case and refuses non-zero bits there as corrupt, rather than guess at a meaning no
file has shown. A scale above `17 - q`, where the bias would be undefined, is refused the same way. The
other three files never send it (the strict first run read them whole).

## Check 1: every sensel against LibRaw

`PYTHONPATH=src python tools/iiq_libraw_check.py *.IIQ` with rawpy 0.28.0 (LibRaw 0.22.2), as for IIQ L.
Rows: `eval/phaseone-iiq-s-libraw-2026-11-18.jsonl` (this run also read three IIQ L files new to the
check, marked L). Files: raw.pixls.us `data/Phase One/` (CC0), fetched with `curl -L`.

| body | file | format | sensels | differing | CFA (= LibRaw) | WB R/G, B/G (= LibRaw) | offsets | read s |
|---|---|---|---|---|---|---|---|---|
| IQ180 | 230214_9562 | S | 81,130,080 | 0 | RGGB | 1.6673, 1.7899 | -6 to 10 | 0.58 |
| IQ180 | 230214_9564 | S | 20,509,312 | 0 | RGGB | 1.6867, 1.7723 | -13 to 4 | 0.10 |
| iXU180 | cap_22908 | S | 81,130,080 | 0 | RGGB | 1.5719, 1.6579 | -336 to 17 | 0.69 |
| IQ3 100MP | Phase_One_IQ3_100MP_IIQ_S | S | 106,011,552 | 0 | RGGB | 3.2244, 1.2962 | none | 0.65 |
| iXM-100 | _849 | S | 104,158,456 | 0 | RGGB | 3.24, 1.52 | none | 0.65 |
| iXM-RS150F | RGB_86_0_4 | S | 153,954,080 | 0 | RGGB | 3.2497, 1.6597 | none | 1.21 |
| IQ180 | 230214_9561 | L | 81,130,080 | 0 | RGGB | 1.6673, 1.7899 | -6 to 5 | 0.64 |
| IQ180 | 230214_9565 | L | 20,509,312 | 0 | RGGB | 1.6867, 1.7723 | -15 to 2 | 0.19 |
| iXM-100 | _848 | L | 104,158,456 | 0 | RGGB | 3.24, 1.52 | none | 0.78 |

IIQ S: 546,893,560 sensels from six files of five bodies, none different. IIQ L: 205,797,848 more sensels
from two bodies the earlier check had not read (IQ180, iXM-100), none different. Crop and orientation equal
LibRaw's on all nine (the check's `flip` 1 is the TIFF code for "none", LibRaw's 0). Read times are with
the C decoder on this container's four cores (one thread); a 154 MP iXM-RS150F frame reads in 1.2 s.
`tests/test_iiq.py`'s real-file test, run with `SHOOTFLOW_IIQ_SAMPLES` on these ten files, checks the
pure-Python and C decoders agree on the first 24 rows of each.

The IQ3 100MP Trichromatic file is format 8 (16-bit IIQ L) and stays refused, as before.

**Levels.** Each colour's mean after black and offsets, as R/G and B/G, against LibRaw's linear
camera-space render:

| body | file | ours R/G, B/G | LibRaw R/G, B/G |
|---|---|---|---|
| IQ180 | 9562 (S) | 0.6767, 0.4916 | 0.6799, 0.4916 |
| IQ180 | 9564 (S) | 0.6731, 0.4854 | 0.6771, 0.4861 |
| iXU180 | 22908 (S) | 0.6568, 0.4483 | 0.6688, 0.4728 |
| IQ3 100MP | S | 0.2866, 0.7882 | 0.2864, 0.7886 |
| iXM-100 | 849 (S) | 0.4987, 0.8340 | 0.4983, 0.8335 |
| iXM-RS150F | (S) | 0.3323, 0.5842 | 0.3315, 0.5840 |

Within 0.6% on five of six. The iXU180 is 1.8% (R/G) and 5.2% (B/G) apart, and it is the file with by far
the largest offset tables (down to -336). As with the P45+ in the IIQ L check, that is where LibRaw's
`phase_one_correct` (Phase One's flat-field, defect and split-sensor corrections from the metadata block),
which this reader does not apply, would show most. The sensels themselves are identical, so the gap is
those corrections, not the decoder.

## Check 2: the whole develop

`PYTHONPATH=src:tests:tools python tools/iiq_develop_check.py FILE.IIQ` per file (one at a time, for
memory), with no profile (the file's own matrix) against `rawpy.postprocess(use_camera_wb=True,
no_auto_bright=True)`. Rows: `eval/phaseone-iiq-s-develop-2026-11-18.jsonl`.

| body | file | format | develop s | chromaticity gap, file's matrix | gap, LibRaw's matrix as a .dcp | unclipped share |
|---|---|---|---|---|---|---|
| IQ180 | 230214_9564 | S | 2.37 | 0.0182 | 0.0035 | 0.9995 |
| IQ180 | 230214_9565 | L | 1.98 | 0.0182 | 0.0034 | 0.9992 |

Both within the 0.02 gate. With LibRaw's own matrix as a stand-in profile the gap is 0.0035: the levels,
white balance and crop agree, and what is left with the file's own matrix is the colour model (DNG
specification with the as-shot white adapted to D50, against dcraw's), as the IIQ L eval explains. The S
and L frames of the same scene develop to the same numbers, as they should.

**The check was wrong before this run.** `tools/iiq_develop_check.py` undid LibRaw's render with the sRGB
curve, but LibRaw's default output curve is BT.709; the Hasselblad 3FR run, merged while this one worked,
found the same flaw in the MRW check (`eval/hasselblad-3fr-reader-2026-11-18.md`). On the IQ180 9564 the old
check reported 0.0205 (fails the gate) and 0.0131 with LibRaw's matrix; asking LibRaw for linear light
(`gamma=(1, 1)`) gives 0.0182 and 0.0035. The IIQ L eval's develop table
(`eval/phaseone-iiq-reader-2026-11-18.md`, Check 2) was made with the old check, so its gaps overstate the
difference; rerunning it needs those ten files again.

**Not run on the larger files.** The 81-154 MP frames (IQ180 9561/9562, iXU180, iXM-100, IQ3 100MP,
iXM-RS150F) were killed for memory in this container (15 GB: our full-size develop, LibRaw's render and the
second arm at once), as the IQ3 100MP was in the IIQ L run. Their sensels are identical to LibRaw's (Check
1), so only the colour model is untested on them.

## Tests

`tests/test_iiq.py` gained an IIQ S writer (`encode_s_row`: random precision, lane scales by step and by
fresh code, refinements and sample bits, with the expected values from the format's arithmetic) and four
tests: every sensel through both decoders at widths 48, 45, 5 and 64; offsets and the split sensor plus a
develop through `parse_raw`; the zero-bit refinement-above-scale case decoded and the non-zero one
refused; and an out-of-range scale refused. 12 passed, 1 skipped (the real-file test, which passes with
`SHOOTFLOW_IIQ_SAMPLES` set to the ten files here).

## Next

The IQ4 150MP's formats and the Trichromatic's 16-bit format 8 (raw.pixls.us has three IQ4 files of 161-201
MB and the Trichromatic); Phase One's flat-field and defect corrections from the metadata block, measured
against the iXU180's and P45+'s level gaps above.
