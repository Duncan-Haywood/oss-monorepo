# The noise-aware demosaic on raws with no NoiseProfile: a noise model read from the frame (2026-11-17)

Flagship item (from NEXT.md, "A noise model for raws without a profile"): `--demosaic noise-aware` needs the
sensor's (shot, read) noise model. A DNG may carry one in NoiseProfile. A raw read directly (ARW, NEF, CR2,
RW2, ORF, PEF, SRW, RAF, CR3, CRW) never does, and neither do many DNGs, so on those files the mode fell back to
the directional demosaic and did nothing.

**Verdict: shipped as an opt-in flag, `--noise-from-frame`, not as the automatic fallback.** With the flag, a
file with no profile gets a model read from its own mosaic (`xtrans_demosaic.frame_noise`: the existing
`estimate_noise`, sigma scaled by 0.8, then the profile guard). Without the flag nothing changes. A file with a
profile ignores the flag.

- **On noisy frames it keeps 80-94% of the true model's luma gain.** On held-out tiles whose added noise is at
  least as loud as the scene's own finest detail, luma over directional is +0.79 / +0.97 / +1.72 dB (Bayer)
  and +0.99 / +1.13 / +1.94 dB (X-Trans), against the true model's +0.84 / +1.06 / +1.94 and
  +1.09 / +1.41 / +2.42, for the three noise buckets below.
- **On clean, finely textured frames it costs detail.** Where the reference's own fine texture is louder than
  the noise, the estimate reads that texture as noise. On those held-out rows it is 0.29 dB (Bayer) and
  0.31 dB (X-Trans) below directional in luma on average, with single tiles down to 4.2 and 5.7 dB.
  No in-frame estimator tried here separates the two (below), so the flag is meant for high-ISO frames.

Every number is synthetic noise on binned real scenes, as in the earlier noise-aware notes.

## Set-up

