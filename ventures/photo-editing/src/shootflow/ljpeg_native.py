"""Optional native Huffman reader for the lossless-JPEG decoder.

ShootFlow stays standard-library only: this module carries the C source of
one small function as a string, compiles it with the system C compiler
(``cc``, or ``$CC``) the first time it is asked for, caches the shared
library under ``$SHOOTFLOW_CACHE`` (default ``~/.cache/shootflow``), and
loads it through ``ctypes``. With no compiler, a failed build or a refused
load, ``reader()`` returns ``None`` and the decoder keeps its pure-Python
Huffman loop (``raw_develop._huffman_run``), which is the reference. The
outputs are the same difference for difference (``tests/test_ljpeg_native.py``
runs every encoder case through both).

The C function is the Huffman pass only, the part measured at about 85% of
decoding (``eval/ljpeg-native-huffman-2026-11-12.md``): it reads de-stuffed
big-endian 32-bit words through one 16-bit table per component (code length
and size category for every 16-bit prefix) and writes one signed difference
per component per MCU. Past the end of the words the stream reads as zeros,
as in the Python reader. An invalid code returns -1 and the caller raises.

Nothing here downloads or runs anything but the system compiler on the
source below. ``SHOOTFLOW_NATIVE=0`` turns it off.
"""

from __future__ import annotations

import ctypes
import hashlib
import os
import shutil
import subprocess
import sys
import tempfile
import threading
from array import array
from pathlib import Path

