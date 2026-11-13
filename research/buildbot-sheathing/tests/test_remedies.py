"""Milestone 12: per-nail reads and the mid push on measured (any-shape) studs."""
import json
import os

import numpy as np

from buildbot_sheathing import ceiling as Q
from buildbot_sheathing import cycle as C
from buildbot_sheathing import measured as M
from buildbot_sheathing import straighten as S
from buildbot_sheathing import tack as K
from buildbot_sheathing.asbuilt import STUD_LEN, U_JOINT

HERE = os.path.dirname(os.path.abspath(__file__))
D = json.load(open(os.path.join(HERE, "..", "experiments", "m11_measured", "profiles.json")))
MID = S.Straightener("mid", U_JOINT, "pinned", 0.5e-3)
KW = dict(trials=6000, seed=3, band=C.band(), s_x=0.5e-3, s_theta=1e-4)


def test_model_profiles_reproduce_milestone_11():
    p = M.model_profiles(D["members"], "smooth", STUD_LEN)
    assert p[1].shape == (6, 201)
    m6b = json.load(open(os.path.join(HERE, "..", "experiments", "m6b_bowed_edge", "results.json")))
    rock = np.radians(np.array(m6b["F_draws"]["drake_deg"]))
    assert abs(Q.clean(profiles=p, rock_draw=rock)["clean"] - 0.42525) < 1e-9


def test_parabola_profile_is_zero_at_its_ends():
    g, d, _ = M.model_profiles(D["members"], "parabola", STUD_LEN)
    assert np.allclose(d[:, 0], 0, atol=1e-12) and np.allclose(d[:, -1], 0, atol=1e-12)


def test_local_reads_follow_waviness():
    p = M.model_profiles(D["members"], "smooth", STUD_LEN)
    three = K.simulate(policy="three", profiles=p, s_read=0.0, **KW)["clean"]
    local = K.simulate(policy="local", profiles=p, s_read=0.0, **KW)["clean"]
    assert local > three + 0.03


def test_push_cancels_a_point_load_shape():
    g = np.linspace(0, 1, 201)
    z = np.zeros((2, len(g)))
    bent = np.vstack([6e-3 * S.shape(g), -6e-3 * S.shape(g)])
    kw = dict(policy="local", s_read=0.0, s_push=0.0, **KW)
    straight = K.simulate(profiles=(g, z, z), **kw)["clean"]
    unpushed = K.simulate(profiles=(g, bent, z), **kw)["clean"]
    pushed = K.simulate(profiles=(g, bent, z), straighten=MID, **kw)["clean"]
    assert unpushed < straight - 0.1
    assert abs(pushed - straight) < 0.03


def test_push_is_measured_from_the_end_chord():
    """A profile tilted about its ends (lean only) needs no push: the push must not move it."""
    g = np.linspace(0, 1, 201)
    z = np.zeros((2, len(g)))
    lean = np.vstack([3e-3 * (g - 0.5), -3e-3 * (g - 0.5)])
    kw = dict(policy="local", s_read=0.0, s_push=0.0, **KW)
    a = K.simulate(profiles=(g, lean, z), **kw)["clean"]
    b = K.simulate(profiles=(g, lean, z), straighten=MID, **kw)["clean"]
    assert abs(a - b) < 1e-9
