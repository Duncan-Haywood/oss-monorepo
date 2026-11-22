# The optical-black area as a read-noise floor (2026-11-22)

NEXT.md, "From the noise-aware demosaic": "A noise floor for frames with no smooth region (the guard reads low
there): the optical-black area." Before building a floor into `--noise-from-frame`, this measures the two things
it rests on: how many real raws keep masked sensels a reader can use, and whether the frame's own read term
actually falls short of what those sensels show.

## Method

`tools/optical_black_floor.py` (tests: `tests/test_optical_black_floor.py`, 5). Every raw in the public
`drewnoakes/metadata-extractor-images` set (sparse checkout of `arw cr2 dng nef orf pef raf rw2 srw`; the 57 non-RAF files, as the script takes 2x2 Bayer only, same clone as eval/noise-pca-mpcw1-2026-11-22.md), read through LibRaw (rawpy 0.28) so every
format reads the same way:

- **Masked sigma**: all four margins outside LibRaw's visible area, each at least 16 sensels deep, 4 skipped at
  each edge. Columns of one value (padding) and columns whose median is over 0.5% of white - black from the
  black level (lit or ramped edges LibRaw trims by table) are dropped. Per CFA colour, each line's mean is
  removed (line banding is pattern noise, not per-sensel read noise; residuals scaled by sqrt(n / (n - 1)) for
  the mean's lost degree of freedom), hot sensels clipped at 6 robust sigmas, and the rest's standard
  deviation taken. A standard deviation, not a MAD: on integer sensels at 1-3 DN the MAD quantises (a true
  sigma of 2.0 read 1.48 in the test). The four colours' sigmas are averaged and divided by white - black.
  At least 2,000 sensels per colour; a margin under 0.5 DN is called zeroed or filled, not read noise.
- **Frame read term**: `noise_pca.estimate_noise_pca` (its defaults: 6 x 6 mosaic patches, Chen's level, line
  fit) on the visible mosaic normalised as (raw - black) / (white - black); the line's intercept is the read
  variance, which `fit_line` clamps to 0 when the fit goes negative.
- **What a floor would change**: sigma at 1% of white (deep shadow) under the frame model, and with its read
  term raised to the masked variance where lower.

Raw rows: `optical-black-floor-2026-11-22.jsonl`; summary: `optical-black-floor-2026-11-22.txt`.

## Results

Coverage is the first finding. **8 of 57 files** give a usable masked reading: Canon (600D, 70D, 7D, 350D),
Pentax K-1 Mark II, Samsung NX3000, an LG Nexus 5X DNG and an Olympus E-P3. The other 49:

| reason | files |
|---|---:|
| no margin passes: LibRaw's visible area starts at (0, 0) and its trimmed right/bottom columns are too narrow, padding, or off black (all 6 Sony ARWs, all 7 Nikon NEFs read, all 4 Panasonic RW2s read, 17 of 18 Olympus/OM ORFs, 2 Samsung SRWs, 4 DJI and Leica DNGs) | 40 |
| LibRaw cannot read the file (four `Issue 247` NEFs, two BigTIFF test DNGs, `Issue 419.rw2`) | 7 |
| masked margin under 0.5 DN: zeroed or filled, not a read (Pentax QS1 DNG 0.36 DN, Samsung NX20 0.10 DN) | 2 |

(The Nikon count is LibRaw's trim, not the sensor: `nef.masked_margins` finds masked right-edge columns on five
of seven Nikon bodies, README "The edge columns that hold no picture", but on these files they fail the
black-level check against LibRaw's black.)

On the 8 that read:

| file | masked sigma (DN) | masked sigma x1000 | frame read sigma x1000 | frame / masked | sigma at 1% of white, floored / frame |
|---|---:|---:|---:|---:|---:|
| Canon EOS 600D.CR2 | 6.85 | 0.594 | 0.000 | 0.00 | 1.16x |
| LG Nexus 5X.dng | 1.75 | 1.806 | 0.000 | 0.00 | 1.54x |
| Pentax K-1 Mark II.pef | 29.16 | 1.898 | 0.000 | 0.00 | 2.34x |
| Samsung NX3000.srw | 1.66 | 0.406 | 0.000 | 0.00 | 1.08x |
| Canon EOS 70D.cr2 | 7.54 | 0.569 | 0.272 | 0.48 | 1.14x |
| Canon EOS 7D.cr2 | 4.90 | 0.424 | 0.551 | 1.30 | 1.00x |
| Canon EOS 350D.CR2 | 2.82 | 0.736 | 2.497 | 3.39 | 1.00x |
| Olympus PEN E-P3.orf | 2.86 | 0.709 | 4.188 | 5.91 | 1.00x |

- The frame line's read term is **clamped to 0 on 4 of 8** and under half the masked sigma on 5 of 8: the
  intercept, extrapolated from bins well above black, is not a read-noise measurement. On those 5 a floor
  raises the deep-shadow sigma by 8% to 134% (median of all 8: 1.11x).
- On the other 3 the frame reads **more** than the masked sensels (1.3x to 5.9x). The masked area cannot see
  what the picture area adds (fixed-pattern noise under light, residual scene texture in the darkest bins), so
  a floor never lowers a model; it only raises a read term that came out under the masked one.
- The K-1 Mark II (ISO 1600, 30 s) has the largest gap: 29 DN of masked read noise, a read term of 0. This is
  the file whose clean-reference reading eval/noise-pca-mpcws-noisy-truth-2026-11-22.md could not settle (a
  green-pair truth reading failed its validity tests). Its masked sensels say the sensor's read noise is high
  on this frame by a measure the scene cannot touch.

## What this does and does not show

It shows the frame model understates deep-shadow noise on most of the bodies that keep masked sensels, and by
how much. It does **not** score the demosaic: the noise-aware evals add synthetic noise to clean reference
tiles, which have no masked area, so a floor there changes nothing. An understated model only moves the blend
toward directional (`tools/noise_estimator_accuracy.py`: "under 1 only moves toward directional"), so the expected
gain is in deep shadows of high-ISO frames, and only a real dark-region comparison can measure it.

Not shipped into `develop`: with 8 of 57 bodies covered through LibRaw and no score, a floor in the default path
is not earned yet.

## Next

1. Read the masked margins through shootflow's own readers (they set ActiveArea from SensorInfo, IAD1 and
   `nef.masked_margins`), which should cover the Nikon bodies LibRaw trims; the same script then reports them.
2. Score the floor on a real low/high-ISO pair of one static scene (NEXT.md already wants one): the floored and
   unfloored blends against the low-ISO frame, deep-shadow blocks only.
3. As a noisy-truth judge for the selection tests: a clean reference whose masked sigma, carried to its binned
   scale, is not well under the added noise is not clean. The K-1 II's 29 DN is the case to try it on.
