# Frame noise as the default fallback for `--demosaic noise-aware`: 52 real raws (2026-11-17, night)

Flagship item (portfolio/flagships.yaml `buildable:`, NEXT.md "Raws without a profile"): with patch-PCA frame
noise and the touching-neighbour X-Trans texture test, no held-out tile lost over 0.1 dB to directional on
either layout (0 of 240 Bayer, eval/noise-pca-estimator-2026-11-17.md; 0 of 248 X-Trans,
eval/xtrans-noise-pca-12-2026-11-17.md). The next step was making it the automatic fallback.

**Verdict: shipped. `DevelopSettings.noise_from_frame` is now `True`, and `shootflow develop --demosaic
noise-aware` reads the noise from the frame whenever the file has no NoiseProfile; `--no-noise-from-frame`
gives the old fallback to directional.** `--demosaic auto` (the default demosaic) is unchanged: noise-aware
stays an opt-in demosaic, because of the time and memory below.

The quality case is the two synthetic notes above (truth known, held-out tiles). This note is the other half:
does the fallback run on every reader the developer has, on whole real frames, what does it cost, and does
what it reads follow the camera's ISO? There is no truth on these frames, so nothing here is a PSNR against a
clean image.

## Method

`tools/noise_fallback_real.py`: each file from drewnoakes/metadata-extractor-images (the 60 raw files under
`arw cr2 nef orf rw2 srw raf pef dng`, `.txt` metadata dumps left out) is read with `read_raw` and developed
at full size on the numpy engine twice: `demosaic="directional"` and `demosaic="noise-aware"` with the new
defaults. A raw read directly carries no colour matrix (`develop` asks for a `.dcp`), so files without one get
the sRGB XYZ-to-RGB matrix as a stand-in: their colours are wrong, while the mosaic, white balance, demosaic
and noise reading are the file's own, and colour does not enter the blend. Per file: both times, peak process
memory, the model `frame_noise` read (sigma at 18% grey on the white-balanced plane, captured by wrapping the
function), EXIF ISO (tag 34855), and how far the two 16-bit outputs differ (PSNR of one against the other, and
the share of pixel values moved by over 1/255). Two files at a time on this container's 4 cores and 15 GB:
four at a time was killed by the kernel for memory (below), so the times are with one other develop running.

## Results

- **It runs on every reader.** 53 of 60 files develop; the 7 that do not fail in `read_raw` before any
  demosaic (four "Issue 247" NEFs with no TIFF header, a truncated RW2, two BigTIFF DNGs), the same files
  the earlier notes could not open. Of the 53, **52 have no NoiseProfile and every one took the frame-read
  model** (the report says `noise-aware`, the notes say "a noise model read from the frame"); 0 fell back to
  directional. The one DNG with a profile (LG Nexus 5X) used its profile and no frame read, as before.
  Layouts covered: all four Bayer phases (RGGB, BGGR, GRBG, GBRG) and two X-Trans frames (the Fujifilm X-E1 and
  FujiFilm EX-2 sample files, each with its own 6 x 6 phase).
- **What it reads rises with ISO, loosely.** On the 51 frames with an EXIF ISO, Spearman rank correlation
  of ISO with the read sigma is +0.28, and with the share of pixels the blend moved +0.34. By ISO group:

  | EXIF ISO | frames | sigma at 18% grey (x1e-3), median | pixels moved > 1/255, median | PSNR vs directional, median |
  |---|---|---|---|---|
  | 50-200 | 39 | 2.22 | 1.5% | 58.3 dB |
  | 250-640 | 3 | 2.47 | 1.0% | 57.3 dB |
  | 800-6400 | 9 | 5.61 | 23.1% | 47.6 dB |

  The loose correlation is expected: these are unrelated scenes from 50 bodies, sigma is on each file's own
  white-balanced scale, and some cameras denoise their raws. The ISO 6400 TG-4 frame reads 48.6e-3 and has
  70.5% of its values moved (PSNR 28.1 dB between the two outputs); at base ISO most frames move under 5%.
  So on clean frames the default changes little, and where the frame is noisy it does what the blend is for.
- **One unexplained row.** The Pentax K-1 Mark II at ISO 1600 reads sigma 2.54e-3 yet its two outputs are
  identical to 115 dB (nothing moved). Either its blocks all show more detail than that noise, or Pentax's
  raw is already smoothed; a reason was not looked for here.
- **Cost.** The frame read and the blend add a median 6.7 s per frame (max 21.8 s, a 36 MP NEF), 5.8x
  directional's time, about 0.49 s per megapixel. Peak memory for the process (both develops) is a median
  0.20 GB per megapixel, up to 6.4 GB on the 36 MP Nikon D810, D800E and K-1 II. That is why `auto` does not
  pick noise-aware: a default that takes 6x the time and 6 GB on a 36 MP file is a regression for a
  photographer culling a card. Cutting both is the next item.

The table of every row (ISO order) is in `noise-fallback-real-2026-11-17.out.txt`; rows in
`noise-fallback-real-2026-11-17.jsonl`.

## What changed

- `src/shootflow/raw_develop.py`: `DevelopSettings.noise_from_frame` defaults to `True`; with it `False` and no
  profile the note now names `--no-noise-from-frame`.
- `src/shootflow/cli.py`: `--noise-from-frame` is a `BooleanOptionalAction` defaulting on, so the old flag still
  parses and `--no-noise-from-frame` turns it off.
- `tests/test_demosaic_noise_aware.py`: the default path (no profile, frame-read model) and the opt-out path
  (directional, noted) both asserted; a profile file gives the same bytes with the flag on or off; the flag's
  parsing.

## Reproduce

    git clone --depth 1 --filter=blob:none --sparse https://github.com/drewnoakes/metadata-extractor-images.git mei
    (cd mei && git sparse-checkout set arw cr2 nef orf rw2 srw raf pef dng)
    (cd mei && find arw cr2 nef orf rw2 srw raf pef dng -type f ! -path '*metadata*' ! -name '*.txt') > all.txt
    (cd mei && tr '\n' '\0' < ../all.txt | PYTHONPATH=../src xargs -0 -P 2 -n 1 python ../tools/noise_fallback_real.py) > rows.jsonl
    PYTHONPATH=src python tools/noise_fallback_real.py --summary rows.jsonl

(numpy 2.5, Python 3.13; about 25 minutes at two files at a time.)
