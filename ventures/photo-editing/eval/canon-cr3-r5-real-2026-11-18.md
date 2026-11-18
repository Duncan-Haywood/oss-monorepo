# Real EOS R5, R5 Mark II and R3 CR3s against LibRaw (2026-11-18)

## Why

The CR3 reader had been checked on five real files (two R8 RAW, two R8 C-RAW, one R3 C-RAW), all from
the metadata-extractor-images collection, because raw.pixls.us refused this container's proxy on
2026-11-15. The tiled layouts were checked only on R8 frames re-stored as tiles by our own encoder
(`eval/canon-cr3-tiled-2026-11-15.md`, `eval/canon-cr3-craw-tiled-2026-11-16.md`), and the flagship's
`next:` asked for "a real tiled CR3". Today raw.pixls.us answers, and it holds the wide Canon bodies.

## Files

raw.pixls.us (CC0), downloaded at check time and not committed. Local names in the JSONL rows map to:

| row `file` | raw.pixls.us path (under `data/Canon/`) | body, quality | size (CMP1) | sha256 (first 12) |
| --- | --- | --- | --- | --- |
| `Canon_EOS_R5_RAW_ISO_100_nocrop_nodual.CR3` | `EOS R5/` same name | R5, RAW | 8352 x 5586 | 21430c36387e |
| `Canon_EOS_R5_RAW_ISO_100_crop_nodual.CR3` | `EOS R5/` same name | R5, RAW, 1.6x crop | 5248 x 3510 | dc3ef975ef02 |
| `Canon_EOS_R5_CRAW_ISO_100_nocrop_nodual.CR3` | `EOS R5/` same name | R5, C-RAW | 8352 x 5586 | 2deae46b816e |
| `Canon_EOS_R5_CRAW_ISO_100_crop_nodual.CR3` | `EOS R5/` same name | R5, C-RAW, crop | 5248 x 3510 | a5f4935e0331 |
| `R3.CR3` | `EOS R3/_C3A1200.CR3` | R3, RAW | 6192 x 4152 | 295d46a4d538 |
| `R5m2_RAW.CR3` | `Canon EOS R5m2/RAW.CR3` | R5 Mark II, RAW | 8480 x 5650 | d6e6aa3b493e |
| `R5m2_CRAW.CR3` | `Canon EOS R5m2/CRAW.CR3` | R5 Mark II, C-RAW | 8480 x 5650 | b3c08a5c7a97 |
| `R5m2_APS-C_RAW.CR3` | `Canon EOS R5m2/APS-C_RAW.CR3` | R5 Mark II, RAW, crop | 5376 x 3574 | 9f88c0ff0129 |
| `R5m2_APS-C_CRAW.CR3` | `Canon EOS R5m2/APS-C_CRAW.CR3` | R5 Mark II, C-RAW, crop | 5376 x 3574 | 6a597497776a |

The four `*_dual.CR3` R5 files (Dual Pixel RAW, a second frame) were not checked this run.

## Finding 1: the real wide bodies store one tile

Every one of the nine files has CMP1's tile size equal to the frame (`tile_cols` and `tile_rows` 0), the
R5's 8352 and the R5 Mark II's 8480 sensels across included. The code and README said the "R5 class"
may store tiles side by side; on these bodies, at least in stills, it does not. So no real tiled CR3 is
known yet. The tiled path stays checked only by re-stored R8 frames, and the open item is narrower
than it read: find a body that actually writes tiles (Cinema EOS stills, the R1?) before spending more
on it.

## Finding 2: every sensel equal on all nine, with both engines

`tools/cr3_libraw_check.py` against LibRaw 0.22.2 (rawpy), rows in `canon-cr3-r5-libraw-2026-11-18.jsonl`:
0 of 290.1 M sensels differ from LibRaw's `raw_image` with the C decoder (RAW and C-RAW, full frame and
crop modes), CFA RGGB on all. The pure-Python reference agrees too on `R5m2_APS-C_RAW` and the R5 crop RAW ("Python engine" below). C read times: 1.3-1.4 s for the 46-48 M sensel RAW
frames, 1.8-2.0 s for C-RAW at that size.

## Finding 3: the R5 Mark II developed with a wrong black level and no white balance (fixed)

