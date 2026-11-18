"""Hash and time the numpy develop, and _normalised_plane alone, at 1, 2 and 4 threads.

Usage: PYTHONPATH=<src> python3 eval/normalised-plane-bands.py <file.dng> [repeats]
Run once with the tree before the change and once after; compare the hashes and times.
"""

import hashlib
import os
import sys
import time

from shootflow import raw_develop, raw_develop_np
from shootflow.raw_develop import DevelopSettings

path = sys.argv[1]
reps = int(sys.argv[2]) if len(sys.argv) > 2 else 3
raw = raw_develop.read_raw(path)
cases = {
    "default": DevelopSettings(engine="numpy"),
    "no opcodes": DevelopSettings(engine="numpy", opcodes=False),
    "half size": DevelopSettings(engine="numpy", half=True),
}

# Capture _normalised_plane's arguments from a real develop, then time it alone.
captured = {}
orig = raw_develop_np._normalised_plane


def spy(*a, **k):
    captured.setdefault("args", (a, k))
    return orig(*a, **k)


raw_develop_np._normalised_plane = spy
raw_develop.develop(raw, DevelopSettings(engine="numpy", opcodes=False))
raw_develop_np._normalised_plane = orig
a, k = captured["args"]
banded = "threads" in orig.__code__.co_varnames

for threads in (1, 2, 4):
    os.environ["SHOOTFLOW_THREADS"] = str(threads)
    kk = dict(k, threads=threads) if banded else {kk_: v for kk_, v in k.items() if kk_ != "threads"}
    times = []
    for _ in range(reps):
        t0 = time.perf_counter()
        orig(*a, **kk)
        times.append(time.perf_counter() - t0)
    best = min(times)
    out, clipped = orig(*a, **kk)
    h = hashlib.sha256(out.tobytes()).hexdigest()[:16]
    print(f"normalised_plane threads={threads}: {best:.3f} s  clipped={clipped}  sha={h}")
    for name, s in cases.items():
        times = []
        for _ in range(reps):
            t0 = time.perf_counter()
            w, hh, px, rep = raw_develop.develop(raw, s)
            times.append(time.perf_counter() - t0)
        sha = hashlib.sha256(bytes(px)).hexdigest()[:16]
        print(f"develop {name:<11} threads={threads}: {min(times):.2f} s  sha={sha}")
