"""Milestone 4o: sigma hat counts the extra lens term, the restricted twin sets match the full ones on
the designs used, and the scorer pools and flags as milestones 4l and 4m did on known cases."""
import importlib.util, os
import numpy as np

EXP = os.path.join(os.path.dirname(__file__), "..", "experiments")


def _module(name, rel):
    spec = importlib.util.spec_from_file_location(name, os.path.join(EXP, rel))
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


sc = _module("m4o_score_t", "m4o_k2wait/score.py")
m4l = _module("m4l_analyse_t", "m4l_predict/analyse.py")


def test_sigma_hat_counts_the_second_lens_term():
    tw = dict(poses=np.zeros((13, 6)), rms=0.1)
    _, N1, p1 = m4l.sigma_hat(tw, 48, ni=4)
    _, N2, p2 = m4l.sigma_hat(tw, 48, ni=5)
    assert N1 == N2 == 1248
    assert p1 == 219 and p2 == 220          # milestone 4m stored p = 219 for the k1 TUM twin


def test_restricted_twin_sets_match_full_ones_for_sizes_6_and_7():
    m4n = _module("m4n_t", "m4n_k2/analyse.py")
    m4j = m4n.m4j_module(1)
    m4g, m4i = m4j.m4g, m4j.m4i
    rng = np.random.default_rng(1)
    import itertools
    full_sets = [v for n in range(4, 8) for v in itertools.combinations(range(13), n)]
    idx_full = {m4g.mask(v): i for i, v in enumerate(full_sets)}
    E = rng.standard_normal((20, 7))
    G_full = rng.standard_normal((len(full_sets), 20))
    keep = [i for i, v in enumerate(full_sets) if len(v) >= 5]
    idx_r = {m4g.mask(full_sets[i]): j for j, i in enumerate(keep)}
    # m4i's twin_sets wants 3-view rows for its 4-view sets; give it sets of 4..7 by skipping n < 5
    F_r, J_r, R_r = m4n.twin_sets(m4g, G_full[keep], idx_r, E)
    F_full = G_full @ E
    for v in [(0, 1, 2, 3, 4, 5), (2, 4, 6, 8, 10, 12, 1)]:
        m = m4g.mask(v)
        loo = F_full[[idx_full[m & ~(1 << w)] for w in v]]
        n = len(v)
        R = (n - 1) ** 2 / n * (m4g.MAD * np.median(np.abs(loo - np.median(loo, 0)), 0)) ** 2
        assert np.allclose(R_r[idx_r[m]], R, rtol=1e-5)
    assert np.isnan(R_r[idx_r[m4g.mask((0, 1, 2, 3, 4))]]).all()   # no 4-view delete-ones: no R


def test_top_quarter_pooled_on_a_known_case(monkeypatch):
    A = {}
    for u in sc.TUM:
        k = f"{u}_7+6"
        n = 8
        pi = np.linspace(1, 0, n)                  # top quarter = first 2 splits
        for s in (0.96, 0.98, 0.99, 1.01, 1.02, 1.04):
            A[f"{k}_pi_{s}"] = pi
            A[f"{k}_fired_S1_{s}"] = np.array([1, 1, 0, 0, 0, 0, 0, 1], bool)
        A[f"{k}_fired_S0_1.0"] = np.zeros(n, bool)
        A[f"{k}_sd"] = 1 - pi
        A[f"{k}_far"] = np.zeros(n, bool)
    r = sc.top_quarter_pooled(A)
    assert r["top_quarter"] == 1.0
    assert r["all"] == 3 / 8
    assert abs(r["ratio"] - 8 / 3) < 1e-12


def test_h90_compares_chosen_rates_across_models():
    K = {nk: dict(predict={u: dict(auc_pm2=0.8, ratio=1.0, tq=dict(fa=0.0)) for u in sc.TUM},
                  tq=dict(top_quarter=0.3, all=0.15, ratio=2.0),
                  wait_pooled=dict(chosen=0.10 * nk ** 0.5, random=0.08, ratio=1.25),
                  wait={u: dict(pi=dict(fa=0.0)) for u in sc.TUM}) for nk in (1, 2)}
    K[1]["predict"]["fr1"]["ratio"] = 1.34
    H = sc.score(K)
    assert H["H90"]["holds"] and abs(H["H90"]["ratio"] - 2 ** 0.5) < 1e-12
    assert H["H87"]["holds"]               # 1.0 is nearer 1 than 1.34
    assert H["H86"]["holds"] and H["H88"]["holds"] and H["H89"]["holds"] and H["H91"]["holds"]
