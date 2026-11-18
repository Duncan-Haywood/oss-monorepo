# A directional X-Trans demosaic, against known truth and LibRaw (2026-11-14)

## Why

Fujifilm RAFs have been read directly since this morning (`eval/fujifilm-raf-reader-2026-11-14.md`),
X-Trans included, but demosaiced bilinearly: each missing colour is the mean of that colour's sensels
in the 3x3 window. That is correct (flat fields stay flat) but soft, and across a sharp edge it mixes
both sides, which shows as coloured fringes. X-Trans makes this worse than Bayer: its red and blue
sensels are irregularly spaced, so the 3x3 mean of red or blue is taken over 1 to 3 sensels in
different places at each of the 36 phases. The flagship row's buildable item: a directional
(Markesteijn-style) X-Trans demosaic, measured against LibRaw's on the X-E1 and X-E2 RAFs.

## What was built

`src/shootflow/xtrans_demosaic.py` (numpy), written from the published idea rather than from dcraw's
or LibRaw's source (dcraw's licence terms and LibRaw's LGPL/CDDL are not MIT):

1. Each colour's 3x3 mean everywhere, as a starting estimate.
2. For each of four directions (across, down, both diagonals) and each red or blue sensel, the
   nearest green on each side along that line (1 to 3 sensels away; the distance depends only on the
   phase, worked out from the 6x6 pattern given, so any rotation or phase works). Green is
   interpolated along the line as a colour difference (green minus the sensel's own colour, the latter
   from step 1 at the green sites), then the sensel's own value is added back.
3. Red and blue for each direction from 3x3 means of red minus green and blue minus green.
4. Each direction's picture goes to CIE L\*a\*b\* (camera RGB treated as linear sRGB: the choice
   needs a perceptual scale, not exact colour). A pixel's homogeneity in a direction counts its 8
   neighbours inside its own lightness and colour tolerances (the smallest step along its best
   direction, as in adaptive homogeneity-directed demosaicing), summed over 3x3. The pixel takes the
   mean of the directions scoring within 1/8 of the best.
5. One 3x3 median of R - G and B - G, rebuilt around each sensel's own value.

Each sensel keeps its own value exactly. The frame is padded by whole 6x6 periods, each padded
sensel copied from the nearest same-phase sensel inside, so the edge sees the true layout (a mirror
pad breaks the phase and put wrong colours on the outer 2-3 pixels; the flat-field test caught it).
Frames run in 192-row bands with 24 rows of overlap a side per pass, more than the steps' reach, so
banded output equals one-piece output exactly (tested); bands run on `SHOOTFLOW_THREADS` threads
(default up to 4). Working precision is float32: every score below is unchanged to two decimals from
the float64 version, at 2.5x the speed.

In the developer: `DevelopSettings.demosaic` and `shootflow develop --demosaic auto|bilinear|directional`.
`auto` (the default) is directional on X-Trans when the numpy engine runs, full and half size, and
bilinear otherwise; the report says which ran (`DevelopReport.demosaic`). The pure-Python engine
keeps bilinear and says so in the notes; asking it for `directional` is refused, as is
`directional` on a Bayer file (not measured there). The engines' byte-for-byte agreement still holds
for `--demosaic bilinear`, which the agreement tests now name.

## Method

`PYTHONPATH=src python tools/xtrans_demosaic_check.py raf/*.raf` with rawpy 0.28 (LibRaw 0.22.2) and
numpy 2.4 in a venv; raw rows in `eval/xtrans-directional-demosaic-2026-11-14.jsonl`. Files: the
X-E1 and X-E2 RAFs from the public metadata-extractor-images collection. The method was tuned on
the X-E1 and the synthetic sheet only (passes, median, a line-weighted red/blue variant); the X-E2 was
looked at once, with the final settings.

