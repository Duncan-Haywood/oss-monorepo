# Vignetting from lensfun, as a FixVignetteRadial (2026-11-13)

Follow-up to `eval/lensfun-correction-2026-11-13.md` (distortion) and `eval/lensfun-tca-2026-11-13.md`
(lateral colour). Those left lensfun's vignetting calibrations (`pa`) as the next item. With
`--lens-db`, a lens with a vignetting calibration now has its corners brightened as lensfun would
brighten them, through the FixVignetteRadial opcode code the developer already runs for camera DNGs.

## Lensfun's vignetting, from its source

Read from lensfun master `libs/lensfun/mod-color.cpp`, `modifier.cpp`, `lens.cpp` and `database.cpp`
(fetched 2026-11-13 from raw.githubusercontent.com), not from memory. Database: lensfun master
`data/db`, commit 52cf1a7b0e82 (2026-11-04), 56 files.

| What | lensfun | Here (`lens_profiles.py`) |
|---|---|---|
| Model | `ModifyColor_DeVignetting_PA`: pixel times `1 / (1 + k1 r^2 + k2 r^4 + k3 r^6)` | the same `c`; the opcode's gain is fitted to `1 / c` (below) |
| XML | `k1..k3` or `alpha1..alpha3`; `focal`, `aperture`, `distance`; `acm` and `none` also exist | `pa` read, both spellings; no profile in the database uses `acm` (29,817 `pa` entries) |
| Units | `rescale_polynomial_coefficients`: `k_i *= hugin_scaling^(2i)`, `hugin_scaling = real_focal / (43.27 / calib crop / 2)`; pixels to real-focal units by `NormScale = 43.27 / crop / hypot(W+1, H+1) / real_focal`, `W = width - 1`, centre `W/2` | `vignetting_scale`: `r_pa = r_px * 2 calib crop / (crop * hypot(w, h))`; with the opcode's `r = 1` at the farthest pixel centre (`hypot(w-1, h-1) / 2`), `s = calib crop / crop * hypot(w-1, h-1) / hypot(w, h)`. The real focal length cancels |
| Order | colour callbacks run on the uncorrected image | the FixVignetteRadial goes into OpcodeList3 before the warp (`Correction.opcodes`) |
| Interpolation | `InterpolateVignetting`: calibration set with the nearest crop at least 0.96 of the camera's; inverse distance weighting, power 3.5, over `(focal on the lens's 0..1 range, 4 / aperture, 0.1 / distance)`; closer than 0.0001 taken as is; nearest farther than 1 means no correction; `pa` terms not scaled (`__parameter_scales`) | `interpolate_vignetting`, the same |
| Focal range | `GuessParameters`: `<focal>` element, else the name's numbers (three regexes, not for converters or adapters) widened by every calibration's focal length | `guess_focal_range`, the same regexes in Python syntax |

Aperture comes from EXIF FNumber and distance from SubjectDistance; with no distance, 1000 m (far
focus) is assumed and said in the notes, since lensfun's axis is `0.1 / d`, where 1000 m and
infinity differ by 0.0001. `--lens-aperture` and `--lens-distance` override; `--no-lens-vignetting`
turns it off. A lens with a vignetting calibration and no distortion one (36 in the database) now
gets the vignette alone.

## The fit

FixVignetteRadial's gain is `1 + k0 r^2 + ... + k4 r^10`; lensfun's is `1 / c`, not a polynomial.
`fit_vignette_radial` minimises the relative error `gain x c - 1` over the disc (each radius weighted
by `r`), as five normal equations; when that leaves more than 0.1%, ten rounds of Lawson's
reweighting move it toward the smallest largest error (on the database's tail this cut the error
about 2.5 times: a case at 2.43% fell to 1.01%). The largest relative error over 2,001 radii is
reported in the develop notes. A calibration whose `c` reaches zero inside the frame (lensfun would
give an infinite or negative gain), or whose best fit is more than 10% off, is refused with a note.

## Checked

- `tests/test_lens_vignetting.py`, 16 tests. A test XML with made-up numbers; `lensfun_gain` writes
  lensfun's pipeline out in its own coordinates (NormScale with a real focal length that cancels,
  the `hugin_scaling` rescale, `1 / c`). The opcode's gain is within the reported fit error of it at
  corners, edges, centre and inner pixels (under 1%) for an exact calibration, an interpolated one on
  a portrait frame, a crop bigger than the calibration's on 4:3, and the `alpha` spelling with a
  2.5x corner. Inverse distance weighting against the formula worked by hand (12 places); the
  refusal beyond distance 1; the crop rule; focal range from the name (four lensfun name styles), a
  `<focal>` element and calibrations; refusal of a calibration that goes dark; the vignette before
  the warp; no FNumber, no vignette; the 1000 m default; a vignetting-only lens. `develop` with the
  database gives the same bytes as the same FixVignetteRadial and WarpRectilinear2 written into the
  DNG's OpcodeList3, on both engines, and differs with `--no-lens-vignetting`.
- Seeded faults, each run against the 16 tests, all caught: `pa` terms scaled by `s, s^2, s^3`
  (1 fails); calibration and camera crop swapped (1); weighting power 2 (1); aperture axis linear
  (2); focal axis not normalised (2); vignette after the warp (2); no refusal beyond distance 1 (1);
  the fit's target sign flipped (5); the name's focal range ignored (1).
- `tools/lensfun_vignetting_check.py` on the whole database: 717 lenses with `pa`, every calibration
  point plus the geometric midpoint between each pair of apertures at one focal length and distance
  (interpolated), on a 6000 px frame at the calibration's crop and aspect: **54,108 cases** corrected,
  **396 refused** (183 go dark inside the frame, 213 fit worse than 10%: 0.7%). Fitted gain against
  lensfun's: median **0.0036%**, 90th percentile 0.098%, 99th **1.1%**; over 0.1% in 9.7% of cases,
  over 1% in 1.1%, over 5% in 0.21%, largest 10.0% (the refusal bound). The pixel check (corners, edge
  midpoints, centre, 10 random pixels each) never exceeds the reported bound by more than 5.5e-10.
  2 min 54 s.
- What the correction is worth: lensfun's gain at the farthest pixel is a median **+0.46 EV**,
  90th percentile +1.29 EV, 99th +2.28 EV, largest corrected +4.6 EV; over half a stop in 47% of
  cases and over a stop in 18%. That is how much darker those corners are left without it.

## Not checked

- A real frame of an even surface (a white wall, a clear sky) shot wide open, to see the corners
  come up level, and how close lensfun's calibration is to that copy of the lens.
- liblensfun's compiled devignetting (lensfunpy's `apply_color_modification`) against ours: the
  formula is written out from the source, not run from the library as the distortion check was.
- The DNG SDK's own FixVignetteRadial (it builds a fixed-point gain mask on a coarser grid).
- Lens centre offsets (`<center>`): no lens in the database has one; not read.
