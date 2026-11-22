# A lower-envelope noise line for dense foliage (2026-11-22)

Item: NEXT.md, "Dense foliage over-reads are not in the eigenvalues ... try a lower-envelope line fit over the
bins" (from eval/noise-pca-min-eigen-2026-11-19.md, "Next" item 2).

## The read

`frame_noise` fits `variance = shot * level + read` by least squares through patch PCA's brightness bins
(`noise_pca.fit_line`). On the D780 DSC_0336 [0, 0] foliage tile the bins' sigma climbs from 0.001 (dark) to
0.035 (bright), faster than shot noise allows: the bright bins keep fine texture the weak-texture test cannot
tell from noise, and the fitted line follows them.

`fit="envelope"` (new, `noise_pca.fit_envelope`, opt-in through `frame_noise(..., fit="envelope")`): texture
only adds variance, so drop the bin furthest above the line (by sigma^2 over the line's) while it is over
**1.5** times the line, refit, and keep at least **3** bins. Both constants were set before any real row was
scored, from the sampling error of a bin's sigma^2 (thousands of patches: a few percent). On the synthetic bins
of `tests/test_noise_pca.py` it returns the plain line when the bins are linear to 3%, and recovers the true
model to 2% (shot) and 5% (read) when the three brightest bins carry texture, where the plain line reads 2x+.

## What is asked, and what each answer decides (committed before any real row was scored with the envelope)

Data: the 53 files of github.com/drewnoakes/metadata-extractor-images that the 2026-11-21 and 2026-11-22 sweeps
scored (cards `eval/near-clean-gate-mei-cards-2026-11-19.json`, same tiles, splits and seeds), rescored by
`tools/near_clean_gate.py sweep --bayer --ks 12 --eigs mpcw.envelope`. The `ship` arm is `mpcw` with the plain
line. **No blind set is reachable:** raw.pixls.us, where the D780 foliage tile lives, refuses this session, and
this set is spent for selection tests (eval/noise-pca-mpcw1-2026-11-22.md). It is still blind to the envelope,
but every outcome below leaves the envelope **opt-in**; the sweep only decides whether it earns a blind set.

- **R (reproduction, decides nothing):** this sweep's `ship` matches the 2026-11-22 rows' `ship` (same file,
  tile, SNR, scenario) to 0.01 dB on at least 99% of scores.
- **T (does it touch anything):** the share of rows where the envelope's sigma at 18% grey differs from ship's by
  over 1%, reported per split.
- **H (no harm), on each split with clean truths:** `whitened --split <s> --eig mpcw.envelope`'s h1 (mean luma
  and colour each at least -0.005 dB against `ship+12`, every (SNR, scenario) cell at least -0.02 dB) and h2 (no
  row newly losing over 0.1 dB to `D`, no more losers in all). h3 (the white-balanced low-SNR lift) is not asked:
  the envelope only lowers reads.
- **G (help):** fewer rows losing over 0.1 dB to `D` than `ship+12`, tune and held together.

H and G pass on both splits: the envelope is worth a blind set (raw.pixls.us's `first` set, which holds the
D780/D600 foliage rows) and NEXT.md says so. Anything fails: it stays opt-in and this note says where.
