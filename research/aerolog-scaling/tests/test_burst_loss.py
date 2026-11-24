import importlib.util
import os
import sys

HERE = os.path.join(os.path.dirname(__file__), "..", "experiments", "hub_airspace")
sys.path.insert(0, HERE)


def _mod(name, fname):
    spec = importlib.util.spec_from_file_location(name, os.path.join(HERE, fname))
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    return m


bl = _mod("burst_loss_test", "burst_loss.py")


def test_gilbert_age_law_is_a_distribution_with_mean_q_times_burst():
    """Mean age = latency + period / 2 + period q B."""
    for q in bl.QS:
        for B in bl.BURSTS:
            if not bl.valid(q, B):
                continue
            ag = bl.ages(q, B)
            assert abs(sum(w for _, w in ag) - 1.0) < 1e-12
            Bq = 1.0 / (1.0 - q) if B is None else B
            mean = sum(A * w for A, w in ag)
            assert abs(mean - (bl.st.LAT + 0.5 * bl.st.PERIOD + q * Bq)) < 1e-4 * max(1.0, q * Bq)


def test_independent_burst_length_reproduces_11bi_ages_and_radius():
    for q in (0.5, 0.75, 0.9):
        a = bl.ages(q, 1.0 / (1.0 - q))
        b = bl.st.ages(q)
        n = min(len(a), len(b)) - 8              # 11bi put its 1e-6 tail on its last k
        for (A1, w1), (A2, w2) in zip(a[:n], b[:n]):
            assert abs(A1 - A2) < 1e-12 and abs(w1 - w2) < 1e-12
        c = 1.7e-4
        for acc in bl.ACCS:
            r1 = bl.r_fixed(c, bl.TG, 12.54, acc, q, None)
            r2 = bl.st.r_fixed(c, bl.TG, 12.54, acc, q)
            assert abs(r1 / r2 - 1) < 1e-4            # 11bi truncates its tail at 1e-6, here 1e-9


def test_radius_grows_with_burst_length_at_fixed_mean_loss():
    c = 1.7e-4
    rs = [bl.r_fixed(c, bl.TG, 12.54, 1.0, 0.5, B) for B in (2.0, 3.0, 10.0, 30.0)]
    assert rs == sorted(rs)
    assert rs[-1] > rs[0]


def test_chain_validity():
    assert bl.valid(0.9, 10.0) and not bl.valid(0.9, 3.0)
    assert bl.valid(0.5, 1.0) and not bl.valid(0.75, 2.0)
