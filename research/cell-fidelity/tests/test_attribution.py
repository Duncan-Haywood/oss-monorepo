import importlib.util
import math
from pathlib import Path

HERE = Path(__file__).resolve().parents[1] / "experiments" / "attribution"
spec = importlib.util.spec_from_file_location("attribution_run", HERE / "run.py")
run = importlib.util.module_from_spec(spec)
spec.loader.exec_module(run)

# PyBaMM 26.10.1.1's shared SEI parameters (every set the programme uses carries these values)
SEI = dict(L0=5e-9, V=9.585e-5, D=2.5e-22, c_sol=2636.0, z=2.0)


def test_closed_form_matches_a_forward_euler_integration_of_pybamms_law():
    # dL/dt = V D c_sol / (z L), the law PyBaMM's solvent-diffusion-limited SEI submodel integrates
    L, t, dt = SEI["L0"], 0.0, 50.0
    while t < 2e5:
        L += dt * SEI["V"] * SEI["D"] * SEI["c_sol"] / (SEI["z"] * L)
        t += dt
    assert math.isclose(run.sei_closed_form(t, **SEI), L, rel_tol=1e-4)


def test_closed_form_starts_at_the_initial_thickness_and_grows_as_sqrt_time_late():
    assert run.sei_closed_form(0.0, **SEI) == SEI["L0"]
    a, b = run.sei_closed_form(1e12, **SEI), run.sei_closed_form(4e12, **SEI)
    assert math.isclose(b / a, 2.0, rel_tol=1e-3)


def test_sei_lithium_is_zero_at_start_and_scales_with_area_and_volume():
    assert run.sei_lithium(0.0, a=1e5, vol=1e-6, **SEI) == 0.0
    one = run.sei_lithium(3.6e5, a=1e5, vol=1e-6, **SEI)
    assert one > 0
    assert math.isclose(run.sei_lithium(3.6e5, a=2e5, vol=3e-6, **SEI), 6 * one, rel_tol=1e-12)


def test_fade_skips_the_first_cycle():
    wh = [10.0, 8.0] + [8.0 - 0.1 * k for k in range(1, 19)]
    assert math.isclose(run.fade(wh), 1 - wh[19] / 8.0)


def test_attribute_shares_and_no_added_fade():
    a = run.attribute(dict(both=0.30, none=0.02, plating=0.29, sei=0.021))
    assert math.isclose(a["added"], 0.28)
    assert math.isclose(a["plating_share"], 0.27 / 0.28)
    assert math.isclose(a["sei_share"], 0.001 / 0.28)
    b = run.attribute(dict(both=0.01, none=0.01, plating=0.01, sei=0.01))
    assert b["plating_share"] is None and b["sei_share"] is None


def test_verdict():
    assert run.verdict([0.95, 0.99], lambda x: x >= 0.9, lambda x: x < 0.7) == "supported"
    assert run.verdict([0.95, 0.8], lambda x: x >= 0.9, lambda x: x < 0.7) == "mixed"
    assert run.verdict([0.95, 0.5], lambda x: x >= 0.9, lambda x: x < 0.7) == "refuted"
    assert run.verdict([], lambda x: True, lambda x: False) == "untested"