Before the fix (the same check, rows in `canon-cr3-r5-libraw-before-fix-2026-11-18.jsonl`):

| file | black ours / LibRaw | as-shot balance ours / LibRaw |
| --- | --- | --- |
| R5m2_RAW, R5m2_CRAW | 504, 504, 505, 503 / 512 | none / 1.835, 1.763 |
| R5m2_APS-C_RAW | 475, 477, 476, 472 / 512 | none / 1.738, 1.925 |
| R5m2_APS-C_CRAW | 474, 475, 475, 471 / 512 | none / 1.750, 1.918 |
| R5 (four files) | 511 / 510 | equal |
| R3 | 2047-2048 / 2047 | equal |

**Black.** ShootFlow measured black as the median of IAD1's left optical-black rectangle. On the
R5 Mark II that rectangle (columns 0-259 full frame, 0-131 in the APS-C crop) takes in two different
strips. Column means over rows 200 to height-200 of `R5m2_RAW`:

| columns | mean | std | what it is |
| --- | --- | --- | --- |
| 4-126 | 468.5 | 23.6 | darker, noisier strip |
| 134-256 | 512.2 | 5.6 | optical black at the stated level |
| 260 on | 871+ | | exposed |

In the APS-C crop the rectangle covers only the darker strip (474-475, std 8.6-8.8), with the real
optical black (512.1-512.5, std 1.6-2.1) right of it. On the R5 the same columns 4-126 read 510.6-511.0
(std 0.9-1.4): one strip, at the stated level. ColorData states a PerChannelBlackLevel, and on every file
here it equals LibRaw's `black_level_per_channel`. Found by searching ColorData for LibRaw's four values:

| ColorData length (version) | bodies here | PerChannelBlackLevel index | value |
| --- | --- | --- | --- |
| 3656 (33) | R5 | 0x157 | 510 |
| 3973 (34) | R3 | 0x16B | 2047 |
| 4528 (64) | R5 Mark II | 0x17F | 512 |

(each also appears a second time later in the block, 0x326 / 0x27C / 0x290, followed by the normal and
specular white levels). The reader now uses the stated level where its index is known, laid on the crop's
CFA phase, and notes the measured one when they differ by more than 4. Where the index is not known
(the R8's 3,778-entry ColorData11 and every older length) it measures as before.

What the old black cost: black 37 levels low on 15,871 levels of range lifts a tone five stops under
middle grey (0.18 / 32 of range, 89 levels above black) to 126 levels, 1.41x, half a stop, and true
black develops as a grey veil. Full frame (8 levels low) that tone was 9% bright.

**White balance.** ColorData12 (4,528 entries) was not in the as-shot index table, so the frame got no
as-shot balance. WB_RGGBLevelsAsShot is at 0x69, as in ColorData11 (1879/1024/1024/1805 on `R5m2_RAW`,
LibRaw's 1.835 and 1.763 to four places). Added.

After (`canon-cr3-r5-libraw-2026-11-18.jsonl`): black and balance equal to LibRaw on all nine, `ok` on all
nine, exit 0.

## Crop

Reported, not gated, as before: ShootFlow uses SensorInfo (the R5 Mark II's starts at 272, 176), LibRaw a
wider visible area (258, 162). Unchanged.

## Python engine

`--engines c,python` on `R5m2_APS-C_RAW` and `Canon_EOS_R5_RAW_ISO_100_crop_nodual` (the last two rows of
the JSONL): 0 sensels differ with the pure-Python reference either, 28.7 s and 28.2 s for 19.2 M and
18.4 M sensels (C: 0.4-0.6 s).

## Reproduce

```
cd ventures/photo-editing
python3 -m venv /tmp/v && /tmp/v/bin/pip install rawpy numpy
curl -L -o RAW.CR3 'https://raw.pixls.us/data/Canon/Canon%20EOS%20R5m2/RAW.CR3'
PYTHONPATH=src /tmp/v/bin/python tools/cr3_libraw_check.py RAW.CR3
```

Tests: `tests/test_cr3.py` (ColorData12 balance and stated black, the stated level winning over a
measured one with the gap noted, the R/G/G/B order laid on each crop phase, and an unknown index falling
back to measuring).
