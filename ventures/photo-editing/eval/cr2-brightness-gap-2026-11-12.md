# The CR2 "3-9% brighter than LibRaw" gap was the check, not the developer (2026-11-12)

## Why

`eval/cr2-five-bodies-2026-11-12.md` reported ShootFlow's CR2 renders 3-9% brighter than
LibRaw's in every channel on five Canon bodies, with the same matrix and white level, and
guessed the colour model (DNG's white balance through the profile against dcraw's camera-space
multipliers). `portfolio/flagships.yaml` made it the next item: "why CR2 renders come out 3-9%
brighter than LibRaw with the same matrix, checked on a known grey".

## What it was: three faults in `tools/cr2_develop_check.py`, none in ShootFlow

**1. LibRaw's `user_sat` is in black-subtracted units.** The tool passed the raw white level
(black included). LibRaw then scaled by 65535 / white instead of 65535 / (white - black), so
every LibRaw render was darker by white / (white - black). In linear light, ShootFlow over
LibRaw (median per channel, pixels neither render clips):

| body | black | white | predicted white / (white - black) | measured R, G, B with the old call | with `user_sat = white - black` |
| --- | --- | --- | --- | --- | --- |
| 350D | 257 | 4,095 | 1.067 | 1.073 1.048 1.058 | 1.005 0.982 0.992 |
| 600D | 2,048 | 16,383 | 1.143 | 1.148 1.139 1.142 | 1.004 0.997 0.999 |
| 70D | 2,048 | 16,383 | 1.143 | 1.154 1.106 1.073 | 1.009 0.967 0.938 |
| 7D | 2,048 | 12,649 | 1.193 | 1.192 1.194 1.193 | 0.999 1.000 1.000 |

The gain was flat across levels (600D red: 1.153, 1.143, 1.147, 1.159 in four brightness bands),
which is what a scale error looks like and a colour-model difference does not. The 7D, with the
lowest white level after its clip fix, had the largest gap, as predicted. In gamma-encoded 8-bit
values a 7-19% linear gain is the "3-9%" recorded.

**2. The 350D was compared on a different 2x2 grid.** ShootFlow's image area (SensorInfo) starts
at row 19; LibRaw's visible area at row 14. Half-size renders bin 2x2 blocks from those origins,
so one paired rows 19/20 where the other paired 20/21: the "same" half-size pixel held red, green
and blue from sensels a row apart. On the 350D's grey areas this showed as blue 4-5% low
(camera-space B/G 0.961 against LibRaw's 0.992) even though, over the whole frame, camera-space
values matched within 0.5%. The tool now moves the image area by one row or column when the
parities differ, turning the CFA pattern and the per-position black levels with it
(`align_half_phase`). The other four bodies already shared LibRaw's parity.

**3. The 70D was compared one pixel off.** Its image area starts 12 sensels (6 half-size
pixels) below and right of LibRaw's; the shift search reached 4 rows. The search now reaches 15
each way, scored on every 4th pixel.

## Render against LibRaw, after the fixes

Half size, `.dcp` from LibRaw's own matrix, `postprocess(use_camera_wb=True, no_auto_bright=True,
gamma=(2.4, 12.92), user_sat=white - black)`. "Through dcraw's matrix" re-renders ShootFlow's
output, inverted back to camera space, with dcraw's camera-to-sRGB matrix instead of the DNG
model's, on pixels ShootFlow does not clip; it separates the data from the colour model.

| body | as-shot white xy | median, 8-bit steps (before) | median now | 99th pct now | through dcraw's matrix: median / 99th |
| --- | --- | --- | --- | --- | --- |
| 350D | 0.351, 0.364 | 3.01 | 0.47 | 3.7 | 0.19 / 0.72 |
| 600D | 0.338, 0.343 | 5.63 | 0.18 | 1.4 | 0.05 / 0.91 |
| 70D | 0.356, 0.382 | 4.26 | 0.88 | 3.9 | 0.13 / 1.31 |
| 7D | 0.314, 0.326 | 5.40 | 0.07 | 1.1 | 0.06 / 1.02 |
| 5D Mark II | 0.318, 0.326 | 0.61 | 0.16 | 1.1 | 0.14 / 1.05 |

Two conclusions:

- **The CR2 reader and the developer's data path match LibRaw**: 0.05-0.19 steps median on all
  five bodies once the colour step is the same. There is no brightness error to fix.
- **What is left is the colour model, and it grows with distance from D65.** The 7D and 5D Mark
  II, shot near D65, differ by 0.07-0.16 steps. The 350D (about 4,800 K) and the 70D (about
  4,700 K and well on the green side of the daylight locus) differ by 0.47 and 0.88. Both models
  render the as-shot neutral as exactly neutral (checked: each matrix maps a balanced (1, 1, 1)
  to (1, 1, 1)); they differ on colours away from it, because DNG adapts the white to D50 in XYZ
  (Bradford) while dcraw scales camera channels and then applies a D65 matrix. On the 70D's
  colourful frame that leaves green 3% and blue 6% lower than LibRaw in linear light. Which one
  is closer to the scene needs a colour chart under that light; it stays the open item, and is
  not a reason to change ShootFlow's DNG-spec model.

The 7D's clipped-highlight check is unchanged (69% of clipped pixels render white).

## Tests

`tests/test_cr2.py`, 3 new (24 in all): the phase is left alone when parities match; an odd
row, column or both moves the area and turns the CFA pattern and black levels position by
position, leaving the original untouched; and the moved copy develops the same channel means as
the original. That last test fails if the pattern is moved without being turned (checked by
removing the turn).

## Reproduce

    python3 -m venv /tmp/v && /tmp/v/bin/pip install rawpy numpy
    curl -LO "https://raw.githubusercontent.com/drewnoakes/metadata-extractor-images/master/cr2/Canon%20EOS%20350D.CR2"
    curl -LO https://raw.githubusercontent.com/letmaik/rawpy/main/test/RAW_CANON_5DMARK2_PREPROD.CR2
    PYTHONPATH=src:tests /tmp/v/bin/python tools/cr2_develop_check.py "Canon EOS 350D.CR2"

The output now includes `phase_shift_sensels` and `linear_ratio_median` (ShootFlow over LibRaw
per channel in linear light).

## Not done

- A colour chart shot under tungsten or a green-tinted light, to say which colour model is
  closer away from D65.
- ColorData8-11 bodies, still no files reached.
