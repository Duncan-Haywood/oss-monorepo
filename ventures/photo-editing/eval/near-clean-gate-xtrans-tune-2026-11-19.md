# X-Trans near-clean lift: its own tune pass, on a fresh set of sample raws (2026-11-19)

Flagship item (portfolio/flagships.yaml photo-editing `next:`, "an X-Trans tune pass for its own k").
eval/near-clean-gate-2026-11-19.md shipped `lift_near_detail` for Bayer at k 12 and left X-Trans off
(`NEAR_DETAIL[6] = None`) because k 12 failed h3 there by one unchanged over-read row.

## Data: a fresh set, because raw.pixls.us is unreachable from this session

raw.pixls.us answered `CONNECT tunnel failed, response 403` here, so the `fourth` and `first` sets cannot be
fetched. The scenes are instead the 60 raws in github.com/drewnoakes/metadata-extractor-images (sparse checkout
of its `arw cr2 dng nef orf pef raf rw2 srw` folders; 55 bodies after grouping `Issue 247-1..4` and
`DJI Phantom 4 (1)/(2)`). No part of the near-clean work has scored these files. The X-Trans layout is taken from
that repo's `Fujifilm X-E1.raf` (`--raf`). Truths, tiles, SNRs, scenarios and seeds are the sweep's own
(`tools/near_clean_gate.py sweep`), unchanged.

Split by body with the sweep's own `split_of` (sha1 of the body name, even = tune): 29 files tune, 31 held.
The cards file that groups bodies is `eval/near-clean-gate-mei-cards-2026-11-19.json`.

## Decision rule, committed before any row was scored

- **Tune** (`split == tune` rows, X-Trans layout, every k in `KS`): `near_clean_gate.py tune` picks k (mean luma
  + colour gain of `ship+k` over `D`, ties to the larger k).
- **Held** (`split == held` rows): `near_clean_gate.py rule --k K` with the tuned K. `NEAR_DETAIL[6]` becomes K
  only if h1 (means within 0.005 dB, every cell within 0.02 dB), h2 (fewer rows lose > 0.1 dB to D, none new)
  and h3 (the worst SNR 200 row improves) all hold. If any fails, X-Trans stays `None` and this note says which.
- **Bayer replication** (reported, not a ship decision; Bayer is already on): the same 60 files on the Bayer
  layout at k 12, all rows through `rule --k 12`, to say whether the 2026-11-19 Bayer result holds on bodies
  outside raw.pixls.us.

## Result: X-Trans stays off; there is nothing on this set for the lift to fix

Seven files did not open in LibRaw (`Issue 247-1..4.nef`: I/O error; `bigtiff*.dng`, `Issue 419.rw2`:
unsupported), leaving 53 files, 51 bodies, 536 rows per layout (248 tune, 288 held on X-Trans). Output:
`near-clean-gate-mei-xtrans-2026-11-19.txt` (rows: `.jsonl`).

**Tune** (`tune --split tune`): no row loses over 0.1 dB to directional, unlifted or at any k (worst -0.08 dB
colour, a Pentax K-1 Mark II tile that gains 0.59 dB luma). Every k costs a little, most at small k:

| arm | mean luma over D | colour | losers | SNR 200 luma | SNR 12 luma |
|---|---|---|---|---|---|
| `ship` (unlifted) | +0.5942 | +0.3114 | 0 | +0.2355 | +1.0610 |
| `ship+4` | +0.5853 | +0.3056 | 0 | +0.2316 | +1.0582 |
| `ship+12` | +0.5940 | +0.3112 | 0 | +0.2353 | +1.0610 |
| `ship+48` (pick) | +0.5942 | +0.3114 | 0 | +0.2355 | +1.0610 |

The rule picks k 48, the weakest lift, equal to unlifted to four places.

**Held** (`rule --split held --k 48`): h1 PASS (+0.0000 / +0.0000), h2 FAIL (0 -> 0 losers: none to remove),
h3 FAIL (the worst SNR 200 row is unchanged). At the Bayer k 12, for reference: h1 PASS (luma -0.0005, colour
-0.0000, worst cell -0.0011 at SNR 60), h2 and h3 FAIL the same way. **`NEAR_DETAIL[6]` stays `None`.** Together
with the 2026-11-19 raw.pixls.us run (24 X-Trans losers left, all where the oracle model does not lose), the X-Trans
tune item is closed: the lift has no loss to remove on 51 fresh bodies, and the losses elsewhere are in the noise
read, which a change to how weights spread cannot reach.

