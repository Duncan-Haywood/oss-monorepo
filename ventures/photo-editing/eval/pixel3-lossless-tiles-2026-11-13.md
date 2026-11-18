# A phone's lossless-JPEG DNG against LibRaw, and its tiles decoded on every CPU (2026-11-13)

## Why

Two open items on the flagship (`portfolio/flagships.yaml`, photo-editing):

- "next on speed: the lossless-JPEG decode of compressed DNGs and CR2s in bands of restart
  intervals or tiles across threads (tiles are independent; check byte-identical at every thread
  count)";
- since `eval/ljpeg-native-huffman-2026-11-12.md`: "No camera- or phone-written lossless-JPEG
  **DNG** was available". Every compressed DNG ShootFlow had read was one its own tests wrote.

This run found one: `pixel3.dng` in the MIT-licensed tinydng repository
(`https://raw.githubusercontent.com/syoyo/tinydng/master/pixel3.dng`, 12.2 MB). It is a Google
Pixel 3 XL raw: 4032 x 3024, BGGR, lossless JPEG (compression 7) in 192 tiles of 256 x 256,
OpcodeList2 with four GainMaps (the lens shading map), OpcodeList3 with a WarpRectilinear (flag 1,
optional), Orientation 6. It is downloaded at check time and not committed.

## The sensels match LibRaw exactly

ShootFlow's `read_raw` against `rawpy.imread(...).raw_image` (rawpy 0.28.0, LibRaw 0.22.2):

| file | samples | differ |
| --- | ---: | ---: |
| Pixel 3 XL `pixel3.dng`, lossless-JPEG tiles | 12,192,768 | **0** |

`tools/dng_camera_check.py --colour dcraw` (half size, opcodes off, both with the camera's own
white balance 1.4302 / 1 / 2.3704): median difference **0.054** of an 8-bit step, p99 0.405,
linear ratio 1.0003 / 1.0004 / 1.0004, channel means equal to 4 decimals. With `--colour dng` (the
DNG specification's colour model, which LibRaw does not use) the median is 0.553 and p99 3.88, in
line with the Nexus 5X's 0.44 in `eval/camera-dngs-2026-11-12.md`. Black level: ShootFlow reports the mean 1023;
LibRaw lists 1022 / 1022 / 1023 / 1025 per CFA position.

## The phone's lens shading map, against the phone's own preview

The tool compares corner brightness (mean linear luminance of each 1/8 corner tile over the centre
tile) of the renders with the camera's embedded preview. The preview (672 x 504) is stored the way
the sensor reads out, while the renders are already turned by Orientation 6, so the old tool
compared the wrong corners on this file. It now turns the preview by the same Orientation (3, 6 or
8) when its shape says it has not been turned, and records `preview_rotated_for_orientation`.

| corner / centre | LibRaw | ShootFlow, opcodes off | ShootFlow, GainMap + warp on | phone preview |
| --- | ---: | ---: | ---: | ---: |
| top left | 0.034 | 0.035 | 0.089 | 0.010 |
| top right | 0.032 | 0.033 | 0.080 | 0.007 |
| bottom left | 0.783 | 0.796 | **2.110** | **1.923** |
| bottom right | 0.514 | 0.512 | **1.308** | **1.536** |

The two top corners are dark scene content: the phone's tone curve takes them to near black, so
their ratio says little. The two bottom corners carry light. Without the GainMap they come out at
41% and 33% of the phone's own level; with it, at 110% and 85%. The remaining gap is within what
the phone's tone curve and local tone mapping (not reproduced here) can move a corner tile, so
this is a sanity check that the shading map runs the right way up and by about the right amount
on a real phone file, not a measurement of its accuracy.

## Tiles on a thread pool

`raw_develop._decode_chunks` decodes lossless-JPEG tiles and strips on a thread pool, at most one
thread per chunk, `SHOOTFLOW_THREADS` threads if set, else one per CPU (as the develop and the
warp do). Each tile is its own JPEG stream, so its samples depend only on its own bytes; the
results come back in file order and are placed exactly as before, and an error in any tile raises
the same `DevelopError`. The C Huffman reader is called through ctypes, which releases the GIL, and
the numpy prediction pass releases it in its array operations. Uncompressed chunks and Canon CR2s
(one stream, no restart markers in the files tried) are unchanged. The native reader's first build
is now behind a lock so two threads cannot compile it at once.

Same samples: the SHA-256 of the Pixel 3 sensels is `7304e29f5ddae78c` (first 16 hex) at 1, 2 and
4 threads. `tests/test_raw_develop.py::ThreadedTileDecodeTests` reads tiled lossless DNGs (one and
two components, predictor 6, restart intervals; edge tiles that hang over the image) at 1, 2, 3 and
8 threads with the native and the pure-Python Huffman engine and compares every sample with the
sensor; checks file order at 1, 2, 4 and 64 threads; and checks that a tile without SOI raises at
1, 2 and 4 threads.

Time, `read_raw` on the Pixel 3 file, this container (4 CPUs), best of 5. One thread runs the same
serial loop as before this change.

| threads | read, best of 5 | read, median | full default develop (numpy, GainMap + cubic warp), best of 2 |
| ---: | ---: | ---: | ---: |
| 1 (the old serial path) | 0.332 s | 0.339 s | 6.19 s |
| 2 | 0.231 s | 0.263 s | 4.16 s |
| 4 | 0.213 s | 0.245 s | 2.86 s |

The tile decode alone (`_decode_chunks`, no placing) goes from 0.345 s on one thread to 0.169 s on
two and 0.155 s on four. The read as a whole is 1.6 times faster on four CPUs; the rest of it
(placing tiles, allocating the plane) is serial. Read plus default develop: 6.5 s on one thread,
3.1 s on four (the develop's own threading landed earlier today).

Why not 4x: per tile, the de-stuffing (`bytes.replace`), the word packing and the table lookups
run in Python with the GIL held, about half of a tile's time. Making those native too (or doing the
de-stuffing inside the C reader) is the next step if reads matter more.

## Not done

- No restart-interval split for CR2s: the 5D Mark II stream has no restart markers, so its one
  scan cannot be split without a decode pass to find the boundaries.
- The `_normalised_plane` stage is still serial.
- The Pixel's WarpRectilinear and GainMap are compared only with the preview's corners, not with
  Google's own full-size JPEG of the frame (none is in the repository).

## Reproduce

    python3 -m venv /tmp/v && /tmp/v/bin/pip install rawpy numpy pillow
    curl -LO https://raw.githubusercontent.com/syoyo/tinydng/master/pixel3.dng
    PYTHONPATH=src:tests /tmp/v/bin/python tools/dng_camera_check.py pixel3.dng --colour dcraw --preview
    for t in 1 2 4; do SHOOTFLOW_THREADS=$t PYTHONPATH=src /tmp/v/bin/python -c \
      "import time; from shootflow import raw_develop as r; t=time.time(); r.read_raw('pixel3.dng'); print(time.time()-t)"; done
