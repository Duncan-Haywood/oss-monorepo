# Olympus lenses identified from the maker note's Equipment IFD (2026-11-14)

## Why

`portfolio/flagships.yaml` listed, after the LensSpecification slice
(`eval/lens-specification-2026-11-14.md`): "next: Olympus's Equipment IFD (ORF magic) and Pentax lens
numbers". That slice found that Olympus bodies of the Four Thirds and early Micro Four Thirds years write no
EXIF LensModel and no LensSpecification, so a file from them gave ShootFlow nothing to choose a lensfun
profile with. Their maker notes do carry the lens: tag 0x2010 points to an "Equipment" sub-IFD with the lens's
shortest and longest focal length, its widest f-number at each end and at the shot's focal length, and (on
most bodies) a lens name. ORF files also start with their own magic ("IIRO"), which the TIFF reader refused.

## What changed

- `raw_develop._Reader` accepts the ORF magics 0x4F52 and 0x5352 (the IFDs behind them are classic TIFF).
  An ORF still has no DNGVersion, so `develop` still asks for a DNG; the change is for shot facts.
- `Ifd` keeps where each tag's values sit in the buffer it was read from (`offsets`, `source`; not compared,
  not printed), because old-style Olympus notes count their offsets from the file's TIFF header.
- `lens_profiles.olympus_equipment(exif)` reads all three layouts seen in real files:
  - "OLYMPUS\0" + byte order + 3 (E-3 onwards, the PENs, the OM-Ds): IFD 12 bytes in, offsets from the note;
  - "OM SYSTEM\0\0\0" + byte order + 4 (OM-1 onwards): IFD 16 bytes in, offsets from the note;
  - "OLYMP\0" + version (the E-1, E-300 era and the compacts): IFD 8 bytes in, offsets from the TIFF header,
    and on the E-1 the Equipment IFD written inline as UNDEFINED bytes rather than pointed to.
- `spec_hint` falls back to it after EXIF LensSpecification, DNG LensInfo and the Nikon note, giving a
  `LensHint` from 0x0207/0x0208 (focal range, whole mm), 0x0205/0x0206 (f-numbers at each end, stored as v
  with f = sqrt(2) ** (v / 256)) and 0x020A (f-number at the shot's focal length). Tag names and the
  f-number encoding are the ones Exiv2 and ExifTool use; metadata-extractor's dumps of the same files (below)
  print the same values. Zeros (a manual lens, the E-PL7 frame) give no hint.
- `LensHint.name`: the Equipment IFD's lens name (0x0203). It is used only to break a tie among lenses that
  already fit the range, scored as a file's lens name would be. A generic name ("OLYMPUS 14-54mm Lens", as
  Four Thirds lenses report themselves) matches nothing and leaves the tie refused; a name for a lens the
  range rules out never wins.

## Results

### Real files

