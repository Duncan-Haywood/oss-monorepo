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

**Rows:** the sweep's own (`tools/noise_aware_estimated.py` draws): three 480 x 480 tiles per file of the LibRaw
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

## Result

(filled in after the sweep, below this line; the rule above is unchanged)
