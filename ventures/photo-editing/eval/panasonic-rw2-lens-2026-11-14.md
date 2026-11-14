# Panasonic RW2 lens from the embedded JPEG's maker note (2026-11-14)

## Why

RW2s are read directly since this morning (`eval/panasonic-rw2-reader-2026-11-14.md`), but the
lensfun stage found no lens for any interchangeable-lens RW2: the EXIF IFD that the RW2's IFD0
points at (0x8769) holds focal length, f-number and the 35 mm equivalent, and no LensModel, no
LensSpecification and no maker note, on all four bodies checked. "RW2 lens from its JpgFromRaw maker
note (EXIF has none)" led the flagship's `next:` list.

## What was built

`src/shootflow/rw2.py`, standard library only:

- `embedded_exif`: the JPEG that tag 0x2E (JpgFromRaw) holds, walked marker by marker to its APP1
  "Exif" segment (stopping at SOS or EOI), its TIFF block read with the same TIFF reader, and IFD0's
  ExifIFD followed. The EXIF's MakerNote (0x927C) is Panasonic's when it starts "Panasonic\0\0\0":
  an IFD right after those 12 bytes, whose value offsets count from the EXIF's TIFF header (the
  layout ExifTool's Panasonic.pm and Exiv2's panasonicmn read). Tag 0x51 is LensType, the lens's
  name ("LUMIX G 20/F1.7"); 0x52 is its serial.
- `rw2_exif`: the RW2's own EXIF IFD, with every tag it lacks filled from the JPEG's (the JPEG's
  maker note left out: its offsets belong to the JPEG). When neither EXIF names the lens, LensType
  becomes LensModel, and the develop notes say where the name came from. Newer bodies that write
  LensModel into the JPEG's EXIF get that, with its own note.
- Nothing else changed: `lens_profiles.shot_info` reads LensModel as for any file, and lensfun's own
  fuzzy matching handles Panasonic's spelling (word classes split "20/F1.7" into 20 and 1.7; lensfun's
  database even lists some Panasonic lenses under these EXIF spellings, "LUMIX G VARIO 35-100/F2.8").

## Check

Run: `python3 tools/rw2_lens_check.py lensfun/data/db rw2/Panasonic*.rw2` with lensfun master
52cf1a7 (2026-11-04, sparse checkout of data/db, not committed) and lensfunpy 1.18.0 (liblensfun
0.3.4 and its bundled database) in a venv. The four camera RW2s are the public
metadata-extractor-images samples. Raw rows: `eval/panasonic-rw2-lens-2026-11-14.jsonl`.

| body | LensType and serial (ours = metadata-extractor's) | lensfun pick (our port, master db) | liblensfun 0.3.4 first pick |
|---|---|---|---|
| DMC-GF1 | LUMIX G 20/F1.7, 00FG3102554 | Lumix G 20mm f/1.7 Asph. | the same |
| DMC-GF3 | LUMIX G 14/F2.5, 01HG6061141R | Lumix G 14mm f/2.5 Asph. (tied with the II; noted) | the same (II second) |
| DMC-GF7 | LUMIX G VARIO 12-32/F3.5-5.6, 04LX2032042B | Lumix G Vario 12-32mm f/3.5-5.6 Asph. Mega OIS | the same |
| DMC-LX7 | none (fixed lens; metadata-extractor shows no 0x51 either) | DMC-LX7 & compatibles (Standard), as before | the same |

Lens name and serial equal metadata-extractor's (Java and .NET outputs, which agree) on all three
interchangeable-lens bodies, and the lens picked equals the compiled lensfun 0.3.4's first choice on
all four. Before this change the three interchangeable-lens frames were refused ("the file names no
lens ... pass --lens").

End to end: `shootflow develop --dcp FOLDER --lens-db lensfun/data/db --half --format png` on the GF1,
GF3 and GF7 frames (placeholder profiles from `tests/test_arw.make_profile`) took 7.7 s for the three
with numpy. Each master was corrected (distortion, lateral colour, vignetting: corners +0.81, +1.63 and
+1.02 EV at the shots' f/5, f/7.1 and f/5), and the GF7's tree-lined avenue was looked at: straight
path edges, corners as bright as the middle.

`tests/test_rw2.py` adds 4 tests: an RW2 built with an embedded JPEG (APP0, then APP1 Exif with a
Panasonic maker note at the offsets a camera writes) gives LensModel, the note, the serial and the
JPEG's FocalLength; an embedded LensModel wins; a Leica-headed or empty note, a missing JpgFromRaw
and five broken JPEGs give no lens and no crash; and a made-up lensfun XML picks the right lens from
both spellings.

## Findings

- **The GF3's 14 mm ties.** "LUMIX G 14/F2.5" has no word that tells the 2010 lens from the 2013 II;
  both our port and lensfun 0.3.4 take the first, which is right for a 2011 GF3 frame, and ours says
  it tied. A II writes "LUMIX G 14/F2.5 II", which the II alone matches.
- **The JPEG's EXIF is the fuller one.** Besides the maker note it carries MaxApertureValue,
  SubjectDistance where the body writes it, and exposure details; these now fill gaps in the RW2's
  EXIF too (the RW2's own values win where both exist).
- **No lens-memory key needed.** Unlike Pentax's lens number, LensType is a name lensfun matches, so a
  Panasonic frame needs no `--lens-memory`.

## Not done

- Leica-branded Panasonic bodies (maker note headed "LEICA") and newer Lumix bodies (GH5 era on) were
  not at hand; a "LEICA" note is ignored rather than guessed at.
- An Olympus lens on a Lumix body writes its own name into LensType ("OLYMPUS M.12-40/F2.8"); not
  tested on a real file.
