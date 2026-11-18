"""Milestone 4p: the fresh pools are disjoint from milestone 4j's views and kept the 1 s gap; the
analysis' cross-pool decide() is milestone 4g's decisions() when both pools are the same; the pick
rule removes the excluded frames."""
import gzip, importlib.util, json, os, sys
import numpy as np

HERE = os.path.dirname(__file__)
EXP = os.path.join(HERE, "..", "experiments", "m4p_fresh")
sys.path.insert(0, EXP)
import fresh  # noqa: E402

_spec = importlib.util.spec_from_file_location("m4p_analyse", os.path.join(EXP, "analyse.py"))
m4p = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(m4p)
_pspec = importlib.util.spec_from_file_location("m4p_prepare", os.path.join(EXP, "prepare.py"))
prep = importlib.util.module_from_spec(_pspec)
_pspec.loader.exec_module(prep)


def test_fresh_pools_are_disjoint_and_keep_the_gap():
    for u in fresh.tu.UNITS:
        _, _, a = fresh.load(u)
        obs, size, b = fresh.load(u + "b")
        assert obs.shape == (13, fresh.tu.NPT, 2) and not set(a) & set(b)
        ta = np.array([float(n[:-4]) for n in a]); tb = np.array([float(n[:-4]) for n in b])
        assert np.all(np.abs(ta - tb) > prep.GAP) and np.all(np.diff(tb) > 0)


def test_pick_skips_frames_near_the_excluded_one():
    block = [dict(t=float(i) / 10, sharp=1.0, tilt=t) for i, t in enumerate((0.1, 0.9, 0.8, 0.2, 0.05, 0.3, 0.4, 0.1, 0.2, 0.1, 0.2, 0.15, 0.25))]
    assert prep.pick(block)["tilt"] == 0.9
    assert prep.pick(block, exclude_t=0.1)["t"] == 1.2        # only t = 1.2 s is more than 1 s away
    block2 = [dict(t=float(i), sharp=1.0, tilt=t) for i, t in enumerate((0.1, 0.9, 0.8, 0.2, 0.05))]
    r = prep.pick(block2, exclude_t=1.0)                      # removes t = 0, 1, 2
    assert r["t"] == 3.0


def test_decide_is_m4g_decisions_within_one_pool():
    m4j = m4p.m4n.m4j_module(2)
    m4g = m4j.m4g
    with gzip.open(m4p.RESULTS["A"], "rt") as fh:
        res = json.load(fh)
    sols = {}
    for r in res["solutions"]:
        sols.setdefault(r["cam"], {})[tuple(r["views"])] = r["sol"]
    T = {c: m4g.per_set(sols[c]) for c in fresh.tu.UNITS}
    D = m4g.decisions(T, 7, 6)
    om, nm = m4g.splits(7, 6)
    for s in (1.0, 0.98):
        mine = m4p.decide(m4g, T["fr1"], T["fr1"], om, nm, s)
        ref = D[("fr1", "S0" if s == 1.0 else "S1", s)]
        assert np.array_equal(mine["old"], ref["old"]) and np.array_equal(mine["new"], ref["new"])
        assert np.allclose(mine["z2_R"], ref["z2_R"]) and np.allclose(mine["d"], ref["d"])
