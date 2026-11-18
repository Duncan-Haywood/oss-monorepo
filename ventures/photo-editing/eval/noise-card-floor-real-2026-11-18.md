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

## Second rule, committed after the first sweep and before the cap sweep

The first sweep's pick failed the rule above (results below). It also showed that what ships, `pcaguard@0.8`,
loses over 0.1 dB to `D` on 18 rows of these full-size frames, all where the frame's own reading is 1.4 to 25
times the truth, and that `card@1` keeps every one of those rows within 0.06 dB of `D`. So a second arm, not in
the first rule: `cap@s` keeps what ships and caps its sigma at s x the card floor (`cap_arms`), for s in 1, 1.25,
1.5, 2, 3. This rule was written after the first sweep's held rows were seen (every arm in it, not `cap@s`),
so it is weaker evidence than the first, and the write-up says so.

- Pick: `fit` on tune rows only, as above, within `cap@s`.
- Adopt it (as a card-level option in the product) only if, on held rows: mean luma gain at least
  `pcaguard@0.8`'s minus 0.01 dB, mean colour gain at least its minus 0.01 dB, and no held row worse than `D`
  by over 0.1 dB; and on tune rows it has fewer rows worse than `D` by over 0.1 dB than `pcaguard@0.8` (18).

## Third rule: `cap@1.5`, fixed, on bodies no sweep here has read (committed before they were fetched)

The second rule's pick (`cap@1`) failed. `cap@1.5` was the near miss: its one tune row past 0.1 dB is a
-0.10 dB row (two-decimal PSNRs) on which the cap does not bind, so it is what ships there too. That choice was
made after seeing both sets, so it gets a fresh test: Bayer bodies from raw.pixls.us not in the first 29
(Sony, Nikon, Canon, Panasonic, Olympus folders with two or more files; up to 4 files of at most 40 MB per body),
repeat scenes dropped as before, every row scored once, no tune split and no other arm picked.

Adopt `cap@1.5` as a card-level option only if, on those rows: (a) mean luma and colour gain over `D` each
within 0.01 dB of `pcaguard@0.8`'s; (b) no more rows worse than `D` by over 0.1 dB than `pcaguard@0.8`, and
none such that `pcaguard@0.8` keeps within 0.1 dB.
