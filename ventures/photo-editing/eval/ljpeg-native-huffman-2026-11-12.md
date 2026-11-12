# Lossless-JPEG Huffman pass in native code (2026-11-12)

## Why

After the two-pass decoder and the numpy prediction pass (2026-11-11), the Huffman reader was
about 85% of lossless-JPEG decoding: roughly 0.2-0.4 microseconds a sample in pure Python, the
floor for a Python bit reader. Lossless JPEG is how cameras, phones and Adobe's DNG Converter
store DNG sensor tiles, and how a Canon CR2 stores its whole sensor, so it sets the speed of
developing almost any real raw file (`portfolio/flagships.yaml`, photo-editing `next:`).

## What changed

`src/shootflow/ljpeg_native.py` carries one C function (about 40 lines) as a string. On first
use it is compiled with the system C compiler (`$CC`, else `cc`, `gcc` or `clang`) into
`~/.cache/shootflow/ljpeg-huffman-<sha256 of the source>.so` (or `$SHOOTFLOW_CACHE`), written
atomically, and loaded with `ctypes`. ShootFlow stays standard-library only: no package, no
wheel, nothing downloaded. With no compiler, on Windows, or with `SHOOTFLOW_NATIVE=0`, the pure
loop runs as before.

The C reader takes the same de-stuffed big-endian 32-bit words as the pure loop and one 16-bit
prefix table per component (code length and size category for every 16-bit prefix, so codes
longer than the Python loop's 12-bit table need no slow path). Past the end of the data it reads
zeros, as the Python reader does. On an invalid code, or a table with a size category above 16,
it returns nothing and the pure loop decodes the scan, so errors and odd streams behave exactly as
before. `raw_develop.HUFFMAN_ENGINE` (`auto`, `python`, `native`) chooses; `native` refuses to run
without the C reader instead of falling back. Its `array('i')` goes straight into the numpy
prediction pass through `np.frombuffer`.

## Correctness

| check | result |
| --- | --- |
| `tests/test_ljpeg_native.py`: every case of `tests/test_ljpeg_fast.py` (all seven predictors, 1-4 components, restart intervals on and off row boundaries, codes up to 16 bits, size 16, byte stuffing, point transform) on the C reader, with and without numpy | identical samples |
| C differences vs the pure loop's differences on raw noise, one and three components | identical |
| Canon 5D Mark II CR2 (`RAW_CANON_5DMARK2_PREPROD.CR2`, rawpy's test folder, 22,032,768 samples): `tools/cr2_ljpeg_check.py --huffman-engine native --compare-python` | identical to the pure-Python Huffman decode; 0 of 22,032,768 sensels differ from LibRaw's `raw_image` (rawpy 0.28) |

## Speed (build container, 4 cores, one used; Python 3.13, numpy 2.5, gcc 13.3 -O2)

| stream | pure-Python Huffman | native Huffman | |
| --- | --- | --- | --- |
| Canon CR2, 22.0 M samples, `decode_lossless_jpeg` (returns a list) | 8.8-11.7 s | 1.2-1.7 s | about 7x |
| same, internal decode (`_decode_lossless_jpeg`, array to `parse_raw`, the path `develop` takes) | about 9 s | 0.70-1.1 s | about 10x |
| of which the C Huffman call | | 0.48 s (22 ns a sample) | |
| DNG-shaped tile 128 x 256 x 2, smooth 14-bit, median of 15 | 17.0 ms | 1.3 ms | 13x |

The first build takes about 0.07 s (gcc, warm disk) and later processes load the cached library.
Most of what remains on the CR2 is the list the public function returns (0.8 s) and the numpy
prediction pass (0.2 s).

## Not done / limits

- Windows is not tried: the loader returns `None` there and the pure loop runs.
- macOS builds with `-dynamiclib`; not run here (no macOS host).
- No camera- or phone-written lossless-JPEG **DNG** was available (raw.pixls.us and
  rawsamples.ch answer 403 from the build sandbox); the CR2 is the camera-written stream.

## Reproduce

    python3 -m venv /tmp/v && /tmp/v/bin/pip install rawpy numpy
    curl -LO https://raw.githubusercontent.com/letmaik/rawpy/main/test/RAW_CANON_5DMARK2_PREPROD.CR2
    PYTHONPATH=src /tmp/v/bin/python tools/cr2_ljpeg_check.py RAW_CANON_5DMARK2_PREPROD.CR2 \
        --huffman-engine native --compare-python
