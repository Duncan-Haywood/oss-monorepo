# A converted DNG's maker note read from DNGPrivateData (2026-11-14)

## Why

`portfolio/flagships.yaml` listed "next: DNGPrivateData MakN for converted DNGs' maker notes". ShootFlow
develops DNGs, and most DNGs from interchangeable-lens bodies come out of Adobe DNG Converter. The converter
does not copy the camera's EXIF MakerNote; it keeps it inside IFD0's DNGPrivateData instead. So every
maker-note reader the lens chooser had (Canon CameraSettings, Nikon's 0x0084, Olympus's Equipment IFD) worked
on the camera's own raw file and on nothing ShootFlow could develop.

## The format, and where it comes from

The DNG 1.7.1.0 specification (read from Adobe's PDF this run, "DNGPrivateData", tag 50740) fixes only that
the block starts with a null-terminated maker string, and that offsets in it should be relative to the block.
It does not say what Adobe's own block holds. The layout used here is the one ExifTool's `DNG.pm` reads
(`ProcessAdobeData`, `ProcessAdobeMakN`; read from exiftool/exiftool master this run):

- `"Adobe\0"`, then records: a four-letter name and a big-endian 32-bit length, then that many bytes;
- record `"MakN"`: the original file's byte order (2 bytes), the big-endian offset the note sat at in the
  original file (4 bytes), then the maker note as it was;
- a known Camera Raw bug: DNGs made from camera JPEGs copy the note from 12 bytes too early, marked by
  `00 00 00 01` where the note should start. ExifTool skips 12 bytes then; so does this reader.

Canon notes, and Olympus's old "OLYMP\0" ones, count their offsets from the original file's TIFF header, not
from the note. They are read through a buffer that puts a TIFF header in the original byte order, zeros up
to the original offset, then the note, so those offsets land on the note again. Nikon type-3 and new-style
Olympus notes carry their own byte order and offsets and need nothing. Data the original note pointed to
outside its own block was not copied by the converter (ExifTool warns of this for Olympus and Sony) and stays
unreadable; the readers then give no hint, as for a file with no note.

## What changed

- `lens_profiles.dng_maker_note(ifd0)`: the note from DNGPrivateData as an EXIF-like `Ifd` holding only
  MakerNote, relocated as above (no relocation when the original offset is under 8 or over 64 MiB).
- `lens_profiles.spec_hint`: after the DNG's own EXIF maker note, the DNGPrivateData one is tried, with
  Canon's CameraSettings (only when IFD0's Make is Canon) beside Nikon and Olympus. The hint's source says
  "converted DNG's ...".
- Precedence change: a LensSpecification or LensInfo with the range but no f-numbers (`18-55mm f/?`) used to
  win outright. Now a maker note giving the same range (within 0.5 mm) is used instead, since it adds the
  aperture (and Olympus's or Canon's lens name for tie-breaks). A tag with f-numbers still wins, and a note
  with a different range leaves the tag's hint.
- `cr2.hint_from_note(note)`: CameraSettings to `LensHint` split out of `cr2.lens_hint` so both paths share it.
  Canon's lens name (0x0095) becomes the hint's tie-break name on the DNG path.

## Results

### The one real converted DNG at hand

ExifTool's own test file `t/images/DNG.dng` (13.6 kB, a Canon EOS 350D frame through Adobe DNG Converter;
fetched from raw.githubusercontent.com, not committed). Its EXIF IFD has no MakerNote; DNGPrivateData has
`Adobe\0` + `MakN`, 8,346 bytes, byte order II, original offset 700. Truth is ExifTool's own decode of the
same file, `t/DNG_2.out`.

| field | ExifTool `DNG_2.out` | ShootFlow, before | ShootFlow, now |
|---|---|---|---|
| maker note reachable | yes (Canon) | no | yes, relocated to offset 700 |
| focal range | Min 18 mm, Max 55 mm, units 1/mm | 18-55 (DNG LensInfo) | 18-55 (Canon CameraSettings) |
| aperture at the shot's focal length | Max Aperture 4 | none | f/4.0 |
| lens type | n/a | - | none (65535 read as unknown) |
| hint source | - | file's DNG LensInfo | converted DNG's Canon maker note's CameraSettings |

Every value the note gives matches ExifTool's. With lensfun master 52cf1a7 the pick does not change on this
frame: f/4 at 55 mm sits inside every 18-55 mm f/3.5-5.6 Canon lists, so the seven EF-S 18-55 mm lenses
still tie and the file is refused with the list, before and now. (f/4 at 55 mm does not fit the kit
f/3.5-5.6 lens wide open at 55 mm, which would report 5.6; the lens type is n/a, so it may be a third-party
18-55. Nothing here says which.)

### Camera-native DNGs: unchanged

`eval/lens_spec_real_files.py` on the first 3 MB of five DNGs in drewnoakes/metadata-extractor-images
(DJI Phantom 4, LG Nexus 5X, Leica T, Leica X Vario, Pentax QS1) and on Exiv2's `test/data/IMG_1361.dng`
(iPhone 12 Pro): output identical before and after (diffed). None carries an Adobe MakN block (the Pentax
QS1's private data starts "PENTAX \0" and its truncated copy is unreadable both times).

### What is still open

No converted Nikon or Olympus DNG was found in the public corpora checked (metadata-extractor-images,
ExifTool's t/images, Exiv2's test/data): those two paths are tested on notes built byte for byte as the
real NEF and ORF notes lay them out (`tests/test_dng_maker_note.py`), not on a converted file. Pentax's
own "PENTAX \0" private data, and Pentax lens numbers, are next.

## Tests

`tests/test_dng_maker_note.py` (12): Canon note relocated to its original offset (the real 350D's
CameraSettings values), Canon lens name as tie-break and a record ahead of MakN, Canon note ignored when the
make is not Canon, Nikon note, old-style Olympus note with offsets from the original header, the Camera Raw
12-byte quirk, precedence against LensInfo (no f-numbers, with f-numbers, different range) and against the
DNG's own EXIF note, truncated and foreign private data, and a huge original offset.
