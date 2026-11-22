# photo-editing: open items beyond flagships.yaml

`portfolio/flagships.yaml` caps a flagship's `next:` at 2000 characters, so it holds the items most worth starting. Open items moved out to make room are kept here by `portfolio/router/flagship_field.py --park`. Take one back into `next:` when it becomes the most useful thing to do, and delete it here when it lands.

## Parked from flagships.yaml `next:`

- (2026-11-16) photos with a real horizon and human tilt labels
- (2026-11-16) a real shoot's picks through the blink detector (eval/blink-*; half faces at the frame edge found by mirroring since 2026-11-16, but under 100 px only 4 of 22: eval/blink-edge-mirror-2026-11-16.md)
- (2026-11-16) an Adobe render of a known frame (settles `--default-tone-curve always`)

## From the min-eigenvalue noise read (2026-11-19, eval/noise-pca-min-eigen-2026-11-19.md)

- (landed 2026-11-21, eval/noise-pca-whitened-level-2026-11-21.md) Per-colour ratios with Chen's level (`mpcw`)
  is the Bayer default: held out +0.09 dB luma, +0.21 dB on white-balanced SNR 25 and 12 rows, no new loser. Next:
  `mpcws` (the same read also picks the weak-texture patches): held out +0.31 dB luma and 0 losers, but on the tune
  split it adds 4 losing rows, all on `Pentax K-1 Mark II.pef` (ISO 1600, 30 s), whose raw-read grain passes
  `clean_enough` while the frame read of the clean mosaic is 2-4x higher. (2026-11-22,
  eval/noise-pca-mpcws-noisy-truth-2026-11-22.md) A green-pair truth reading, pre-registered as the noisy-truth
  judge, failed its validity tests (reads scene detail on small frames; 0.16x on one K-1 tile where the sites share
  noise), and the K-1 SNR 12 losers stay clean under either reading. On [372, 678] `mpcws` reads 2.3x truth grain +
  added noise, `mpcw` 1.1x: the selection feeds on its own read. Next: `mpcws` selecting with `mpcw`'s level, one
  pass, pre-registered against `mpcw` with "read ratio at most 1.3 on that tile" as a stated check; rerun on
  raw.pixls.us's `first` set (the 6 named D780/D600 foliage rows) when it is reachable. X-Trans has not been
  tested with either read.
- Dense foliage over-reads are not in the eigenvalues (the quietest direction is full too). On D780 DSC_0336
  [0, 0] the bins' sigma climbs from 0.001 (dark) to 0.035 (bright), steeper than shot noise allows: try a
  lower-envelope line fit over the bins, or cap each bin at the darker bins' line.

## From the float32 check (2026-11-17, eval/noise-aware-float32-2026-11-17.md)

