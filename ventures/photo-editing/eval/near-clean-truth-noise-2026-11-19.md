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
