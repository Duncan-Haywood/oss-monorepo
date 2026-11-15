# A directional demosaic for Bayer files (2026-11-15)

## Why

Every Bayer raw file the developer reads (DNG, CR2, CR3, NEF, ARW, ORF, RW2, SRW, PEF, the GFX's
RAF: nearly every camera made) was demosaiced bilinearly: each missing colour the average of its
3x3 neighbours. That is soft, and across any sharp line it mixes both sides, which shows as zipper
patterns and false colour. The X-Trans work of 2026-11-14 and 2026-11-15 ended with "Bayer, still
bilinear" in its open list. This session's first pick (Panasonic RW2 RawFormat 8) could not be
built: raw.pixls.us, the only source of GH6-era files, was refused by this session's network
proxy (`connect_rejected`, 2026-11-15), and the GitHub sample set holds no RawFormat 8 file.

## What was built

`src/shootflow/bayer_demosaic.py` (numpy), the repository's own code from published ideas:

1. **Row and column greens** at each red or blue sensel (Hamilton and Adams, 1997): the two
   neighbouring greens' mean plus a quarter of the sensel's own second difference.
2. **Which way the edge runs**, by the colour-difference test of Menon, Andriani and Calvagno
   (2007): green minus red-or-blue is formed along each row and column at every sensel; its
   sensel-to-sensel change, summed over a 5x5 window, is small along an edge and large across one.
   The two greens are blended with weights `(D_other / (D_h + D_v))^2`.
3. **Red and blue** as colour differences from green: at the opposite colour's sensels from the
   four diagonals, each weighted by how smooth the raw is along it; at green sensels from the four
   nearest (two real, two just filled), weighted by step 2's row and column weights.
4. Optional: a 3x3 median of R - G and B - G (`median_passes=1`; off by default, see below).

Every sensel keeps its own value. Bands of 512 rows run on a thread pool; neither the band height nor
the thread count changes a bit (tested). `raw_develop`'s `demosaic="auto"` now picks it for Bayer
files whenever the numpy engine runs, at full size (Bayer half size bins each 2x2 block and
demosaics nothing, unchanged). `--demosaic bilinear` keeps the old method, byte-identical on both
engines.

## How it was checked

`tools/bayer_demosaic_check.py`, the Bayer twin of `tools/xtrans_demosaic_check.py` (same scores,
same synthetic sheet, same way of running LibRaw on a mosaic of our choosing: the mosaic is written
into the file's visible sensor data in memory and LibRaw's own method runs on it). rawpy 0.25
(LibRaw 0.22.2), numpy. Truths:

- each file's own frame rendered by LibRaw (AHD) and **binned 4 x 4**: real edges, textures and
  colours, with demosaic error and noise binned away, then mosaicked with the file's own Bayer phase;
- the **synthetic sheet**: a zone plate up to Nyquist, coloured discs and a slanted colour edge.

