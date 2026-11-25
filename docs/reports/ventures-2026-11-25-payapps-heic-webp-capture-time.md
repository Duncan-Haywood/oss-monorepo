---
kind: milestone
date: 2026-11-25
---
# PayApps (bet #1): converted HEIC and WebP photos keep their capture time

2026-11-25, ventures run. Private PR: Duncan-Haywood/private-monorepo#137. ROADMAP Next
"Attachments, part 4"; claim `claim/payapps/attachments-part-4`.

**What landed** (client side, no server change, no migration, no new dependency):
- `src/shared/photo-exif.ts`: `photoCaptureTime(bytes)` dispatches on magic bytes (JPEG, RIFF/WEBP,
  ISO BMFF with `ftyp`); `webpExif` reads the RIFF `EXIF` chunk; `heifExif` finds the `Exif` item in
  `meta/iinf` (infe v2/v3) and gathers its extents from `iloc` v0-2 (construction method 0 = file,
  1 = idat; 64-bit box sizes; item capped at 1 MB), skips the 4-byte TIFF-header offset and a stray
  `Exif\0\0`. The TIFF reader was split out of `readCaptureTime` as `tiffCaptureTime`.
- `client/lib/packet-photo.ts`: `convert()` reads the time from the original and inserts the APP1
  into the converted JPEG; note gains ", with the time it was taken kept."
- Fixtures: `test/fixtures/exif-photo-libheif.heic` (libheif 1.23 via pillow-heif 1.9; EXIF big-endian,
  offset 6 then `Exif\0\0`, iloc v0) and `exif-photo-pillow.webp`; generator
  `test/fixtures/pdf-sources/exif-photo-heic-webp.py`.

**Deviation:** the Next item said "if people ask for it". Shipped anyway: HEIC is how iPhone photos
arrive, and silently dropping the capture time of the most common job photo is worse than ~200 lines
of bounds-checked parser.

**Verification.** typecheck clean; `test:unit` 500/500 in 55 files; `pnpm build` ok. Real Chromium
(esbuild bundle of `packetReadyPhoto` with the real `browserDecoder`, shrink on): the WebP fixture came
out as `walk.jpg` reading back 2026:11:24 16:42:30 -08:00. HEIC decode needs Safari: unit tests only.

**For the next run:** `pip install pillow-heif` in a venv works here (manylinux wheel, bundles libheif
with an x265 encoder), so HEIC fixtures can be generated. Legal-text hosts (leginfo, justia, findlaw,
cornell, state legislatures) are refused by the proxy, which blocks the California lien-waiver item.