- (moved from flagships.yaml `buildable:`) Bayer trees parked: a range guard passes 6 fresh cameras, misses
  K-1 II/A7 III; no fresh frames left (eval/bayer-boosted-guard-*).

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
- (2026-11-17) Raws without a profile: `--noise-from-frame` shipped opt-in (eval/noise-aware-estimated-2026-11-17.md). Patch PCA since that afternoon (src/shootflow/noise_pca.py, eval/noise-pca-estimator-2026-11-17.md): 0 of 240 held Bayer tiles lose over 0.1 dB (was 43), X-Trans 17 of 248 (was 45, worst 1.48 dB); that evening a touching-neighbour texture test took X-Trans to 0 of 248 (12 x 12 patches were worse; eval/xtrans-noise-pca-12-2026-11-17.md). Made the automatic fallback for `--demosaic noise-aware` that night (eval/noise-fallback-real-2026-11-17.md; `--no-noise-from-frame` opts out). A per-frame scale above 0.8 was tried that evening and failed held-out (eval/noise-scale-per-frame-2026-11-17.md): every tune-only pick (constants to 1.5; two-level rules on spread/PCA ratio, patches kept, binned whiteness; 861 rules) climbs to 1.25 and loses up to 2.51 dB on 11 held rows, and even 0.9 loses 0.21 dB, all on one NEX-5N crop that no frame feature flags. Time and memory cut late that night, same bytes: 2.2x faster, 41% less added memory on 14 real raws, 0.16 s per MP over directional (eval/noise-aware-full-frame-cost-2026-11-17.md); float32 bilinear landed the next night, 15% less memory, every changed value one tone-table step (eval/noise-aware-float32-2026-11-17.md); the guard's residual and block medians in C 2026-11-19, same bytes on 14 raws, 31% less added time (0.124 to 0.085 s per MP over directional; noise-aware 2.05x to 1.77x directional's time, eval/noise-aware-native-spread-2026-11-19.md); the blend and bilinear image in C the same afternoon, same bytes on 14 raws, the luma step's BLAS product replaced by a fixed elementwise order, 0.085 to 0.053 s per MP over directional, 1.46x directional's time (eval/noise-aware-native-blend-2026-11-19.md); block levels and maxima in C that evening, same bytes on 12 raws, noise-aware a median 1.11x faster, 1.32x directional's time; a last-bit change in the noise model reaches no output code below 1e-9 relative (eval/noise-aware-native-levels-2026-11-19.md); the patch PCA's covariance and texture energy in C in a fixed order that night, no BLAS left in the noise read, same bytes on 12 raws, the step 1.25x faster, noise-aware 1.26x directional's time (eval/noise-pca-native-2026-11-19.md; LAPACK's 36 x 36 `eigvalsh` stays); next there: whether `auto` should pick noise-aware. Card floor tested on real raw.pixls.us cards 2026-11-18 (eval/noise-card-floor-real-2026-11-18.md): no rule passed; `cap@1.5` removes 17 of 24 near-clean losses, misses the luma bar by 0.005 dB. The 2nd-lowest scene and the pre-white-balance scale were tried the same day on 24 unseen bodies (eval/noise-card-floor-rank-2026-11-18.md): pre-WB changes nothing, 2nd-lowest halves the cost but still misses (0.020 dB luma), and on all 5 losing rows the oracle model loses too, so the card floor is closed. The blend's near-clean loss was a leak in how block weights spread, not the ramps; closed on Bayer 2026-11-19 (`lift_near_detail`, k 12; eval/near-clean-gate-2026-11-19.md). Open there: an X-Trans tune pass (k 12 failed its h3 by one unchanged over-read row), and the `fresh` set's 24 losers rerun with the lift. Also open: more grain-textured tune tiles; gate on EXIF ISO and the optical-black area's spread, fitted on a real ISO series.
- The noise-free oracle gain (+0.06-0.12 dB from averaging the two demosaics) is untouched.
- (2026-11-17) a tungsten-lit colour chart to say which colour model is closer (the 70D frame, 4,700 K and green-tinted, is where they part most; the Nexus 5X carries ForwardMatrix)
- (2026-11-17) a phone DNG with its own JPEG of the frame (corrected corners)
- (2026-11-17) a real DNG with opcode flag bit 1 set
- (2026-11-17) the DJI Phantom 4 DNG's vignette lift against DJI's own render (eval/opcode-quality-flag-*)

## From the cull showcase (2026-11-17, eval/cull-showcase-2026-11-17.md)

