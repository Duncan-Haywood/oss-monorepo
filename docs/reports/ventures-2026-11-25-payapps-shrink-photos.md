---
kind: milestone
date: 2026-11-25
---
# PayApps (bet #1): large photos shrunk before upload, capture time kept

2026-11-25, ventures run. Private PR: Duncan-Haywood/private-monorepo#135. ROADMAP Next
"Attachments, part 3"; claim `claim/payapps/attachments-part-3-shrink-photos`.

**What landed** (all client side, no server change, no migration, no new dependency):
- `src/shared/photo-exif.ts`: reads DateTimeOriginal, OffsetTimeOriginal (Exif sub-IFD) and DateTime
  (IFD 0) from a JPEG's APP1 in either byte order; writes a big-endian APP1 holding only those; inserts
  it after the canvas JPEG's JFIF APP0, replacing any existing APP1.
- `src/shared/attachments.ts`: `SHRINK_LONG_EDGE` 2560, `SHRINK_MIN_BYTES` 1 MB, quality 0.85,
  `SHRINK_MAX_RATIO` 0.8, `shrinkable`, `shrunkSize`.
- `client/lib/packet-photo.ts`: `packetReadyPhoto(file, { shrink, decode })` (the signature changed
  from `(file, decode)`); HEIC/WebP conversion is drawn at the shrunk size when shrink is on.
- `client/components/attachments.tsx`: the "Make large photos smaller before upload" checkbox, on by
  default, kept in localStorage `payapps.shrinkPhotos` (try/catch; it falls back to on).
- Next item renamed: "Attachments, part 4" carries capture time out of HEIC/WebP, if people ask.

**Deviation:** the Next item said "once storage use per plan is measured". It shipped before that
because it is on by default and can be turned off, and it stretches the free plan's 250 MB.

**Verification.** Local: typecheck clean; `test:unit` 491/491 in 55 files; the fixture
`test/fixtures/exif-photo-pillow.jpg` has EXIF written by Pillow, not by our code. Real Chromium (esbuild
bundle of the real `browserDecoder`): a 4032 × 3024 JPEG with orientation 6 (7 MB) came out as a
1920 × 2560 upright JPEG of 1.8 MB. Pillow reads back both times, with no GPS, model or
orientation. Not tried on a real phone.

**For the next run:** Pillow from the system `python3` is broken here (`_imaging` import error). A venv
`pip install pillow` works.
