"""A proportional infrared gate: the commanded transmittance rises linearly from CLOSED to OPEN as skin temperature
goes from `lo` to `hi`, and the textile follows it with a first-order lag of `lag` minutes (same lag form as
`garment-twonodeswitch`'s Gate). Model, scenarios, bands and scoring come from `garment-twonodelag` and the packages
it reuses; this module only adds the proportional law and the train/test protocol."""
import os, sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "..", "garment-twonodelag", "src"))
from garment_twonodelag import lag as L  # noqa: E402

h, OURS, REF, CLOSED, OPEN = L.h, L.OURS, L.REF, L.CLOSED, L.OPEN
TRAIN, TEST_BETWEEN, TEST_OUTSIDE, DEFAULT_BAND, LAGS = L.TRAIN, L.TEST_BETWEEN, L.TEST_OUTSIDE, L.DEFAULT_BAND, L.LAGS


class PropGate:
    """Commanded tau = CLOSED + (OPEN-CLOSED) * clip((tsk-lo)/(hi-lo), 0, 1); first-order lag toward it."""
    def __init__(self, lo, hi, lag=0.0, start=CLOSED):
        assert lo < hi and lag >= 0
        self.lo, self.hi, self.lag, self.tau = lo, hi, lag, start

    def __call__(self, minute, tsk, tcr):
        x = min(1.0, max(0.0, (tsk - self.lo) / (self.hi - self.lo)))
        cmd = CLOSED + (OPEN - CLOSED) * x
        self.tau = cmd if self.lag == 0 else self.tau + (cmd - self.tau) / self.lag
        return self.tau


def grid():
    """Same lower edges as the on/off grid; widths from 0.1 C (nearly on/off) to 3.0 C (very soft)."""
    lows = (32.6, 32.8, 33.0, 33.2, 33.4, 33.6, 33.8, 34.0, 34.2)
    return [(round(lo, 2), round(lo + w, 2)) for lo in lows for w in (0.1, 0.2, 0.6, 1.0, 1.4, 1.8, 2.4, 3.0)]


def score(sc, opts, band, lag):
    return h.met.discomfort(h.met.simulate(*sc, opts, PropGate(band[0], band[1], lag))[1])


def mean_score(scs, opts, band, lag):
    return sum(score(sc, opts, band, lag) for sc in scs) / len(scs)


def tune(scs, opts, lag, g=None):
    """Lowest mean training discomfort (first in grid order on ties). Returns (band, train mean)."""
    return min(((b, mean_score(scs, opts, b, lag)) for b in (g or grid())), key=lambda x: x[1])


def tau_range(sc, opts, band, lag):
    """(min, max) transmittance reached in one scenario."""
    tr = h.met.simulate(*sc, opts, PropGate(band[0], band[1], lag))[1]
    ts = [t for _, t, _, _ in tr]
    return min(ts), max(ts)
