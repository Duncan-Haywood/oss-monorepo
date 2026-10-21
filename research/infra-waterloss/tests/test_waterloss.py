import numpy as np
from infra_waterloss import simulate, junctions
from infra_waterloss.detect import pelt, first_alarm_cusum, first_alarm_ma, first_alarm_pelt

G = 9.80665


def _brute(x, beta):
    """Optimal penalised segmentation by dynamic programming over all start points (no pruning)."""
    n = len(x)
    f = [-beta] + [np.inf] * n
    last = [0] * (n + 1)
    for t in range(1, n + 1):
        for s in range(t):
            seg = np.asarray(x[s:t])
            v = f[s] + ((seg - seg.mean()) ** 2).sum() + beta
            if v < f[t]:
                f[t], last[t] = v, s
    cps, t = [], n
    while t > 0:
        if last[t] > 0:
            cps.append(last[t])
        t = last[t]
    return sorted(cps)


def test_pelt_matches_unpruned_dynamic_programme():
    rng = np.random.default_rng(3)
    for trial in range(5):
        x = np.concatenate([rng.normal(0, 1, 20), rng.normal(2.5, 1, 15), rng.normal(-1, 1, 12)])
        for beta in (3.0, 8.0, 20.0):
            assert [int(c) for c in pelt(x, beta)] == _brute(x, beta)


def test_pelt_finds_a_step_and_stays_quiet_on_noise():
    rng = np.random.default_rng(0)
    z = rng.normal(size=120)
    assert pelt(z, 3 * np.log(120)) == []
    z[70:] += 3
    cps = pelt(z, 3 * np.log(120))
    assert len(cps) == 1 and abs(int(cps[0]) - 70) <= 2


def test_cusum_ignores_negative_drift_and_delay_shrinks_with_shift():
    assert first_alarm_cusum(np.full(100, -1.0), 5) is None
    d = [first_alarm_cusum(np.r_[np.zeros(20), np.full(80, s)], 5, k=0.5, start=0) - 20 for s in (1.0, 2.0, 4.0)]
    assert d[0] > d[1] > d[2] >= 0
    assert first_alarm_cusum(np.r_[np.zeros(20), np.full(80, 2.0)], 5, k=0.5) == 20 + 3     # 1.5 per step: 4 steps to exceed 5


def test_moving_average_waits_for_a_window():
    z = np.r_[np.zeros(10), np.full(10, 6.0)]
    assert first_alarm_ma(z, 3.0, win=3) == 11            # mean of (0, 6, 6) = 4 > 3, mean of (0, 0, 6) = 2 is not
    assert first_alarm_pelt(z, 5.0, start=6, every=2) is not None


def test_leak_follows_the_orifice_law_and_only_lowers_pressure():
    base_p, _, base_d = simulate()
    J = junctions()
    i = 40
    p, leak, d = simulate(leak_node=J[i], leak_flow_frac=0.02, nominal_pressure=float(base_p[96, i]), mean_demand=float(base_d.mean()))
    assert leak[:96].max() == 0.0 and leak[100] > 0
    target = 0.02 * base_d.mean()
    assert 0.5 * target < leak[100] < 1.1 * target       # pressure falls once the leak opens, so the flow is a bit under target
    h = p[100, i]
    assert abs(leak[100] / np.sqrt(h) - leak[100 + 1] / np.sqrt(p[101, i])) / (leak[100] / np.sqrt(h)) < 0.05   # Q proportional to sqrt(head)
    d = p[100] - base_p[100]
    assert d[i] < -0.05 and d.mean() < 0 and (d < 0).mean() > 0.5     # the leak node and most junctions lose pressure (pumps and tanks let a few gain)
    assert np.allclose(p[:96], base_p[:96], atol=1e-6)


def test_demand_uncertainty_moves_pressures_and_is_seeded():
    a, _, _ = simulate(seed=1, sigma_node=0.1, sigma_sys=0.03, hours=24)
    b, _, _ = simulate(seed=1, sigma_node=0.1, sigma_sys=0.03, hours=24)
    c, _, _ = simulate(seed=2, sigma_node=0.1, sigma_sys=0.03, hours=24)
    n, _, _ = simulate(hours=24)
    assert np.allclose(a, b, atol=1e-4) and not np.allclose(a, c)
    assert 0.02 < np.abs(a - n).mean() < 5
