"""Milestone 4q: the twin-sd gate's bookkeeping (set sd, far flags, gated rates) on small known cases."""
import importlib.util, os
import numpy as np

HERE = os.path.dirname(__file__)
_spec = importlib.util.spec_from_file_location("m4q_analyse", os.path.join(HERE, "..", "experiments", "m4q_gate", "analyse.py"))
m4q = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(m4q)
m4g = m4q.m4n.m4j_module(2).m4g


def test_set_stats_scales_twin_sd_by_rms_and_flags_far_solves():
    sets = [(0, 1, 2, 3, 4), (1, 2, 3, 4, 5), (2, 3, 4, 5, 6)]
    idx = {m4g.mask(v): i for i, v in enumerate(sets)}
    F = np.array([[1.0, -1.0] * 50, [2.0, -2.0] * 50, [0.0, 0.0] * 50], np.float32)
    sols = {v: dict(f=f, status=1) for v, f in zip(sets, (500.0, 505.0, 600.0))}
    sd, tilt, far = m4q.set_stats(sols, (F,), idx, 0.5, np.arange(13) / 10, m4g)
    assert np.allclose([sd[m4g.mask(v)] for v in sets], [0.5, 1.0, 0.0])
    assert np.isclose(tilt[m4g.mask(sets[2])], 0.4)
    assert [bool(far[m4g.mask(v)]) for v in sets] == [False, False, True]


def test_gated_rate_counts_only_scored_splits():
    fired = {s: np.array([True, False, True, False]) for s in m4q.S_LIST}
    arms = {"u": {"AA": dict(rel=np.array([0.005, 0.02, 0.012, 0.001]), tilt_ok=np.array([True, True, False, False]), fired=fired)}}
    assert m4q.rate(arms, [("u", "AA")]) == (0.5, 4)
    assert m4q.rate(arms, [("u", "AA")], cut=0.01) == (0.5, 2)
    assert m4q.rate(arms, [("u", "AA")], cut=0.0125) == (2 / 3, 3)
    assert m4q.rate(arms, [("u", "AA")], gate="tilt") == (0.5, 2)
    assert m4q.rate(arms, [("u", "AA")], s_set=m4q.PM2, cut=0.01) == (0.5, 4)
