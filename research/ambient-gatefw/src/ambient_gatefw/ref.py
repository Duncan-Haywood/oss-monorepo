"""Python references for the C gate's floor, and the sibling ambient-gateroc simulator."""
import sys
from pathlib import Path

import numpy as np

_GR = Path(__file__).resolve().parents[3] / "ambient-gateroc" / "src"
if str(_GR) not in sys.path:
    sys.path.insert(0, str(_GR))

from ambient_gateroc.sim import (FRAME, adaptive_gate, dbfs_to_ms, frame_ms, noise_floor,  # noqa: E402,F401
                                 score, synth)
from ambient_gateroc.power import Params, battery_hours  # noqa: E402,F401

WINDOW = 250


def block_floor(ms, block):
    """What adaptive_gate.c computes with AGATE_BLOCK=block: the minimum over the current partial
    block and the previous WINDOW//block - 1 finished blocks (block=1 is the exact 250-frame window)."""
    keep = WINDOW // block - 1
    out = np.empty(len(ms), dtype=np.int64)
    for i in range(len(ms)):
        start = max(0, (i // block - keep) * block)
        out[i] = ms[start:i + 1].min()
    return out
