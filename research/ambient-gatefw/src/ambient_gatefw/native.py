"""Build the C adaptive gate with gcc and run whole streams through it (host only)."""
import ctypes
import subprocess
import tempfile
from pathlib import Path

import numpy as np

FW = Path(__file__).resolve().parents[2] / "firmware"
_cache = {}


def build(block, count=False):
    """Compile firmware/adaptive_gate.c with AGATE_BLOCK=block into a shared library."""
    key = (block, count)
    if key not in _cache:
        d = Path(tempfile.mkdtemp(prefix="agate"))
        so = d / "gate.so"
        flags = [f"-DAGATE_BLOCK={block}"] + (["-DAGATE_COUNT"] if count else [])
        subprocess.run(["gcc", "-std=c99", "-Wall", "-Wextra", "-O2", "-shared", "-fPIC", *flags, "-I", str(FW),
                        "-o", str(so), str(FW / "adaptive_gate.c"), str(FW / "host_harness.c")], check=True)
        lib = ctypes.CDLL(str(so))
        lib.harness_sizeof.restype = ctypes.c_size_t
        lib.harness_run.argtypes = [ctypes.c_void_p, ctypes.c_size_t, ctypes.c_size_t, ctypes.c_uint32,
                                    ctypes.c_uint16, ctypes.c_void_p, ctypes.c_void_p]
        if count:
            lib.harness_compares.restype = ctypes.c_ulong
        _cache[key] = lib
    return _cache[key]


def run(lib, x, frame, k, hangover):
    """-> (open bool[nframes], floor uint32[nframes]) from the C gate."""
    nf = len(x) // frame
    x = np.ascontiguousarray(x[:nf * frame], dtype=np.int16)
    op = np.zeros(nf, dtype=np.uint8)
    fl = np.zeros(nf, dtype=np.uint32)
    lib.harness_run(x.ctypes.data, nf, frame, k, hangover, op.ctypes.data, fl.ctypes.data)
    return op.astype(bool), fl