- (2026-11-17) Crop-tolerant grouping shipped (eval/cull-crop-grouping-2026-11-17.md): held-out burst-pair recall
  0.40 to 0.72. The showcase's 4% corner reframe still splits (whole 13, windows 7, rule needs 6): zooms are matched
  by equal-size windows only. Zoom windows shipped 2026-11-18 (eval/cull-zoom-windows-2026-11-18.md): held-out
  recall 0.72 to 0.91, zooms of 3-10% 0.98-1.00, the showcase's reframe now groups. Pans of 8-10% shipped the
  same day (eval/cull-pan-windows-2026-11-18.md): off-centre window pairs, held-out recall 0.91 to 0.985, those
  pans 0.86-1.00. 6% pans were the crop gate, not the grid (whole frames 25-33 apart, windows 0-7): gate 24
  to 44 the same day, 6% pans 1.00, held-out recall 0.991, no added false merge, crop and pan checks packed
  into one (eval/cull-crop-gate-2026-11-18.md). 10% pans: every window pair at the wide offsets 2026-11-18
  (eval/cull-pan-all-pairs-2026-11-18.md, held-out 0.991 to 0.995, diagonal 10% pans 0.89), then the same day
  the cause was shown to be the 3% grid (7% and 9% pans, added to the test, were worse): 24 fine windows give
  every whole-percent offset, held-out recall 0.982 to 0.998 with 5/7/9% pans in the test, 7-10% pans 0.99-1.00,
  no added false merge (eval/cull-fine-offsets-2026-11-18.md); the all-pairs pass then added 0.0001 held out for
  one more tune false merge and 1.8x the grouping time, so the cull runs the fine pass instead of it. Open:
  pans past 10.7% (past the margin), an exact chunked index since 2026-11-18 (2,000 frames 10.0 to 3.6 s, 10,000 frames 251 to 42 s, same groups, eval/cull-grouping-index-2026-11-18.md); the C helper landed 2026-11-18 (eval/cull-grouping-native-2026-11-18.md: index and exact checks in C on every core, 10,000 frames 115 to 5.8 s, same groups); single-linkage chaining measured on a real shoot; sunsets and dark-ground horizons are where the
  distinct-photo false merges sit.
- A copy at 30% brightness (exposure 0.28) stayed an alternate; it lost its group, so harmless, but the reject line
  for exposure may sit too low.
- (2026-11-18) next a real shoot's picks
- (2026-11-18) cull: zoom, pan windows, the 44 crop gate and an exact pair index 2026-11-18 (10,000 frames 251 to 42 s, eval/cull-grouping-index-*) (6% pans 0.85 to 1.00, eval/cull-crop-gate-*), whole-percent window offsets 2026-11-18 (7-10% pans 0.78-0.95 to 0.99-1.00, eval/cull-fine-offsets-*)
- (2026-11-18) a real CR3 with tiles stacked one above another (2018-23 bodies store two across, read since 2026-11-18 with their old C-RAW: 0 of 986.8 M sensels differ on 39 files, eval/canon-cr3-every-body-*)

## From the Hasselblad 3FR reader (2026-11-18, eval/hasselblad-3fr-reader-2026-11-18.md)

- (landed 2026-11-18) Phocus `.fff` files read as 3FRs: eval/hasselblad-fff-reader-2026-11-18.md.

## From the Phocus .fff reader (2026-11-18, eval/hasselblad-fff-reader-2026-11-18.md)

- The H4D-40 and H6D-100c `.fff` files carry no colour matrix and no public 3FR of those bodies exists to
  read one from: a 3FR (or a camera-written DNG) of either body would add them to `OWN_MATRICES`.
- Older exports (CFV-50, H4D-40, H5D-40, H5D-50c) have empty codes of other sizes (H5D-40: half of R and B,
  a quarter of G; H5D-50c: 11% of R): some other digital step. A 3FR and `.fff` pair of one of those bodies
  would say what it is and whether their neutral needs anything.
- An Adobe or Phocus render of a `.fff` frame to settle which neutral reading Phocus itself uses.
- Rerun `tools/mrw_develop_check.py` with LibRaw's output in linear light (`gamma=(1, 1)`): it undid LibRaw's
  BT.709 curve with the sRGB curve, so its 0.003-0.016 colour gaps are overstated. Needs the nine MRW files again.
  (The CR2 and camera-DNG checks pass `gamma=(2.4, 12.92)` and are not affected.)
- A real 3FR written with predictor 11 (all five compressed files at hand use 8).
- (2026-11-18) a real Adobe `.dcp` through the profile chooser
- (2026-11-18) lateral colour measured on a real frame with sharp corner edges
- (2026-11-18) a real DNG carrying any opcode run only on synthetic files so far, or the SDK to check them
- (2026-11-18) a second maker-against-lensfun DNG pair
- (2026-11-19) a real evenly lit frame shot wide open (corners level after lensfun's vignetting?)
- (2026-11-19) a real DNG and a vignetting-calibrated lens through the pipeline's lens stage
- (2026-11-19) calibration on IIQ S (iXU180 blue 5.2%)
