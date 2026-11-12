# Canon CR2 on five real bodies (2026-11-12)

## Why

The CR2 reader (`eval/cr2-direct-2026-11-12.md`) had been checked on one real file, a Canon
5D Mark II. `portfolio/flagships.yaml` listed "real CR2s from other Canon bodies (other
ColorData versions, the per-model white level)" as the next item. raw.pixls.us and
rawsamples.ch answer 403 from the build container. raw.githubusercontent.com answers, and the
public metadata-extractor-images collection (its README: "You are free to use these media
files however you wish") holds full-size CR2s from four other bodies. They are downloaded at
check time and not committed.

| file | body | bits | ColorData (entries, version) | sensor |
| --- | --- | --- | --- | --- |
| `cr2/Canon EOS 350D.CR2` | 350D (2005) | 12 | 582, ColorData1 | 3516 x 2328 |
| `cr2/Canon EOS 600D.CR2` | 600D | 14 | 1273, ColorData6 | 5344 x 3516 |
| `cr2/Canon EOS 70D.cr2` | 70D | 14 | 1313, ColorData7 | 5568 x 3708 |
| `cr2/Canon EOS 7D.cr2` | 7D | 14 | 1337, ColorData4 | 5360 x 3516 |
| rawpy `RAW_CANON_5DMARK2_PREPROD.CR2` | 5D Mark II | 14 | 1250, ColorData4 | 5792 x 3804 |

## What the reader got right unchanged

`tools/cr2_ljpeg_check.py`: 0 sensels different from LibRaw's `raw_image` on all five. The
SensorInfo image area is LibRaw's crop to the pixel on all five. Black levels per 2x2
position are within 2 of LibRaw's. The as-shot levels at index 0x19 (ColorData1) and 0x3F
(the rest) are exactly LibRaw's camera multipliers.

## Two failures, both fixed

**The 70D was refused** ("as-shot balance too close to neutral to tell red from blue"). Its
as-shot levels are red 1,993 and blue 1,964, so log(B/R) is -0.015, under the 0.15 the rule
needs. The green diagonal was clear: disagreement 0.005 against 0.662.

The fix is the uncompressed RGB thumbnail (IFD 2), used for one question only: which of the
two non-green positions is red. On the 12 x 8 grid the reader already uses, log(p/q) of the
two positions is correlated with the thumbnail's log(R/B), with the raw's mean black taken off
a 16-bit thumbnail.

| body | thumbnail | correlation (p first on the non-green diagonal) | as-shot log(B/R) | LibRaw's red |
| --- | --- | --- | --- | --- |
| 350D | 384 x 256, 8 bit (tagged compression 6) | -0.994 (q is red) | -0.342 | q |
| 600D | 668 x 432, 16 bit | -0.988 (q) | -0.362 | q |
| 70D | 464 x 309, 16 bit | +0.993 (p) | -0.015 | p |
| 7D | 670 x 432, 16 bit | -0.977 (q) | -0.551 | q |
| 5D Mark II | 362 x 234, 16 bit | -0.061 (unclear) | -0.587 | q |

The rule: a clear balance decides, as before. A thumbnail with |r| of at least 0.8 decides
when the balance cannot. A clear thumbnail that contradicts a clear balance is refused. On the
dim ISO 3200 5D Mark II frame the thumbnail says nothing (-0.06), and that does not matter
because the balance is clear. The 350D tags its plain 8-bit strip with compression 6; it is
read only when its size is exactly width x height x 3. The 70D now develops as RGGB, which is
LibRaw's phase at the image origin.

**The 7D's blown highlights rendered pink.** In the image area, its two green positions pile
13,618 and 12,240 sensels on 12,650 and 12,649 (6 to 23 on each value just below). The 14-bit
stream's top, 16,383, is never reached there. With white at 16,383 a clipped green sits at 77%
of full scale while red and blue go on rising, so clipped areas render a pinkish grey. New
rule: a 2x2 position whose maximum carries at least 64 sensels, 8 times the average of the 8
values below it, and lies more than a quarter of the range above black, is clipped there.
The lowest such maximum is the white level. Otherwise the stream's top stays.

`tools/cr2_develop_check.py` now reports, for any file whose white level comes from clipping,
the half-size pixels over a clipped sensel rendered both ways:

| 7D, 14,224 clipped half-size pixels | mean R, G, B | share white (every channel >= 0.97) | median max-min |
| --- | --- | --- | --- |
| white at 16,383 (before) | 0.938, 0.867, 0.867 | 0.0% | 0.080 |
| white at 12,649 (from the pile) | 0.998, 1.000, 0.981 | 68.6% | 0.015 |

LibRaw's per-model table gives 13,584 for this body. That is above the real clip in this
frame, so it would also leave these pixels short of white. The rule reads the file, so no
table is copied. The other four frames have no pile below full scale. The 350D's pile is at
4,095, its 12-bit top, so their white level is unchanged.

## Render against LibRaw, after the fixes

Half size, a `.dcp` built from LibRaw's own matrix for each body, LibRaw's
`postprocess(use_camera_wb=True, no_auto_bright=True, gamma=(2.4, 12.92), user_sat=<our white>)`:

| body | CFA (ours / LibRaw) | white (ours / LibRaw) | median, 8-bit steps | 99th pct | channel means ours / LibRaw |
| --- | --- | --- | --- | --- | --- |
| 350D | GBRG / GBRG | 4095 / 4095 | 3.01 | 15.5 | 0.386 0.386 0.309 / 0.373 0.377 0.300 |
| 600D | GBRG / GBRG | 16383 / 13584 | 5.63 | 10.1 | 0.324 0.271 0.260 / 0.303 0.255 0.244 |
| 70D | RGGB / RGGB | 16383 / 15303 | 4.26 | 16.0 | 0.301 0.224 0.166 / 0.281 0.212 0.161 |
| 7D | GBRG / GBRG | 12649 / 13584 | 5.40 | 17.9 | 0.374 0.365 0.342 / 0.345 0.335 0.314 |
| 5D Mark II | GBRG / GBRG | 16383 / 15600 | 0.61 | 3.9 | 0.068 0.075 0.157 / 0.066 0.072 0.152 |

**Correction (later on 2026-11-12):** the gap below was the check's fault, not ShootFlow's. The
tool passed LibRaw a white level with black included, where LibRaw expects it black-subtracted, and
the 350D and 70D were also compared on misaligned grids. Fixed, the medians are 0.07-0.88 steps,
and 0.05-0.19 through the same colour matrix: `eval/cr2-brightness-gap-2026-11-12.md`.

ShootFlow is 3-9% brighter than LibRaw in every channel on every body, with the same matrix
and white level. The difference grows with scene brightness: the 5D Mark II frame is dim,
which is why it showed 0.6 steps. The 7D's median rose from 3.6 to 5.4 steps with the new
white level, because both renders are scaled by 16,383/12,649 and the same relative gap now
spans more steps. This is not a reader fault: the sensor, levels, balance and phase all match.
The likely cause is the colour model (DNG's white balance through the profile against dcraw's
camera-space multipliers). It is recorded as the next item, to be checked on a known grey.

## Speed

Numpy present: read 0.27-0.72 s, half-size develop 0.4-1.2 s. Pure Python (no numpy): the 7D
reads in 4.0-4.5 s, of which the clip search is about 1.1 s (it piles here; a frame with no pile skips most of it). The values below the maximum are
counted only when a pile is possible.

## Tests

`tests/test_cr2.py`, 21 tests (12 before). New: the thumbnail decides all four phases under
a neutral balance, for 16-bit and 8-bit thumbnails. A grey thumbnail is refused as unclear. A
red/blue-swapped thumbnail against a clear balance is refused. A clear balance still decides
when the thumbnail agrees. The correlation threshold is tested directly. A sensor clipped at
9,000 gets white 9,000, with the numpy and pure-Python searches equal. No pile keeps 16,383.
A frame cut off at 1,500 (near black) is not read as clipped. Full suite: 678 passed, 4
skipped. ruff 0.15.8 and mypy 1.19.1 are clean.

## Reproduce

    python3 -m venv /tmp/v && /tmp/v/bin/pip install rawpy numpy
    curl -LO "https://raw.githubusercontent.com/drewnoakes/metadata-extractor-images/master/cr2/Canon%20EOS%207D.cr2"
    PYTHONPATH=src /tmp/v/bin/python tools/cr2_ljpeg_check.py "Canon EOS 7D.cr2"
    PYTHONPATH=src:tests /tmp/v/bin/python tools/cr2_develop_check.py "Canon EOS 7D.cr2"

## Not done

- ColorData8-11 bodies (5D Mark IV, 80D, 90D...): no files reached yet.
- A frame that is both clipped and neutral-balanced.
- The 3-9% brightness gap against LibRaw (above): resolved, a fault in the check
  (`eval/cr2-brightness-gap-2026-11-12.md`).
- The same collection's camera-written DNGs (DJI Phantom 4, LG Nexus 5X, Leica T, Pentax
  QS1) are uncompressed, not lossless JPEG. All four develop half size; none is compared with
  LibRaw yet.