**Known truth.** A truth picture is mosaicked with the RAF's own X-Trans layout, then demosaiced by
ours (bilinear, directional) and by LibRaw itself: the mosaic is written into the RAF's sensor data
in memory (`raw_image_visible`) and `postprocess` runs LibRaw's linear interpolation (quality 0) or
its X-Trans method, Markesteijn's, with one pass (quality 1) or three (quality 3). LibRaw's output is
matched to the truth by one least-squares gain per channel (its 16-bit scaling differs); ours is
scored as it comes. Two truths per file:

- the frame itself, rendered by LibRaw's three-pass method and binned 4x4: real edges, textures and
  colours with almost no demosaic error or noise left in them. (Its source is LibRaw's three-pass
  render, which may favour that method a little; binning by 4 removes most of its signature.)
- a synthetic sheet: a zone plate up to the Nyquist frequency, a slanted red and cyan edge, and three
  coloured discs on grey. No method has an advantage here.

Scores on the interior (12 px border dropped): colour PSNR (all three channels, peak 1), luminance
PSNR, and the chroma error (R - G and B - G against the truth's; mean and 99th percentile, in
thousandths of full scale): the false colour a viewer sees.

## Results

Default settings (one pass, one median):

| truth | method | colour PSNR dB | luma PSNR dB | chroma err mean | chroma err p99 |
|---|---|---|---|---|---|
| X-E1 frame, binned | ours bilinear | 34.83 | 39.91 | 18.7 | 116.2 |
| | **ours directional** | **36.60** | 40.54 | 15.8 | 85.1 |
| | LibRaw linear | 35.31 | 40.54 | 17.3 | 112.1 |
| | LibRaw Markesteijn 1 pass | 37.48 | 41.99 | 14.6 | 81.4 |
| | LibRaw Markesteijn 3 passes | 39.28 | 44.65 | 12.6 | 65.4 |
| X-E2 frame, binned (held out) | ours bilinear | 41.95 | 45.56 | 7.5 | 53.9 |
| | **ours directional** | **47.88** | 51.47 | 4.7 | 24.3 |
| | LibRaw linear | 42.47 | 46.31 | 7.0 | 51.6 |
| | LibRaw Markesteijn 1 pass | 46.45 | 51.09 | 5.4 | 31.9 |
| | LibRaw Markesteijn 3 passes | 49.89 | 53.91 | 4.1 | 16.7 |
| synthetic sheet | ours bilinear | 20.25 | 23.83 | 89.9 | 539.1 |
| | **ours directional** | **33.51** | 36.92 | 18.4 | 133.6 |
| | LibRaw linear | 20.59 | 24.53 | 89.7 | 485.2 |
| | LibRaw Markesteijn 1 pass | 25.89 | 31.66 | 49.4 | 338.6 |
| | LibRaw Markesteijn 3 passes | 39.37 | 42.50 | 5.9 | 68.4 |

(The sheet's rows on the X-E2's layout are within 0.07 dB of these.)

- Against bilinear, the directional demosaic gains 1.8 dB on the X-E1 frame, 5.9 dB on the held-out
  X-E2 frame and 13.3 dB on the sheet, and cuts the 99th-percentile false colour by 27%, 55% and 75%.
- It beats LibRaw's one-pass Markesteijn on the X-E2 frame (47.9 against 46.5 dB) and on the sheet
  (33.5 against 25.9), and trails it on the X-E1 frame (36.6 against 37.5).
- LibRaw's three-pass Markesteijn is better than ours on all three, by 2.7 dB (X-E1), 2.0 dB (X-E2)
  and 5.9 dB (sheet). It is also faster: 1.7 s for a 16 MP frame in C against our 7-8.5 s in numpy.
