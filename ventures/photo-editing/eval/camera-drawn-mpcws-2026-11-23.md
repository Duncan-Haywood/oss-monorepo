# `--noise-read mpcws` on camera raws with drawn noise: the check J4 committed (2026-11-23)

Flagship item (portfolio/flagships.yaml photo-editing `next:`, "next a drawn-noise check on camera raws"; the
first "Next" of `eval/hdrplus-joint-check-j4-2026-11-23.md`). J4 shipped `shootflow develop --noise-read mpcws` as
an opt-in after it passed four pre-registered tests on 111 HDR+ bursts. Every one of those bursts is a 10-bit Google
phone, so J4 kept the default and named this check: the same option against what ships on Bayer camera raws that
no ramp fit has used, with the noise drawn on a clean truth as the earlier camera sweeps draw it.

## The rule (committed in this PR before any file was scored)

**Arms** (`tools/near_clean_gate.py sweep --bayer --ks 12 --option`):

- `ship+12`: what ships with no NoiseProfile on Bayer: `frame_noise` (patch PCA, `mpcw` read), colour ramp
  `RAMPS[2]`, luma ramp `LUMA_RAMPS[2]`, lifted by `NEAR_DETAIL[2]` = 12;
- `opt`: the option exactly as develop runs it: `xtrans_demosaic.frame_noise_read(c, pat, "mpcws")` (the `mpcws`
  read with colour ramp (0.3, 1.0), or exactly `ship` where its sigma at 18% grey is under 0.6x the shipped read's),
  the shipped luma ramp and the same lift;
- `true+12`: the oracle, the model the noise was drawn from, on the shipped ramps and lift;
- `D`: directional.

**Rows:** the sweep's own (`tools/noise_aware_estimated.py` draws): up to three 480 x 480 tiles per file of the LibRaw
truth binned 4 x 4 and re-mosaicked RGGB, at SNR 200, 60, 25 and 12, `equal` and `wb` (noise drawn before white
balance, as a sensor draws it), seeds from file, tile, SNR and scenario. Judged on clean truths only (the sweep's
`clean_enough`: the truth's own grain, read from the raw, is no louder than the noise added), as every camera sweep
since 2026-11-19 has been.

**Tests, `opt` against `ship+12`** (J4's four, `near_clean_gate.py drawn`):

- h1: mean luma and colour gain at least -0.005 dB, every (SNR, scenario) cell at least -0.02 dB;
- h2: no new row losing over 0.1 dB to `D`, and no more such rows;
- h3: mean luma gain at least +0.02 dB;
- h4o: no row more than 0.1 dB under `ship+12` where the oracle is not also more than 0.1 dB under it.

**A pass on all four** makes `mpcws` the default noise read for Bayer frames without a NoiseProfile (HDR+ real
noise and camera drawn noise, two independent sets). **A fail** keeps it opt-in, and the failing rows say what to
look at next.

## Data: 11 Bayer raws no noise read has been scored on

raw.pixls.us refused this session again, and the 60 files of github.com/drewnoakes/metadata-extractor-images are
spent for noise-read selection (NEXT.md). These come from three other public repositories' test folders (fetched
with a sparse git checkout; the files are not committed here):

| file | body | source |
|---|---|---|
| RAW_CANON_5DMARK2_PREPROD.CR2 | Canon 5D Mark II | github.com/letmaik/rawpy `test/` |
| iss030e122639.NEF, iss042e297200.NEF | Nikon D3S, D4 (ISS photographs, NASA) | github.com/letmaik/rawpy `test/` |
| RAW_NIKON_D3X.NEF, RAW_OLYMPUS_E3.ORF, RAW_PANASONIC_DMC-GF1.RW2, RAW_PANASONIC_G1.RW2, RAW_PENTAX_K200D.PEF, RAW_SONY_A300.ARW | as named | github.com/OpenImageIO/oiio-images `raw/` |
| mire1.cr2, hlrecovery.arw | a test chart; a highlight-recovery scene | github.com/darktable-org/darktable-tests `images/` |

Left out before scoring: `RAW_CANON_EOS_7D.CR2` (a file of that name is in the 2026-11-18 card-floor set,
eval/noise-card-floor-files-2026-11-18.json), `M0054341_01_00005.cr2` (LibRaw: data error), `RAW_CANON_40D_SRAW_V103.CR2`
(sRAW, not a mosaic), `RAW_FUJI_F700.RAF` (SuperCCD), `IMG_1361.dng` (64 KB). The 5D Mark II and the first ISS NEF
were used earlier only to check the developer's colour and decoding, never in a noise read or ramp fit.

## Result: all four pass, so `mpcws` is the default read for Bayer raws with no NoiseProfile

104 rows (the 4 x 4 binned truths fit one 480 tile on ten files and three on the D3X); 76 have clean truths and are
judged. About 10 minutes on 4 cores. Output: `camera-drawn-mpcws-2026-11-23.txt`; every row:
`camera-drawn-mpcws-rows-2026-11-23.jsonl.gz` (`near_clean_gate.py drawn` reads it as is).

| test | reading | bar | |
|---|---|---|---|
| h1 means and cells | luma **+0.224**, colour **+0.115**; worst cell -0.003 (SNR 200 wb colour) | means at least -0.005, cells at least -0.02 | pass |
| h2 losers to `D` | 0, none new (what ships: 0) | no new, no more | pass |
| h3 mean luma | **+0.224** | at least +0.02 | pass |
| h4o over 0.1 dB under `ship+12` where the oracle is not | **0 of 76** (none under at all) | none | pass |

Gains over D, mean of 76 rows: `ship+12` +0.63 luma / +0.40 colour, `opt` +0.85 / +0.52, the oracle +0.90 / +0.38.
By cell, `opt` minus `ship+12` (luma / colour): SNR 12 wb +0.70 / +0.34, SNR 25 wb +0.34 / +0.15, SNR 12 equal
+0.13 / +0.11, SNR 25 equal +0.09 / +0.05, SNR 60 +0.01 to +0.06, SNR 200 0.00. The collapse fallback fired on no
judged row. Every file gains on average (luma +0.03 on the K200D to +1.78 on the 5D Mark II's one tile).

## Readings after the verdict (they decide nothing)

- **Where the gain comes from.** At SNR 25 and 12 the option's read is 0.58 to 1.11 of the drawn noise's sigma at
  18% grey, what ships 0.31 to 0.94. Most of the gain is in `wb` rows, where the noise is drawn before white
  balance: the case the 2026-11-21 synthetic table showed `mpcws`'s selection fixes (0.97 of the truth against
  0.74 to 0.83). That is also a caveat: the drawn noise follows the same Poisson-Gaussian model the read assumes.
  The HDR+ draws (real sensor noise) gained less, +0.08 colour / +0.12 luma, and are the better guide to the size.
- **All truths** (`drawn --all-truths`, 104 rows): h1 would fail on one cell, SNR 200 `wb` luma -0.046, from two
  rows whose truth is grainier than the noise added (5D Mark II, truth grain 0.0046 against 0.0012 drawn: -0.58 dB;
  ISS D3S: -0.11 dB). The oracle loses on both too, so no read can be judged there: the score rewards keeping the
  truth's own grain. It is why camera sweeps since 2026-11-19 are judged on clean truths, and the rule said so.
- **Small set.** 11 files, 13 tiles, 76 rows. The pass is on the committed bars; the next camera files (raw.pixls.us
  when it answers, the D780/D600 foliage rows) should be read with the new default against `--noise-read ship`.

## What changed

`DevelopSettings.noise_read` and `shootflow develop --noise-read` default to `mpcws`. `--noise-read ship` gives the
output before this change byte for byte. X-Trans and files with a NoiseProfile are unchanged. Tests:
`tests/test_demosaic_noise_aware.py` (default and flag), `tests/test_near_clean_gate_split.py` (`DrawnJudge`).

## Reproduce

```
# the 11 files: sparse checkouts of the three repositories above (git clone --filter=blob:none --no-checkout, then
# git checkout HEAD -- <paths>)
PYTHONPATH=src python tools/near_clean_gate.py sweep --bayer --ks 12 --option --cache /tmp/truths FILES... > rows.jsonl
python tools/near_clean_gate.py drawn rows.jsonl                # the committed judgement (clean truths)
python tools/near_clean_gate.py drawn --all-truths rows.jsonl   # the reading
```
