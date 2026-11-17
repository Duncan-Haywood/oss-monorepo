# Opcode flag bit 1: full quality runs it (2026-11-13)

Flagship 7's `next:` listed this as buildable here: `dng_opcodes.plan()` skipped every opcode
with flag bit 1 set, in every develop.

## What the specification says

DNG 1.7.1.0 (September 2023), chapter 6, p. 104, read from the PDF this session (pdftotext of
the file at the helpx.adobe.com URL in `opcode-spec-audit-2026-11-12.md`):

> Next is a 32-bit unsigned integer, which contains various flag bits. There are two defined flag
> bits. If bit 0 (the least significant bit) is set to 1, the opcode is considered optional, and
> the DNG reader may decide to not apply this opcode if it wishes, or it does not understand the
> opcode ID. If bit 1 (the second to least significant bit) is set to 1, the opcode can be skipped
> when doing "preview quality" processing, and only needs to be applied when doing "full quality"
> processing.

So bit 1 is permission to skip in a quick render, not an instruction to skip in a full one. The
module's property was named `preview_only` and `plan()` dropped those opcodes unconditionally.

## The change

- `Opcode.full_quality_only` (was `preview_only`), with the quote in its docstring.
- `plan(..., preview=False)`: at full quality (the default) a bit-1 opcode is handled like any
  other; at preview quality it is skipped and counted:
  `"OpcodeList2: 1 x GainMap skipped (full quality only; this is a preview-quality render)"`.
- `DevelopSettings.preview_quality` (default off) and `shootflow develop --preview-quality`.
- `still_for_review`, the half-size develop made for proxies and analysis when a DNG has no
  embedded preview, is a preview-quality render: it sets both `half` and `preview_quality`.
- The WarpRectilinear2 skip rule (p. 105) is armed only by a WarpRectilinear2 that was applied, so
  an optional, bit-1 WarpRectilinear2 in a preview render leaves its fallback warp in place, and in
  a full render replaces it.

## Checks

`tests/test_dng_quality_flag.py` (10 tests, one for the listing tool) and one rewritten case in `tests/test_dng_warp2.py`:
the bit is read from bit 1 and independent of bit 0; a flagged FixVignetteRadial runs at full
quality and is skipped and named at preview quality; unflagged opcodes run in both; the skip rule
in both modes; a flagged GainMap on a darkened synthetic DNG restores the scene at full quality
(within 3 8-bit steps) and leaves it more than 40 steps off at preview; `still_for_review` passes
`preview_quality`; the CLI flag. With the old `plan()` body (the skip unconditional), 6 of the 11
fail.

## Real files

`tools/dng_opcode_flags.py` lists every opcode's flags. On the six camera DNGs in
drewnoakes/metadata-extractor-images (`dng/`, listed with a blobless `git clone --filter=blob:none
--no-checkout`, since api.github.com's tree listing answers 403 from a cloud session; files from
raw.githubusercontent.com):

| file | opcodes (flags) | bit 1 set |
|---|---|---|
| DJI Phantom 4 (1).dng | L1 FixBadPixelsList (0); L3 WarpRectilinear (0), FixVignetteRadial (0) | no |
| DJI Phantom 4 (2).dng | same as (1) | no |
| LG Nexus 5X.dng | L2 GainMap x4 (1, optional) | no |
| Leica T (Typ 701).dng | L3 WarpRectilinear (0) | no |
| Leica X VARIO (Typ 107).dng | L3 WarpRectilinear (0) | no |
| Pentax QS1.dng | none | - |

(`bigtiff.dng` and `bigtiff_be.dng` in the same folder are 2 KB BigTIFF test stubs; the reader
rejects BigTIFF, magic 43.)

So on every real file available the change runs exactly what ran before: it fixes a misreading
that would bite on a file that sets the bit, and none here does. Which writers set it is not
known from this set; Adobe's DNG Converter, which writes warp and vignette opcodes from its lens
profiles, is the obvious next file to look at.

## A side result: the first DJI DNG, and the first real FixVignetteRadial and FixBadPixelsList

The DJI Phantom 4 files (camera FC330, 4000 x 3000, RGGB, black 800, white 16383) are the first
real files here carrying `FixVignetteRadial` and `FixBadPixelsList`; until now both opcodes had
run only on synthetic files (`vignette-polynomial-2026-11-12.md`, `bad-pixels-2026-11-12.md`).
`shootflow develop --half` on `DJI Phantom 4 (1).dng` (pure Python, 46 s) applies all three
opcodes; `FixBadPixelsList` repairs 9,334 sensels.

Against LibRaw (rawpy 0.28.0, `tools/dng_camera_check.py --preview`, opcodes off on both sides,
since LibRaw runs none): median difference 0.012 8-bit steps, 99th percentile 0.07, channel
means equal to 4 decimals, linear ratio 1.0000-1.0001, white balance equal to LibRaw's as-shot
multipliers. The half-size frames differ by 2 px each way (1996 x 1496 against 2000 x 1500).

Corner brightness over the centre, the same frame:

| render | top left | top right | bottom left | bottom right |
|---|---|---|---|---|
| LibRaw | 1.886 | 3.088 | 0.365 | 0.543 |
| ShootFlow, opcodes off | 1.891 | 3.094 | 0.365 | 0.545 |
| ShootFlow, opcodes on | 2.722 | 4.087 | 0.517 | 0.789 |

The ratios are mostly the scene (sky at the top); what the opcodes add is the 1.32x to 1.45x
lift at each corner, the drone's own vignetting correction. The tool printed no comparison with
the embedded preview for this file, so whether that lift matches DJI's own render is not checked.

## Not checked

- No real file with bit 1 set.
- Whether any other reader (the DNG SDK's `dng_opcode_list::Apply`, RawTherapee, darktable)
  skips bit-1 opcodes in its own preview path; only the specification's text was used.

Reproduce:

    curl -LO https://helpx.adobe.com/content/dam/help/en/photoshop/pdf/DNG_Spec_1_7_1_0.pdf
    pdftotext -layout DNG_Spec_1_7_1_0.pdf - | grep -n -A3 "If bit 1"
    git clone --depth 1 --filter=blob:none --no-checkout https://github.com/drewnoakes/metadata-extractor-images.git mei
    git -C mei ls-tree -r --name-only HEAD | grep -i '\.dng$'
    curl -LO "https://raw.githubusercontent.com/drewnoakes/metadata-extractor-images/master/dng/DJI%20Phantom%204%20(1).dng"
    PYTHONPATH=src python3 tools/dng_opcode_flags.py *.dng
