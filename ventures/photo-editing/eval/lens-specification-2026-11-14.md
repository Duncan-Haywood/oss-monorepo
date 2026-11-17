# Lenses identified from LensSpecification, DNG LensInfo and Nikon's maker note (2026-11-14)

## Why

`portfolio/flagships.yaml` listed, after the Canon focal-range slice
(`eval/canon-lens-from-range-2026-11-14.md`): "next: the same fields from Nikon's LensData or Sony's maker
note". A per-maker reader for each brand would repeat one idea many times. Most bodies since EXIF 2.3 write
the same facts in one standard tag, LensSpecification (0xA432): the shortest and longest focal length, then
the widest f-number at each end. DNG has the same four values in IFD0 as LensInfo (50736). Nikon's encrypted
LensData (0x0098) is not needed: every type-3 Nikon maker note also has an unencrypted tag 0x0084 ("Lens",
as Exiv2 and ExifTool name it) with exactly that layout. Sony's maker note gives a lens number, not a
range, so it is not read; Sony bodies write LensSpecification.

## What changed

- `lens_profiles.spec_hint` reads LensSpecification (EXIF IFD, then IFD0), DNG LensInfo, then the Nikon
  maker note's 0x0084, into a `LensHint` with a new `marked` field (the f-numbers at both ends) and a
  `source` naming the field. 0/0 f-numbers give a hint with no f-numbers; 0/0 focal lengths give none.
  `shot_info` uses it when the reader gave no maker-note hint (Canon's CameraSettings hint still wins).
- `find_lenses_by_range(..., marked=)`: both of the name's f-numbers must equal the tag's within a sixth of
  a stop. Canon's hint has one f-number, which a variable-aperture zoom's range merely has to contain, so
  an f/4 constant zoom and an f/3.5-5.6 zoom of the same range tie there; with both ends they do not.
- `correction_for` uses a tag hint only when the body is in lensfun with a mount (an unknown camera would
  match lenses on every mount) and the camera is not a fixed-lens camera (its own entry wins). Notes and
  refusals name the field: "from the file's LensSpecification (24-120 mm f/4)", "its Nikon maker note gives
  a 80-400 mm f/4.5-5.6 lens, which fits 5 lenses".

## Results

### Real files

`eval/lens_spec_real_files.py` on the TIFF-shaped raws in drewnoakes/metadata-extractor-images (first 3 MB
of each, from raw.githubusercontent.com; not committed), lensfun master 52cf1a7 (2026-11-04). "Tags only"
drops the file's lens name to see what the tag alone gives; where the file has a name, the pick is compared
with it.

| file | lens name in file | tag | tags only |
|---|---|---|---|
| Sony A5000 | E PZ 16-50mm F3.5-5.6 OSS | LensSpecification 16-50 f/3.5-5.6 | same lens |
| Sony A7 III | FE 24-105mm F4 G OSS | 24-105 f/4 | same lens |
| Sony A7 IV | FE 24-70mm F2.8 GM II | 24-70 f/2.8 | tied, 4 (refused) |
| Sony NEX-5N | E 24mm F1.8 ZA | 24 f/1.8 | tied, 3 (refused) |
| Sony NEX-7 | E 24mm F1.8 ZA | 24 f/1.8 | tied, 3 (refused) |
| Samsung NX1 | NX 16-50mm F2-2.8 S | 16-50 f/2-2.8 | same lens |
| Leica T (DNG) | none | LensInfo 18-56 f/3.6-5.6 | refused: lensfun has no 18-56 mm |
| Leica X Vario (DNG) | none | LensInfo 18-46 f/3.5-6.4 | fixed-lens entry, as before |
| DJI Phantom 4 (DNG, x2) | none | 3.61 mm, no f-numbers | refused, as before (camera not in lensfun) |
| Nikon D70 | none | maker note 18-70 f/3.5-4.5 | AF-S DX Zoom-Nikkor 18-70mm f/3.5-4.5G IF-ED |
| Nikon D300 | none | maker note 18-70 f/3.5-4.5 | AF-S DX Zoom-Nikkor 18-70mm f/3.5-4.5G IF-ED |
| Nikon D200 | none | maker note 80-400 f/4.5-5.6 | tied, 5 |
| Nikon D800E | none | maker note 150-600 f/5-6.3 | tied, 2 (Sigma and Tamron versions) |
| Nikon D5100 | none | maker note 18-55 f/3.5-5.6 | tied, 4 |
| Nikon D810 | none | maker note 50 f/1.4 | tied, 5 |
| Nikon D90 | none | maker note 24 f/2.8 | tied, 3 |

Where the file names its lens, the tag alone picked the same lens 3 times out of 6 and refused the other
3; it never picked a different lens. The two 18-70 mm Nikon frames would be identified; ShootFlow does not
develop NEFs (convert to DNG first), so the Nikon reader matters for the NEF shot facts it already reads
and for a future NEF developer, not for a develop today. Files with no tag: Sony A500, Pentax K-1 II,
Samsung NX20 and Galaxy NX (no LensSpecification), NX3000 (a name, no tag). ORF and RW2 files are not
read by the TIFF reader (their own header magic), the Pentax Q-S1 DNG and the BigTIFF samples were cut
by the 3 MB range or are not classic TIFF.

### Whole database

`tools/lens_spec_check.py lensfun/data/db`: every lens lensfun lists on any mount whose name states its
focal and f-number range (1,119; 318 do not), asked with only its four values on a body of its own mount:

| hint | picked (one lens fits) | tied (refused) | lost |
|---|---|---|---|
| both f-numbers (LensSpecification, Nikon 0x0084) | 560 (50.0%) | 559 | 0 |
| one f-number, the short end's (Canon's kind) | 522 (46.6%) | 597 | 0 |

By mount maker (both f-numbers): Nikon 263 lenses, 43.0% picked; Canon 253, 45.8%; Sony 173, 48.0%; Micro
Four Thirds 91, 46.2%; Pentax 89, 51.7%; Fujifilm 51, 45.1%. Ties are mostly one lens's versions (VR, II)
and same-range third-party lenses (Sigma, Tamron, Samyang). "Alone" means alone in lensfun, as for the
Canon hint: a lens lensfun lacks can be taken for one it has; the note names the lens used.

## Tests

`tests/test_lens_specification.py` (15): the tag layouts, 0/0 values, precedence (EXIF tag, IFD0, DNG
LensInfo, Nikon note; a Canon maker-note hint over all), the Nikon maker note built as the real D300's and
D810's are laid out, both-ends matching, ties, refusals naming the field, the unknown-camera and
fixed-lens rules. The database is made up in lensfun's XML format; no lensfun data is copied.

## Next

- Pentax and Olympus: neither writes LensSpecification on the files here; Pentax's maker note has a lens
  number (0x003F), Olympus's Equipment IFD a lens type and focal range (0x0201 to 0x0207), and the ORF
  header needs the reader to accept its magic.
- A tie-break among one lens's versions needs data a file does not have; refusing with the list stays.
