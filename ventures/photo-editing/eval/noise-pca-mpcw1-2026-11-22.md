# `mpcw1`: `mpcws`'s patch selection without its feedback (2026-11-22)

Flagship item (portfolio/flagships.yaml photo-editing `next:`, "next mpcws selecting with mpcw's level,
pre-registered"; eval/noise-pca-mpcws-noisy-truth-2026-11-22.md, "Next").

## The read

`frame_noise` on Bayer reads its noise line with patch PCA per brightness bin. Liu's iteration picks the
weak-texture patches (texture energy under `s2 x tr x q`), and the eigenvalue read takes sigma^2 from the kept set.

- `mpcw` (Bayer default since 2026-11-21): the set Chen's iteration keeps, read with the colour-whitened level.
- `mpcws` (opt-in): the iteration's own `s2` is the whitened read, iterated up to 6 times. The 2026-11-22 note
  found it over-reads the K-1 Mark II's [372, 678] tile 2.3 times: a high read loosens the threshold, keeps more
  texture, and reads higher again.
- `mpcw1` (new, `src/shootflow/noise_pca.py`, `RESELECT_ONCE`): Chen's iteration picks the set as for `mpcw`; the
  whitened read of that set sets **one** more threshold over all the bin's patches; the whitened read of the set
  that threshold keeps is the answer. It can lift a read that Chen's low level trimmed (white-balanced noise),
  but its own answer never moves its threshold.

On the synthetic white-balanced field of `tests/test_noise_pca.py` (gains 2, 1, 1.6, SNR 25), read / true:
`chen` 0.70, `mpcw` 0.78, `mpcw1` 0.84, `mpcws` 0.99 (seen while writing the test, before any real row).

## What is asked, and what each answer decides (committed before any real row was scored with `mpcw1`)

Data: the 53 files of github.com/drewnoakes/metadata-extractor-images the 2026-11-21 sweep scored (cards file
`eval/near-clean-gate-mei-cards-2026-11-19.json`, the same tiles, splits and seeds), rescored by
`tools/near_clean_gate.py sweep --bayer --ks 12 --eigs mpcw1,mpcws`. In this sweep the `ship` arm is `mpcw`.
raw.pixls.us refuses this session (CONNECT 403), so no fresh body can be added; the held split is not blind to
`mpcw` and `mpcws` (both reported there before), but it is to `mpcw1`.

- **R (reproduction, decides nothing about the pick):** the rerun's `ship` and `mpcws` arms match the committed
  2026-11-21 rows' `mpcw` and `mpcws` (same file, tile, SNR, scenario) to 0.01 dB on at least 99% of rows. If not,
  this note says so and the verdict below is read only on this sweep's own rows.
- **C (stated check, K-1 Mark II [372, 678]):** `mpcw1` / `mpcw` sigma at 18% grey at most 1.3 on every row of that
  tile. It fails: `mpcw1` stays opt-in whatever the pick and test say.
- **Pick (tune, `--clean-truths`):** `mpcw1+12` against `ship+12` (= `mpcw+12`): a higher mean (luma + colour) gain
  over `D` and no more rows losing over 0.1 dB to `D` (`near_clean_gate.py whitened --split tune --eigs mpcw1`).
- **Test (held, same filter), `mpcw1+12` against `ship+12`**, the 2026-11-21 bars (`whitened --split held --eig
  mpcw1`): h1 mean luma and mean colour gain each at least -0.005 dB, every (SNR, scenario) cell at least
  -0.02 dB; h2 no new row losing over 0.1 dB to `D` and no more in all; h3 the white-balanced SNR 25 and 12 rows
  gain at least +0.02 dB luma.

C, the pick and the test all pass: `mpcw1` becomes `frame_noise`'s Bayer default (X-Trans keeps Chen's read).
Anything fails: defaults stay and this note says where.

## Result: `mpcw1` fails C, the pick and h1; `mpcw` stays the Bayer default

The section above was committed (c6506d976) before the sweep ran. The sweep: 60 files given, 53 scored (7 LibRaw cannot
open, the same 7 as on 2026-11-21), 536 rows, about 35 minutes on 4 cores. Rows:
`noise-pca-mpcw1-2026-11-22.jsonl`; every number below: `noise-pca-mpcw1-2026-11-22.txt`.

