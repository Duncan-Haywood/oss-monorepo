"""Price actuation: on/off gate cost = discomfort + penalty * (number of state changes); proportional gate cost =
discomfort + penalty * (total variation of transmittance / (OPEN-CLOSED)), i.e. one full close-to-open swing counts as
one switch, so the two penalties are in the same units. Model, scenarios, grids and gates come from
`garment-twonodeprop` and `garment-twonodelag`; this module adds the equal-units wear count and the penalty sweep."""
import os, sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "..", "garment-twonodeprop", "src"))
from garment_twonodeprop import prop as P  # noqa: E402

L, h = P.L, P.h
OURS, REF, CLOSED, OPEN = P.OURS, P.REF, P.CLOSED, P.OPEN
TRAIN, TEST_BETWEEN, TEST_OUTSIDE, LAGS = P.TRAIN, P.TEST_BETWEEN, P.TEST_OUTSIDE, P.LAGS
PENALTIES = (0.0, 0.003, 0.01, 0.03, 0.1)   # C of discomfort proxy per full swing in 180 min, assumed


def swings(trace):
    """Total variation of transmittance in units of one full close-open swing."""
    ts = [t for _, t, _, _ in trace]
    return sum(abs(b - a) for a, b in zip(ts, ts[1:])) / (OPEN - CLOSED)


def prop_cost(sc, opts, band, lag, pen):
    tr = h.met.simulate(*sc, opts, P.PropGate(band[0], band[1], lag))[1]
    return h.met.discomfort(tr) + pen * swings(tr)


def onoff_cost(sc, opts, band, lag, pen):
    tr = L.run(sc, opts, band, lag)
    return h.met.discomfort(tr) + pen * swings(tr)


def mean(f, scs, opts, band, lag, pen):
    return sum(f(sc, opts, band, lag, pen) for sc in scs) / len(scs)


def tune(f, scs, opts, lag, pen, grid):
    return min(((b, mean(f, scs, opts, b, lag, pen)) for b in grid), key=lambda x: x[1])
