# Pentax lens numbers from the maker note, and a lens memory (2026-11-14)

## Why

`portfolio/flagships.yaml` listed "next: Pentax lens numbers and its 'PENTAX' private data". Pentax files
give the lens correction nothing to go on: none of the five Pentax interchangeable-lens files read here
(K-1 Mark II PEF and JPEG of 2018, 645D, *ist D, K10D) carries EXIF LensModel or LensSpecification. The only
lens identity a Pentax file holds is the number the lens's ROM reports, in the maker note. So `--lens-db`
refused every Pentax frame with "the file names no lens".

## The format, and where it comes from

Tag numbers, byte positions and formulas as ExifTool's `Pentax.pm` and `MakerNotes.pm` read them (exiftool
master, read this run; ExifTool itself was not run, and nothing of it is in the tree):

- Note headers: `"AOC\0"` + byte order, IFD 6 bytes in, offsets from the file's TIFF header (K10D, *ist D,
  645D JPEGs); `"PENTAX \0"` or `"SAMSUNG\0"` + byte order, IFD 10 bytes in, offsets from the note (K-1 Mark
  II, Q-S1); `"RICOH\0"` + byte order, IFD 8 bytes in (GR III). A Pentax camera DNG keeps the `"PENTAX \0"`
  form in DNGPrivateData (ExifTool's `Exif.pm`); a converted DNG keeps the note in Adobe's MakN record
  (`eval/dng-maker-note-2026-11-14.md`), and all three places are tried.
- 0x003f LensRec: series and model, one byte each. 0x0207 LensInfo: the number again (with a two-byte model on
  bodies from the K10D on) and LensData, the lens codes LC0-LC15. Five LensInfo layouts, told apart by byte
  count and model (old *ist/K100D: type at 0, data at 3; 90 bytes, 645D: at 1, data at 13; 91, K-r/K-5: at 1,
  data at 12 with an extra byte; 80 or 128, K-01 and later: five type bytes at 1, data at 15; others, K10D
  to K-7: at 0, data at 4).
- LC8 (focal length) = 10 * (v >> 2) * 4 ** ((v & 3) - 2) mm; LC9 high nibble n gives the nominal widest
  f-number 2 ** (n / 4); LC13's low 7 bits v > 1 give the widest f-number at the shot, 2 ** ((v - 1) / 32).

ExifTool turns the number into a name with a table of about 400 lenses. That table is not copied: it is
ExifTool's compilation under its own licence, and a number does not always name one lens anyway ("3 44" is
"Sigma or Tamron Lens", any of several). See "Lens memory" below for what is done instead.

## Results on real files

Files: `pef/Pentax K-1 Mark II.pef` and `jpg/Pentax {K-1 Mark II, 645D, ist D, QS1}.jpg`, `dng/Pentax QS1.dng`
from drewnoakes/metadata-extractor-images, and ExifTool's `t/images/Pentax.jpg` (a K10D). Not committed.
`PYTHONPATH=src python3 eval/pentax_lens_real_files.py <lensfun db> FILE...` with lensfun master's
`slr-pentax.xml`, `mil-pentax.xml`, `compact-pentax.xml` and `slr-sigma.xml` (fetched 2026-11-14).

