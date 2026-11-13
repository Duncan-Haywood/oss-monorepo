"""Milestone 11: the scan extractor and measured-stud Monte Carlo."""
import json
import os

import numpy as np

from buildbot_sheathing import cycle as C
from buildbot_sheathing import measured as M
from buildbot_sheathing import tack as K

HERE = os.path.dirname(os.path.abspath(__file__))
PROFILES = os.path.join(HERE, "..", "experiments", "m11_measured", "profiles.json")


def test_chord_fit_exact_parabola():
    s = np.linspace(0, 1, 101)
    f = M.chord_fit(s, 2.0 + 0.5 * s + 4 * 3.0 * s * (1 - s))
    assert abs(f["bow"] - 3.0) < 1e-9
    assert f["r2"] > 0.999999 and f["rms_res"] < 1e-9


def test_extractor_recovers_a_known_bow():
    rows = M.calibrate(bows=(3.0,), phases=4)
    rec = np.array(rows[0]["recovered"])
    assert np.all(np.abs(rec - 3.0) < 0.8)
    assert np.median(rows[0]["width"]) > 34          # a 38.1 mm face on a 2 mm profile grid


def test_straight_profiles_match_straight_model():
    g = np.linspace(0, 1, 51)
    z = np.zeros((3, len(g)))
    kw = dict(trials=6000, seed=1, policy="three", band=C.band(), s_x=1e-3, s_theta=1e-4)
    a = K.simulate(profiles=(g, z, z), **kw)["clean"]
    b = K.simulate(**kw)["clean"]
    assert abs(a - b) < 0.03


def test_profiles_file():
    d = json.load(open(PROFILES))
    vert = [m for m in d["members"] if m["kind"] == "vertical"]
    assert len(vert) == 6
    assert d["source"]["doi"] == "10.34770/0w80-p436"
    for m in vert:
        assert len(m["v"]) == len(m["centre"]) > 200
        assert 34 < np.median(m["width_all"]) < 38.5