| gate | reading | bar | |
|---|---|---|---|
| R, `ship` vs committed `mpcw` | 2,128 / 2,144 scores within 0.01 dB (99.25%) | at least 99% | pass |
| R, `mpcws` vs committed `mpcws` | 2,142 / 2,144 (99.91%) | at least 99% | pass |
| C, K-1 II [372, 678], `mpcw1` / `mpcw` read | 0.96 to 1.25 on 7 rows, **1.48** at SNR 60 wb | every row at most 1.3 | FAIL |
| pick (tune, 162 rows), mean luma + colour over D | `mpcw1` +1.0441 vs `mpcw` +1.0340 | higher | pass |
| pick, rows losing over 0.1 dB to D | `mpcw1` **7** vs `mpcw` 6 | no more | FAIL |
| h1 (held, 208 rows), worst cell | SNR 200 wb **-0.052** dB luma | at least -0.02 | FAIL |
| h1, means | luma +0.024, colour -0.0005 | each at least -0.005 | pass |
| h2, new losers | 0 (0 -> 0) | none | pass |
| h3, wb SNR 25 and 12 luma | +0.076 dB (n = 68) | at least +0.02 | pass |

So by the rule committed above, defaults stay: `mpcw` on Bayer, Chen on X-Trans; `mpcw1` is kept as an opt-in
read (`eig="mpcw1"`), like `mpcws`.

**Readings after the verdict (they decide nothing).**

- R's drift is two files, both Fujifilm RAFs scored on the RGGB layout: of the 16 `ship` scores off by more than
  0.01 dB, 10 are `FujiFilm EX-2.raf` and 6 `Fujifilm X-E1.raf` (worst 0.32 dB, EX-2 at SNR 25 wb, its sigma read
  0.0063 now against 0.0066). `mpcws` matches on them, so the noise added is the same; why `mpcw`'s read moved
  there is not traced here.
- The new tune loser is the K-1 II [372, 678] at SNR 12 equal (-0.19 dB; `mpcw` -0.01): the same tile C flags. The
  other six losers are the K-1 II's two textured tiles, where both reads lose about equally.
- Cutting the feedback cut the gain with it. On tune, `mpcws` gains +0.256 dB (luma + colour) over `mpcw`; `mpcw1`
  keeps +0.010 of it. On held, `mpcw1` keeps the white-balanced low-SNR lift (+0.107 dB luma at SNR 12 wb) but
  gives some back at SNR 60 equal (-0.018) and 200 wb (-0.052, n = 6). The medians of read / true sigma move by
  0.01 to 0.04 at most. Read with the 2026-11-22 noisy-truth note: `mpcws`'s gain and its 2.3x over-read on the
  K-1 II come from the same mechanism, letting a higher read admit more patches. A selection change of this kind
  cannot keep one without the other on these 53 files.

## Next (for the flagship row)

The patch-selection line on these 53 files is spent: three pre-registered tests (min-eigenvalue, the noisy-truth
reading, this one) have failed, and the held split is no longer blind to any whitened read. A further read needs a
fresh, blind set: raw.pixls.us's bodies (refused this session) or a new public sample set, with `mpcws` and `mpcw1`
both as arms and C stated again on whatever K-1-like long exposure is in it.

## Reproduce

    git clone --filter=blob:none --no-checkout --depth 1 https://github.com/drewnoakes/metadata-extractor-images.git mei
    cd mei && git sparse-checkout set arw cr2 dng nef orf pef raf rw2 srw && git checkout && cd -
    # the files the 2026-11-21 rows name
    python -c "import json;print('\n'.join(sorted({json.loads(l)['file'] for l in open('eval/noise-pca-whitened-level-2026-11-21.jsonl')})))" \
        | while read f; do find mei -type f -name "$f"; done | tr '\n' '\0' \
        | PYTHONPATH=src xargs -0 -P 4 -n 1 python tools/near_clean_gate.py sweep --bayer --ks 12 --eigs mpcw1,mpcws \
            --cards eval/near-clean-gate-mei-cards-2026-11-19.json --cache /tmp/truths > rows.jsonl
    python tools/mpcw1_checks.py rows.jsonl eval/noise-pca-whitened-level-2026-11-21.jsonl
    python tools/near_clean_gate.py whitened rows.jsonl --split tune --eigs mpcw1,mpcws
    python tools/near_clean_gate.py whitened rows.jsonl --split held --eig mpcw1

Python 3.13, numpy 2.5.3, rawpy 0.28.0.
