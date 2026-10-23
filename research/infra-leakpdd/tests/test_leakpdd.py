import warnings
import numpy as np
from infra_leakpdd import run, junctions, leak_area, G

warnings.filterwarnings("ignore")


def test_leak_area_inverts_orifice_law():
    a = leak_area(0.02, 40.0)
    assert abs(0.75 * a * np.sqrt(2 * G * 40.0) - 0.02) < 1e-12


def test_pdd_equals_dd_at_base_demand():
    p0, d0, _ = run(1.0, False)
    p1, d1, _ = run(1.0, True)
    assert np.abs(p0 - p1).max() < 1e-4 and np.abs(d0 - d1).max() < 1e-6


def test_pdd_serves_less_than_dd_when_overloaded():
    _, d0, _ = run(3.0, False)
    _, d1, _ = run(3.0, True)
    assert d1.sum(axis=1).mean() < 0.8 * d0.sum(axis=1).mean()


def test_leak_flow_zero_before_onset_and_positive_after():
    J = junctions()
    _, _, lk = run(1.0, False, J[10], leak_area(0.01, 40.0))
    assert lk[:24].max() == 0 and lk[30] > 0


def test_leak_lowers_pressure_somewhere():
    J = junctions()
    p0, _, _ = run(1.0, False)
    p, _, _ = run(1.0, False, J[10], leak_area(0.02, 40.0))
    assert (p0[48] - p[48]).max() > 0.1
