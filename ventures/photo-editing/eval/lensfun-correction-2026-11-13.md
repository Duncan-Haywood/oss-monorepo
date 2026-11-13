# Lens correction from a lensfun database, for raws that carry none (2026-11-13)

## What landed

`shootflow develop FILE --lens-db DIR` corrects lens distortion on files whose opcode lists carry no
lens warp of their own: every Canon CR2, and the DNGs most cameras and converters write (the Pentax
Q-S1's, for one). `DIR` is a folder of lensfun's database XML (`data/db` in
github.com/lensfun/lensfun, CC BY-SA 3.0). The files are read at run time, and nothing of lensfun
is vendored here. The camera, lens and focal length come from the file's tags. The EXIF IFD is now
read for DNG and CR2 alike (`RawImage.exif`): `Make`, `Model`, `LensModel`, `FocalLength` and
`FocalLengthIn35mmFilm`, plus DNG `LensInfo` for a prime. `--lens`, `--lens-focal` and `--lens-crop`
override them. The correction becomes an exact `WarpRectilinear2` and runs through the same warp code
as a camera's own opcode: both engines, same bytes. Module: `src/shootflow/lens_profiles.py`.

A file's own warp wins. With `--lens-db` on a DNG that carries a WarpRectilinear,
WarpRectilinear2 or WarpFisheye, the report says "lens database not used: the file carries its own
lens warp". With `--no-opcodes` the database's correction runs in its place. A lens that can't be
found is a note in the report ("no lens correction: ..."), not an error, so a batch keeps going.

## Lensfun's own rules, read from its source

Every step was ported from lensfun's `libs/lensfun` sources (master, fetched 2026-11-13; database at
commit 52cf1a7, 2026-11-04), not written from memory:

| Step | lensfun source | Here |
|---|---|---|
| Split a name into words | `auxfun.cpp` `lfFuzzyStrCmp::Split` | letter runs, digit runs with dots (`2.0` read as `2`), punctuation runs; a lone mark or lone `f` dropped, `+` and `*` kept; case-folded, sorted as bytes |
| Score a name | `lfFuzzyStrCmp::Compare` (all words required) | every EXIF word must be in the database name; `200 x matched / (words in both)` |
| Score a lens | `database.cpp` `MatchScore` | crop bands (2 to 10 points; none if the camera's crop is under 0.96 of the calibration's), mount (10 own, 9 compatible, else rejected), maker (10, if given), name (`x 4 / 10`, at least 1) |
| Calibration set | `lens.cpp` `InterpolateDistortion` | the set whose crop the camera's is at least 0.96 of, closest |
| Focal length | same, with `__insert_spline`, `__parameter_scales`, `_lf_interpolate` | exact focal used as is; outside the range, the nearest; between, a cubic Hermite spline on `term x focal` over the two nearest calibrations each side (a missing outer one takes the chord's slope), divided by the focal length |
| Coordinates | `modifier.cpp` (`NormScale`), `mod-coord.cpp` `rescale_polynomial_coefficients` and `ModifyCoord_Dist_*` | Hugin's `r = 1` is half the calibration sensor's height (`43.27 mm / crop / hypot(aspect, 1) / 2`); a pixel's size comes from the camera's crop and `hypot(w, h)`; ptlens `a/d^4, b/d^3, c/d^2` with `d = 1 - a - b - c`, poly3 `k1/(1-k1)^3`, poly5 as is |

The focal length cancels out of the distortion itself, so lensfun's `real-focal` attribute (used
only for projection changes) is not needed. With `s` the DNG warp's `r = 1` in Hugin units, the
correction is a WarpRectilinear2 with `kr0 = 1` and `kr1..kr3` (ptlens), `kr2` (poly3) or `kr2, kr4`
(poly5). There is no approximation.

**Fill.** By default the warp is then zoomed by the factor `k` that brings every border pixel's
source inside the frame, with the edge on it. It zooms in for pincushion, so there is no smeared
edge, and out for barrel, so no picture is thrown away. That is what lensfun's `GetAutoScale` is
for. Dividing the corrected coordinates by `k` is `kr_p / k^(p+1)`, still exact. `--no-lens-fill`
keeps the centre's scale. The zoom is found by bisection over 65 points per side, not lensfun's own
search, so the two can differ in the last digits.

**Two choices of our own**, both stricter than lensfun:

- **A lens name that is only numbers is refused.** Canon bodies write a third-party lens as `105mm`.
  Lensfun's matcher would take the shortest database name containing "105" and "mm". On the real
  70D file below, that is a Sigma macro, a guess. The report asks for `--lens` instead.
- **A fixed lens must be named one.** With no lens name, a camera matches the single lens on its
  own mount that lensfun calls "fixed lens" (263 lenses carry that name). The first version took
  any lone lens on the camera's mount. A test caught it: a rare interchangeable mount with one
  profiled lens would have been taken for a built-in lens.

Not ported: lateral colour (TCA) and vignetting (lensfun has both; TCA would be a per-plane
WarpRectilinear2, still exact); the focal and aperture ranges lensfun guesses from a name and
scores; and projection changes for fisheye lenses.

## Tests (`tests/test_lens_profiles.py`, 17)