- **Half size** (the developer's X-Trans half size demosaics at full size and averages 2x2 blocks):
  ours directional against ours bilinear, scored against the truth's 2x2 averages: X-E1 40.07 against
  38.93 dB, X-E2 52.14 against 46.46 dB, sheet 37.36 against 23.97 dB. I had expected the averaging
  to hide most of the difference and planned to keep bilinear for half size; it does not, so `auto`
  is directional at both sizes.

What did not work (tuned on the X-E1 and the sheet):

- **More passes** (each pass takes its colour differences from the previous pass's picture instead
  of the 3x3 means): three passes lift the sheet to 35.8 dB but drop the X-E1 frame to 34.5 dB, below
  bilinear's 34.8. On the X-E2, three passes would have helped (48.6 dB), so the option stays
  (`directional(..., passes=3)`) but is not the default.
- **Red and blue along the line** (the colour differences weighted by distance from the direction's
  line over 5x5, instead of the 3x3 mean): no better on the X-E1 frame (36.60 either way with
  sigma 1), 1.3 dB better on the sheet with the median; dropped as not worth the code.
- Without the median clean-up the X-E1 frame loses 0.2 dB and the sheet 2.8 dB.

**Real frames, against LibRaw.** On the two frames' real sensor data (camera white balance), each of
ours against LibRaw's three-pass render (one gain per channel): colour PSNR 45.53 (bilinear) and 45.72
(directional) on the X-E1, 54.09 and 54.41 on the X-E2; chroma p99 28.0 and 23.5, 9.8 and 8.3. So the
directional output's colour is nearer LibRaw's, but its luminance is not: luma PSNR 51.2 to 47.4 on
the X-E1, 59.3 to 56.3 on the X-E2. This is a closeness check, not a quality score (LibRaw's render
is not the truth), but the luma gap is unexplained: the directional demosaic keeps more of the
sensor's fine detail and noise than either a 3x3 mean or LibRaw's three passes, or its choice is
noisier than theirs on real noise, which the noise-free known-truth tests do not see. A noisy known
truth (the binned frame plus measured sensor noise) would tell which.

## Speed and memory

`shootflow develop`'s engine on four cores of this container, 16 MP X-Trans frames, end to end
(read, demosaic, colour, encode):

| frame | bilinear | directional (4 threads) | directional (1 thread) |
|---|---|---|---|
| X-E1 | 0.90 s, 1.0 GB | 8.5 s, 2.1 GB | 26.6 s, 1.6 GB |
| X-E2 | 0.93 s, 1.0 GB | 6.9 s, 2.0 GB | |

Before profiling it took 21 s and 3.5 GB: a full-frame `np.pad` per shifted view, an `np.where` per
phase combination, non-separable 3x3 sums, and `_lab` computed three times per direction. The fixes
(pad once and slice, gather by per-pixel offsets, separable sums, float32, a 19-exchange median-of-9
network for `np.median`) keep the scores. A C version (the repository already builds an optional C
reader, `ljpeg_native`) is the way to LibRaw's speed.

## Tests

`tests/test_xtrans_demosaic.py` (9): each sensel keeps its value; a flat field stays flat; on a
slanted colour edge and a fine grating the directional demosaic has under 60% of bilinear's false
colour and a lower error; banded output equals one-piece output exactly (one and three passes, one
to three threads); any phase of the layout works; the developer picks directional on X-Trans with
numpy (full and half size) and reports it, falls back to bilinear with a note on the pure engine,
and refuses `directional` on the pure engine, on Bayer, and an unknown name. `tests/test_raf.py`'s
engine-agreement test now names `demosaic="bilinear"`.

## Not done

(2026-11-15: the clamp and gradient choice in `eval/xtrans-clamp-gradient-2026-11-15.md` close most of
the first item: 0.5-0.7 dB short on the real frames, 4.4 dB on the sheet.)

- LibRaw's three-pass Markesteijn is still 2-6 dB better. Our extra passes, as built, do not close
  the gap on real frames; what LibRaw's later passes refine (and how) is the next thing to read about.
- The luma gap on real sensor data (above) needs a noisy known truth.
- No C path: 7-8.5 s a frame on four cores.
- Bayer files keep bilinear; the same code runs on a 2x2 pattern but was not measured there.
