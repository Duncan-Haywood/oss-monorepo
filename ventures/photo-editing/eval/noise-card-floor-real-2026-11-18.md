# A card-level noise floor on real multi-frame sets from raw.pixls.us (2026-11-18)

Flagship item (portfolio/flagships.yaml `buildable:`, NEXT.md "Raws without a profile"): with no NoiseProfile,
`--demosaic noise-aware` reads the noise from the frame (patch PCA, sigma x 0.8, guarded). On a frame whose fine
texture reads as noise (the NEX-5N crop of eval/noise-scale-per-frame-2026-11-17.md) that overstates it, and every
per-frame rule that raised the 0.8 lost up to 2.51 dB held out. The open idea: frames from one body at one ISO
share the sensor's noise and not their texture, so the lowest reading across a card should strip the texture.
The 2026-11-17 set could not test it (39 of 45 files gave one tile).

## Decision rule, committed before any scored row existed

Written and committed with `tools/card_scenes.py` and `sweep --cards`, after the features pass
(`floors` output, unscored: no demosaic, no PSNR) and before the `--card` sweep ran.

- Set: raw.pixls.us files from 29 Bayer bodies, repeat scenes dropped by `tools/card_scenes.py --same 0.8`
  (83 scenes kept of 158 files). A card is one body. Tune/held split by body name (`split_of`): 15 bodies and
  45 scenes tune, 14 bodies and 38 scenes held.
- Arms: `D` (directional), `true`, `pcaguard@0.8` (what ships), `card@s` for s in 0.8, 0.9, 1, 1.1, 1.25,
  1.5, 2: the frame's PCA model rescaled to s x its card's floor at that SNR and scenario, then guarded.
- Pick: `fit` on tune rows only: the `card@s` with the best mean tune luma + colour gain over `D` among those
  with no tune row worse than `D` by over 0.1 dB in either metric.
- Ship it as a card-level option only if, on held rows scored once, the pick (a) beats `pcaguard@0.8` on mean
  luma gain, (b) does not lose mean colour gain to it by over 0.02 dB, and (c) has no held row worse than `D`
  by over 0.1 dB. Otherwise nothing ships and this note says why.