- **Against lensfun's pipeline, written out separately in the test** (NormScale, the coefficient
  rescale and the `ModifyCoord_Dist_*` formula, in lensfun's own coordinates). The module's warp
  lands within 1e-7 px of it at seven points per case. The cases: an exact calibration, an
  interpolated focal length, a camera crop (1.6) that differs from the calibration's (1.5), a
  portrait frame, poly3 on a 4:3 calibration, and poly5.
- Interpolation against `_lf_interpolate` written out, at 30 mm (four neighbours) and 20 mm (no
  lower neighbour); exact and out-of-range focal lengths.
- Word splitting and scoring on lensfun-style names; numbers-only names; mount, compatible-mount and
  crop filters; fixed-lens lookup.
- Fill: barrel zooms out and pincushion zooms in, every border source inside, and the nearest within
  0.05 px of the edge.
- `develop`: the same bytes as the same file carrying the built warp as its own WarpRectilinear2
  opcode; the file's own warp wins, or not with opcodes off; an unknown lens is a note; numpy and
  pure Python give the same bytes.

## On the whole database

- **Every calibration builds.** All 6,500 distortion entries of the 1,580 lenses build a warp, fill
  zoom included.
- **Every name finds itself.** Looked up by its own main name, with its own crop factor, 1,576 of the
  1,580 lenses come back with a lens of that name first. The other 4 come back with an alias of the
  same lens, listed twice: `E 30mm f/2.8` for `Sigma 30mm f/2.8 EX DN`, the `Contemporary` and `C`
  spellings of one Sigma, `Macro` and `Macro A14` of one Tamron, and an `F/` against `f/` Tamron.
  The run takes 69 s.

## On real files (metadata-extractor-images collection; downloaded at check time, not committed)

**Canon EOS 600D CR2** (`EF100-400mm f/4.5-5.6L IS USM` at 100 mm): `shootflow develop` with the
camera's RawTherapee `.dcp`, `--half` and `--lens-db` takes 9.5 s and reports "lens correction from
lensfun: Canon EF 100-400mm f/4.5-5.6L IS USM [slr-canon.xml], ptlens, calibrated at 100 mm; crop
factor 1.613, zoom 0.9980 to fill the frame". At full size (5184 px) the correction moves the
corner pixel 7.8 px at 100 mm, 4.4 px at 135 mm and 32 px at 400 mm.

**Canon EOS 70D CR2**: its lens is written as `105mm`, which is refused as above. **350D and 7D
CR2s**: no `LensModel` tag (Canon's maker note holds a lens number, not read), so they need
`--lens`. **Pentax Q-S1 DNG**: `02 STANDARD ZOOM` is not in lensfun (only the 01 prime is).

**The maker against lensfun: Leica X Vario (Typ 107) DNG.** This is the one file found that carries
both a camera-written WarpRectilinear and a lensfun profile for its lens: the fixed 18-46 mm, at 46
mm, an exact calibration. `tools/lensfun_vs_camera.py` compares where the two send every 16th pixel
of the 4944 x 3274 frame:

| plane | best zoom between them | gap after that zoom: max | p99 | median | camera's own correction, zoom removed: max | median |
|---|---|---|---|---|---|---|
| R | 0.98649 | 8.12 px | 4.95 | 1.29 | 3.73 px | 0.96 |
| G | 0.98671 | 8.14 px | 4.97 | 1.30 | 3.75 px | 0.96 |
| B | 0.98698 | 8.18 px | 5.01 | 1.31 | 3.79 px | 0.98 |

At this focal length the two disagree by more than the camera's whole correction. Leica's warp is
a slight barrel fix of under 4 px. Lensfun's 46 mm entry (`a 0.00682, b -0.02474, c 0.02966`) is
mostly a 1.3% zoom from its linear `c` term, plus a rise near the centre that the camera's
even-power warp cannot have. Which is right can't be settled from this file. The embedded 720 px
preview (`tools/warp_preview_check.py --lens-db`, which now undoes the orientation tag before
matching) fits the uncorrected render best once a zoom is removed: a mean radial residual of 0.07
px, against 0.13 with the camera's warp and 0.18 with lensfun's. So this camera's preview is not
lens-corrected, unlike the Leica T's (still 4.2 px off, 0.18 px on, with the orientation fix). Read
it as: at the long end of this zoom, the volunteer profile and the maker's correction differ by up
to 8 px at full size. That is one lens at one focal length, not a verdict on lensfun.

## Run it

    git clone --depth 1 --filter=blob:none --sparse https://github.com/lensfun/lensfun && \
      (cd lensfun && git sparse-checkout set data/db)
    shootflow develop IMG.CR2 --dcp "Canon EOS 600D.dcp" --lens-db lensfun/data/db --out masters/
    python3 tools/lensfun_vs_camera.py lensfun/data/db "Leica X VARIO (Typ 107).dng"
    PYTHONPATH=src python3 tools/warp_preview_check.py "Leica X VARIO (Typ 107).dng" --lens-db lensfun/data/db

## Next

- Lensfun's TCA as a per-plane WarpRectilinear2 (exact, the same way), and its `pa` vignetting.
- A second maker-against-lensfun pair, ideally a zoom at several focal lengths: the DJI FC330 and
  Leica T have camera warps but no lensfun profile. A Fujifilm or Panasonic DNG from a body that
  writes WarpRectilinear would do.
- Canon's maker-note lens number (350D, 7D) mapped to a name, so those files need no `--lens`.
- The pipeline's grade stage reading a workspace's lens database, as it reads its camera profiles.
