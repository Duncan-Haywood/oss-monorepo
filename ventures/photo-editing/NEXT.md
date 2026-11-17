# photo-editing: open items beyond flagships.yaml

`portfolio/flagships.yaml` caps a flagship's `next:` at 2000 characters, so it holds the items most worth starting. Open items moved out to make room are kept here by `portfolio/router/flagship_field.py --park`. Take one back into `next:` when it becomes the most useful thing to do, and delete it here when it lands.

## Parked from flagships.yaml `next:`

- (2026-11-16) photos with a real horizon and human tilt labels
- (2026-11-16) a real shoot's picks through the blink detector (eval/blink-*; half faces at the frame edge found by mirroring since 2026-11-16, but under 100 px only 4 of 22: eval/blink-edge-mirror-2026-11-16.md)
- (2026-11-16) an Adobe render of a known frame (settles `--default-tone-curve always`)

## From the noise-aware demosaic (2026-11-16, eval/xtrans-noise-aware-blend-2026-11-16.md)

- Make `--demosaic noise-aware` the default for DNGs with a NoiseProfile. The overstated-profile risk is
  handled (`guard_profile`, per plane since 2026-11-16), and luma is scored: +0.6 to +1.8 dB over directional on
  held-out tiles, none worse by more than 0.01 dB (eval/noise-aware-planes-luma-2026-11-16.md); +0.99 / +1.28 dB
  with the luma ramp (2026-11-17). What remains is
  evidence on real noise (the ISO pair below).
- A noise floor for frames with no smooth region (the guard reads low there): the optical-black area.
- (2026-11-17) Luma has its own ramp (eval/noise-aware-luma-ramp-2026-11-17.md). Open: does the guard's cap want
  re-tuning with the later luma ramp; an earlier colour ramp (0.2-1.5 / 0.2-2.0 gained 0.01-0.02 dB colour).
- A real low- and high-ISO pair of one static scene, for this mode as for the X-Trans SNR 25 column.
- (2026-11-17) Raws without a profile: `--noise-from-frame` shipped opt-in (eval/noise-aware-estimated-2026-11-17.md). Patch PCA since that afternoon (src/shootflow/noise_pca.py, eval/noise-pca-estimator-2026-11-17.md): 0 of 240 held Bayer tiles lose over 0.1 dB (was 43), X-Trans 17 of 248 (was 45, worst 1.48 dB); that evening a touching-neighbour texture test took X-Trans to 0 of 248 (12 x 12 patches were worse; eval/xtrans-noise-pca-12-2026-11-17.md). Open: make it the automatic fallback for `--demosaic noise-aware`; win back noisy-tile gain (41-71% of the true model's) with a scale picked on tune rows only (0.9?); gate on EXIF ISO and the optical-black area's spread, fitted on a real ISO series.
- The noise-free oracle gain (+0.06-0.12 dB from averaging the two demosaics) is untouched.
- (2026-11-17) a tungsten-lit colour chart to say which colour model is closer (the 70D frame, 4,700 K and green-tinted, is where they part most; the Nexus 5X carries ForwardMatrix)
- (2026-11-17) a phone DNG with its own JPEG of the frame (corrected corners)
- (2026-11-17) a real DNG with opcode flag bit 1 set
- (2026-11-17) the DJI Phantom 4 DNG's vignette lift against DJI's own render (eval/opcode-quality-flag-*)

## From the cull showcase (2026-11-17, eval/cull-showcase-2026-11-17.md)

- A 4% reframe of a frame formed its own group (a 3% one grouped). Near-duplicates shown as separate groups cost the
  photographer a look each; try a second hash or a crop-tolerant distance, scored on the same known bursts.
- A copy at 30% brightness (exposure 0.28) stayed an alternate; it lost its group, so harmless, but the reject line
  for exposure may sit too low.
