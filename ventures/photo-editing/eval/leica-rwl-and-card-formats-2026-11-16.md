# Leica RWL, and a card copy that leaves no raw behind (2026-11-16)

## The gap

`ingest.MEDIA_EXTENSIONS` listed ten raw formats, the ones the developer reads. A file with
any other extension was not copied and not mentioned. The copy's own note says "review
ingest_manifest.json before formatting the source card", and the manifest did not name what
was left. A Leica D-LUX shooter's `.RWL`, a Coolpix's `.NRW`, a 10D's `.CRW` or a Sigma's
`.X3F` stayed on the card, and was lost when the card was formatted.

Measured on the public corpus `drewnoakes/metadata-extractor-images` (file names only, by
extension, `git ls-tree` of the default branch on 2026-11-16):

| | camera raw files | copied by the old list | copied now |
|---|---|---|---|
| all raw extensions | 71 | 65 | 71 |
| `.rwl` | 2 | 0 | 2 |
| `.x3f` | 2 | 0 | 2 |
| `.crw` | 1 | 0 | 1 |
| `.dcr` | 1 | 0 | 1 |

Outside raws, the old list also skipped `.heif` (5), `.hif` (1), `.m2ts` (1) and `.xmp`
sidecars (4) in the same corpus.

## What changed

- `ingest.RAW_PHOTO_EXTENSIONS`: 27 raw extensions (3FR, ARW, CR2, CR3, CRW, DCR, DNG, ERF,
  FFF, GPR, IIQ, KDC, MEF, MOS, MRW, NEF, NRW, ORF, PEF, RAF, RAW, RW2, RWL, SR2, SRF, SRW,
  X3F). The copy takes all of them whether or not they develop. `raw_preview.RAW_EXTENSIONS`
  and the catalog's photo list are the same set (a test keeps them equal), so cull scores
  each from its embedded preview and the grade stage refuses the undevelopable ones with its
  existing "convert to DNG" message.
- Also copied: `.heif`, `.hif` (Canon and Fujifilm 10-bit HEIF), `.insp`, `.mxf`, `.m2ts`,
  `.crm`, `.insv`, `.lrv`, and `.xmp` sidecars (copied, not catalogued as media).
- `left_on_card`: every other file under the card root, minus hidden files and card
  housekeeping (`.CTG`, `.DAT`, `.BIN`, `.THM`, AVCHD's `.BDM/.CPI/.MPL` ...), is listed in
  `preview-ingest`, `execute-ingest`, the card-dump workflow's preview and
  `ingest_manifest.json`.
- Hidden files are no longer copied. A Mac writes `._NAME` (AppleDouble, 4 KB of Finder
  metadata) beside each file on an exFAT or FAT card; `._IMG_0001.CR3` has a raw's
  extension and was copied, catalogued as a photo and then failed in the grade.
- `.rwl` reads through the RW2 reader.
- The "camera profile is for X, the file is from Y" note now compares names as the profile
  chooser does (case and spacing ignored): Leica writes `LEICA D-LUX (Typ 109)`, Adobe's
  profile says `Leica D-LUX (Typ 109)`, and every RWL develop printed a false mismatch.

## RWL against LibRaw 0.22

`PYTHONPATH=src python tools/rw2_libraw_check.py FILE.rwl --engines native,python`, rows in
`eval/leica-rwl-libraw-2026-11-16.jsonl`:

| file | storage | sensels | differing (C / Python) | balance, black, CFA, crop, white |
|---|---|---|---|---|
| Leica D-LUX (Typ 109) | RawFormat 4, 12-bit | 12,544,896 | 0 / 0 | all equal |
| Leica V-LUX (Typ 114) | RawFormat 4, 12-bit | 20,108,032 | 0 / 0 | all equal |

`shootflow develop L1000001.RWL --dcp DIR` on the D-LUX file, with a test profile named
`Leica D-LUX (Typ 109) Adobe Standard.dcp`, chose that profile by its tag and wrote a
4272 x 2856 master (no real Adobe profile here, so colour is not judged).

## The other new raws, through cull

`shootflow cull` on a folder of the six real files the old copy left behind: five scored
from their embedded JPEG (CRW 1536x1024, both RWLs 1920x1280, both X3F Quattros 5424x3616),
all keepers; the Kodak DCS Pro SLRn `.dcr` carries no JPEG and is listed as unreadable
with the reason. Before, cull did not list any of the six.

## Not done

- No reader for CRW, NRW, X3F, DCR, 3FR, IIQ or the others: they are copied and culled, not
  developed. NRW (Coolpix) is the likeliest next one (a NEF variant); no public sample was at
  hand.
- `left_on_card` is checked on synthetic cards; no real card dump was available.
