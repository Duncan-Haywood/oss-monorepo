# Fujifilm RAF read directly, and an X-Trans demosaic, against LibRaw (2026-11-14)

## Why

The developer read DNG, CR2, ARW, NEF, ORF, RW2, SRW and PEF. A Fujifilm RAF stopped at the grade
stage with "convert RAF to DNG". Fujifilm is the one large maker whose current bodies mostly do not
use a Bayer sensor: the X-Trans layout repeats every 6x6 sensels, and the developer only knew 2x2
patterns (`_cfa_pattern` refused anything else). So RAF needed two things, a reader and a 6x6
demosaic. The flagship row's buildable item named the three RAFs in the public samples the proxy
serves (`github.com/drewnoakes/metadata-extractor-images`, sparse checkout of `raf/`):
`Fujifilm X-E1.raf` (X-Trans, 12-bit), `FujiFilm EX-2.raf` (its header says X-E2; X-Trans, 14-bit)
and `FujiFilm FinePix S5500.raf` (Bayer, 2005).

## What was built

`src/shootflow/raf.py`, standard library only (numpy speeds up the 12-bit unpack when present):

- The fixed big-endian header (magic, model at 28, JPEG / header / CFA offsets at 84, 92, 100) and
  the RAF header records: 0x0100 stored size, 0x0110 and 0x0111 the picture area (top, left;
  height, width), 0x0130 the layout bytes (SuperCCD refused), 0x0131 the X-Trans layout, 0x2FF0
  the older bodies' balance (G, R, G, B).
- X-Trans bodies put a small little-endian TIFF in the CFA block whose 0xF000 sub-IFD gives width,
  height, bits, data offset and length, 36 black levels (0xF00A) and the balance (0xF00E: G, R, B).
  The S5500's CFA block is bare sensor data.
- Storage: 16-bit little-endian words (X-E2, S5500) and 12-bit little-endian packing, first sensel
  in the low 12 bits (X-E1), told apart by the data's length. Anything shorter (Fujifilm's lossless
  compression on X-T2-era and later bodies) is refused with a message to convert to DNG.
- The file's EXIF is the embedded JPEG's (APP1 at JPEG + 12): Make, Model, Orientation and lens
  reach the developer as for every other format.

In the developer (`raw_develop.py`, `raw_develop_np.py`):

- `_cfa_pattern` accepts a 6x6 repeat; `cfa_period` and `cfa_offsets` give the period and, for each
  of its 36 phases and each colour, the 3x3 neighbours holding that colour. Every 3x3 window of
  X-Trans holds all three colours (checked over all 36 phases), so the bilinear demosaic carries over
  unchanged in kind, with the period as a parameter. The highlight caps get one row per phase.
- At the image edge a clipped 2x3 X-Trans window can lack a colour (never on Bayer). The pure path
  already borrowed the reflected neighbours there; the numpy path now does the same, in the same
  order, so the engines still agree byte for byte.
- Half size: 2x2 blocks of X-Trans do not each hold R, G and B, so half size on a 6x6 CFA demosaics
  at full size, clips, and averages each 2x2 block (summed in row order from 0.0 on both engines).
- Wired into `parse_raw` (checked first: the RAF magic is unambiguous), the colour gate,
  `camera_profiles.camera_of` ("Fujifilm X-E1", Adobe's naming), `raw_preview` (a `.raf` now needs
  a profile, so the grade stage develops it) and the grade stage's refusal message. `.raf` was
  already in the ingest and catalogue lists.

## Check against LibRaw

`PYTHONPATH=src python tools/raf_libraw_check.py raf/*.raf` with rawpy (LibRaw 0.22.2) and numpy in a
venv. Raw rows: `eval/fujifilm-raf-libraw-2026-11-14.jsonl`.

| body | CFA | storage | sensels | differing | WB R/G, B/G (ours = LibRaw) | black | white | read s |
|---|---|---|---|---|---|---|---|---|
| X-E1 | X-Trans | 12-bit packed | 16,834,560 | 0 | 1.8411, 2.2219 | 255 (x36) | 4095 | 0.33 |
| X-E2 | X-Trans | 16-bit words, 14-bit data | 16,453,632 | 0 | 1.8675, 1.5762 | 1023 (x36) | 16383 | 0.24 |
| FinePix S5500 | RGGB | 16-bit words | 4,008,960 | 0 | 1.6125, 1.5375 | 0 | 15872 | 0.01 |

