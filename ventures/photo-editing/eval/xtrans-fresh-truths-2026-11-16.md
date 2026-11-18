# X-Trans demosaic: seven held-out truths, and two changes that did not survive them (2026-11-16)

Flagship item: "X-Trans demosaic: real frames 0.5-0.7 dB short of LibRaw's three-pass, level under
noise" (`eval/xtrans-clamp-gradient-2026-11-15.md`, Open: "Whether to keep green out of the median:
needs a real noisy frame with a known answer"). Same scores and tool (`tools/xtrans_demosaic_check.py`).
Raw rows: `eval/xtrans-fresh-truths-2026-11-16.jsonl` (the tool's own output) and
`eval/xtrans-guided-rb-2026-11-16.jsonl` (a scratch experiment, see below).

**Verdict: no default changes.** The 2026-11-15 default gets its first wide held-out check, and it
holds: on seven truths it was never tuned on, it has higher colour PSNR than LibRaw 0.22.2's three-pass
Markesteijn on four of seven noise-free and on all seven at SNR 25, and higher luma PSNR noise-free on
six of seven. Two candidate changes that looked good on the tuning frame were tested and refused:
keeping green out of the median (`median_green=False`, now an option) and a green-guided red/blue step.

## Why a wider truth set

Every X-Trans number so far rested on two real frames (X-E1, used for tuning; X-E2, looked at once) and
a synthetic sheet. They disagreed on several choices (the sheet wanted three passes and green in the
median; the X-E1 wanted neither), and there was no third frame to break the tie: the public sample set
(drewnoakes/metadata-extractor-images) holds only two X-Trans RAFs, and raw.pixls.us refused connections
from this session.

The new `--truth-from FILE` option borrows a scene instead. Any raw LibRaw reads (here Bayer frames from
other cameras) is rendered with AHD, binned 4 x 4 (which removes nearly all demosaic error and noise, as
the RAF's own truth is made), cropped to 800 x 1200 and mosaicked with the X-E1's own 6 x 6 layout. LibRaw
gets the same mosaic written into the X-E1 RAF. The scenes are real; only the layout is borrowed. Six
frames none of the X-Trans notes used: Sony A7 IV, Nikon D800E, Canon 7D, Panasonic GF7, Samsung NX1,
OM System OM-1 (the files the 2026-11-16 Bayer note used as its fresh set, plus the OM-1). With the X-E2,
seven held-out truths.

## The default against LibRaw

Colour PSNR / luma PSNR (dB), noise-free:

| truth | bilinear | **default** | LibRaw 1 pass | LibRaw 3 passes | default minus 3 passes (colour) |
|---|---|---|---|---|---|
| X-E2 (own layout) | 41.95 / 45.56 | **49.43** / 53.94 | 46.45 / 51.09 | 49.89 / 53.91 | -0.46 |
| A7 IV | 51.50 / 58.09 | **51.52** / 56.40 | 51.06 / 55.92 | 51.62 / 57.61 | -0.10 |
| D800E | 37.03 / 41.18 | **44.86** / 49.12 | 42.11 / 46.84 | 45.16 / 48.65 | -0.30 |
| 7D | 43.15 / 46.99 | **50.65** / 54.45 | 48.30 / 52.41 | 49.78 / 52.93 | +0.87 |
| GF7 | 23.53 / 27.02 | **30.18** / 33.78 | 27.63 / 31.60 | 27.77 / 29.88 | +2.41 |
| NX1 | 35.61 / 39.13 | **45.99** / 49.63 | 40.46 / 44.63 | 45.73 / 48.27 | +0.26 |
| OM-1 | 43.40 / 48.26 | **48.61** / 53.06 | 47.07 / 51.66 | 48.17 / 52.45 | +0.44 |

At SNR 25 (Poisson-Gaussian, the tool's `--noise-snr 25`), colour PSNR, default against three passes:
X-E2 40.79 / 40.67, A7 IV 39.63 / 39.56, D800E 41.44 / 41.35, 7D 42.70 / 42.44, GF7 29.94 / 27.61,
NX1 40.53 / 40.27, OM-1 42.90 / 42.62: ahead on all seven, by 0.07-0.28 dB (2.3 on the GF7).

- **Colour:** ahead of three passes on four of seven noise-free (-0.46 to +2.41 dB), all seven at SNR 25;
  ahead of one pass on all seven at both levels (by 0.5-5.5 dB).
- **Luma:** ahead of three passes noise-free on six of seven (the A7 IV is the exception, -1.2 dB); at
  SNR 25 behind on six of seven, by 0.01-0.6 dB. That is the median's known cost under noise (it puts
  each red or blue sensel's own noise into green; 2026-11-15 note).
- **False colour (p99, thousandths):** lower or equal to three passes on six of seven noise-free (X-E2
  18 against 17 is the exception) and lower on all seven at SNR 25 (for example GF7 155 against 217).
- **The GF7** is a fine, aliased scene (the Bayer note's worst frame too): every method is near 30 dB,
  and LibRaw's three passes fall behind its own one pass in luma there.
- **The A7 IV** is the smoothest scene: bilinear has the best luma (58.09) noise-free and the best colour
  at SNR 25 (41.28 against 39.63). On a scene with little detail at the sampling limit, any edge-keeping
  demosaic only spends noise. Reported, not acted on: no frame-level switch was tried.
- **The synthetic sheet** stays the outlier: 34.99 against LibRaw's 39.44 (now on the X-E2's layout).
  None of the seven real scenes shows that gap; the sheet's finest zone-plate rings are what it measures.

## Green out of the median (`median_green=False`), refused

The 2026-11-15 note found the median costs luma under noise and that a median setting red and blue only
gained 0.4 dB on the X-E1 at every noise level but lost 2.4 dB on the sheet, and asked for more truth.
It is now an option, `directional(..., median_green=False)` (numpy only; the C path refuses it), so the
tool scores it. Colour PSNR change against the default:

| truth | noise-free | SNR 60 | SNR 25 |
|---|---|---|---|
| X-E1 (tuning frame) | +0.43 | +0.42 | +0.40 |
| sheet | -2.46 | -2.35 | -1.93 |
| X-E2 | -0.23 | +0.03 | +0.19 |
| A7 IV | +0.48 | +0.36 | +0.32 |
| D800E | -0.40 | -0.31 | -0.07 |
| 7D | -0.76 | -0.31 | +0.08 |
| GF7 | -1.08 | -1.07 | -1.02 |
| NX1 | -1.37 | -0.94 | -0.28 |
| OM-1 | -0.26 | -0.10 | +0.12 |

(SNR 60 rows from the same code, run separately; the committed jsonl holds noise-free and SNR 25.)

Worse on six of the seven held-out truths noise-free, by up to 1.4 dB (luma by up to 3.2), and a wash at
SNR 25 (four up by 0.08-0.32, three down by 0.07-1.02). The X-E1's gain was that frame, not the method:
the A7 IV is the only other truth that agrees, and it is the smooth scene above. **Green stays in the
median.** This answers the open question with synthetic noise on real scenes, not with a real noisy
frame; a real low/high-ISO pair could still move the SNR 25 column, which is the only one in doubt.

## A green-guided red and blue step, refused (scratch experiment)

Red and blue were the worst channels on the X-E1 (2026-11-15 note). Step 3 averages each direction's
colour difference (red minus green, blue minus green) uniformly over the 3 x 3 window. Tried: the same
average with each red or blue sensel weighted by how close its green is to the centre's green,
`1 / (0.01 x scale + |G_i - G_0|)` (and a Gaussian of the same difference, three widths), over 3 x 3 and
5 x 5. The repository's own idea, run through a scratch harness that patched step 3 (not committed as
code; rows in `eval/xtrans-guided-rb-2026-11-16.jsonl`).

On the tuning pair the best (inverse, 3 x 3) gained 0.36 dB on the X-E1 and lost 0.37 on the sheet
(sum 73.55 against the default's 73.56); every Gaussian variant summed lower. On the held-out truths,
3 x 3: -0.35 to +0.13 dB colour (NX1 the loss); 5 x 5: +0.57 GF7 and +0.43 NX1 but -0.42 A7 IV and
luma down 0.1-1.3 on five of seven. Not shipped.

## Three passes

Within -0.21 to +0.23 dB of one pass on the seven held-out truths (better only on the NX1, +0.23), and
+1.64 on the sheet. The 2026-11-15 choice of one pass stands.

## Commands (from `ventures/photo-editing`)

    M=<sparse checkout of drewnoakes/metadata-extractor-images>
    PYTHONPATH=src python tools/xtrans_demosaic_check.py "$M/raf/Fujifilm X-E1.raf" --skip-own --skip-real \
        --noise-snr 25 --truth-from "$M/arw/Sony ILCE-7M4 (A7M4).ARW" --truth-from "$M/nef/Nikon 800E.nef" \
        --truth-from "$M/cr2/Canon EOS 7D.cr2" --truth-from "$M/rw2/Panasonic DMC-GF7.rw2" \
        --truth-from "$M/srw/Samsung NX1.srw" --truth-from "$M/orf/OM Sytem OM-1.orf" > rows.jsonl
    PYTHONPATH=src python tools/xtrans_demosaic_check.py "$M/raf/FujiFilm EX-2.raf" --skip-real \
        --noise-snr 25 >> rows.jsonl

rawpy 0.25 with LibRaw 0.22.2, Python 3.13, numpy path (the C path is bit-identical for the default).

## Tests

`tests/test_xtrans_demosaic.py`, 1 new (14 in all): with `median_green=False` green equals the
no-median green exactly, the output differs from both the default and no median, bands equal one piece,
and `native=True` is refused.

## Open

- A real noisy frame with a known answer (a static scene at low and high ISO) for the SNR 25 column.
- Per-frame choice: the A7 IV wants less edge-keeping, the GF7 and NX1 a wider red/blue window. A
  frame-level measure that predicts which, checked on held-out truths, is untried.
- The sheet's 4.4 dB (zone-plate rings) is still the only truth with a large gap to three passes.
