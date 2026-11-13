# Lensfun vignetting against the compiled liblensfun 0.3.4 (2026-11-13)

Follow-up to `eval/lensfun-vignetting-2026-11-13.md`, whose "Not checked" list named this:
the vignetting port had been compared only with lensfun's formula written out again from its source,
by the same reader. `eval/lensfun-released-check-2026-11-13.md` ran the compiled library for
distortion and found an SSE bug in it; this does the same for vignetting.

## How

lensfunpy 1.18.0 (`pip install lensfunpy`, MIT) bundles **liblensfun 0.3.4**, lensfun's latest release,
and that release's database. `tools/lensfun_vignetting_released_check.py` takes every lens there with
a `pa` calibration that `lens_profiles.load_db` reads from the same files and finds by the same name
(474 lenses; 171 entries are skipped because the name maps to more than one of our lenses, the same
rule as the distortion check). For each it tries:

- every calibration point (focal length, f-number, distance) as is;
- the geometric midpoint between each pair of f-numbers calibrated at one focal length and distance;
- the midpoint between neighbouring calibrated focal lengths at one f-number and distance;

each twice: a 3:2 frame at the calibration's crop factor, and a 4:3 frame at 1.5 times it. That is
**97,382 cases**, 56,484 of them interpolated. Each case runs
`Modifier.apply_color_modification` (vignetting only) on an 800 x 533 or 800 x 600 float32 image of
ones, so every pixel comes back as lensfun's own gain, and compares 7 full rows (top, bottom and five
between). 6 min 27 s on one core.

## One identity

Read from tag v0.3.4 (`modifier.cpp` constructor, `mod-color.cpp` `AddColorCallbackVignetting`,
`ApplyColorModification`, `ModifyColor_DeVignetting_PA`), fetched 2026-11-13: the release measures the
`pa` radius as `r_px * 2 calib crop / (crop * hypot(w - 1, h - 1))` (its `NormScale` with
`AspectRatioCorrection` divided back out), centred at `((w - 1) / 2, (h - 1) / 2)`. Lensfun's master
branch, which `lens_profiles` follows, uses `hypot(w, h)` (master `modifier.cpp` line 79,
`hypot(Width + 1.0, Height + 1.0)` with `Width = width - 1`): the sensor's diagonal from pixel edge to
pixel edge, which is what a crop factor describes. Interpolation (`InterpolateVignetting`, inverse
distance weighting, power 3.5) is the same code in both. So the release's gain is ours with the
scale multiplied by `hypot(w, h) / hypot(w - 1, h - 1)`, exactly; `tests/test_lensfun_vignetting_released.py`
writes v0.3.4's pipeline out step by step and checks the identity to 12 places on four frame shapes.

## Results

| Gap (relative, of the gain) | median | 90th | 99th | largest |
|---|---|---|---|---|
| **Port**: our terms and units (in 0.3.4's pixel unit, float64) vs liblensfun 0.3.4 | 0.00012% | 0.0012% | 0.0034% | 0.32% |
| Master's pixel unit vs the release's, at the corner, 800 px frame | 0.056% | 0.31% | 0.86% | 46% |
| The same, 6000 px frame | 0.0075% | 0.041% | 0.12% | 10% |
| The FixVignetteRadial we ship vs liblensfun 0.3.4, 800 px (one case in ten, 9,715) | 0.057% | 0.36% | 1.2% | 15% |
| of which the polynomial fit's own error (vs master's `1 / c`) | 0.00015% | 0.053% | 0.36% | 9.1% |

- **The port is right.** Lensfun 0.3.4 and our interpolation and units agree to a median 1.2e-6. No case
  where lensfun corrected and we did not, or the other way round. The tail is float32: lensfun keeps
  `r^2` as a running sum along each row (`r2 += 2 ns x + ns^2`) in single precision, and the relative
  error of `1 / c` grows with the gain. Grouped by lensfun's corner gain, the 99th percentile of the gap
  is 0.002% below 2x, 0.008% from 2x to 5x, 0.05% from 5x to 20x and 0.32% above 20x (28 cases, up to a
  93x corner gain on the RX100 VI at 10.38 mm and f/7.5). That loop re-run here in float32 matches
  liblensfun to 1.6e-6 on 400 rows, so the tail is lensfun's rounding, not a formula gap.
- **Near-singular calibrations.** 133 cases on 10 lenses (41 on the Canon EF 8-15mm fisheye) have
  pixels where `c` is under 0.01 or negative: lensfun's gain there passes 100 or flips sign. Where
  `c < -0.01` lensfun 0.3.4 returns 0 (it clamps the negative pixel), at every such pixel; between
  -0.01 and 0.01 its float32 rounding decides the pixel (one SX220 HS case: 5,809 against an exact
  5,000). `build_vignette` refuses all 133, so ShootFlow leaves those corners alone with a note.
- **The release and master disagree, and that is not ours to fix.** The pixel-unit change alone moves the
  corner gain by a median 0.056% at 800 px and 0.0075% at 6000 px (it shrinks as `1 / width`), but on
  steep calibrations it is large: the 99th percentile is 0.86% at 800 px, and the RX100 VI case above
  differs by 46% at 800 px and 10% at 6000 px. A darktable or RawTherapee built on the 0.3 release and
  one built on master will brighten the same corner differently by that much. We keep master's unit.
- **What a user of the release would see change.** The shipped opcode is within 1.2% of liblensfun 0.3.4
  at the 99th percentile on an 800 px frame. The largest gap, 15.3% (PowerShot G1X Mark II at 22.8 mm,
  f/4.18, a 4.97x corner), is 9.1% of fit error (under the 10% refusal bound) plus 4.6% of pixel unit.

## Checked

- `tests/test_lensfun_vignetting_released.py`, 6 tests (5 run without lensfunpy given numpy; all skip
  without numpy, as CI's bare `python3` has neither): the 0.3.4 pipeline written out against
  `released_scale` (12 places, four frames including portrait and a 7 x 5 frame), master's unit visibly
  different at the corner, the float32 loop against float64, the vectorised opcode gain against
  `dng_opcodes.vignette_gain`, the case list (both kinds of midpoint), and with lensfunpy the real
  library on the Canon EF 100-200mm f/4.5A at three rows to 1e-5.
- Seeded faults in the tool, each run against the 6 tests, all caught: the pixel-unit factor dropped
  (2 fail), the centre at `w / 2` (3), the float32 loop's `ns^2` step dropped (1), focal midpoints
  replaced by the calibrated focal (1).

## Not checked

- A real frame of an even surface shot wide open (still the first open item for vignetting).
- The SSE path (`ModifyColor_DeVignetting_PA_SSE`, four components per pixel, 16-byte aligned): lensfunpy
  passes three-component images, so the plain loop ran. Its arithmetic reads the same.
- Integer pixel formats (u8 in 20.12 fixed point capped at 2047x, u16 in 22.10 capped at 31x): ShootFlow
  develops in float.
