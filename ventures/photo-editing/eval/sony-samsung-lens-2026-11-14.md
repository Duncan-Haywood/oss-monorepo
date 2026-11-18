# Sony and Samsung lenses identified from the maker note (2026-11-14)

## Why

`portfolio/flagships.yaml` listed "Samsung SRW lens name (maker note 0xA003) for lensfun; Sony maker-note
lens names, from those same files" as buildable with public samples. The ARW and SRW readers landed earlier
the same day (`eval/sony-arw-reader-2026-11-14.md`, `eval/samsung-srw-reader-2026-11-14.md`), but three of
the ten real files in drewnoakes/metadata-extractor-images carry no EXIF LensModel and no LensSpecification
(Sony DSLR-A500, Samsung Galaxy NX, Samsung NX20), so `--lens-db` had nothing to match them with. Three more
(NEX-5N, NEX-7, A7 IV) carry LensSpecification, but the range alone fits several lensfun lenses.

## What changed

`src/shootflow/lens_profiles.py`:

- `sony_lens_spec(raw)` decodes Sony's maker-note LensSpec (0xB02A, 8 bytes): byte 0 and byte 7 are feature
  flags, bytes 1-2 and 3-4 the shortest and longest focal length, 5 and 6 the widest f-number at each end in
  tenths, all written as hex digits read as decimal (0x0055 is 55 mm, 0x35 is f/3.5, 0xB0 is f/11). The
  flags give the letters of Sony's own lens names (DT, FE, E, PZ prefixes; ZA, G, SSM, SAM, OSS, Macro, II
  and others as suffixes). Format as published at equational.org/importphotos/alphalensinfo.html and read
  by ExifTool's Sony.pm; no code copied.
- `_samsung_lens_hint` reads Samsung's LensType (0xA003) and names it from Samsung's NX list (17 lenses),
  taken from metadata-extractor's `SamsungType2MakernoteDescriptor` (Apache License 2.0); ExifTool's
  Samsung.pm has the same numbers and names. The range and f-numbers are parsed from the name.
- Both notes are found through the file's own buffer: an ARW's note (no header; "SONY DSC \0\0\0" in a JPEG)
  counts offsets from the TIFF header, an SRW's from the note's start. Each is read only when IFD0's Make
  names that maker, since neither note has a header to recognise it by.
- `spec_hint` uses them (a) as the hint when the file has no LensSpecification, and (b) when it has one with
  the same range, to add the note's lens name, which breaks a range tie exactly as Olympus's Equipment name
  does. A note whose range disagrees with the tag is ignored.

## Results

`PYTHONPATH=src python3 eval/lens_spec_real_files.py LENSFUN/data/db FILES` on the six ARWs and four SRWs
of drewnoakes/metadata-extractor-images (not committed), lensfun master 52cf1a7 (2026-11-04). "tags only"
is what `correction_for` picks with the EXIF lens name dropped; "own name" what it picks from the file's
EXIF LensModel. Truth: the file's EXIF LensModel where there is one; for the A500, ExifTool's Minolta.pm
names the note's LensType 55 "Sony DT 18-55mm F3.5-5.6 SAM (SAL1855) or SAM II"; for the Samsung frames,
metadata-extractor's own dump prints the LensType name.

| file | EXIF LensModel | note's lens (ours) | tags only, before | tags only, now | own name |
|---|---|---|---|---|---|
| DSLR-A500 | none | DT 18-55mm F3.5-5.6 SAM | no hint | Sony DT 18-55mm f/3.5-5.6 SAM (SAL1855) | - |
| ILCE-5000 | E PZ 16-50mm F3.5-5.6 OSS | E PZ 16-50mm F3.5-5.6 OSS | E PZ 16-50mm f/3.5-5.6 OSS I/II | same | same |
| ILCE-7M3 | FE 24-105mm F4 G OSS | FE 24-105mm F4 G OSS | FE 24-105mm f/4 G OSS | same | same |
| ILCE-7M4 | FE 24-70mm F2.8 GM II | FE 24-70mm F2.8 II | refused (4 fit) | FE 24-70mm f/2.8 GM II | FE 24-70mm f/2.8 GM II |
| NEX-5N | E 24mm F1.8 ZA | E 24mm F1.8 ZA | refused (3 fit) | E 24mm f/1.8 ZA | E 24mm f/1.8 ZA |
| NEX-7 | E 24mm F1.8 ZA | E 24mm F1.8 ZA | refused (3 fit) | E 24mm f/1.8 ZA | E 24mm f/1.8 ZA |
| Galaxy NX | none | Samsung NX 18-55mm F3.5-5.6 OIS (type 2) | no hint | Samsung NX 18-55mm f/3.5-5.6 OIS | - |
| NX1 | NX 16-50mm F2-2.8 S | Samsung NX 16-50mm F2-2.8 S ED OIS (13) | Samsung NX 16-50mm f/2-2.8 S | same | same |
| NX20 | none | Samsung NX 18-55mm F3.5-5.6 OIS (type 2) | no hint | Samsung NX 18-55mm f/3.5-5.6 OIS | - |
| NX3000 | NX 16-50mm F3.5-5.6 Power Zoom | Samsung NX 16-50mm F3.5-5.6 Power Zoom ED OIS (15) | no hint (empty LensSpecification) | Samsung NX 16-50mm f/3.5-5.6 PZ ED OIS | same |

Ten of ten frames now pick, from maker-note and tag data alone, the lens their own name (or an
independent decoder) gives; before, three gave no hint and three were refused as ties. Every Sony note name
equals the file's EXIF LensModel except the A7 IV's, where LensSpec has no "GM" bit; its "II" still singles
out the GM II among the four 24-70 mm f/2.8 lenses. The NX3000's LensType 15 (metadata-extractor printed an
empty value for it) agrees with its EXIF LensModel.

## Checks

`tests/test_sony_samsung_lens.py` (12 tests): the four real LensSpec byte strings decode to the names above;
letter digits (f/11) and malformed specs; headerless and "SONY DSC" notes; a Minolta-made file is not read as
Sony; both byte orders for Samsung; every listed Samsung number parses; and on a made-up lensfun database
the A500 and NX20 hints, and the NEX-7's LensSpecification, are refused without the name and picked with it.

## Not done

Sony's LensType (0xB027, A-mount) and LensType2 (E-mount, inside the encrypted 0x9050 block) numbers are not
named: the lists that name them (ExifTool's) are GPL/Artistic-licensed and large; LensSpec gives the range
and letters without them. Sony's in-file lens corrections (0x7032 and neighbours) are still not applied.
A lens memory key for Sony and Samsung (as Pentax and Canon have) is not needed while the note names the lens.
