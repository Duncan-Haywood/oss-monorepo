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

## Result: G passes, H fails on both splits; the envelope stays opt-in

The section above was committed (4f2ab6ad3) before the sweep ran. The sweep: 53 files scored, 536 rows, about
35 minutes on 4 cores. Rows: `noise-envelope-fit-2026-11-22.jsonl`; every number below:
`noise-envelope-fit-2026-11-22.txt`. ("Rows losing" = rows losing over 0.1 dB to `D`.)

| gate | reading | bar | |
|---|---|---|---|
| R, `ship` vs the 2026-11-22 `ship` | 1,066 / 1,072 scores within 0.01 dB (99.44%) | at least 99% | pass |
| T, rows whose read moves over 1% | tune 154 / 248 (151 lower), held 139 / 288 (135 lower) | reported | |
| G, rows losing, tune + held | **6 -> 3** (tune 6 -> 3, held 0 -> 0) | fewer | pass |
| H tune, h1 worst cell | SNR 12 wb **-0.204** dB luma; means luma -0.054, colour -0.020 | -0.02 / -0.005 | FAIL |
| H tune, h2 | no new loser, 6 -> 3 | none new | pass |
| H held, h1 worst cell | SNR 12 wb **-0.176** dB luma; means luma -0.069, colour -0.041 | -0.02 / -0.005 | FAIL |
| H held, h2 | 0 -> 0 | none new | pass |

So by the rule committed above, it stays opt-in (`frame_noise(..., fit="envelope")`); the default line is
unchanged, and no blind set is asked for yet.

**What it fixes.** The three rows it rescues are the ones it was aimed at: the Pentax K-1 Mark II's textured tiles,
[0, 0] at SNR 25 equal (-0.59 -> +0.00 dB) and wb (-0.43 -> +0.00), and [0, 1362] at SNR 25 wb (-0.70 -> +0.02).
On those tiles the bright bins carry texture and dropping them is right.

**What it breaks (readings after the verdict; they decide nothing).** The envelope lowers the read on about half
the rows, and the read was already low: median read / true sigma at 18% grey is 0.88 (equal) and 0.70 (wb) for
the plain line, 0.81 and 0.65 for the envelope. It moves 63% of white-balanced rows (median 0.94x the plain read)
against 46% of equal rows (median 0.999x). Under white balance the bins are not on one line even with no texture:
a bin's patches mix colours whose gains differ, and the bins' colour mix shifts with level, so honest noise can sit
1.5x off a line through the other bins. The cost lands at low SNR with white balance (-0.20 / -0.18 dB luma at SNR
12 wb), where the noise-aware blend most needs the read.

**Next (NEXT.md).** The texture signal is real but the test cannot be "above the line": (a) run the envelope on
the colour-whitened bins (`mpcw`'s per-colour ratios applied before the fit), so honest wb noise is linear again,
and re-score on a blind set; (b) drop a bin only when its patches' whiteness (`noise_pca.whiteness`) says texture,
not when its variance is high. Both need a set this one is not spent for: raw.pixls.us's `first` set holds the
D780/D600 foliage rows.

## What changed

- `src/shootflow/noise_pca.py`: `fit_envelope`, `ENVELOPE_RATIO`, `ENVELOPE_MIN`, `FITS`; `estimate_noise_pca(...,
  fit="line")`. The default output is unchanged (R above).
- `src/shootflow/xtrans_demosaic.py`: `frame_noise(..., fit=)` passes it on.
- `tools/near_clean_gate.py`: `--eigs` takes `<eig>.<fit>` arms (`mpcw.envelope`).
- `tests/test_noise_pca.py`: the envelope returns the plain line on linear bins and recovers the model when the
  three brightest bins carry texture; `frame_noise` takes `fit=` and rejects an unknown one.

## Reproduce

    git clone --filter=blob:none --no-checkout --depth 1 https://github.com/drewnoakes/metadata-extractor-images.git mei
    cd mei && git sparse-checkout set arw cr2 dng nef orf pef raf rw2 srw && git checkout && cd -
    find mei/{arw,cr2,dng,nef,orf,pef,raf,rw2,srw} -type f -not -path '*/metadata/*' -print0 | PYTHONPATH=src \
        xargs -0 -P 4 -n 1 python tools/near_clean_gate.py sweep --bayer --ks 12 --eigs mpcw.envelope \
        --cards eval/near-clean-gate-mei-cards-2026-11-19.json --cache /tmp/truths > rows.jsonl
    python tools/near_clean_gate.py whitened rows.jsonl --split tune --eigs mpcw.envelope
    python tools/near_clean_gate.py whitened rows.jsonl --split held --eig mpcw.envelope

Python 3.13, numpy 2.5.3, rawpy 0.28. Note: after `git sparse-checkout set` on a `--no-checkout` clone, run
`git checkout` (the 2026-11-21 recipe omits it, and the tree stays empty).
