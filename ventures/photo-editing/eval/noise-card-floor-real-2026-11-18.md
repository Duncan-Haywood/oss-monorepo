# A card-level noise floor on real multi-frame sets from raw.pixls.us (2026-11-18)

Flagship item (portfolio/flagships.yaml `buildable:`, NEXT.md "Raws without a profile"): with no NoiseProfile,
`--demosaic noise-aware` reads the noise from the frame (patch PCA, sigma x 0.8, guarded). On a frame whose fine
texture reads as noise (the NEX-5N crop of eval/noise-scale-per-frame-2026-11-17.md) that overstates it, and every
per-frame rule that raised the 0.8 lost up to 2.51 dB held out. The open idea: frames from one body at one ISO
share the sensor's noise and not their texture, so the lowest reading across a card should strip the texture.
The 2026-11-17 set could not test it (39 of 45 files gave one tile).

**Verdict: nothing ships; the default stays.** Three rules were committed in turn, each before the rows it
judged existed, and none passed. What the run did establish, on 454 real scenes from 182 bodies:

- **What ships loses a little on real full-size frames.** It is worse than directional by over 0.1 dB on 42 of
  5,312 rows (0.8%), worst -0.53 dB, all near clean (SNR 60-200), where the frame reads its own fine detail as
  1.4-25x the noise. The 2026-11-17 note found none on small binned frames.
- **A card floor finds those frames.** As a cap on what ships (`cap@1.5`), on 153 bodies no rule had seen,
  it removes 17 of 24 such rows and adds none. It misses its bar by 0.005 dB: it costs 0.0148 dB of mean luma
  against a pre-set 0.01. On its own the floor understates noisy frames, because a minimum of noisy readings
  sits low (0.51-0.76 of the truth at SNR 12), and the developer's white-balanced scale makes that worse.
- **Most of raw.pixls.us's multi-file sets are one scene saved several ways.** 75 of the first 158 files
  repeat an earlier file's scene, and 142 of the fresh 513 do. `tools/card_scenes.py` finds them, and any card
  test on that site needs it.

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

## The set

158 files from 29 Bayer bodies on raw.pixls.us (CC0), fetched with `curl -L` on 2026-11-18, decoded by LibRaw
0.22 through rawpy, binned 4 x 4 into truths as eval/noise-scale-per-frame-2026-11-17.md does. Most of the
site's multi-file sets are **one scene saved several ways**: `tools/card_scenes.py` put 75 of the 158 files with
an earlier file of the same body (log-luma correlation of the centre 256 x 256 at least 0.8). The Nikon D3,
D300S, D600 and D700, the Z 6's first six frames, the Panasonic GH5S and FZ80, the PowerShot SX70 and the R6
Mark III are each one view repeated: an ISO series or a set of compression modes (correlations 0.92-1.00).
83 scenes stay: 18 bodies with three or more, 3 with two, 8 with one. They give 159 tiles of 480 x 480
(about two per scene; a full frame binned 4 x 4 is only 1,000-1,500 sensels wide) and 1,272 rows across 4 SNRs
and 2 noise scenarios. Tune: 15 bodies, 728 rows; held: 14 bodies, 544 rows.

## What the floor reads (features pass, no scoring)

Reading / true sigma at 18% grey, over the 159 tiles (`floors`, and per scenario below):

| scenario, SNR | frame's own: median, p90, max | card floor: median, p90, max |
|---|---|---|
| equal, 200 | 2.13, 8.93, 24.81 | 1.38, 3.06, 8.31 |
| equal, 60 | 1.11, 3.00, 7.00 | 0.91, 1.74, 2.03 |
| equal, 25 | 0.96, 1.38, 2.58 | 0.88, 1.03, 1.33 |
| equal, 12 | 0.94, 1.07, 1.69 | 0.76, 0.95, 1.01 |
| wb, 200 | 1.66, 7.00, 14.96 | 1.32, 3.56, 6.60 |
| wb, 60 | 0.80, 2.27, 6.00 | 0.64, 1.08, 1.79 |
| wb, 25 | 0.70, 1.13, 2.36 | 0.53, 0.64, 0.96 |
| wb, 12 | 0.67, 0.84, 1.13 | 0.51, 0.67, 0.96 |

- **The floor strips texture.** Near-clean frames (SNR 200 and 60) read their own texture as up to 25x the
  noise; the card's floor cuts the tail by 3-4x (max 24.8 to 8.3, p90 8.9 to 3.1 at SNR 200).
- **It also understates noisy frames.** The lowest of a card's readings sits below the truth: a minimum of
  noisy estimates. At SNR 12 the floor reads 0.76 of the truth against the frame's own 0.94.
