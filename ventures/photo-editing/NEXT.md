# photo-editing: open items beyond flagships.yaml

`portfolio/flagships.yaml` caps a flagship's `next:` at 2000 characters, so it holds the items most worth starting. Open items moved out to make room are kept here by `portfolio/router/flagship_field.py --park`. Take one back into `next:` when it becomes the most useful thing to do, and delete it here when it lands.

## Parked from flagships.yaml `next:`

- (2026-11-16) photos with a real horizon and human tilt labels
- (2026-11-16) a real shoot's picks through the blink detector (eval/blink-*; half faces at the frame edge found by mirroring since 2026-11-16, but under 100 px only 4 of 22: eval/blink-edge-mirror-2026-11-16.md)
- (2026-11-16) an Adobe render of a known frame (settles `--default-tone-curve always`)

## From the noise-aware demosaic (2026-11-16, eval/xtrans-noise-aware-blend-2026-11-16.md)

- Make `--demosaic noise-aware` the default for DNGs with a NoiseProfile once it is safe: check a profile
  against the in-frame noise estimate (`frame_measures(noise=None)`) and refuse one that reads far above it.
  Overstating the noise by about 1.5x costs detail.
- Score the local blend's luma (only colour PSNR is per ramp in the jsonl).
- A real low- and high-ISO pair of one static scene, for this mode as for the X-Trans SNR 25 column.
- A noise model for raws without a profile (the optical-black area, ISO).
- The noise-free oracle gain (+0.06-0.12 dB from averaging the two demosaics) is untouched.