`eval/lens_spec_real_files.py` (now also reading a camera JPEG's EXIF segment) on the 18 ORFs and three
Olympus JPEGs in drewnoakes/metadata-extractor-images (first 3 MB of each, from raw.githubusercontent.com;
not committed) and ExifTool's `t/images/OlympusE1.jpg`, `Olympus.jpg` and `Olympus2.jpg`, with lensfun master
52cf1a7 (2026-11-04). "Truth" is the Lens Type that metadata-extractor's own Olympus decoder printed for the
same file (`orf/metadata/java/*.txt` in that repository), read independently of this code.

| file | EXIF lens name | Equipment: range, ends, name | before | now | truth (metadata-extractor) |
|---|---|---|---|---|---|
| E-1 (JPEG) | none | 14-54, f/? - 3.5, no name (old-style, inline) | no hint | Zuiko Digital 14-54mm f/2.8-3.5 | (not in that corpus) |
| E-30 | none | 14-54, f/2.8-3.5, "OLYMPUS 14-54mm Lens" | no hint | Zuiko Digital 14-54mm f/2.8-3.5 | Zuiko Digital 14-54mm F2.8-3.5 |
| E-410 | none | 14-42, f/3.5-5.6, no name | no hint | Zuiko Digital ED 14-42mm f/3.5-5.6 | Zuiko Digital ED 14-42mm F3.5-5.6 |
| E-600 | none | 14-42, f/3.5-5.6, "OLYMPUS 14-42mm Lens" | no hint | Zuiko Digital ED 14-42mm f/3.5-5.6 | Zuiko Digital ED 14-42mm F3.5-5.6 |
| E-P3 (ORF and JPEG) | none | 17, f/1.8, "OLYMPUS M.17mm F1.8" | no hint | M.Zuiko Digital 17mm f/1.8 (range ties 3; name picks) | M.Zuiko Digital 17mm F1.8 |
| E-PL1 | none | 14-42, f/3.5-5.6, "OLYMPUS M.14-42mm F3.5-5.6 L" | no hint | M.Zuiko Digital ED 14-42mm f/3.5-5.6 L (ties 8; name picks) | M.Zuiko Digital ED 14-42mm F3.5-5.6 L |
| E-PM1 | none | 14-42, f/3.5-5.6, "OLYMPUS M.14-42mm F3.5-5.6 II R" | no hint | M.Zuiko Digital ED 14-42mm f/3.5-5.6 II R (ties 8; name picks) | M.Zuiko Digital 14-42mm F3.5-5.6 II R |
| E-M5 (ORF and JPEG), E-M10, E-M1 (JPEG), OM-1 | yes | (EXIF LensSpecification is read first, as before) | unchanged | unchanged | - |
| E-PL7 | none | zeros (manual lens) | no hint | no hint | Lens Type = None |
| 10 compacts (C5050Z, C8080, SP350, SP500UZ, TG-4, TG-6, TG-7, XZ-1, C2000Z, u760) | none | no lens tags | fixed-lens path | unchanged | - |

Eight frames from seven bodies that gave no lens before are now identified, and each pick is the lens the
independent decoder names (lensfun calls the E-PM1's kit zoom "ED"; it is the same II R lens). Four were
identified by the range alone, three by the name breaking a range tie. Range ties on the 14-42 mm f/3.5-5.6
are wide: eight lensfun lenses share it on Micro Four Thirds, Panasonic's included. The OM-1's 100-400 mm is
refused as before: lensfun 52cf1a7 has no profile for it.

Every Olympus body here that writes EXIF LensSpecification (E-M5 ORF and JPEG, E-M10, E-M1 JPEG, OM-1) also
writes the Equipment IFD. Read on its own, it gives the same range and end f-numbers as the EXIF tag on all
five (the OM-1's through the "OM SYSTEM" layout), and a lens name equal to EXIF LensModel, so which one is read
first makes no difference to them. The shot's f-number (0x020A) sits within a sixth of a stop of the marked
ends (E-M5 at 50 mm: 6.36 against f/6.3).

### What this does and does not reach

ShootFlow develops DNG and CR2. An Olympus raw is developed after Adobe DNG Converter, which normally writes
DNG LensInfo itself, so the new reader matters for the shot facts ShootFlow reads from ORFs and camera JPEGs
and for a future ORF developer. A converted DNG keeps the original maker note in DNGPrivateData ("Adobe" +
"MakN"); reading the Nikon and Olympus notes from there is not done (no converted DNG with a maker note was
at hand to check it on).

## Tests

`tests/test_olympus_equipment.py` (11): the three layouts built byte for byte as the real files lay them out
(values from the real E-30, E-PM1 and E-1 frames), ORF magic, zeros and a compact's lens-less Equipment IFD,
junk notes, EXIF LensSpecification still first, range-alone pick, the name breaking a tie, a generic name
leaving it refused, and a name outside the range never picking. The database is made up in lensfun's XML
format; no lensfun data is copied.

## Next

- DNGPrivateData's MakN block, so a converted DNG's original Nikon or Olympus maker note is read too.
- Pentax: the maker note's lens number (0x003F) gives no range; lensfun has no lens-number table.
