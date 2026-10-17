import numpy as np

from ambient_capcv.core import FIT_NAMES, GRID, PRIOR_W, World, dr_fit, ips_value, run_logged, select_cap, simulate, decide


def _logged(seed=1, hours=20, eps=0.02):
    w = World(); d = simulate(w, hours, np.random.default_rng(seed))
    n = len(d["need"]); rng = np.random.default_rng(seed + 1)
    prop = np.where(rng.random(n) < 0.5, 1.0, eps); spoke = rng.random(n) < prop
    return w, d, d["need"].astype(float), spoke, prop


def test_all_fits_finite_and_cap_in_grid():
    w = World(); d = simulate(w, 20, np.random.default_rng(2))
    fits, nlab, chosen = run_logged(w, d, np.random.default_rng(3), eps=0.02, hours=(20,))
    assert set(fits[20]) == set(FIT_NAMES) and nlab[20] > 0 and chosen[20] in GRID
    assert all(np.all(np.isfinite(v)) for v in fits[20].values())


def test_ips_value_unbiased_on_average():
    # Full-information value of a fixed rule vs IPS estimate from an eps-greedy log: close over many streams.
    w = World(); wt = np.array([1.0, 0.0, 0.0, -3.5]); est, tru = [], []
    for s in range(40):
        _, d, y, spoke, prop = _logged(seed=10 + s, hours=50)
        spoke = np.where(prop == 1.0, True, spoke)
        est.append(ips_value(w, wt, d["X"], d["others"], y, spoke, prop))
        act = decide(w, wt, d["X"], d["others"]); r = np.where(y > 0, w.benefit, -np.where(d["others"], w.others_cost, 1.0))
        tru.append(np.mean(np.where(act, r, 0.0)))
    assert abs(np.mean(est) - np.mean(tru)) < 0.15


def test_eps_one_all_caps_agree():
    w = World(); d = simulate(w, 10, np.random.default_rng(4)); y = d["need"].astype(float)
    n = len(y); spoke = np.ones(n, bool); prop = np.ones(n)
    ref = dr_fit(d["X"], y, spoke, prop, PRIOR_W, 1.0, np.inf)
    for c in GRID:
        assert np.allclose(dr_fit(d["X"], y, spoke, prop, PRIOR_W, 1.0, c), ref, atol=1e-8)


def test_select_cap_deterministic_and_returns_scores():
    w, d, y, spoke, prop = _logged()
    a, sa = select_cap(w, d["X"], d["others"], y, spoke, prop, PRIOR_W, 1.0)
    b, sb = select_cap(w, d["X"], d["others"], y, spoke, prop, PRIOR_W, 1.0)
    assert a == b and sa == sb and set(sa) == set(GRID)


def test_deterministic():
    w = World(); d = simulate(w, 10, np.random.default_rng(7))
    a, _, _ = run_logged(w, d, np.random.default_rng(8), hours=(10,))
    b, _, _ = run_logged(w, d, np.random.default_rng(8), hours=(10,))
    assert all(np.array_equal(a[10][k], b[10][k]) for k in FIT_NAMES)
