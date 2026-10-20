"""Tune a thermostat gate's band on training rooms and score it on held-out rooms, for one step in metabolic rate.
Model, gate, scoring and oracle are those of `garment-twonodemet` (which uses `garment-twonodeoptics` and
`garment-twonodeswitch`); this module only adds the train/test protocol."""
import itertools, os, sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "..", "garment-twonodemet", "src"))
from garment_twonodemet import met  # noqa: E402

OURS, REF, CLOSED, OPEN, Gate = met.OURS, met.REF, met.CLOSED, met.OPEN, met.Gate
DEFAULT_BAND = (33.2, 34.2)


def scenarios(rooms):
    """Each room, both directions: rest->walk (1 -> 2 met) and walk->rest (2 -> 1 met)."""
    return [(ta, m0, m1) for ta in rooms for m0, m1 in ((1.0, 2.0), (2.0, 1.0))]

TRAIN = scenarios((22.0, 24.0, 26.0))
TEST_BETWEEN = scenarios((23.0, 25.0))      # rooms inside the training range, none seen in training
TEST_OUTSIDE = scenarios((20.0, 28.0))      # rooms outside it


def bands(lows=(32.6, 32.8, 33.0, 33.2, 33.4, 33.6, 33.8, 34.0, 34.2), widths=(0.1, 0.2, 0.6, 1.0, 1.4, 1.8)):
    return [(round(lo, 2), round(lo + w, 2)) for lo, w in itertools.product(lows, widths)]


def score(sc, opts, band=None, tau=None, lag=0.0):
    """Discomfort proxy of one scenario under a gate band, or under a fixed transmittance `tau`."""
    g = met.fixed(tau) if band is None else Gate(band[0], band[1], lag)
    return met.discomfort(met.simulate(*sc, opts, g)[1])


def mean_score(scs, opts, **kw):
    return sum(score(sc, opts, **kw) for sc in scs) / len(scs)


def oracle_mean(scs, opts):
    return sum(met.oracle(*sc, opts)[0] for sc in scs) / len(scs)


def tune(scs, opts, grid=None, lag=0.0):
    """Band with the lowest mean training score (first in grid order on ties). Returns (band, train mean)."""
    return min(((b, mean_score(scs, opts, band=b, lag=lag)) for b in (grid or bands())), key=lambda x: x[1])
