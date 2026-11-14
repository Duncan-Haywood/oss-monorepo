import os
import sys

import numpy as np
import pytest

HERE = os.path.dirname(__file__)
sys.path.insert(0, os.path.join(HERE, "..", "src"))
sys.path.insert(0, os.path.join(HERE, "..", "experiments", "m3_identify"))
from civ_seeding import bcdj, complex as cx  # noqa: E402
import run as m3  # noqa: E402


@pytest.fixture(scope="module")
def setup():
    V = bcdj.load()
    return V, bcdj.leader_logit(V)[0]


def test_leader_masks_match_cached_on_real_data(setup):
    V, _ = setup
    for v in V[:6]:
        m1, m2 = m3.leader_masks(v, v.takeup.astype(float)[:, None])
        assert (m1[:, 0] == v.nb_taking_leader).all()
        assert (m2[:, 0] == v.nb_nontaking_leader).all()


def test_pbar_gives_moments_2_and_3_exactly(setup):
    # the reuse trick: moments 2 and 3 are linear in simulated adoption
    V, beta = setup
    v = V[2]
    Y = cx.simulate(v, beta, 0.05, 0.3, 75, np.random.default_rng(0), gamma=0.1, delta=-0.25)
    direct = cx.moments_ext(v, Y).mean(0)[1:3]
    pb = Y.mean(1)[None]
    via = [m3.masked_mean(pb, mk[:, None])[0][0, 0]
           for mk in (v.nb_taking_leader, v.nb_nontaking_leader)]
    assert np.allclose(direct, via)


def test_families_are_disjoint_and_cover_grid():
    idx = np.concatenate([m3.FIDX[f] for f in m3.FAMS])
    assert len(idx) == len(set(idx)) == len(m3.POINTS)