The 6x6 (or 2x2) pattern equals LibRaw's `raw_pattern` on all three, once LibRaw's pattern is moved
from its visible origin to the stored frame's origin (the X-E2's left margin is 6, a whole period).
The black level at every one of the 36 positions equals LibRaw's.

## Findings

- **Header record 0x0131 is stored backwards.** Byte `35 - k` is position `k`. Read forwards it
  matches neither file. Independently of LibRaw: on the X-E2's picture area, each of the 36
  positions' mean over its 6x6 block, against what the as-shot balance predicts for that colour,
  correlates at r = 1.000 read backwards and 0.087 forwards (X-E1: 0.836 and 0.036, a redder scene).
- **The picture area in the header is centred on the camera's JPEG.** `eval/raf_jpeg_alignment.py`
  scales each embedded JPEG up to the header's picture area, slides it over a LibRaw render and
  finds the best shift in each corner on its own (raw rows: `eval/fujifilm-raf-jpeg-alignment-2026-11-14.jsonl`).
  On both X-Trans bodies the corners' shifts differ by exactly 16 px each way and their centre falls
  on the header area's centre (X-E1: column 2476, row 1644; X-E2: 2472, 1648): the camera's JPEG is
  the header area less 8 px on each side. The S5500's corners differ by 9-10 px across and 6 px down,
  centred to within 1 px. So the header area is the camera's picture, a few pixels generous, and it
  is what the crop uses; no per-body measurement is needed as it was for the Pentax.
- **LibRaw's crop differs a little.** It moves an X-Trans origin onto the 6x6 grid (X-E1: column 28
  to 30; X-E2: row 16 to 18) and shrinks the size by 2. The developer does not need that: the CFA
  pattern is relative to the active area and the crop is applied after demosaicing.
- **The embedded JPEGs are not full size.** 1920 x 1280 on both X-Trans bodies, 1280 x 960 on the
  S5500, so the alignment above is good to about one pixel of the scaled JPEG.
- **The S5500 has no masked sensels.** Its left and right edge columns average 1,050 to 1,570, well
  above LibRaw's black of 0, and its top six rows hold values near 39,000 (junk LibRaw also leaves
  outside its visible area). Its white level, 0x3E00, is dcraw's constant for these bodies; the
  picture area peaks at 13,730.

## Develop

`shootflow develop X.RAF --dcp FOLDER --format png` with a placeholder profile per camera (built by
`tests/test_arw.make_profile`, an sRGB matrix, so colour is not Fujifilm's): the profile is chosen
by camera, the picture area is applied (4896 x 3264 on both X-Trans bodies, 2272 x 1704 on the
S5500), 6.9 s (X-E1), 7.1 s (X-E2) and 1.9 s (S5500) end to end with numpy on this container. On a
600 x 402 window of the real X-E1 sensor data the pure-Python and numpy engines give identical bytes,
full and half size (0.66 s and 0.05 s full size).

`tests/test_raf.py` (14 tests): a builder writes RAFs the way the real ones are laid out (16-bit and
12-bit X-Trans TIFF blocks, a bare Bayer block); known sensels come back exactly, at even and odd
widths; the tags (pattern read backwards, 36 blacks, balance, picture area as (left, top)); the
refusals (data as short as compressed data would be, SuperCCD, a non-RAF); flat fields stay flat
on both engines, full and half size; the engines agree byte for byte on four sizes, including
sizes where an edge sensel needs the reflected neighbours; and the CLI chooses the profile and
crops to the picture area. Whole venture suite: see the run record.

## Not done

- **The demosaic is bilinear.** It is correct (flat fields stay flat, the phase is right on real
  frames) but X-Trans has more green and irregular red and blue spacing, and bilinear on it is softer
  and more prone to false colour than on Bayer. A Markesteijn-style or other directional X-Trans
  demosaic, measured against LibRaw's on these frames, is the next step.
- **Compressed RAF** (Fujifilm's lossless compression, X-T2 era and later, and the default on some
  newer bodies) is refused: no such file was at hand. Neither was a SuperCCD (S5Pro, F-series)
  file, nor a GFX (Bayer, 16-bit) one.
- No real Fujifilm `.dcp` was at hand, so colour was not checked beyond LibRaw's levels and balance.
- The lens name from the EXIF reaches `--lens-db`, but lensfun correction was not run on these files.
