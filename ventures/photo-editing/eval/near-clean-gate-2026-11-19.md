# The noise-aware blend near clean: the loss is a leak, not a ramp (2026-11-19)

**Verdict: (filled in after the held-out test below.)**

Flagship item (portfolio/flagships.yaml photo-editing `next:`, "a near-clean gate in the blend's ramps"). Since
2026-11-19 `--demosaic auto` picks noise-aware (eval/auto-noise-aware-2026-11-19.md). 0.78% of 6,008 scored rows
lose over 0.1 dB to directional, all near clean, worst -0.58 dB on a Pentax K-3 Mark III tile at SNR 200 where
the true noise model loses as much (eval/noise-card-floor-rank-2026-11-18.md). That note proposed a gate in the
ramps: skip the blend where the model's noise is small next to the detail.

## What the loss is (diagnosis, on the one losing tile, before any rule)

The tile (IMGP9854.PEF [276, 534], 480 x 480, 20 x 20 blocks of 24) at SNR 200, `equal`, true model: q (block
detail over block noise) has median 6.9; 31 blocks sit under the ramp's 0.8 (weight 0, bilinear), none between
0.8 and 2, 369 above 2 (weight 1, directional). Squared error summed per q band:

| blocks | n | directional | bilinear | noise-aware |
|---|---|---|---|---|
| q < 0.8 (blend: bilinear) | 31 | 7.6e-5 | 5.6e-5 | 5.1e-5 |
| 2 <= q < 3 | 12 | 2.5e-5 | 4.8e-5 | 2.5e-5 |
| q >= 3 (blend: directional) | 357 | 6.08e-3 | 6.35e-2 | **6.78e-3** |

The smooth blocks are not where it loses: the blend is better than either there. It loses in the detailed blocks,
whose weight is 1 at their own centre. `blend` spreads block weights to pixels by interpolating between block
centres, so the half of a detailed block nearest a smooth neighbour takes part of the neighbour's weight 0. Near
clean, bilinear is 10 dB worse than directional on detail, and that partial weight costs 11% more error in the
detailed blocks than directional alone. No ramp setting reaches it: the ramps decide each block's own weight,
and these blocks already have 1. The gate belongs where the weights are spread.

Raising every block's q to its 3 x 3 neighbourhood's maximum (a full dilation) took the tile from -0.58 to
+0.01 dB but gave back up to 0.7 dB at SNR 12 on the same file, where smooth blocks beside detail do want
bilinear. So the lift is scaled: `lift_near_detail(q, k)` raises each block's q to at least its largest 3 x 3
neighbour's over `k` (`src/shootflow/xtrans_demosaic.py`). With a neighbour at q 30 and k 16 a smooth block
goes to 1.9, almost directional; at SNR 12 the same neighbour reads about q 2 and nothing moves.

## Decision rule, committed before the tune and held-out rows were scored

`tools/near_clean_gate.py sweep` scores, per tile x SNR (200, 60, 25, 12) x scenario (`equal`, `wb`), with the
same truths, tiles and noise seeds as the 2026-11-18 sweeps: `D` (directional), `true` (oracle model), `ship`
(`frame_noise`, what `--demosaic auto` uses on a raw with no NoiseProfile), and each lifted with k in
{4, 6, 8, 12, 16, 24, 32, 48}. Bayer layout (`--bayer`); repeat scenes skipped by the sets' cards files.

- **Tune**: the `fourth` set (96 files listed, 24 bodies; the set holding both oracle-losing tiles; its
  aggregates were seen on 2026-11-18). `tune` picks the k that maximises mean luma + colour gain of `ship+k`
  over `D`, ties to the larger k. One file of it (the K-3 Mark III) was scored while building the tool:
  k 8 to 16 were best there.
- **Held out**: the `first` set (158 files listed, 29 bodies; never used to build or tune this lift). The lift
  ships, on by default inside `noise_aware`, only if all of these hold for `ship+k` against `ship`:
  - (h1) mean luma and mean colour change each >= -0.005 dB, and in every SNR x scenario cell >= -0.02 dB;
  - (h2) fewer rows lose over 0.1 dB to `D` (either metric), and no row newly does;
  - (h3) the worst SNR 200 row (either metric, against `D`) improves.
- **X-Trans** (reported, separately decided): the same k on the `first` set's tiles re-mosaicked on an X-Trans
  layout (`--raf`, a FUJIFILM file's pattern). If h1 to h3 hold there too the lift covers X-Trans; if not, it
  is Bayer only and this note says which failed.
- **Cost**: the lift works on the block grid (a 36 MP frame has about 63,000 blocks); timed on one full frame.

## Tune: k = 12 (committed before the held-out rows were read)

`python tools/near_clean_gate.py tune eval/near-clean-gate-tune-2026-11-19.jsonl` (696 rows, 87 tiles of the
`fourth` set; output `near-clean-gate-tune-2026-11-19.txt`). The unlifted `ship` arm reproduces the 2026-11-18
sweep to the last digit (+0.6961 luma, +0.4719 colour, 5 rows losing over 0.1 dB), so the tool draws the same
noise on the same tiles.

| arm | mean luma over D | mean colour | rows losing > 0.1 dB | worst row | SNR 200 luma | SNR 12 luma |
|---|---|---|---|---|---|---|
| `true` (oracle, unlifted) | +0.9521 | +0.4354 | 6 | -0.58 | +0.2690 | +1.6003 |
| `true+12` | +0.9554 | +0.4385 | 1 | -0.12 | +0.2777 | +1.6003 |
| `true+8` | +0.9562 | +0.4397 | 0 | -0.02 | +0.2786 | +1.6003 |
| `ship` (what ships) | +0.6960 | +0.4719 | 5 | -0.58 | +0.2032 | +1.1379 |
| `ship+4` | +0.6889 | +0.4681 | 0 | -0.05 | +0.2110 | +1.1344 |
| `ship+12` (pick) | +0.6996 | +0.4741 | 0 | -0.07 | +0.2135 | +1.1379 |
| `ship+48` | +0.6964 | +0.4722 | 3 | -0.41 | +0.2047 | +1.1379 |

The rule picks k = 12 for `ship` (mean luma + colour +1.1737 against +1.1679 unlifted). Every k from 4 to 16
removes all 5 losing rows of what ships. Small k lifts too much (k 4 gives back 0.004 dB at SNR 12); large k
lifts too little (k 48 keeps 3 losers). The oracle's best is k 8, and with k 12 one oracle row still loses
0.12 dB; the rule scores what ships, so it stays 12.