Scores on the interior (12-sensel border dropped): colour PSNR (peak 1), luma PSNR, and the
99th-percentile chroma error (R-G and B-G against the truth's, thousandths of full scale), which is
the false colour a viewer sees. LibRaw's output is matched to the truth by one gain per channel;
ours is scored as it comes. Noise: Poisson-Gaussian, SNR 60 and 25 at 18% grey, scored against
the clean truth (`--noise-snr`; LibRaw rows at SNR 25 only).

Files, from drewnoakes/metadata-extractor-images (not committed): **tuning** on the Canon EOS 70D
(`cr2/Canon EOS 70D.cr2`), Nikon D810 (`nef/Nikon D810.nef`) and the sheet; **held out**, run once
with the final settings: Sony A7 III (`arw/Sony ILCE-7M3 (A7M3).arw`), Olympus E-M10
(`orf/Olympus E-M10.orf`), Pentax K-1 Mark II (`pef/Pentax K-1 Mark II.pef`).

Commands (from `ventures/photo-editing`):

    PYTHONPATH=src:tools python tools/bayer_demosaic_check.py <5 files> \
        --variant bilinear --variant default --variant median --variant simple-rb \
        --noise-snr 60 --noise-snr 25 --no-libraw          # ours, final code
    PYTHONPATH=src:tools python tools/bayer_demosaic_check.py <5 files> \
        --variant bilinear --variant default --variant median --noise-snr 25   # with LibRaw

Raw rows: `eval/bayer-directional-demosaic-2026-11-15.jsonl` (ours from the first run, LibRaw's
from the second, marked `"run"`; our rows in the second run, made before a box-sum rewrite that
changes no interior value, agree with the first to 0.01 dB).

## Results

Colour PSNR (dB) / 99th-percentile false colour, noise-free:

| truth | ours bilinear | **ours directional** | + median | LibRaw VNG | PPG | AHD | DCB | DHT | AAHD |
|---|---|---|---|---|---|---|---|---|---|
| 70D binned (tuning) | 44.31 / 33 | **47.90 / 19** | 47.47 / 20 | 47.11 / 22 | 47.32 / 21 | 47.38 / 21 | 47.14 / 22 | 46.81 / 22 | 47.46 / 20 |
| D810 binned (tuning) | 52.36 / 15 | **57.50 / 8** | 57.64 / 8 | 56.26 / 10 | 55.29 / 11 | 55.69 / 10 | 54.92 / 11 | 55.08 / 11 | 56.36 / 9 |
| sheet (tuning) | 21.72 / 368 | **35.59 / 119** | 37.51 / 74 | 25.86 / 327 | 32.04 / 214 | 32.89 / 165 | 29.60 / 218 | 31.68 / 213 | 34.74 / 136 |
| A7 III binned (held out) | 35.69 / 70 | **35.94 / 64** | 35.45 / 65 | 36.01 / 65 | 35.71 / 68 | 35.82 / 66 | 35.89 / 67 | 35.51 / 66 | 35.53 / 65 |
| E-M10 binned (held out) | 30.40 / 208 | **42.67 / 46** | 43.32 / 41 | 33.87 / 156 | 38.52 / 74 | 42.12 / 48 | 39.48 / 66 | 40.12 / 68 | 42.62 / 45 |
| K-1 II binned (held out) | 27.54 / 177 | **29.16 / 139** | 28.89 / 139 | 28.99 / 145 | 28.22 / 155 | 28.43 / 151 | 28.14 / 156 | 28.56 / 147 | 28.46 / 146 |

- Against bilinear: +0.25 to +14 dB colour PSNR on every truth; 99th-percentile false colour down
  9-78% (A7 III 9%, K-1 II 22%, 70D 41%, D810 47%, E-M10 78%, sheet 68%).
- Against LibRaw's seven Bayer methods: the highest colour PSNR on five of the six truths, second
  on the A7 III (0.07 dB behind VNG); the lowest 99th-percentile false colour on five of six (the
  E-M10: AAHD 45 against our 46).
- **Luma is not uniformly better.** On the two held-out frames with the finest texture (A7 III
  and K-1 II, the latter with no anti-aliasing filter; every method scores low on them) luma PSNR
  is 40.64 against bilinear's 41.63 and DCB's 41.72 (A7 III) and 34.03 against VNG's 34.80 (K-1 II).
  The gain there is colour, not sharpness.
- The binned truth comes from LibRaw's AHD render, binned 4 x 4. Binning removes nearly all of
  AHD's own error, and the scores do not favour AHD (it ranks third to fifth), so this does not
  look like a bias toward LibRaw's method, but it is a caveat.

**With noise (SNR 25, colour PSNR / p99):** ours 41.91 / 26 (70D), 44.94 / 17 (D810), 34.55 / 66 (A7
III), 40.28 / 48 (E-M10), 28.79 / 140 (K-1 II), 34.26 / 120 (sheet). Bilinear has the higher colour
PSNR on the D810 (45.68) and A7 III (34.71) at this noise level, because its 3x3 average also
smooths noise, but leaves 1.2-1.9x the false colour (32 and 80). Among LibRaw's methods, VNG's
colour PSNR is 0.02-0.20 dB above ours on the 70D, D810 and A7 III and below ours on the other
three; every LibRaw method leaves more false colour than ours on five of the six noisy truths (the
E-M10: AAHD 47.5 against our 47.6).

**The median, measured and left off.** One 3x3 median pass gains 1.3-1.9 dB on the sheet and
0.14 and 0.65 dB on the D810 and E-M10 noise-free, but loses 0.27-0.49 dB on the 70D, A7 III and
K-1 II and loses on 8 of the 10 noisy real-frame truths (SNR 60 and 25) (it rebuilds green from each sensel's own noisy
value). The sheet's zone plate rewards it most; real frames decide the default, as in the X-Trans
note. `directional(..., median_passes=1)` keeps it available.

**Plain red and blue (`rb="simple"`):** unweighted averages instead of the weighted ones; 0.00-0.37
dB lower on the real frames, 0.82 dB worse on the sheet, and about 40% faster. Not the default.

**Real sensor data**, our output against LibRaw's AHD render of the same frame (closeness, not
quality; colour / luma PSNR): ours directional is nearer LibRaw's AHD than bilinear is on all five
(70D 58.17 / 60.36 against 55.91 / 59.59; D810 60.26 / 62.24 against 56.91 / 60.60; A7 III 49.71 /
51.73 against 47.62 / 51.35; E-M10 57.65 / 59.82 against 49.42 / 53.30; K-1 II 57.00 / 59.25 against
53.67 / 57.64).

**Speed**, a real 24 MP A7 III frame (6024 x 4024), four cores, idle machine, best of two:
bilinear 0.58 s (1.76 s on one thread), directional 1.83 s (5.71 s on one thread), `rb="simple"`
1.05 s; LibRaw's AHD `postprocess` 1.04 s (single-threaded C, including its colour steps).

## Tests

`tests/test_bayer_demosaic.py` (9 tests): own values kept on all four Bayer phases; flat fields
flat; on an edge and a grating, every phase at least 6 dB better than bilinear; bands and threads
equal one piece bit for bit; tiny and odd sizes; bad patterns refused; the developer's auto picks it
on Bayer with numpy and equals an explicit `demosaic="directional"`; Bayer half size unchanged; the
Python engine falls back to bilinear. Engine-equivalence tests across the suite (numpy against the
pure engine, byte for byte) now pin `demosaic="bilinear"`, the method both engines share.

## Open

- Luma on fine, aliased texture (A7 III, K-1 II): trails bilinear, DCB and VNG by 0.8-1 dB. Mostly closed by a
  3/16 Laplacian weight (A7 III 0.08 dB behind bilinear, K-1 II 0.17 behind VNG):
  `eval/bayer-laplace-weight-2026-11-15.md`.
- Noise: at SNR 25 a plain average has the higher colour PSNR on two frames; a demosaic that
  denoises its colour differences (or a real low/high-ISO pair as a noisy truth) is the next step.
- The sheet: 1.9 dB more is available from a median that real frames do not want.
- A C path (1.8 s against LibRaw's 1.0 s for 24 MP).