| file | number | LC8 focal / EXIF focal | widest at shot (LC13) | nominal widest (LC9) | ExifTool's table for the number |
|---|---|---|---|---|---|
| K10D (ExifTool's) | 3 44 | 10.0 / 10.0 | 3.91 | 4.0 | Sigma or Tamron lens |
| K-1 Mark II PEF | 8 227 | 170.0 / 170 | 4.0 | 4.0 | smc PENTAX-DA* 60-250mm F4 [IF] SDM |
| K-1 Mark II JPEG | 8 227 | 60.0 / 60 | 4.0 | 4.0 | (same) |
| 645D | 13 18 | 55.0 / 55 | n/a | 2.83 | smc PENTAX-D FA 645 55mm F2.8 AL [IF] SDM AW |
| *ist D | 4 24 | 77.5 / 77 | 1.79 | 1.68 | smc PENTAX-FA 77mm F1.8 Limited |
| Q-S1 JPEG and DNG | 21 2 | (no LensInfo) | - | - | 02 Standard Zoom 5-15mm F2.8-4.5 |

- **The K10D against ExifTool's own decode** (`t/Pentax_2.out`): Lens Type 3 44, Lens Focal Length 10.0 mm,
  Nominal Max Aperture 4.0, Max Aperture 3.9. All four agree.
- **The others against the file and the lens**: each LC8 focal length equals the EXIF FocalLength (the *ist D's
  77 mm reads 77.5: LC8 has 2.5 mm steps there), and each f-number fits the lens the number belongs to: a
  constant f/4 at 60 and 170 mm on the 60-250mm F4, f/2.83 nominal on the 55mm F2.8, f/1.79 on the 77mm F1.8.
  LensRec and LensInfo give the same number in every file.
- **The Q-S1's DNG**: its "PENTAX \0" private data is read in full now (the earlier run read only the first
  3 MB, where the block was cut off) and gives the same 21 2 as the camera's JPEG. Its EXIF names the lens
  ("02 STANDARD ZOOM"), which lensfun does not list, so it is refused as before.

## Lens memory

A photographer owns a handful of lenses, so the table that matters is theirs. `shootflow develop --lens-db DB
--lens-memory FILE` (a JSON file, created when absent):

- a frame whose body reports a number in the memory gets that lens, with a note ("lens X from the lens memory,
  remembered for Pentax lens 8 227 (pass --lens if it is not)"), unless the file names a specific lens itself;
- a frame developed with `--lens` and a number is remembered under that number;
- a frame with a number and no memory entry is refused with what to do ("names the lens only by the body's
  number for it (Pentax lens 8 227); pass --lens once with --lens-memory FILE ...").

Keys are Pentax's number, and for Canon the CameraSettings lens type with the focal range ("Canon lens type 160,
70-200 mm"): Canon's numbers are shared by several lenses, so the range keeps a 70-200 and an 18-55 on one
number apart, and the memory resolves the ties the range match refuses (`eval/canon-lens-from-range-2026-11-14.md`:
62% of lensfun's Canon-mount cases are ties). The overnight pipeline's grade stage reads the shoot's
`color/lens-profiles/lens-memory.json` (read only; a symlink is refused).

On the real files, with one entry per lens (the lensfun name of the lens the number belongs to):

| file | no memory | memory |
|---|---|---|
| K-1 Mark II PEF, 170 mm | refused: names the lens only by number | smc PENTAX DA* 60-250mm F4 [IF] SDM |
| K-1 Mark II JPEG, 60 mm | refused | smc PENTAX DA* 60-250mm F4 [IF] SDM |
| *ist D, 77 mm | refused | smc Pentax-FA 77mm f/1.8 Limited |
| K10D, 10 mm | refused | Sigma 10-20mm f/4-5.6 EX DC HSM |
| 645D, 55 mm | refused | refused (lensfun has no 645 55mm; no entry) |
| Q-S1 | refused: lensfun has no "02 STANDARD ZOOM" | same |

The two K-1 Mark II frames are the case the memory is for: name the lens on one, and the other frame, at a
different focal length, is corrected with no flag.

`tests/test_pentax_lens.py` (12): the real LensRec and LensInfo bytes of four files in each note layout
(PENTAX, AOC in either byte order through a file buffer, RICOH, Pentax DNG private data, converted-DNG MakN),
LensRec alone and a manual lens (0 0, no number), the memory's file round trip and bad files, the refusal,
the remembered pick, the workspace read, and `shootflow develop --lens-memory` on a CR2 whose range ties two
lenses: refused, then named with `--lens` and remembered, then picked from the memory.

## Still open

- A real K-r, K-5 or K-5 II file (the 91-byte layout with the extra byte) and a real K-01-to-K-3 file with
  the 80-byte form: only the 128-byte K-1 Mark II form of that layout was read.
- Nikon's and Sony's lens IDs as memory keys (Nikon's LensData is enciphered on newer bodies).
- Pentax's own lens-correction settings (the maker note's LensCorr record, as ExifTool names it): not read.