- **White balance makes it worse.** In `wb` the noise is drawn before white balance and read after it, as the
  developer reads it, so each frame's reading carries its own as-shot gains and the card's frames are on
  different scales. The floor then reads 0.51-0.53 of the truth at SNR 12-25. A product floor belongs on the
  pre-white-balance scale or per colour plane, not on the developer's white-balanced plane.

## First rule: `card@s` (the frame's model replaced by s x the floor), result

`fit` on tune picks `card@1`. Held, one pass, gain over `D` in dB:

| arm | tune luma | tune colour | tune luma rows < -0.1 | held luma | held colour | held luma rows < -0.1 (worst) |
|---|---|---|---|---|---|---|
| true model | +0.674 | +0.321 | 1 luma, 4 colour (-0.19) | +0.958 | +0.444 | 1 (-0.11) |
| `pcaguard@0.8` (ships) | +0.428 | +0.282 | 18 (-0.27) | +0.725 | +0.491 | 0 (-0.08) |
| `card@0.9` | +0.357 | +0.239 | 0 | +0.597 | +0.404 | 0 (-0.08) |
| `card@1` (pick) | +0.427 | +0.269 | 0 | +0.704 | +0.449 | 2 (-0.13) |
| `card@1.25` | +0.545 | +0.298 | 9 | +0.865 | +0.474 | 9 (-0.28) |
| `card@1.5` | +0.609 | +0.291 | 22 | +0.924 | +0.436 | 30 (-0.63) |

**Fails all three tests:** held luma +0.704 against +0.725, colour -0.042 dB, 2 held rows past -0.1 dB. Nothing
ships from it.

Two things the table shows besides the verdict:

- **What ships loses on real full-size frames.** `pcaguard@0.8` has 18 tune rows (four bodies: D780, A7C II, D600, Z 5; all
  near-clean: 11 at SNR 200, 6 at 60, 1 at 25) worse than `D` by over 0.1 dB, worst -0.27 dB (Sony A7C II
  DSC02430, SNR 200). On every one the frame reads its own texture as 1.4 to 25 times the noise, and on every one
  `card@1` stays within 0.06 dB of `D`. The 2026-11-17 set (small binned frames from metadata-extractor-images)
  had none: these are full-frame scenes with fine detail. The held bodies happen to have none. The losses are
  small (a quarter of a dB on near-clean frames, where the blend barely moves anything) but they are real.
- **Replacing the frame's reading throws away gain on noisy frames**, because the floor understates them.
  That is why `card@s` either loses gain (s <= 1) or loses rows (s >= 1.25).

## Second rule: `cap@s` (what ships, capped at s x the floor), result

The cap can only lower a frame's model, and only where the frame reads far above its card. At s = 1.5 it
binds on 219 of 1,272 rows (93 at SNR 200, 16 at SNR 12).

| arm | tune luma | tune colour | tune rows < -0.1 (worst) | held luma | held colour | held rows < -0.1 |
|---|---|---|---|---|---|---|
| `pcaguard@0.8` (ships) | +0.428 | +0.282 | 18 (-0.27) | +0.725 | +0.491 | 0 |
| `cap@1` (pick) | +0.357 | +0.247 | 0 (-0.09) | +0.615 | +0.425 | 0 |
| `cap@1.25` | +0.396 | +0.269 | 1 (-0.10) | +0.693 | +0.473 | 0 |
| `cap@1.5` | +0.410 | +0.276 | 1 (-0.10) | +0.722 | +0.490 | 0 |
| `cap@2` | +0.421 | +0.282 | 4 (-0.16) | +0.725 | +0.492 | 0 |
| `cap@3` | +0.424 | +0.282 | 12 (-0.27) | +0.725 | +0.491 | 0 |

`fit` picks `cap@1`, the only scale with no tune row past 0.1 dB. **Held it gives up 0.110 dB luma, so the
second rule fails too.** `cap@1.25` and `cap@1.5` miss the tune check on one row each: the same Sony A7C II
DSC02431 tile at SNR 60, -0.10 dB to two decimals, where the cap does not bind and the arm is what ships.
`cap@1.5` keeps 17 of the 18 tune losses within 0.1 dB of `D` and costs 0.003-0.018 dB of mean gain.
`pcaguard@0.8` in this sweep reproduces the first sweep's to the last digit (1,272 of 1,272 rows).

## Third rule: `cap@1.5` on 153 fresh bodies, result

521 files from 153 bodies not in the first set (`--set fresh`); LibRaw could not open 8 (the Nikon Z 8, Z 9 and
Z f high-efficiency NEFs, two Panasonic FZ38 aspect-ratio files). `card_scenes.py` kept 371 scenes from 151 bodies
(70 with three or more, 38 with two, 43 with one). 505 tiles, 4,040 rows, all scored once. The cap binds on 355.