C_SOURCE = r"""
#include <stdint.h>
#include <stddef.h>

/* luts: nf tables of 65536 entries, entry = (length << 8) | size, or 0 for no code.
   Returns the number of differences written (mcus * nf) or -1 on an invalid code. */
long shootflow_huffman_run(const uint32_t *words, long nwords, long mcus, int nf,
                           const uint16_t *luts, int32_t *out)
{
    uint64_t acc = 0;
    int nbits = 0;
    long wi = 0;
    long k = 0;
    for (long m = 0; m < mcus; m++) {
        for (int c = 0; c < nf; c++) {
            if (nbits < 32) {
                uint64_t w = wi < nwords ? (uint64_t)words[wi] : 0;
                wi++;
                acc = (nbits ? (acc << 32) : 0) | w;
                nbits += 32;
            }
            unsigned peek = (unsigned)((acc >> (nbits - 16)) & 0xFFFF);
            uint16_t e = luts[(size_t)c * 65536 + peek];
            if (!e) return -1;
            int len = e >> 8, s = e & 0xFF;
            nbits -= len;
            if (s == 0) { out[k++] = 0; continue; }
            if (s == 16) { out[k++] = 32768; continue; }
            if (nbits < s) {
                uint64_t w = wi < nwords ? (uint64_t)words[wi] : 0;
                wi++;
                acc = (acc << 32) | w;
                nbits += 32;
            }
            nbits -= s;
            int32_t v = (int32_t)((acc >> nbits) & ((1u << s) - 1));
            if (v < (1 << (s - 1))) v -= (1 << s) - 1;
            out[k++] = v;
        }
    }
    return k;
}

/* The same Huffman pass, read straight from the entropy-coded bytes of a scan.

   Byte-for-byte the stream raw_develop._segment_words builds, without building it:
   a stuffed FF 00 reads as FF; FF followed by any other byte is a marker, and from
   there the segment reads as zeros. With restart > 0 the scan is decoded in
   intervals of `restart` MCUs: after each, the segment's marker is found (whether
   or not the decode reached it), the next FF D0-D7 at or after it is skipped, and
   the bit reader starts afresh (as raw_develop._scan_diffs does). With no restart
   marker left, the next interval starts at the end of the data and reads zeros.
   Returns mcus * nf, or -1 on an invalid code. Runs without the GIL (ctypes). */
static long scan_marker(const uint8_t *d, long len, long p)
{
    while (p < len) {
        if (d[p] == 0xFF && p + 1 < len) {
            if (d[p + 1] != 0) return p;
            p += 2;
        } else {
            p++;
        }
    }
    return len;
}

long shootflow_huffman_scan(const uint8_t *d, long len, long pos, long mcus, long restart,
                            int nf, const uint16_t *luts, const uint16_t *fast, int32_t *out)
{
    long k = 0;
    long done = 0;
    long p = pos;
    if (restart <= 0) restart = mcus;
    /* fast: nf 12-bit first look-ups (8 KB a component, they stay in L1) for codes of up
       to 12 bits; 0 sends the rare longer code to the full 16-bit table. */
    while (done < mcus) {
        if (done) {
            long stop = scan_marker(d, len, p);
            p = len;
            for (long i = stop; i + 1 < len; i++) {
                if (d[i] == 0xFF && d[i + 1] >= 0xD0 && d[i + 1] <= 0xD7) { p = i + 2; break; }
            }
        }
        long n = mcus - done < restart ? mcus - done : restart;
        uint64_t acc = 0;
        int nbits = 0;
        int ended = 0;  /* reached a marker or the end: zeros from here */
        for (long m = 0; m < n; m++) {
            for (int c = 0; c < nf; c++) {
                while (nbits < 32) {  /* a code and its extra bits take at most 31 */
                    if (!ended && nbits <= 32 && p + 4 <= len) {
                        /* Four bytes at once when none of them is FF (no stuffing, no marker). */
                        uint32_t w = ((uint32_t)d[p] << 24) | ((uint32_t)d[p + 1] << 16)
                                   | ((uint32_t)d[p + 2] << 8) | (uint32_t)d[p + 3];
                        uint32_t x = ~w;
                        if (!((x - 0x01010101u) & ~x & 0x80808080u)) {
                            acc = (acc << 32) | w;
                            nbits += 32;
                            p += 4;
                            continue;
                        }
                    }
                    unsigned b = 0;
                    if (!ended) {
                        if (p >= len) {
                            ended = 1;
                        } else if (d[p] == 0xFF && p + 1 < len) {
                            if (d[p + 1] == 0) { b = 0xFF; p += 2; }
                            else ended = 1;
                        } else {
                            b = d[p++];
                        }
                    }
                    acc = (acc << 8) | b;
                    nbits += 8;
                }
                uint16_t e = fast[(size_t)c * 4096 + ((acc >> (nbits - 12)) & 0xFFF)];
                if (!e) {
                    if (!luts) return -1;  /* every code fits the 12-bit table */
                    unsigned peek = (unsigned)((acc >> (nbits - 16)) & 0xFFFF);
                    e = luts[(size_t)c * 65536 + peek];
                    if (!e) return -1;
                }
                int len_ = e >> 8, s = e & 0xFF;
                nbits -= len_;
                if (s == 0) { out[k++] = 0; continue; }
                if (s == 16) { out[k++] = 32768; continue; }
                nbits -= s;
                int32_t v = (int32_t)((acc >> nbits) & ((1u << s) - 1));
                if (v < (1 << (s - 1))) v -= (1 << s) - 1;
                out[k++] = v;
            }
        }
        done += n;
    }
    return k;
}

/* raw_develop._predict_scan in C: differences to samples for any predictor 1-7 and any
   restart interval, masked to 16 bits (point transform 0). Returns 0, or -1 when a
   reference would fall outside the image (the Python loop then decides). */
long shootflow_predict(const int32_t *diffs, long width, long height, int nf, int predictor,
                       int initial, long restart, uint16_t *out)
{
    long row_len = width * nf;
    long mcu = 0, k = 0, first_line = 0;
    for (long y = 0; y < height; y++) {
        long base = y * row_len;
        for (long x = 0; x < width; x++) {
            int fresh = mcu == 0;
            if (restart && mcu && mcu % restart == 0) { fresh = 1; first_line = y; }
            mcu++;
            long at = base + x * nf;
            for (int c = 0; c < nf; c++) {
                int32_t diff = diffs[k++];
                int32_t pred;
                if (fresh) {
                    pred = initial;
                } else if (y == first_line) {
                    long r = x > 0 ? at - nf + c : at - row_len + c;
                    if (r < 0) return -1;
                    pred = out[r];
                } else if (x == 0) {
                    pred = out[at - row_len + c];
                } else {
                    int32_t ra = out[at - nf + c], rb = out[at - row_len + c];
                    int32_t rc = out[at - row_len - nf + c];
                    switch (predictor) {
                    case 1: pred = ra; break;
                    case 2: pred = rb; break;
                    case 3: pred = rc; break;
                    case 4: pred = ra + rb - rc; break;
                    case 5: pred = ra + ((rb - rc) >> 1); break;
                    case 6: pred = rb + ((ra - rc) >> 1); break;
                    default: pred = (ra + rb) >> 1; break;
                    }
                }
                out[at + c] = (uint16_t)((pred + diff) & 0xFFFF);
            }
        }
    }
    return 0;
}
"""

