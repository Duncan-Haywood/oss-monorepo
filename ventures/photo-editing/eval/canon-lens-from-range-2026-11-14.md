# Canon lenses identified from the maker note's focal range (2026-11-14)

## Why

`portfolio/flagships.yaml` listed, as buildable here: "Canon's maker-note lens number (CameraSettings
index 22) mapped to a name for CR2s whose maker note gives no usable name (the 350D writes none, the 7D
only "10-17mm")". Without a name, `--lens-db` could not correct those files at all.

A lens-number table was not built. Canon's numbers are shared (type 183 is the EF100-400mm f/4.5-5.6L
on the 600D file below and a Sigma 105 mm macro on the 70D file), the public tables live in GPL and
Artistic-licensed projects (Exiv2, ExifTool) that this MIT tree should not copy, and a number that
names five lenses still needs something else to choose among them. That something else is already in
the maker note: CameraSettings also holds the lens's focal range and its widest f-number. This slice
matches those against lensfun's names instead, which needs no table, and refuses when more than one
lens fits.

## The fields, read from the real files

CameraSettings is maker-note tag 0x0001, an array of shorts. Indexes, as Exiv2 numbers them
(`src/canonmn_int.cpp`, `tagInfoCs_`, read 2026-11-14; ExifTool uses the same): 22 lens type, 23 long
focal, 24 short focal, 25 focal units per mm, 26 max aperture (Canon's EV code: 32 to a stop, low five
bits 0x0C and 0x14 meaning a third and two thirds). The five real CR2s the reader is checked on
(`eval/cr2-five-bodies-2026-11-12.md`; downloaded at check time, not committed):

| body | file's lens name | type | short-long, units | index 26 | f-number | focal shot |
|---|---|---|---|---|---|---|
| 350D | none | 65535 | 28-200, 1 | 159 | 5.6 | 182 mm |
| 600D | EF100-400mm f/4.5-5.6L IS USM | 183 | 100-400, 1 | 140 | 4.49 | 100 mm |
| 70D | "105mm" | 183 | 105-105, 1 | 96 | 2.83 | 105 mm |
| 7D | "10-17mm" | 160 | 10-17, 1 | 128 | 4.0 | 13 mm |
| 5D Mark II | EF50mm f/1.2L USM | 241 | 50-50, 1 | 20 | 1.26 | 50 mm |

Index 26 is the widest f-number **at the focal length shot**, not the lens's widest at its short end:
the 350D's 28-200 mm (f/3.5-5.6 is the usual marking for that range) at 182 mm reports 5.6, and the
7D's 10-17 mm at 13 mm reports 4.0. So a zoom marked f/A-B matches any reported value from A to B.

## What changed

- `cr2.lens_hint` reads those fields into `raw_develop.LensHint` (short, long, aperture, lens type;
  type 0 or 65535 kept as None); `parse_cr2` carries it on `RawImage.lens_hint`, and the develop's lens
  stage passes it to `lens_profiles.shot_info`.
- `lens_profiles.name_range` reads a lensfun name's focal and f-number range with lensfun's own first
  name pattern (also taking `F2.8` and en dashes); `find_lenses_by_range` keeps lenses whose name gives
  exactly that range (0.5 mm) and an f-number range holding the reported aperture (a sixth of a stop
  either way), on the camera's mount or a same-maker compatible one, and passing the crop filter.
  Teleconverter entries are skipped (the body reports the multiplied range then). Manual mounts lensfun
  lists as compatible (M42, T2...) are skipped too: a lens with no contacts sends no focal range.
- `correction_for`: when the file names no lens, or only numbers ("105mm"), and a hint is there, the
  one lens that fits is used, with a note saying so and "pass --lens if it is not". Several fit:
  refused, the candidates listed. None fit: the old refusal, now naming the range it looked for. A
  real name in the file and `--lens` both win over the hint.

## Results

Real files, `shootflow develop FILE --half --dcp STANDIN.dcp --lens-db lensfun/data/db` (lensfun master
52cf1a7, 2026-11-04; the profile is an identity matrix, as colour is not under test):

- **70D**, "105mm" (refused before): identified as **Sigma 105mm f/2.8 EX DG OS HSM Macro**, the only
  lens in lensfun with 105 mm at f/2.8 on an EF-S body's mounts; distortion, lateral colour and
  vignetting (+0.09 EV at f/18) corrected. That Canon type 183 is also listed for a Sigma 105 mm is
  consistent; the file itself cannot confirm the exact Sigma version.
- **350D**, no name: still refused, now with the reason: lensfun has no Canon-mount 28-200 mm (its
  28-200s are Nikon F, Sony E and L-mount).
- **7D**, "10-17mm": still refused: lensfun's only 10-17 mm fisheye is Pentax's.
- **600D** and **5D Mark II**: unchanged, their maker note names the lens.

Whole database (`tools/lens_from_range_check.py lensfun/data/db`): every lens lensfun lists on a Canon
mount whose name states its range (366; 9 do not), asked with only its range and its marked aperture at
each end (581 cases, a prime once):

| | cases | picked (one lens fits) | tied (refused, candidates listed) | lost (the lens itself not found) |
|---|---|---|---|---|
| all | 581 | 223 (38.4%) | 358 (61.6%) | 0 |
| Canon EF | 426 | 148 | 278 | 0 |
| Canon EF-S | 52 | 14 | 38 | 0 |
| Canon EF-M | 26 | 16 | 10 | 0 |
| Canon RF | 77 | 45 | 32 | 0 |

Ties are mostly one lens's versions (EF-S 18-55mm f/3.5-5.6, IS II, III; EF 24-105mm f/4L IS and IS
II), and on RF and EF-M bodies the adapted EF lenses of the same range. Tie sizes: 2 lenses 113 times,
3 90, 4 44, 5 to 11 the rest.

## Not checked, and the risk that stays

- "Picked" means alone **in lensfun**. A lens lensfun lacks with the same range and aperture as one it
  has (a third-party 70-200 f/4 against Canon's) is taken for the one it has. The note names the lens
  and says to pass `--lens`; the report carries it. A real CR2 from such a lens would measure how far off
  the wrong profile is.
- Canon's lens type number is read but not used. Joined with the range, it would split most ties
  between versions (IS against IS II). That needs a number-to-name source under a licence this tree can
  use, or the owner's own photos with known lenses.
- Other makers' maker notes (Nikon's LensData, Sony's LensType2) carry similar fields; only Canon's are read.

## Checked

`tests/test_canon_lens_range.py`, 17 tests on synthetic CR2s and a made-up lensfun-format database:
the EV code on the five real files' values; the hint read with focal units of 1 and 100, refused with
no array, units 0, short above long or too short an array; `parse_cr2` and `shot_info` carrying it;
`name_range` forms and refusals; a prime alone; aperture separating f/4 from f/2.8 zooms but not their
versions; a variable-aperture zoom matched across its range and not outside; mount and crop filters;
`correction_for` resolving a bare-focal name and no name, refusing a tie with the candidates and a miss
with the range, and a real name and `--lens` winning. The whole photo-editing suite passes
(`python3 platform/ci/run_venture_tests.py photo-editing`, 118 s).

Reproduce:

    git clone --depth 1 https://github.com/lensfun/lensfun.git
    python3 tools/lens_from_range_check.py lensfun/data/db
    curl -LO "https://raw.githubusercontent.com/drewnoakes/metadata-extractor-images/master/cr2/Canon%20EOS%2070D.cr2"