| arm | mean luma | mean colour | rows worse than `D` by > 0.1 dB (luma, colour) | worst |
|---|---|---|---|---|
| `pcaguard@0.8` (ships) | +0.4523 | +0.2990 | 24 (23, 19) | -0.53 |
| `cap@1.5` | +0.4375 | +0.2935 | 7 (6, 7) | -0.53 |

- (a) **fails, narrowly**: luma is 0.0148 dB below what ships, against a bar of 0.01. Colour is within it
  (-0.0055).
- (b) passes: 7 losing rows against 24. The cap fixes 17 and adds none.

**Verdict: nothing ships.** Of the three rules, none passed. `frame_noise` keeps sigma x 0.8 and the develop has
no card option.

Where the cap could not help: all 7 rows it leaves are on cards where the losing frame is its own floor. Five
are on bodies with one scene (Panasonic G80 P1000403, worst -0.53 dB at SNR 200, and GX8 P1020809). Two are on
the Nikon 1 J1, whose losing tile is its card's lowest reading. A card of one frame cannot vote its texture out.

## What this settles, and what would move it

- **The default loses on real frames, by a little, near clean.** Across both sets, 42 of 5,312 rows (0.8%)
  are worse than directional by over 0.1 dB, worst -0.53 dB. All are at SNR 60-200, where the frame's own
  texture reads as 1.4 to 25 times the noise. The 2026-11-17 note's "0 of 240 held tiles" was on small
  binned frames. Full-size scenes have fine detail those did not.
- **A card floor finds those frames**, but on its own it understates noisy ones (a minimum of noisy readings,
  0.51-0.76 of the truth at SNR 12), and white balance spreads a card's readings further. As a cap it keeps
  most of the gain and removes 70% of the losses, at about 0.015 dB of mean luma.
- Next, most valuable first: (1) take the floor from more than the minimum: the 2nd-lowest reading, or a low
  percentile, on cards of three or more scenes, where the minimum's downward bias is the cost the bar caught;
  (2) take the floor on the pre-white-balance scale, per colour, as the sensor draws it; (3) a fourth set to
  test it on, since both sets here have now been seen. Doing any of these and keeping the rule honest needs
  a set no rule has been tuned on: the raw.pixls.us Fujifilm X-Trans bodies (not read here), or a real ISO
  series per body.

## Reproduce

    python tools/pixls_fetch.py eval/noise-card-floor-files-2026-11-18.json --set first --out /tmp/raws > manifest.json   # 3.6 GB
    PYTHONPATH=src python tools/card_scenes.py --manifest manifest.json --cache /tmp/truths --same 0.8 > cards.json
    python -c "import json;d=json.load(open('cards.json'));print(''.join('/tmp/raws/'+n+'\n' for n in sorted(d) if d[n]['keep']),end='')" > kept.txt
    tr '\n' '\0' < kept.txt | PYTHONPATH=src xargs -0 -P 4 -n 1 python tools/noise_aware_estimated.py sweep --bayer --features-only --cards cards.json --cache /tmp/truths > feats.jsonl
    python tools/noise_aware_estimated.py floors feats.jsonl
    tr '\n' '\0' < kept.txt | PYTHONPATH=src xargs -0 -P 4 -n 1 python tools/noise_aware_estimated.py sweep --bayer --cards cards.json --card feats.jsonl --scales 0.8,0.9,1,1.1,1.25,1.5,2 --cache /tmp/truths > card.jsonl
    tr '\n' '\0' < kept.txt | PYTHONPATH=src xargs -0 -P 4 -n 1 python tools/noise_aware_estimated.py sweep --bayer --cards cards.json --card feats.jsonl --cap --scales 1,1.25,1.5,2,3 --cache /tmp/truths > cap.jsonl
    python tools/noise_aware_estimated.py fit card.jsonl; python tools/noise_aware_estimated.py fit cap.jsonl

The fresh set is the same with `--set fresh` (10 GB) and `--cap --scales 1.5`. Python 3.13, numpy 2.x, LibRaw
0.22 through rawpy; at four processes the features pass took 4 min on the first set and 16 on the fresh one,
the `--card` sweep about 5 min and the `--cap` sweep 4 min on the first set. Before `emit`, two rows of the
parallel sweeps' shared stdout were written into one line twice (one in `cap`, one in the fresh features); each
was split back at the `}{` and every row parses, 8 rows per tile.

Files (all rows, no paths): `noise-card-floor-files-2026-11-18.json` (URLs), `-cards-` (`card_scenes.py` on the
first set), `-feats-`, `-sweep-` and `-sweep-fit-` (first rule), `-cap-` and `-cap-fit-` (second), `-fresh-cards-`,
`-fresh-feats-` and `-fresh-cap-` (third).