## Bayer replication at k 12: no change, and the 15 losers are a noisy truth, not the demosaic

`rule --k 12` on all 536 Bayer rows (output `near-clean-gate-mei-bayer-2026-11-19.txt`): h1 PASS (luma +0.0002,
colour +0.0001; lowest cell -0.0004), h2 FAIL (15 -> 15, 0 new), h3 FAIL (worst SNR 200 row unchanged at -1.22 dB).
So the lift neither helps nor hurts on these bodies; Bayer keeps k 12 on the strength of the raw.pixls.us held-out
test, which this does not contradict.

All 15 rows that lose over 0.1 dB are on one file, `Pentax K-1 Mark II.pef` (3 tiles, SNR 12 to 200, down to
-1.22 dB). The oracle model loses on none of them. The frame-read noise there is 12x (SNR 60: 3.6x) to 30x (9x)
the noise added. The reason is the file: ISO 1600 at 30 s (EXIF 0x8827, 0x829a). Its grain survives the 4 x 4
binning, so the "truth" itself reads sigma 0.011 to 0.027 at 18% grey (`frame_noise` on the clean mosaic, before
any noise is added), a truth SNR of 7 to 17. Scored against that truth, a blend that smooths the grain looks like
lost detail. Across the set the median truth sigma is 0.0017 (SNR about 100).

So the sweep now records it: each row carries `truth_sigma18` (that clean-mosaic reading), and `tune` and `rule`
take `--clean-truths` to keep only rows whose truth SNR is at least the row's SNR (`clean_enough`). The Bayer
rows here were given the field by joining the same computation per tile (checked equal to a fresh sweep row on the
K-1 II, 0.01062 both). With `--clean-truths`, 352 of the 536 rows stay (dropped: K-1 II 22, A7 III 12, NEX-7 10,
NEX-5N 8, others 6 or fewer, mostly at SNR 200 and 60) and **what ships loses over 0.1 dB on none of them**
(lift: luma -0.0001, colour -0.0001).

What this means for the remaining near-clean losers (the raw.pixls.us D780 and D600 rows): check their truths'
own noise before treating them as over-read estimates. A rerun of the `first` set with this sweep says it in one
column; that needs raw.pixls.us.

## What changed

- `tools/near_clean_gate.py`: `--split tune|held` on `tune` and `rule` (one sweep serves both roles);
  `truth_sigma18` on every sweep row; `--clean-truths` / `clean_enough`.
- `tests/test_near_clean_gate_split.py`: both filters.
- No change to `src/`: `NEAR_DETAIL` stays `{2: 12.0, 6: None}`.

## Reproduce

    git clone --filter=blob:none --no-checkout --depth 1 https://github.com/drewnoakes/metadata-extractor-images.git mei
    cd mei && git sparse-checkout set --no-cone '/*/*.nef' '/*/*.NEF' '/*/*.arw' '/*/*.ARW' '/*/*.cr2' '/*/*.CR2' \
        '/*/*.orf' '/*/*.ORF' '/*/*.rw2' '/*/*.RW2' '/*/*.pef' '/*/*.raf' '/*/*.dng' '/*/*.srw' && git checkout HEAD && cd -
    # cards: eval/near-clean-gate-mei-cards-2026-11-19.json (file name -> body, split)
    find mei -type f -not -path '*/.git/*' -print0 | PYTHONPATH=src xargs -0 -P 3 -n 1 python tools/near_clean_gate.py \
        sweep --raf "mei/raf/Fujifilm X-E1.raf" --cards eval/near-clean-gate-mei-cards-2026-11-19.json --cache /tmp/truths > xtrans.jsonl
    python tools/near_clean_gate.py tune xtrans.jsonl --split tune
    python tools/near_clean_gate.py rule xtrans.jsonl --split held --k 48
    # Bayer: --bayer --ks 12 in place of --raf, then: rule bayer.jsonl --k 12 [--clean-truths]

(Python 3.13, numpy, rawpy 0.28 / LibRaw 0.22.2; 1.9 GB of raws; the X-Trans sweep about 70 minutes on 3 cores.)
