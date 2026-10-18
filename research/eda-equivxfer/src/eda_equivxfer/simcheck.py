"""Random-vector check of a chip-systolic mutant against the integer reference (bit-exact outputs and cycle count)."""
import os
import re
import subprocess
import tempfile

import numpy as np

from chip_systolic import flow, gen, model
from chip_systolic.model import NIN, NOUT

SIM_TIMEOUT = 30


def vectors(q, r, n_batches, seed=0):
    rng = np.random.default_rng(seed)
    lo, hi = -(1 << (q["wb"] - 1)), (1 << (q["wb"] - 1)) - 1
    return rng.integers(lo, hi + 1, (n_batches * r, NIN))


def killed(q, c, r, verilog, xs):
    """True if the mutant's output or latency differs from the reference on any batch; a hang counts as killed.
    Raises RuntimeError if the mutant does not compile."""
    wb = q["wb"]
    batches = [xs[i:i + r] for i in range(0, len(xs), r)]
    ref = model.int_forward(q, xs)
    with tempfile.TemporaryDirectory() as d:
        open(f"{d}/a.v", "w").write(verilog)
        open(f"{d}/tb.v", "w").write(flow._tb(wb, batches))
        p = subprocess.run(["iverilog", "-g2012", "-o", f"{d}/s", f"{d}/a.v", f"{d}/tb.v"], capture_output=True, text=True)
        if p.returncode:
            raise RuntimeError(p.stderr)
        try:
            out = subprocess.run(["vvp", f"{d}/s"], capture_output=True, text=True, timeout=SIM_TIMEOUT).stdout
        except subprocess.TimeoutExpired:
            return True
    rows = re.findall(r"OUT (\d+) (\d+)", out)
    if len(rows) < len(batches):
        return True
    ys = []
    for cyc, v in rows:
        if int(cyc) != gen.cycles(c, r):
            return True
        v = int(v)
        for i in range(r):
            ys.append([(v >> ((i * NOUT + j) * wb)) & ((1 << wb) - 1) for j in range(NOUT)])
    ys = np.array(ys, dtype=np.int64)
    ys = np.where(ys >= 1 << (wb - 1), ys - (1 << wb), ys)
    return not bool((ys == ref).all())
