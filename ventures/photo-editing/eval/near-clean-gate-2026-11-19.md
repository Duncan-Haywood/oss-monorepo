# The noise-aware blend near clean: the loss is a leak, not a ramp (2026-11-19)

**Verdict: shipped for Bayer, the default from today; X-Trans stays as it was.** The near-clean loss was never in
the ramps. `blend` interpolates block weights between block centres, so a detailed block beside a smooth one
takes part of the smooth block's bilinear weight, and near clean bilinear is about 10 dB worse than directional on
detail. `lift_near_detail` raises each block's q to at least its largest neighbour's over 12 before the blend.
On 1,272 held-out Bayer rows (29 bodies no part of this work had read) rows losing over 0.1 dB to directional fall
from 18 to 11, none is new, the worst SNR 200 row goes from -0.27 to -0.14 dB, and the means rise (+0.0031 dB
luma, +0.0017 colour; no SNR x scenario cell lower). On the tune set it removed all 5 losers, the -0.58 dB K-3
Mark III tile included. On X-Trans the same lift passed two of the three tests (losers 31 to 24, none new) but
left the worst SNR 200 row where it was, so by the rule it is not on there. The 11 Bayer rows still losing are
the other kind: the oracle model does not lose on any of them, so they are the frame's noise read too high.

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

## Held out: the `first` set, Bayer (the test)

`python tools/near_clean_gate.py rule eval/near-clean-gate-held-2026-11-19.jsonl --k 12` (1,272 rows, 159 tiles,
83 kept files of 29 bodies; output `near-clean-gate-held-2026-11-19.txt`). The unlifted `ship` arm has the same
18 rows over 0.1 dB as the 2026-11-18 sweep of this set (eval/auto-noise-aware-2026-11-19.md, q2).

    PASS h1 means within 0.005 dB, every cell within 0.02 dB      (luma +0.0031, colour +0.0017; lowest cell +0.0000)
    PASS h2 fewer rows lose > 0.1 dB to D, none new               (18 -> 11, 0 new)
    PASS h3 the worst SNR 200 row improves                        (-0.27 -> -0.14 dB)
    verdict: ship the lift

| SNR, scenario | gain over D, unlifted | lifted |
|---|---|---|
| 200 equal | +0.092 | +0.101 |
| 200 wb | +0.092 | +0.097 |
| 60 equal | +0.359 | +0.366 |
| 60 wb | +0.316 | +0.318 |
| 25 equal / wb | +0.760 / +0.633 | +0.761 / +0.634 |
| 12 equal / wb | +1.262 / +0.924 | unchanged |

(mean luma, dB; 159 rows each.) The lift does what the diagnosis said: nothing at SNR 12, most at SNR 200 and 60.

The 7 rows it fixed are all on two bodies: Sony ILCE-7CM2 (5 rows, worst -0.27 to -0.02) and Nikon Z 5 (-0.17 to
+0.08). The 11 left are Nikon D780 (8 rows on three frames) and Nikon D600 (3 rows on one tile), at SNR 25 to 200.
The oracle model loses on none of those 11 (each within 0.01 dB of directional): there the frame's own noise
reading is too high, the texture-as-noise case of eval/noise-card-floor-real-2026-11-18.md, which a change to how
weights are spread cannot reach.

## X-Trans: the same tiles on an X-Trans layout (reported; fails h3)

`sweep --raf FUJIFILM_X-M5__DSCF0621_-_lossless.RAF --ks 12` on the same 83 files (the truths re-mosaicked on the
X-M5's 6 x 6 pattern; output `near-clean-gate-xtrans-2026-11-19.txt`):

    PASS h1 (luma +0.0012, colour +0.0002; lowest cell -0.0005 at SNR 200 wb)
    PASS h2 (31 -> 24 rows over 0.1 dB, 0 new)
    FAIL h3 the worst SNR 200 row improves (Nikon D780 DSC_0338 [0, 0], wb: -0.39 -> -0.39; the oracle: 0.00)

The worst row is again an over-read estimate, out of the lift's reach, and colour moves by under a thousandth of a
dB either way. By the rule committed above, `NEAR_DETAIL` stays `None` for X-Trans. A tune pass on X-Trans rows
(the fourth set on an X-Trans layout) could pick its own k; it was not run.

## Cost

The lift is a 3 x 3 maximum on the block grid: 1.2 ms for the 275 x 229 blocks of a 36 MP frame
(numpy, this container), against about 8 s for the develop. Memory: two arrays the size of the grid.
On a real frame, `shootflow develop` of the fourth set's Pentax K-3 II DNG (24 MP, no NoiseProfile, so the
frame-read model) took 5.9 s; with the lift switched off the TIFF differs in 0.012% of its values, by at most 8
codes. The lift only binds beside high-q blocks, so most of a frame keeps its bytes.

## What changed

- `src/shootflow/xtrans_demosaic.py`: `lift_near_detail(q, k)`; `NEAR_DETAIL = {2: 12.0, 6: None}`;
  `noise_aware(..., near_detail=True)` takes the CFA's k (a number sets one, `None`/`False` is the old blend).
  `--demosaic auto` and `--demosaic noise-aware` both go through `noise_aware`, so every Bayer develop with a noise
  model changes; directional output does not.
- `tools/near_clean_gate.py`: the sweep, the tune pick and the rule.
- Tests (`tests/test_demosaic_noise_aware.py`): the lift's arithmetic; on a clean frame, half flat and half fine
  stripes, the unlifted blend loses over 2x directional's error in the stripes' first block column and the
  default (k 12) matches directional there.

## What it does not settle

- The 11 Bayer rows (24 X-Trans) still losing over 0.1 dB, all over-read estimates. Their fix is in the noise read,
  not the blend: the D780 and D600 tiles are the cases to start from.
- X-Trans: its own tune pass.
- The `fresh` set (4,040 rows, 153 bodies) was not rerun: its 24 losing rows are untested with the lift.
- Still synthetic noise on binned real scenes: a real low- and high-ISO pair of one static scene is the missing
  evidence (NEXT.md).

## Reproduce

    python tools/pixls_fetch.py eval/noise-card-floor-files-2026-11-18.json --set fourth --out /tmp/raws > m4.json
    python tools/pixls_fetch.py eval/noise-card-floor-files-2026-11-18.json --set first --out /tmp/raws1 > m1.json
    python -c "import json;d=json.load(open('eval/noise-card-floor-fourth-cards-2026-11-18.json'));print(''.join('/tmp/raws/'+n+'\n' for n in sorted(d) if d[n]['keep']),end='')" > kept4.txt
    tr '\n' '\0' < kept4.txt | PYTHONPATH=src xargs -0 -P 4 -n 1 python tools/near_clean_gate.py sweep --bayer \
        --cards eval/noise-card-floor-fourth-cards-2026-11-18.json --cache /tmp/truths > tune.jsonl
    python tools/near_clean_gate.py tune tune.jsonl
    # the same with the first set's cards file and /tmp/raws1 -> held.jsonl, then:
    python tools/near_clean_gate.py rule held.jsonl --k 12
    # X-Trans: --raf /tmp/raws/FUJIFILM_X-M5__DSCF0621_-_lossless.RAF --ks 12 in place of --bayer

(Python 3.13, numpy 2.5.3, rawpy 0.28; the `first` set is 2.1 GB of kept files and its sweep about 20 minutes on
4 cores; the tune set about the same.)
