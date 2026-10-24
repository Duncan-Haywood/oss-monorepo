import math

import numpy as np
import pytest

from buildbot_studfind import model as M

MM = 1e-3


def test_groups_match_the_fasten_schedule_counts():
    g, z = M.stud_groups()
    assert [len(g[k]) for k in range(4)] == [17, 7, 7, 17] and len(z) == 14
    assert sum(map(len, g.values())) + len(z) == 62
    assert g[0][0] * 1000 == pytest.approx((0.75 * 25.4 - 0.131 * 25.4 / 2 - 0.375 * 25.4) / 2)


def test_matches_buildbot_fasten_when_available():
    F = pytest.importorskip("buildbot_fasten.model")
    nails = F.schedule()
    g, z = M.stud_groups()
    ys = sorted(n.half for n in nails if n.axis == "y")
    mine = sorted(h for hs in g.values() for h in hs)
    assert ys == pytest.approx(mine) and sorted(n.half for n in nails if n.axis == "z") == pytest.approx(sorted(z))
    # perfect studs, robot scatter 1.24 mm each nail: the 95% budget of buildbot-fasten
    assert M.sheet_success_analytic(0.0, F.required_sigma(nails)) == pytest.approx(0.95, abs=2e-3)


def test_analytic_equals_closed_form_without_robot_noise():
    g, _ = M.stud_groups()
    s = 2 * MM
    want = 1.0
    for hs in g.values():
        want *= math.erf(min(hs) / (s * math.sqrt(2)))     # one shared error per stud: the narrowest window binds
    assert M.sheet_success_analytic(s, 0.0) == pytest.approx(want, abs=2e-3)


def test_monte_carlo_agrees_with_analytic():
    for s in (0.5, 1.0, 2.0):
        mc = M.simulate("single", s * MM, 0.0, 1.24 * MM, trials=60000)[0]
        assert mc == pytest.approx(M.sheet_success_analytic(s * MM, 1.24 * MM), abs=0.01)


def test_shared_stud_error_beats_independent_nail_errors():
    shared = M.simulate("single", 1.5 * MM, 0.0, 0.0, trials=40000)[0]
    servo = M.simulate("servo", 1.5 * MM, 0.0, 0.0, trials=40000)[0]
    assert shared > servo


def test_averaging_reads_reduces_error_as_root_n():
    rng = np.random.default_rng(0)
    e1 = M.estimate_errors("single", rng, 40000, 3 * MM, 0.0, 1).std()
    e4 = M.estimate_errors("single", rng, 40000, 3 * MM, 0.0, 4).std()
    assert e1 / e4 == pytest.approx(2.0, rel=0.03)


def test_pooling_helps_when_layout_is_straight_and_not_when_it_is_not():
    rng = np.random.default_rng(0)
    straight = M.estimate_errors("pooled", rng, 40000, 3 * MM, 0.0, 1, k_studs=10).std()
    single = M.estimate_errors("single", rng, 40000, 3 * MM, 0.0, 1, k_studs=10).std()
    assert straight < 0.45 * single
    wild_p = M.estimate_errors("pooled", rng, 40000, 1 * MM, 30 * MM, 1, k_studs=10).std()
    wild_s = M.estimate_errors("single", rng, 40000, 1 * MM, 30 * MM, 1, k_studs=10).std()
    assert wild_p == pytest.approx(wild_s, rel=0.1)


def test_success_falls_with_reading_error_and_miss_share_rises():
    a = M.simulate("single", 0.5 * MM, 0.0, 1.0 * MM)
    b = M.simulate("single", 3 * MM, 0.0, 1.0 * MM)
    assert a[0] > b[0] and a[1] < b[1]
