"""Tune the on/off and proportional infrared gates for one person and clothing level, then score them, unchanged, on other
clothing levels and body sizes. Model, gates, grids, penalty and tuning follow `garment-twonodepen`; this module adds
scenarios that carry clothing insulation, body mass and height (which `garment-twonodemet` fixes at 0.5 clo, 70 kg,
1.7 m) and the train/test groups."""
import os, sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "..", "garment-twonodepen", "src"))
from garment_twonodepen import pen as Q  # noqa: E402

met, flex, P, h = Q.h.met, Q.h.met.flex, Q.P, Q.h
CLOSED, OPEN = Q.CLOSED, Q.OPEN
ROOMS = (22.0, 24.0, 26.0)
BASE = dict(clo=0.5, mass=70.0, height=1.7)


def scenarios(rooms=ROOMS, **person):
    """(room C, met before, met after, clo, mass kg, height m): each room in both directions (1->2 and 2->1 met)."""
    p = dict(BASE, **person)
    return [(ta, m0, m1, p["clo"], p["mass"], p["height"]) for ta in rooms for m0, m1 in ((1.0, 2.0), (2.0, 1.0))]


def simulate(sc, opts, gate, minutes=180, step=90):
    ta, m0, m1, clo, mass, height = sc
    tr = []
    flex.run(m0, clo, ta, 50, v=0.1, opts=opts, mass=mass, height=height, minutes=minutes, gate=gate, trace=tr,
             met_fn=lambda m: m0 if m < step else m1)
    return tr


def onoff_cost(sc, opts, band, lag, pen):
    tr = simulate(sc, opts, h.Gate(band[0], band[1], lag))
    return met.discomfort(tr) + pen * Q.swings(tr)


def prop_cost(sc, opts, band, lag, pen):
    tr = simulate(sc, opts, P.PropGate(band[0], band[1], lag))
    return met.discomfort(tr) + pen * Q.swings(tr)


mean, tune = Q.mean, Q.tune

TRAIN = scenarios()
TEST = {
    "lighter 0.3 clo": scenarios(clo=0.3),
    "heavier 0.8 clo": scenarios(clo=0.8),
    "heavy 1.2 clo": scenarios(clo=1.2),
    "small person 50 kg, 1.6 m": scenarios(mass=50.0, height=1.6),
    "large person 95 kg, 1.85 m": scenarios(mass=95.0, height=1.85),
    "large and heavy 95 kg, 0.8 clo": scenarios(mass=95.0, height=1.85, clo=0.8),
}
PENALTIES = (0.01, 0.1)
