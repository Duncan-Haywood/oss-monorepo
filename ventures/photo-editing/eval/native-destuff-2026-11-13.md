# Lossless-JPEG tiles decoded wholly in C: de-stuffing, restart walk and prediction (2026-11-13)

## Why

The flagship's speed item (`portfolio/flagships.yaml`, photo-editing), left by
`eval/pixel3-lossless-tiles-2026-11-13.md`: tiles decode on a thread pool, but on four CPUs the
Pixel 3 XL read was only 1.6 times faster than on one, and that note blamed "the de-stuffing
(`bytes.replace`), the word packing and the table lookups [that] run in Python with the GIL
held, about half of a tile's time". Next step named: "move the de-stuffing into the C reader".

## What the measurement said first

Before changing anything this run timed one Pixel tile (54,842 bytes, 32,768 MCUs of two
components, codes of 8 bits at most) on this container:

| step, one tile | time |
| --- | ---: |
| Python de-stuffing and word packing (`_segment_words`) | 0.10 ms |
| C Huffman pass on the prepared words (old kernel) | 1.13-1.20 ms |

So the GIL-held de-stuffing was about 8% of the Huffman stage, not half. Moving only it into C
changed the whole read by under 10% (0.33 s to 0.30 s median at 4 threads, noisy). A profile of
the read on one thread showed what did hold it back: the numpy prediction pass (`predict_rows`,
about 0.12 s of 0.56 s, much of it with the GIL held in small array calls) and, for the first
version of this change, building lookup tables per tile. The Pixel writes **its own Huffman
tables for every tile**, so a table cache keyed on the tables never hits (352 builds for 192
tiles). The earlier note's "half" was an estimate; this one is measured.

## What changed (`src/shootflow/ljpeg_native.py`, `raw_develop._scan_diffs_native`, `_decode_scan`)

1. `shootflow_huffman_scan` reads the scan's entropy-coded **bytes** directly: a stuffed `FF 00`
   reads as `FF`; `FF` followed by any other byte is a marker, after which the segment reads as
   zeros; with a restart interval it finds the segment's marker (whether or not the decode
   reached it), skips the next `FF D0`-`D7` and restarts the bit reader, exactly as the Python
   restart loop does. Four bytes are taken at once when none is `FF`. One call per scan.
2. A **12-bit first look-up** (8 KB a component, built per call from the code table) decodes every
   code of up to 12 bits; the 65,536-entry table (128 KB a component) is built only when some
   code is longer, and is otherwise not passed at all (a 12-bit miss is then an invalid code).
3. `shootflow_predict` is `_predict_scan` in C: any predictor 1-7, any restart interval, masked
   to 16 bits, returning an `array('H')`. It runs when the differences came from the C reader and
   the point transform is 0; other cases keep the numpy or Python pass.

Switches: `SHOOTFLOW_NATIVE=0` turns all C off (the pure Python decoder, the reference);
`SHOOTFLOW_NATIVE_SCAN=0` keeps the older per-interval C call on Python-prepared words;
`raw_develop.DECODE_ENGINE = "python" | "numpy" | "native"` pins the prediction pass.

## Same samples

- Pixel 3 XL `pixel3.dng` (MIT, tinydng repository, downloaded at check time): 0 of 12,192,768
  sensels differ from LibRaw 0.22.2 (`rawpy` 0.28.0); SHA-256 of the sensels `7304e29f5ddae78c`
  (first 16 hex), the same as before the change.
- `tests/test_ljpeg_native.py`: every encoder case of `test_ljpeg_fast.py` (seven predictors, one
  to four components, restart intervals on and off row boundaries, point transform, size 16,
  byte stuffing) again with the C reader, and again with the prediction pinned to C
  (`NativePredictionTests`); a spy checks one C call per scan and that the C prediction is taken.
  `test_scan_reader_matches_the_word_reader_on_hostile_bytes` runs 1,500 random byte strings
  weighted towards `00`, `FF`, `D0`-`D7` and `D9` (stuffing, `FF FF` runs, a trailing `FF`,
  restart markers, short data, positions past the end, zero MCUs) through the C scan reader and
  through the pure loop over `_segment_words` with three table sets (codes to 16 bits, mixed, all
  of 5 bits), and requires identical differences or both an invalid code.

## Time

`parse_raw` on the Pixel file, this container (4 CPUs, noisy shared host), 10 repetitions at
each thread count, three alternating runs of the code before (`main` at 2d82e14d) and after:

| threads | before, best | before, median | after, best | after, median |
| ---: | ---: | ---: | ---: | ---: |
| 1 | 0.320-0.349 s | 0.378-0.405 s | 0.214-0.217 s | 0.226-0.276 s |
| 2 | 0.206-0.215 s | 0.224-0.242 s | 0.119-0.130 s | 0.138-0.151 s |
| 4 | 0.207-0.218 s | 0.230-0.237 s | 0.091-0.107 s | 0.114-0.121 s |

About 1.5 times faster on one thread and 2 times on four. Before, two threads and four were the
same; now four beat two. The C Huffman kernel alone, from bytes, is about 0.9-1.0 ms a tile
against 1.1-1.2 ms for the old kernel on prepared words, and scales from 0.23 s (1 thread) to
0.08 s (4) over the 192 tiles.

## Not done

- What is left serial in the read: `_blit` (placing tiles, about 0.06 s) and the IFD walk.
- CR2s are one stream with no restart markers, so they gain from the faster kernel and C
  prediction but cannot be split across threads.
- Point-transform scans (pt > 0) still predict in numpy or Python.

## Reproduce

    python3 -m venv /tmp/v && /tmp/v/bin/pip install rawpy numpy pytest
    curl -LO https://raw.githubusercontent.com/syoyo/tinydng/master/pixel3.dng
    PYTHONPATH=src /tmp/v/bin/python -m pytest -q tests/test_ljpeg_native.py tests/test_ljpeg_fast.py
    for t in 1 2 4; do SHOOTFLOW_THREADS=$t PYTHONPATH=src /tmp/v/bin/python -c \
      "import time; from shootflow import raw_develop as r; d=open('pixel3.dng','rb').read(); r.parse_raw(d); t=time.time(); r.parse_raw(d); print(time.time()-t)"; done
