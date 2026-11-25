# Cull page: HEVC previews of Nikon HLG raws (2026-11-24)

Flagship item (portfolio/flagships.yaml photo-editing, NEXT.md "From the cull page's AF point" (a)): HLG-mode
Z8/Z9 NEFs carry HEVC previews, so the page showed the 160 x 120 thumbnail and read the whole 51 MB file
looking for a JPEG. Decode the HEVC preview with WebCodecs where the browser has HEVC, and stop the
whole-file read once one is found.

## What the files hold

Three CC0 Z8 raws from aaron-rust/hdr-sample-images (IMAGE_001, 006, 019; the same set as
eval/cull-nikon-af-2026-11-24.md). Each has two reduced-resolution SubIFDs (NewSubfileType 1) with
Compression 34713 and one strip that starts `00 00 00 01 40 01` (an Annex B VPS): 1620 x 1080 (0.44 to
1.05 MB) and 320 x 212 (26 to 39 KB). ffprobe: Main 10, level 120, yuv420p10le, BT.2020, ARIB STD-B67
(HLG), coded 1632 x 1088 with a conformance window to 1620 x 1080. ffmpeg's trace_headers gives the
general constraint flags progressive, non-packed, frame-only and one-picture-only set.

## What changed

- `site/rawpreview.mjs`: reduced-resolution SubIFDs with Compression 34713 and one strip become HEVC
  candidates; `hevcCodec` reads the VPS or SPS profile_tier_level (emulation-prevention bytes removed) into
  an RFC 6381 string, `hev1.2.4.L120.B0.10` for all six streams here (L60 for the 320 px ones), which
  matches the trace above field by field. `readRaw` returns `hevc` (largest first); the byte scan for a JPEG
  and `readRawFile`'s whole-file fallback are skipped when an HEVC preview of 640 px or more is present.
  Raw sensor data (NewSubfileType 0, also 34713) is never a candidate.
- `site/hevcpreview.mjs` (new): `VideoDecoder.isConfigSupported` once per codec string, then the strip as
  one key `EncodedVideoChunk` (Annex B, no description), the frame drawn to a canvas and kept as a JPEG
  blob. Null where there is no decoder.
- `site/cull.html`: small or missing JPEG + HEVC preview: decode it; the large view says "the camera's HEVC
  preview", or that the browser has no HEVC decoder (Safari has one). Usage counters `hevc_previews`,
  `hevc_previews_unsupported`. Help text says the same.
- `site/hevcpreview.test.mjs`: 5 tests (the codec string from the Z8's own first 88 bytes, VPS and SPS;
  a NEF skeleton's HEVC list; a 50 MB skeleton read sparsely, under 1 MB; the decoder fed one Annex B key
  chunk; no decoder gives null, a failed decode rejects).

## Check 1: bytes read and metadata (node, readRawFile)

| file | main: bytes read | now: bytes read | now: time |
| --- | --- | --- | --- |
| IMAGE_001.NEF | 51,134,526 (whole) | 327,680 | 13 ms |
| IMAGE_006.NEF | 50,650,442 (whole) | 327,680 | 9 ms |
| IMAGE_019.NEF | 47,820,744 (whole) | 327,680 | 4 ms |

Main took about 500 ms a file. `meta` (AF points included) and the JPEG `previews` list are deep-equal to
main's on all three.

## Check 2: the page in Chromium (eval/cull-hevc-previews.mjs, https origin)

| run | HEVC decoder | status line | previews | large view |
| --- | --- | --- | --- | --- |
| native | none (`isConfigSupported` false) | 3 files, read in 0.1 s; **1 MB of 143 MB** | 160 x 120 x 3 | "thumbnail: this browser has no HEVC decoder ... Safari has one" |
| shim (ffmpeg stands in for the decoder) | yes | 3 files, read in 4.8 s; 3 MB of 143 MB | **1620 x 1080 x 3** | "the camera's HEVC preview", AF grid drawn on it |

No page errors in either. Raw output: `cull-hevc-previews-2026-11-24.json`. The shim run checks everything
after the decoder (chunk handed over intact, frame to canvas to JPEG, grid, detail score, AF view, CSV); it
does not check a browser's own decode. On an http origin `VideoDecoder` is not exposed at all (WebCodecs
needs a secure context); the live page is https.

Why it matters for culling: eval/cull-nikon-af-2026-11-24.md ranked detail at the AF point on these files at
median 0.92 of the frame on the 1620 px HEVC preview against 0.73 on the thumbnail.

## Open

- A real Safari, or Chrome on hardware with HEVC, decoding a Z8 HLG card; how its HLG-to-sRGB mapping looks
  next to the camera's own screen (the page does no tone mapping of its own).
- Browsers without HEVC keep the thumbnail. A software decoder (libde265 is LGPL) was not added: a few MB of
  WebAssembly for one tone mode of two bodies.

## Reproduce

```bash
for i in 01 06 19; do curl -sSLo z8/IMAGE_0$i.NEF \
  "https://media.githubusercontent.com/media/aaron-rust/hdr-sample-images/main/image_gallery_hdr_sdr_raw_png_avif_jpeg/00_RAW/NIKON-Z8_BAYER-MATRIX_14BIT_LOSSLESS/IMAGE_0$i.NEF"; done
node --test site/hevcpreview.test.mjs
node eval/cull-hevc-previews.mjs z8 OUT     # Playwright Chromium; the shim run needs ffmpeg
```
