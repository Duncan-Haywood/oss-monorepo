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
"""

_STATE: dict[str, object] = {}


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
    return fn


def available() -> bool:
    return reader() is not None


def reader():
    """The loaded C function, or None. Built and loaded once per process."""

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
