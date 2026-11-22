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
