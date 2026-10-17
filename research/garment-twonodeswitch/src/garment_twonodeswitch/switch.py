"""A switching infrared-gating textile in garment-twonodeoptics' two-node model: the gate opens when skin
temperature rises above `t_hi`, closes when it falls below `t_lo`, and its transmittance moves toward the
commanded state as a first-order lag with time constant `lag` minutes. The model lives in ../garment-twonodeoptics."""
import os, sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "..", "garment-twonodeoptics", "src"))
from garment_twonodeoptics import flex  # noqa: E402

OURS, REF = flex.OURS, flex.REF
CLOSED, OPEN = 0.15, 0.8
ROOMS = {"hot 31 C": 31.0, "mild 24 C": 24.0, "cool 16 C": 16.0}


class Gate:
    """Hysteresis thermostat on skin temperature plus first-order actuation lag (lag 0 = instant)."""
    def __init__(self, t_lo, t_hi, lag=0.0, start=CLOSED):
        assert t_lo <= t_hi and lag >= 0
        self.t_lo, self.t_hi, self.lag = t_lo, t_hi, lag
        self.tau, self.cmd = start, start

    def __call__(self, minute, tsk, tcr):
        if tsk > self.t_hi:
            self.cmd = OPEN
        elif tsk < self.t_lo:
            self.cmd = CLOSED
        self.tau = self.cmd if self.lag == 0 else self.tau + (self.cmd - self.tau) / self.lag
        return self.tau


def run(room, opts, minutes=180, gate=None, tau=CLOSED):
    """Returns the end state and, if `gate` is given, a trace of (minute, tau, tsk, tcr)."""
    tr = []
    r = flex.run(1.2, 0.5, ROOMS[room], 50, v=0.1, opts=opts, tau=tau, minutes=minutes, gate=gate, trace=tr)
    return r, tr


def switches(trace):
    """Number of times the commanded state changes, counted from the tau trace crossing the midpoint."""
    mid, n, prev = (CLOSED + OPEN) / 2, 0, None
    for _, t, _, _ in trace:
        s = t > mid
        if prev is not None and s != prev:
            n += 1
        prev = s
    return n


def open_fraction(trace):
    return sum(t > (CLOSED + OPEN) / 2 for _, t, _, _ in trace) / len(trace) if trace else float("nan")
