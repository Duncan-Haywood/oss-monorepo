"""Retune the thermostat gate band when the textile has an actuation lag and each switch has a cost.
Model, gate, scoring and train/test rooms are those of `garment-twonodeheld` (which reuses `garment-twonodemet`,
`garment-twonodeswitch` and `garment-twonodeoptics`); this module adds the lag and switch-penalty sweep."""
import os, sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "..", "garment-twonodeheld", "src"))
from garment_twonodeheld import held as h  # noqa: E402

OURS, REF, CLOSED, OPEN, Gate = h.OURS, h.REF, h.CLOSED, h.OPEN, h.Gate
TRAIN, TEST_BETWEEN, TEST_OUTSIDE, DEFAULT_BAND = h.TRAIN, h.TEST_BETWEEN, h.TEST_OUTSIDE, h.DEFAULT_BAND
LAGS = (0.0, 2.0, 5.0, 10.0)        # first-order time constant in minutes (Gate's `lag`), assumed
PENALTIES = (0.0, 0.01, 0.03)       # C added to the mean discomfort proxy per switch in the 180 min, assumed


def run(sc, opts, band, lag):
    """Trace of one scenario under a gate band and lag."""
    return h.met.simulate(*sc, opts, Gate(band[0], band[1], lag))[1]


def n_switches(trace):
    return h.met.sw.switches(trace)


def cost(sc, opts, band, lag, penalty):
    """Discomfort proxy plus `penalty` per switch (`penalty` is in C per switch)."""
    tr = run(sc, opts, band, lag)
    return h.met.discomfort(tr) + penalty * n_switches(tr)


def mean_cost(scs, opts, band, lag, penalty):
    return sum(cost(sc, opts, band, lag, penalty) for sc in scs) / len(scs)


def tune(scs, opts, lag, penalty, grid=None):
    """Band with the lowest mean training cost (first in grid order on ties). Returns (band, train mean cost)."""
    return min(((b, mean_cost(scs, opts, b, lag, penalty)) for b in (grid or h.bands())), key=lambda x: x[1])