_STATE: dict[str, object] = {}
_LOAD_LOCK = threading.Lock()  # tiles decode on several threads; build and load once


def _cache_dir() -> Path:
    base = os.environ.get("SHOOTFLOW_CACHE")
    if base:
        return Path(base)
    return Path.home() / ".cache" / "shootflow"


def _compiler() -> str | None:
    cc = os.environ.get("CC")
    if cc and shutil.which(cc):
        return cc
    for name in ("cc", "gcc", "clang"):
        found = shutil.which(name)
        if found:
            return found
    return None


def _build(target: Path) -> bool:
    cc = _compiler()
    if cc is None or sys.platform == "win32":
        return False
    target.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix="shootflow-cc-") as tmp:
        src = Path(tmp) / "huff.c"
        src.write_text(C_SOURCE)
        out = Path(tmp) / target.name
        flags = ["-O2", "-shared", "-fPIC"]
        if sys.platform == "darwin":
            flags = ["-O2", "-dynamiclib"]
        try:
            subprocess.run(
                [cc, *flags, "-o", str(out), str(src)],
                check=True,
                capture_output=True,
                timeout=60,
            )
        except (OSError, subprocess.SubprocessError):
            return False
        os.replace(out, target)  # atomic, so a parallel build never loads half a file
    return True


def _load():
    if os.environ.get("SHOOTFLOW_NATIVE", "1") == "0":
        return None
    digest = hashlib.sha256(C_SOURCE.encode()).hexdigest()[:16]
    suffix = ".dylib" if sys.platform == "darwin" else ".so"
    target = _cache_dir() / f"ljpeg-huffman-{digest}{suffix}"
    try:
        if not target.exists() and not _build(target):
            return None
        lib = ctypes.CDLL(str(target))
    except OSError:
        return None
    fn = lib.shootflow_huffman_run
    fn.restype = ctypes.c_long
    fn.argtypes = [
        ctypes.c_void_p,
        ctypes.c_long,
        ctypes.c_long,
        ctypes.c_int,
        ctypes.c_void_p,
        ctypes.c_void_p,
    ]
    scan = lib.shootflow_huffman_scan
    scan.restype = ctypes.c_long
    scan.argtypes = [
        ctypes.c_char_p,
        ctypes.c_long,
        ctypes.c_long,
        ctypes.c_long,
        ctypes.c_long,
        ctypes.c_int,
        ctypes.c_void_p,
        ctypes.c_void_p,
        ctypes.c_void_p,
    ]
    _STATE["scan"] = scan
    pred = lib.shootflow_predict
    pred.restype = ctypes.c_long
    pred.argtypes = [
        ctypes.c_void_p,
        ctypes.c_long,
        ctypes.c_long,
        ctypes.c_int,
        ctypes.c_int,
        ctypes.c_int,
        ctypes.c_long,
        ctypes.c_void_p,
    ]
    _STATE["predict"] = pred
    return fn


def available() -> bool:
    return reader() is not None


def reader():
    """The loaded C function, or None. Built and loaded once per process."""

    if "fn" not in _STATE:
        with _LOAD_LOCK:
            if "fn" not in _STATE:
                _STATE["fn"] = _load()
    return _STATE["fn"]


_LUT16_CACHE: dict[tuple, bytes] = {}


def lut16(table: dict[tuple[int, int], int]) -> bytes:
    """One 16-bit prefix table: entry ``(length << 8) | size``; 0 where no code starts."""

    key = tuple(sorted(table.items()))
    hit = _LUT16_CACHE.get(key)
    if hit is not None:
        return hit
    lut = array("H", bytes(2 * 65536))
    for (length, code), s in table.items():
        if not 1 <= length <= 16 or s > 16:
            continue
        free = 16 - length
        start = code << free
        span = 1 << free
        lut[start : start + span] = array("H", [(length << 8) | s]) * span
    raw = lut.tobytes()
    if len(_LUT16_CACHE) > 64:
        _LUT16_CACHE.clear()
    _LUT16_CACHE[key] = raw
    return raw


