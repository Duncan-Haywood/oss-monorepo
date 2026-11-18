# Panasonic RW2 RawFormat 8: three more bodies, a 4 x 2 tile grid, and no tone curves (2026-11-18)

## Why

The flagship row's next item was "an RW2 RawFormat 8 with a tone curve (0x39/0x3A)": `rw2.py`
refuses a file whose curve is not the identity, because no file at hand showed what a curve means.
This run looked for one. There isn't one in the public set. Along the way it found three bodies
nobody had checked, and a real frame that both our reader and LibRaw refused.

## The survey: no public file has a tone curve

raw.pixls.us (CC0) holds 35 RawFormat 8 RW2s from nine bodies: DC-GH6 (5), DC-GH7 (4), DC-G9M2 (5),
DC-S1M2 (2), DC-S1M2ES (1), DC-S1RM2 (10), DC-S5M2 (3), DC-S5M2X (3), DC-S9 (3). Only the first 64 KB
of each was fetched (`curl -r 0-65535`), which is enough for IFD0, and every tag was read the way
`C8Params` reads it. Output, one line per file: `eval/panasonic-rw2-format8-curve-survey-2026-11-18.txt`.

All 35 files carry the identity curve (0x39 = 65536 six times, 0x3A all zero), zero per-symbol
shifts (0x41), zero starting values (0x3C-0x3F) and a top value of 65535 (0x3B). At 12, 14 and
16 bits, across every body Panasonic has shipped with RawFormat 8, nothing exercises the curve
path. The refusal stays, and the item comes off the row: no buildable input exists for it.

## Three bodies never checked, against LibRaw 0.22.2

`tools/rw2_libraw_check.py --engines native` (rawpy 0.28, LibRaw 0.22.2). Rows:
`eval/panasonic-rw2-format8-grid-libraw-2026-11-18.jsonl`.

| body | file | bits, tiles | sensels | differing | WB, black, CFA, crop, white |
|---|---|---|---|---|---|
| DC-S1RM2 (S1R II) | P1000236 | 12, 2 | 44,281,664 | 0 | all = LibRaw |
| DC-S1RM2 | P1000454 | 14, 2 | 44,281,664 | 0 | all = LibRaw |
| DC-S1RM2 | S1Rii_65x24 (65:24 crop, 1212 rows off the top) | 14, 2 | 44,281,664 | 0 | all = LibRaw |
| DC-S1RM2 | S1Rii_electronic_shtr | 14, 2 | 44,281,664 | 0 | all = LibRaw |
| DC-S1RM2 | S1Rii_multiexposure | 14, 2 | 44,281,664 | 0 | all = LibRaw |
| DC-S5M2X (S5 IIX) | P1055415 | 14, 2 | 24,080,064 | 0 | all = LibRaw |
| DC-S1M2ES (S1 II E) | 3_2_P1022959 | 14, 2 | 24,160,256 | 0 | all = LibRaw |
| DC-S5M2 | P1126473_96MP | 14, 3 | 96,160,064 | 0 | all = LibRaw |
| DC-S9 | ..._XL_96MP | 12, 3 | 96,160,064 | 0 | all = LibRaw |

That makes 462.0 M more sensels equal, on 9 files. The S5 II's and S9's 96 MP frames had not been checked before.

## The S1R II's 177 MP mode: a second row of tiles

`DC-S1RM2/P1000450.RW2` (200 MB) is the S1R II's high-resolution mode: 16296 x 10856 sensels in
4 x 2 tiles. It is the only real file in the public set with more than one row of tiles. Before this run:

- our reader refused it: `tile 4 (4656 x 5224 at 369098752, 5632) does not fit`;
- LibRaw 0.22.2 refuses it too: `LibRawIOError: Input/output error`.

The tile tags:

| tag | values |
|---|---|
| 0x45 (left) | 0, 4656, 8448, 12080, **369098752, 369103408, 369107200, 369110832** |
| 0x47 (width) | 4656, 3792, 3632, 4216, 4656, 3792, 3632, 4216 |
| 0x48 (height) | 5632 x 4, 5224 x 4 |

369098752 is 0x16000000. Its high 16 bits (0x1600) are 5632, the height of the first row of tiles. So
tag 0x45 holds `(top << 16) | left`, and on a single row of tiles the top is always 0, which is why
the ten files of 2026-11-15 read as "left" alone. The fix (`C8Params`): split the entry, and refuse a
tile whose stored top disagrees with the heights of the tiles above it rather than trusting either.
The synthetic encoder in `tests/test_rw2_c8.py` now writes the packed form. Two new tests cover a
4 x 2 grid of unequal widths and heights like this one, and the refusal of a second-row tile that
says it starts at row 0.

Now: `RW2: Panasonic RawFormat 8, 14-bit, 8 tiles` in 3.05 s (C), in-camera crop 16288 x 10848 at
(4, 4), black 512, white 16319, as-shot WB R/G 1.836, B/G 2.105.

### Checking it with no LibRaw to compare against

`tools/rw2_grid_check.py`, new. Rows: `eval/panasonic-rw2-format8-grid-seams-2026-11-18.jsonl`.

- **Seams.** At every tile edge, the mean step between same-colour sensels straddling it (two
  columns or rows apart), divided by the median of that step over the 32 positions either side.
  A misplaced or mis-predicted tile gives a jump.
- **Preview.** Each tile, binned to the embedded 1920 x 1280 JPEG, against the JPEG's luma over the
  same area (Spearman's rank correlation, so the camera's tone curve and clipping don't count).
- **Engines.** The C decoder and the pure-Python reference on the first 24 row pairs of all eight
  tiles (both rows of tiles): identical.

| file | seam ratios | preview rank r per tile |
|---|---|---|
| S1R II P1000450, 4 x 2 (no LibRaw) | x 1.073, 1.030, 1.058; **y=5632 0.976** | 0.60, 0.95, 0.95, 0.80, 0.92, 0.97, 0.94, 0.84 |
| S5 II 96 MP, 3 x 1 (= LibRaw, control) | 1.168, 1.112 | 0.93, 0.91, 0.76 |
| S1R II P1000454, 2 x 1 (= LibRaw, control) | 1.033 | 0.83, 0.65 |
| P1000450 with a block swapped (negative control) | x=12080 **28.96**, y=5632 **46.21** | tile 0: 0.60 to **0.19** |
| S5 II 96 MP with a block swapped | x=7984 **18.91** | tile 0: 0.93 to 0.61 |

The new frame's seams are as smooth as those of the files LibRaw confirms (0.98 to 1.07, against 1.03 to 1.17), and
the negative control shows the check sees a wrong tile (19 to 46). The preview correlation is the
weaker signal: tile 0 of P1000450 sits at 0.60, but its seams are clean and the engines agree.
Its swap drops it to 0.19, so the low value is read as the scene, not the decode. That is a
judgement, not a measurement; a sensel-by-sensel check waits on a reader that opens the file
(a later LibRaw, or Adobe DNG Converter on a machine that has it).

## Not done

- A tone curve, shifts or starting values: none in 35 files from all nine bodies; the refusal stays.
- P1000450 has not been compared sensel by sensel with another decoder.
- Why LibRaw 0.22.2 refuses P1000450 was not traced (its pana8 path, or an allocation limit at 177 MP).
- Colour still needs each body's `.dcp`, as for every RW2.
