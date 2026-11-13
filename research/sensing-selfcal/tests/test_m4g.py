"""Milestone 4g's variances and test behave as intended on synthetic independent-offset data."""
import importlib.util, itertools, os
import numpy as np

HERE = os.path.dirname(__file__)
_spec = importlib.util.spec_from_file_location("m4g", os.path.join(HERE, "..", "experiments", "m4g_allsplits", "analyse.py"))
m4g = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(m4g)


def fake(seed=0, tau=0.02):
    rng = np.random.default_rng(seed)
    off = rng.normal(0, tau, 13)
    return {v: dict(f=500 * (1 + off[list(v)].mean()), sf=500 * tau / np.sqrt(len(v)), status=2)
            for n in range(3, 14) for v in itertools.combinations(range(13), n)}


def test_variances_match_formulae():
    J, R = m4g.variances([1.0, 2.0, 3.0, 4.0])
    assert np.isclose(J, 3 / 4 * 5.0)
    assert np.isclose(R, 9 / 4 * (1.4826 * 1.0) ** 2)


def test_split_counts():
    om, nm = m4g.splits(7, 6)
    assert len(om) == 1716 and not np.any(om & nm)
    assert len(m4g.splits(7, 4)[0]) == 25740 and len(m4g.splits(9, 4)[0]) == 715


def test_unchanged_camera_is_quiet_and_a_big_change_is_seen():
    # independent per-view offsets: the jackknife is unbiased, so chi^2_1 at 1% is roughly right
    sols = {"left": fake(0), "right": fake(1)}
    T = {c: m4g.per_set(sols[c]) for c in m4g.CAMS}
    res, q, D = m4g.run(T)
    for cam in m4g.CAMS:
        assert m4g.rate(res, "J", cams=(cam,)) < 0.05
        assert 0.7 < m4g.scale_ratio(D, cam, "J") < 1.4
    assert m4g.rate(res, "J", design=(7, 6), scen="S1", s_set=(0.96, 1.04)) > 0.5


def test_zero_variance_counts_as_fired_and_failed_sets_are_skipped():
    sols = fake(2)
    sols[(0, 1, 2, 3, 4, 5, 6)]["status"] = 0
    T = m4g.per_set(sols)
    assert not T["usable"][m4g.mask((0, 1, 2, 3, 4, 5, 6))]
    row = dict(z2_J=np.array([np.inf]), z2_R=np.array([0.0]))
    assert m4g.fired(row, "J", 1.0)[0] and not m4g.fired(row, "R", 1.0)[0]
