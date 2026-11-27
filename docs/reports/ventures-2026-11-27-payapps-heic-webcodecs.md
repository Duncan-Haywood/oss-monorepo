---
kind: milestone
date: 2026-11-27
subjects: [payapps]
---
# PayApps (bet #1): iPhone HEIC photos from Chrome, Edge and Firefox, through WebCodecs

2026-11-27, ventures run. ROADMAP Next "Backup packets, part 3"; claim
`claim/payapps/backup-packets-part-3-heic-webcodecs` on this repository.

## The problem

A subcontractor's backup packet (one PDF to the GC: the application, an index, then stored-material
invoices and job photos) takes JPEG, PNG and PDF. iPhones save HEIC. Since 2026-11-25 the upload
form converted a HEIC to JPEG in the browser, but only Safari can open a HEIC as an image, so a PM
or bookkeeper attaching the foreman's photos from Chrome or Edge on the office PC got a "send it
separately" line on the packet's index.

## Why not a WebAssembly decoder

The ROADMAP suggested bundling one. The free ones (libheif + libde265) are LGPL-3.0, and shipping an
HEVC decoder brings HEVC patent pools into a paid product. Both are liability questions for a
product sold under an all-rights-reserved notice, so this approach was not used. Instead the browser's own HEVC *video*
decoder (WebCodecs `VideoDecoder`, the device's hardware decoder, licensed with the device) decodes
the HEIC's pictures. A HEIC is just HEVC intra pictures in a HEIF (ISO BMFF) container.

## What landed (client only, no server change, no migration, no dependency)

- `apps/payapps/src/shared/heif.ts`: a HEIF reader. `pitm`, `iinf` (infe v2/3), `iloc` v0-2
  (file and idat), `iref` dimg, `iprp`/`ipco`/`ipma` (7- and 15-bit indexes); the primary item as
  one `hvc1` or a `grid` (8/16 and 32-bit output sizes); `hvcC`, `ispe`, `clap`, `irot`, `imir`.
  Tiles must share size and hvcC; limits 1,024 tiles and 16,384 px a side; null on anything else.
  `hevcCodecString` builds the ISO/IEC 14496-15 annex E string (`hvc1.1.6.L93.B0` for Main).
  `tileRect` places scaled tiles at rounded edges (no seams); `orientTransform` gives the canvas
  matrix for irot then imir.
- `apps/payapps/src/client/lib/heic-webcodecs.ts`: `isConfigSupported`, then each tile is a key
  `EncodedVideoChunk` (timestamp = tile index), and each output frame is drawn at its place straight
  onto a canvas at the JPEG's size, then turned and mirrored onto the display-size canvas. It
  returns null (the original is uploaded, as before) with no WebCodecs, an unsupported profile, a
  decode error or a missing tile.
- `packet-photo.ts`'s `browserDecoder` tries the native image decoder first, then this.
- The packet's HEIC note and the upload form's help text name Chrome and Edge.

## Verification

- Unit: `src/shared/heif.test.ts` (fixtures, truncations, 400 random corruptions never throw,
  codec strings, tile edges, corner mappings) and `test/unit/heic-webcodecs.test.ts` (fake decoder
  and canvas: chunks fed, draw rectangles, the turned canvas sizes and matrix, every give-up path).
  Full unit suite: 140 files, 1,302 passed, 1 skipped. `tsc --noEmit` clean, `biome ci` clean.
- End to end, `test/fixtures/pdf-sources/heic-webcodecs-check.cjs` in Playwright's Chromium 158.
  That Chromium has no HEVC decoder (`isConfigSupported` false for every hvc1 string, true for avc1),
  so the stand-in is only the decoder: the page's parser hands back each tile's bytes, ffmpeg decodes
  exactly those bytes, and a stub `VideoDecoder` asserts every chunk equals its tile before returning
  ffmpeg's picture as a real `VideoFrame`. The rest is the real code. Against pillow-heif's decode
  (libheif + libde265, transforms applied):

| fixture | tiles | ours vs libheif, full size | scaled to 37% |
|---|---|---|---|
| exif-photo-libheif.heic (64 x 48 via clap) | 1 | 48.13 dB | 48.13 dB |
| heic-grid-libheif.heic (3 x 2 of 256, cropped to 600 x 400) | 6 | 40.96 dB | 34.77 dB |
| heic-grid-rot-libheif.heic (irot 3) | 6 | 40.96 dB | 34.79 dB |
| heic-grid-transpose-libheif.heic (irot 3, imir) | 6 | 40.94 dB | 34.80 dB |
| heic-single-libheif.heic (one item) | 1 | 40.97 dB | 35.82 dB |

  Control: our transposed output against libheif's rotate-only picture is 8.42 dB, so the check can
  fail on orientation. The about 41 dB is JPEG at quality 0.95 plus YUV-to-RGB differences.

## Not known yet (next run)

- **Not run on a real HEVC decoder or a real iPhone photo.** The libheif fixtures are profile 3
  (Main Still Picture, `hvc1.3.E...`); iPhones write Main. Whether a given GPU's decoder accepts
  either is exactly what `isConfigSupported` answers, and a "no" falls back safely. Next check: Chrome
  on Windows and Android with a real iPhone photo (ROADMAP Next, "Backup packets, part 3").
- `imir`'s bit follows libheif's reading (1 = left-right), confirmed against libheif only.
- Colour profiles are not applied (Display P3 drawn as sRGB, slightly less saturated).
