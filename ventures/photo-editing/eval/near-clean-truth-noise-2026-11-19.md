# The last near-clean losers: is the D780 and D600 truth itself noisy? (2026-11-19)

Flagship item (portfolio/flagships.yaml photo-editing `next:`, "next the D780/D600 losers' truth noise, when
raw.pixls.us answers"). eval/near-clean-gate-2026-11-19.md left 11 held-out Bayer rows of the `first` set losing
over 0.1 dB to directional with the lift on (Nikon D780 DSC_0334, 0336, 0338 and Nikon D600 DSC_3294), all where
the oracle model does not lose, and called them over-read noise estimates. eval/near-clean-gate-xtrans-tune-2026-11-19.md
then found that every Bayer loser on 51 other bodies was a noisy truth (an ISO 1600, 30 s frame whose grain survives
the 4 x 4 binning) and added `truth_sigma18` and `--clean-truths` to the sweep. raw.pixls.us answers from this
session, so the `first` set can be swept again with that column.

## What is asked, and what each answer decides (committed before any row of this run was read)

Sweep: `tools/near_clean_gate.py sweep --bayer`, unchanged code, the `first` set's cards file, same tiles, SNRs,
scenarios and seeds as the 2026-11-19 held-out run. Step 1: the four files above (`--ks 12`). Step 2, if the
fetch and time allow: the whole `first` set (`--ks 12`).

- (c1) Check the rerun reproduces the 2026-11-19 held-out rows (`ship` and `ship+12` scores equal to the
  committed `eval/near-clean-gate-held-2026-11-19.jsonl` to 0.01 dB). If not, stop and say so.
- (c2) For each of the 11 losing rows: its `truth_sigma18`, its truth SNR (0.18 / truth_sigma18), and whether
  `clean_enough` keeps it.
- Decision. If `--clean-truths` drops all 11, the near-clean loss on Bayer is closed as a scoring artefact
  (noise in the reference), nothing changes in `src/`, and the flagship row's item is removed. If any survive,
  they are real over-reads of the noise on a clean scene: nothing changes in `src/` this run either, and the
  survivors (file, tile, SNR, the ship model's sigma at 18% against the noise added) become the next item, a
  noise-read fix with its own pre-registered rule.
- Step 2, reported: `rule --k 12 --clean-truths` on the whole set (h1 to h3 as committed) and how many rows the
  filter drops per body.

## Result

**c1: reproduced.** The 1,272 rows (159 tiles, 83 kept files, none skipped) equal the committed
`near-clean-gate-held-2026-11-19.jsonl` in `D`, `ship` and `ship+12` to the last digit; the 11 rows that lose
over 0.1 dB with the lift on are the same 11.

**c2, by the rule as committed: `--clean-truths` drops all 11.** Their `truth_sigma18` reads truth SNR 13 to 25,
below every one of their row SNRs (25 to 200). Read literally, the decision closes the item as noise in the
reference.

**But the column fails an independent check, so the item is not closed (a deviation, decided after reading).**
The losing frames are the D780's DSC_0334, 0336 and 0338 at **ISO 100, 1/400 s, f/4**, and the D600's DSC_3294 at
ISO 400. A full-frame sensor at ISO 100 cannot leave grain at SNR 13 in a 4 x 4-binned frame. Looking at the tiles
says what is: the D780 tiles are a sunlit forest, fine branches and leaves at the sampling limit; the D600 tile is
textured wallpaper beside a framed painting's brushwork. And one exposure has one grain, yet the three tiles of
DSC_0336 read 0.0019, 0.0114 and 0.0140. `truth_sigma18` is `frame_noise`, the shipped read whose over-reads on
texture were the hypothesis to test, so filtering on it drops a row for the very reason it loses.

A reading that does not use the binned scene: `tools/truth_noise_check.py` (`raw_grain`) reads the raw's own noise
model at native resolution (patch PCA on the tile's sensels, normalised to black and white levels), takes it at
the raw level the truth maps to 18% grey, and multiplies by the measured transfer of raw noise into the truth (the
raw is postprocessed again with known Gaussian noise added to its sensels; the truth's green difference is that
noise as the truth sees it). Texture can only raise the PCA reading, so this is an upper bound on the truth's
grain. It agrees with physics where it can be checked: the D780 at raw level 0.065 of full scale has about 3,900
electrons, shot sigma about 0.0010 of full scale, and the raw read is 0.0011 to 0.0012; the D600 at ISO 400,
0.0015 to 0.0016 read, 0.0016 expected.

| tile | ISO | truth SNR by `truth_sigma18` | by the raw (`truth_grain18`) |
|---|---|---|---|
| D780 DSC_0336 [0, 0] | 100 | 13 | 153 |
| D780 DSC_0334 [0, 0] | 100 | 17 | 168 |
| D780 DSC_0338 [0, 0] | 100 | 19 | 181 |
| D600 DSC_3294 [0, 1026] | 400 | 25 | 74 |
| Pentax K-1 Mark II (mei set), three tiles | 1600, 30 s | 7 to 17 | 16 to 27 |

So on the D780 and D600 the old column reads 3 to 12 times the grain. On the K-1 Mark II, the case the filter
was built from, the raw confirms a grainy truth (SNR 16 to 27), so that earlier finding stands, though the old
column overstated it 1 to 4 times. Across all 159 tiles the two readings agree at the median (ratio 1.04), but a
quarter of tiles read more than twice the raw's grain by the old column (p90 4.0, max 13.5): the textured ones.

**With the raw reading, 6 of the 11 losers are real**, on clean truths:

| row | lift on, worst vs D | oracle vs D | truth SNR (raw) |
|---|---|---|---|
| D780 DSC_0336 [0, 0], SNR 60 equal | -0.18 dB | 0.00 | 153 |
| D780 DSC_0336 [0, 0], SNR 60 wb | -0.17 | 0.00 | 153 |
| D780 DSC_0336 [0, 0], SNR 25 wb | -0.12 | 0.00 | 153 |
| D780 DSC_0338 [0, 0], SNR 60 wb | -0.12 | 0.00 | 181 |
| D780 DSC_0334 [0, 0], SNR 60 wb | -0.11 | 0.00 | 168 |
| D600 DSC_3294 [0, 1026], SNR 60 equal | -0.11 | 0.00 | 74 |

The other 5 are at SNR 200, where the truth's own grain (SNR 74 to 168) is louder than the noise added: those
cannot be scored either way on these truths. On the 6, what ships reads the noise at 2.3 to 5.2 times what was
added (sigma at 18% 0.0075 to 0.0167 against 0.0030 to 0.0072), and on the clean mosaic, with nothing added, it
reads almost the same (0.0073 to 0.0140): its floor on these tiles is the foliage, whatever the noise. So the
2026-11-19 reading ("over-read estimates") was right for these 6, and the next item is the noise read on dense
fine texture, with its own pre-registered rule. Worth knowing before that: a real develop reads the full-resolution
raw, where grain is about four times larger against the same texture than in a 4 x 4-binned truth, so the binned
sweep may overstate how often a real frame meets this.

**Step 2, the whole set with the raw reading** (`rule --k 12 --clean-truths`; 9 files whose LibRaw pattern is not
2 x 2 (Sony ILCE-7CR and ILCE-9M3, Canon 5D Mark IV, Nikon D810 and D4S here) have no raw reading and keep the old
column): 958 of 1,272 rows kept (the old column kept 920). h1 PASS (luma +0.0025, colour +0.0014, lowest cell
+0.0000), h2 PASS (losers 8 to 6, none new), h3 PASS: the Bayer lift (k 12) holds on the clean-truth rows too, so
nothing changes in `src/`. Rows dropped per body differ: the old column dropped 56 D780 rows, the raw reading 18.
Output: `near-clean-truth-noise-held-2026-11-19.txt` (rows: `.jsonl`); the 15 tiles of the step 1 check:
`near-clean-truth-noise-2026-11-19.jsonl`.

## What changed

- `tools/truth_noise_check.py`: `raw_grain` (the truth's grain from the raw, with the measured transfer) and a CLI
  that prints it beside `truth_sigma18`, EXIF ISO and exposure, and the frame's spread, with `--png` tiles.
  A first try, the 5th percentile of 8 x 8 plane-fit residuals in the binned truth, read above `truth_sigma18`
  on every tile (these scenes have no flat patches at that scale) and was dropped.
- `tools/near_clean_gate.py`: `sweep` writes `truth_grain18` (`--no-raw-grain` skips it); `clean_enough` uses it
  when present, else `truth_sigma18`.
- `tests/test_near_clean_gate_split.py`: the precedence.

## Reproduce

    python tools/pixls_fetch.py eval/noise-card-floor-files-2026-11-18.json --set first --out /tmp/raws1 > m1.json
    python -c "import json;d=json.load(open('eval/noise-card-floor-cards-2026-11-18.json'));print(''.join('/tmp/raws1/'+n+'\n' for n in sorted(d) if d[n]['keep']),end='')" > kept1.txt
    tr '\n' '\0' < kept1.txt | PYTHONPATH=src xargs -0 -P 4 -n 1 python tools/near_clean_gate.py sweep --bayer --ks 12 \
        --cards eval/noise-card-floor-cards-2026-11-18.json --cache /tmp/truths > held.jsonl
    python tools/near_clean_gate.py rule held.jsonl --k 12 --clean-truths
    PYTHONPATH=src python tools/truth_noise_check.py --cache /tmp/truths --png /tmp/tiles /tmp/raws1/Nikon_D780__DSC_033*.NEF

(Python 3.13, numpy, rawpy 0.28; 3.6 GB fetched, 2.1 GB of kept files; the sweep about 6 minutes on 4 cores with
truths cached.)
