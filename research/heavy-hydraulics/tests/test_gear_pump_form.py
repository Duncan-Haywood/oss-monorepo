"""Milestone 6t: the functional-form check reproduces its committed results and its pieces behave on known cases."""
import math
import subprocess
import sys
from pathlib import Path

EXP = Path(__file__).resolve().parents[1] / "experiments"
sys.path.insert(0, str(EXP))
import gear_pump_form as gf  # noqa: E402


def test_gear_pump_form_reproduces_committed_results():
    out = subprocess.run([sys.executable, str(EXP / "gear_pump_form.py")], capture_output=True, text=True,
                         check=True).stdout
    assert out == (EXP / "gear_pump_form_results.txt").read_text()


def test_every_form_is_fifty_percent_at_its_location():
    for f in gf.FORMS.values():
        assert math.isclose(f(0.0), 50.0, abs_tol=1e-9)
        assert f(-1.0) < f(0.0) < f(1.0)


def test_fit_recovers_a_known_cloglog():
    pts = [(0.74 + 0.01 * i, gf.cloglog((0.74 + 0.01 * i - 0.8300) / 0.0300)) for i in range(16)]
    e50, s = gf.fit(gf.cloglog, pts)
    assert math.isclose(e50, 0.8300, abs_tol=2e-4) and math.isclose(s, 0.0300, abs_tol=2e-4)


def test_isotonic_pools_a_violation_and_crosses():
    fitted = gf.isotonic([(0.80, 40.0), (0.81, 30.0), (0.82, 70.0)])
    assert [round(v, 6) for _, v in fitted] == [35.0, 35.0, 70.0]
    assert math.isclose(gf.iso_crossing(fitted), 0.81 + 15.0 / 35.0 * 0.01)