def huffman_run(words: array, mcus: int, tables: list[dict[tuple[int, int], int]]) -> array | None:
    """``mcus`` MCUs of differences as ``array('i')``; None for an invalid code.

    ``words`` is an ``array`` of 4-byte unsigned big-endian-ordered words (as
    ``raw_develop._segment_words`` builds them, before ``tolist``).
    """

    fn = reader()
    if fn is None:  # pragma: no cover - callers check first
        raise RuntimeError("native Huffman reader is not available")
    if words.itemsize != 4:  # pragma: no cover - CPython's 'I' is 4 bytes everywhere
        return None
    nf = len(tables)
    luts = b"".join(lut16(t) for t in tables)
    out = array("i", bytes(4 * mcus * nf))
    lut_buf = ctypes.create_string_buffer(luts, len(luts))
    if len(words) == 0:
        words = array(words.typecode, [0])
        nwords = 0
    else:
        nwords = len(words)
    w_addr, _ = words.buffer_info()
    o_addr, _ = out.buffer_info()
    got = fn(w_addr, nwords, mcus, nf, lut_buf, o_addr)
    if got < 0:
        return None
    return out


def lut12(table: dict[tuple[int, int], int]) -> bytes:
    """The 12-bit first look-up: entry ``(length << 8) | size`` for codes of up to 12 bits."""

    lut = array("H", bytes(2 * 4096))
    for (length, code), s in table.items():
        if not 1 <= length <= 12 or s > 16:
            continue
        free = 12 - length
        lut[code << free : (code + 1) << free] = array("H", [(length << 8) | s]) * (1 << free)
    return lut.tobytes()


def _lut_buffers(tables):
    """``(full, fast)`` ctypes buffers for the scan reader.

    Phones write their own Huffman tables per tile, so these are built per call: the
    12-bit tables always (8 KB a component), the 16-bit ones only when some code is
    longer than 12 bits (else ``None``, and a miss in the 12-bit table is an invalid code).
    """

    fast = b"".join(lut12(t) for t in tables)
    fast_buf = ctypes.create_string_buffer(fast, len(fast))
    if all(length <= 12 for t in tables for (length, _code) in t):
        return None, fast_buf
    full = b"".join(lut16(t) for t in tables)
    return ctypes.create_string_buffer(full, len(full)), fast_buf


def scan_run(data: bytes, pos: int, mcus: int, tables: list[dict[tuple[int, int], int]], restart: int = 0) -> array | None:
    """A whole scan's differences from its entropy-coded bytes, as ``array('i')``.

    The de-stuffing, the word packing and the restart-interval walk of
    ``raw_develop._scan_diffs`` all run in C, so a tile holds the GIL only to
    set up the call (``eval/native-destuff-2026-11-13.md``). None for an invalid
    code, so the pure loop decides and raises exactly as before.
    """

    if reader() is None:  # pragma: no cover - callers check first
        raise RuntimeError("native Huffman reader is not available")
    scan = _STATE.get("scan")
    if scan is None:  # pragma: no cover - loaded with the reader
        return None
    if not isinstance(data, bytes):
        data = bytes(data)
    nf = len(tables)
    lut_buf, fast_buf = _lut_buffers(tables)
    out = array("i", bytes(4 * max(1, mcus * nf)))
    o_addr, _ = out.buffer_info()
    got = scan(data, len(data), pos, mcus, restart or 0, nf, lut_buf, fast_buf, o_addr)
    if got < 0:
        return None
    if mcus * nf == 0:
        del out[:]
    return out


def predict(diffs: array, width: int, height: int, nf: int, predictor: int, initial: int, restart: int) -> array | None:
    """``raw_develop._predict_scan`` in C on an ``array('i')`` of differences: an ``array('H')``.

    Point transform 0 only (the caller shifts otherwise). None when the C pass
    declines, so the Python pass decides.
    """

    fn = _STATE.get("predict") if reader() is not None else None
    if fn is None or not isinstance(diffs, array) or diffs.typecode != "i":
        return None
    n = width * height * nf
    if len(diffs) < n or not 1 <= predictor <= 7:
        return None
    out = array("H", bytes(2 * max(1, n)))
    d_addr, _ = diffs.buffer_info()
    o_addr, _ = out.buffer_info()
    if fn(d_addr, width, height, nf, predictor, initial, restart or 0, o_addr) < 0:
        return None
    if n == 0:
        del out[:]
    return out
