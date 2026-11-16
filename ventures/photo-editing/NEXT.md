# photo-editing: open items beyond flagships.yaml

`portfolio/flagships.yaml` caps a flagship's `next:` at 2000 characters, so it holds the items most worth starting. Open items moved out to make room are kept here by `portfolio/router/flagship_field.py --park`. Take one back into `next:` when it becomes the most useful thing to do, and delete it here when it lands.

## Parked from flagships.yaml `next:`

- (2026-11-16) photos with a real horizon and human tilt labels
- (2026-11-16) a real shoot's picks through the blink detector (eval/blink-*; half faces at the frame edge found by mirroring since 2026-11-16, but under 100 px only 4 of 22: eval/blink-edge-mirror-2026-11-16.md)
- (2026-11-16) an Adobe render of a known frame (settles `--default-tone-curve always`)

## From the noise-aware demosaic (2026-11-16, eval/xtrans-noise-aware-blend-2026-11-16.md)

- Make `--demosaic noise-aware` the default for DNGs with a NoiseProfile. The overstated-profile risk is
  handled (`guard_profile`, per plane since 2026-11-16), and luma is scored: +0.6 to +1.8 dB over directional on
  held-out tiles, none worse by more than 0.01 dB (eval/noise-aware-planes-luma-2026-11-16.md). What remains is
  evidence on real noise (the ISO pair below).
- A noise floor for frames with no smooth region (the guard reads low there): the optical-black area.
- Refit the blend's ramps on luma, or on luma and colour together (fitted on colour only; a per-colour carry that
  leaned less to bilinear lost 0.05-0.07 dB luma, so luma may want more bilinear).
- A real low- and high-ISO pair of one static scene, for this mode as for the X-Trans SNR 25 column.
- A noise model for raws without a profile (the optical-black area, ISO).
- The noise-free oracle gain (+0.06-0.12 dB from averaging the two demosaics) is untouched.