`tools/noise_aware_estimated.py sweep`, on the same scenes, tiles and split as
`eval/noise-aware-luma-ramp-2026-11-17.md`. The scenes are every raw in drewnoakes/metadata-extractor-images
that LibRaw 0.22.2 reads (46 files: 21 tune, 25 held, split by a SHA-1 of the name). Each is binned 4 x 4, with
up to three 480 x 480 tiles per file, 58 tiles in all. Noise is drawn at SNR 200, 60, 25 and 12 at 18% grey, in
the two scenarios (**equal**: on the white-balanced plane; **wb**: on the raw scale with the file's as-shot
gains). That makes 464 rows per layout: 216 tune and 248 held. Seeds are now a SHA-1 of the row, so
reruns give the same draws (the earlier tools used Python's per-process `hash`). The arms are:

- `D`: directional (what ships without a profile);
- `true`: the blend with the true model, carried as the developer carries a profile (the oracle);
- `fit@s`: `estimate_noise` on the white-balanced plane, sigma times s;
- `planes@s`: the same fit per colour;
- `guard@s`: `fit@s` through `guard_profile`.

Every arm uses the shipped ramps (`RAMPS`, `LUMA_RAMPS`). s runs over 0.4-1.25.

## First reading: no scale is safe

Over all rows (`fit`, every arm in `eval/noise-aware-estimated-fit-2026-11-17.jsonl`), the rule the earlier
fits used (best tune mean, no tune row worse than D by more than 0.1 dB) is met only at s = 0.4, where the blend
does almost nothing: held luma +0.03 / +0.04 dB, and still 4 / 10 held rows worse by over 0.1 dB, the worst
-0.55 / -0.93 dB. At s = 0.8, guard, held luma is +0.53 / +0.63 dB (the true model's: +0.77 / +0.99), but 44 / 49
held rows lose over 0.1 dB, the worst -4.2 / -5.7 dB. Unscaled (`fit@1`), the worst held row is -4.8 / -7.4 dB,
which matches the "up to 5 dB" the 2026-11-16 note recorded.

## Why: the reference's own fine detail reads as noise

`tools/noise_estimator_accuracy.py` compares each estimator's sigma with the true sigma at 18% grey, with no
demosaic (`eval/bayer-noise-estimator-accuracy-2026-11-17.jsonl`, 30 files). On held rows the existing
estimator reads a median 0.95x the truth at SNR 12, 1.19x at 25, 2.0x at 60 and 5.5x at 200. Something in the
tiles is as loud as SNR 30-60 noise. On the **clean** reference tiles (`--clean`, no noise added,
`eval/noise-estimated-scene-grain-2026-11-17.jsonl`), the cleanest-block wavelet reading (`haar2`) gives a
median sigma of 3.3e-3 at 18% grey (10th percentile 1.3e-3, 90th 9e-3, worst 4.5e-2). The added sigma is
0.9e-3 at SNR 200 and 3.0e-3 at SNR 60.

That residual is **texture, not grain**. Binning a reference 8 x 8 instead of 4 x 4 halves white noise. It
changes this reading by a median 0.95x, with a range of 0.55-2.13 over 12 files
(`--binning`, `eval/noise-estimated-binning-2026-11-17.jsonl`). The scoring treats it as detail, rightly, and
every in-frame estimator reads it as noise:

| estimator (held, Bayer) | median est/true | p90 | p99 |
|---|---|---|---|
| `spread15` (shipped `estimate_noise`) | 1.53 | 6.90 | 34.9 |
| `spread2` (2nd percentile of blocks) | 1.22 | 5.38 | 26.5 |
| `haar2` (Haar diagonal MAD per same-colour subplane, 2nd pct) | 1.12 | 3.98 | 23.1 |
| `two15` (two-scale: n^2 = (s1^2 - s2^2) / 0.75) | 0.56 | 3.65 | 30.4 |

The two-scale estimator assumes texture has equal diagonal energy at adjacent scales (the binning median of
0.95 says that holds on average), and it cancels much of it. But the tail is a handful of tiles with very fine
structure, and there every estimator reads 3x too high even at SNR 12. A lower percentile or a wavelet residual
moves the median, not the tail. Those are the tiles that cost dB.

## Split by noise against texture

`bucket` puts each row in a bucket by the added sigma over the clean tile's `haar2` reading. Under 1, the
reference's texture is louder than the noise, and the harness cannot tell an estimator that reads texture from
one that reads noise. Rows are luma / colour gain over D, the worst row in either metric, and rows worse than D
by more than 0.1 dB
(`eval/noise-aware-estimated-buckets-2026-11-17.jsonl`):

| held | < 1 (n 112) | 1-2 (n 36) | 2-4 (n 48) | >= 4 (n 52) |
|---|---|---|---|---|
| Bayer true | +0.09 / +0.04 | +0.84 / +0.37 | +1.06 / +0.51 | +1.94 / +0.96 |
| Bayer guard@0.8 (shipped) | -0.29 / -0.33, worst -4.17, 42 rows | +0.79 / +0.38, worst -0.09 | +0.97 / +0.57, worst -1.16, 2 rows | +1.72 / +1.19 |
| X-Trans true | +0.13 / +0.05 | +1.09 / +0.46 | +1.41 / +0.67 | +2.42 / +1.21 |
| X-Trans guard@0.8 (shipped) | -0.31 / -0.42, worst -5.65, 43 rows | +0.99 / +0.45, worst -0.13, 3 rows | +1.13 / +0.61, worst -2.37, 3 rows | +1.94 / +1.29 |

In the three noisy buckets, 8 of 272 held rows lose over 0.1 dB. Five of them are one tile: the Samsung NX1's
top-left corner at SNR 25, a texture-dense tile where even the true model gains only 0.1-0.35 dB. The other
three are within 0.13 dB.

**Picking s.** On tune rows in the noisy buckets, guard@0.8 is the largest scale with no row worse than D by
more than 0.1 dB (worst -0.02 Bayer, -0.08 X-Trans; 0.9 reaches -0.33 / -0.51). The guard never hurt against
the plain fit: it only lowers the model, and it cut the worst `<1` rows by 1-2 dB. The buckets were defined
after the first, unbucketed held reading had been seen, so they are an analysis of the result, not a
pre-registered hold-out. The scale itself was chosen on tune rows.

## What shipped

- `xtrans_demosaic.frame_noise(c, pat, pct=15, scale=0.8)`: `estimate_noise` (now with a `pct` argument;
  `_noise_model` too), sigma times `scale`, then `guard_profile`. `FRAME_PCT`, `FRAME_SCALE`.
- `DevelopSettings.noise_from_frame` and `shootflow develop --noise-from-frame`. With
  `--demosaic noise-aware` on a file with no NoiseProfile, the white-balanced plane's own model drives the blend
  (`raw_develop_np._directional`), and the notes say "noise model read from the frame". Without the flag, the
  fallback to directional and its note are unchanged; the note now names the flag.
- On real files: a Fujifilm X-E1 RAF (16 MP X-Trans) and a Sony DSLR-A500 ARW (12 MP) develop through it, 24 s
  and 12.8 s, against 6.5 s and 2.4 s directional, on four cores. These have no truth, so this is a smoke run,
  not a score.
- Tests (`tests/test_demosaic_noise_aware.py`): `frame_noise` is the scaled estimate and never above it; its
  blend beats directional on a flat noisy field; the developer falls back without the flag, blends with it
  (full and half size), and a file with a profile ignores the flag.
- Tools: `tools/noise_aware_estimated.py` (`sweep`, `fit`, `bucket`), `tools/noise_estimator_accuracy.py`
  (estimator accuracy, `--clean`, `--binning`; the Haar and two-scale estimators live only here).

## Not done / open

- **A real high-ISO frame of a static scene with a low-ISO twin.** That would score the flag on real noise, and
  it is the same open item as for the profile path.
- **Gate on ISO.** A raw's EXIF ISO (and the optical-black area's spread, which reads read noise with no
  texture at all) says which regime a frame is in, which the pixels alone cannot say. The flag could switch
  itself on above an ISO, per body. That needs real ISO series to fit.
- **A texture-proof estimator.** The two-scale reading halves the median overstatement and leaves the tail.
  Patch-PCA noise estimation (weak-texture patches by their covariance's smallest eigenvalue) is the next
  candidate. It was not tried here.

## Commands (from `ventures/photo-editing`, numpy 2.5 and rawpy 0.28 / LibRaw 0.22.2, Python 3.13, four cores)

    M=<sparse checkout of drewnoakes/metadata-extractor-images with arw nef cr2 rw2 srw orf raf>
    ls $M/{arw,nef,cr2,rw2,srw,orf,raf}/* | grep -vi metadata > files.txt
    tr '\n' '\0' < files.txt | PYTHONPATH=src xargs -0 python tools/noise_aware_estimated.py sweep --bayer --cache /tmp/truths > bayer.jsonl
    tr '\n' '\0' < files.txt | PYTHONPATH=src xargs -0 python tools/noise_aware_estimated.py sweep --raf "$M/raf/Fujifilm X-E1.raf" --cache /tmp/truths > xtrans.jsonl
    python tools/noise_aware_estimated.py fit bayer.jsonl xtrans.jsonl --json fit.jsonl
    tr '\n' '\0' < files.txt | PYTHONPATH=src xargs -0 python tools/noise_estimator_accuracy.py --clean --cache /tmp/truths > grain.jsonl
    python tools/noise_aware_estimated.py bucket --grain grain.jsonl bayer.jsonl xtrans.jsonl --json buckets.jsonl
    head -30 files.txt | tr '\n' '\0' | PYTHONPATH=src xargs -0 python tools/noise_estimator_accuracy.py --bayer --cache /tmp/truths > acc.jsonl
    grep -E 'nef|cr2|arw' files.txt | head -16 | tr '\n' '\0' | PYTHONPATH=src xargs -0 python tools/noise_estimator_accuracy.py --binning > binning.jsonl

The sweep took about 20 minutes on four processes (two per layout, files halved; 11:43 to 12:03 UTC). The accuracy and binning runs
took a few minutes each.
