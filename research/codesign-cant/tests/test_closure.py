"""Milestone 7q: the exact closure solve in aero.size, the component-constant hooks, and the component data."""
import csv
import os
import sys

import numpy as np

HERE = os.path.dirname(__file__)
sys.path.insert(0, os.path.join(HERE, "..", "src"))
from codesign_cant import aero  # noqa: E402

DATA = os.path.join(HERE, "..", "data", "components")


def _exact(f):
    keep = aero.SIZE_SOLVE
    aero.SIZE_SOLVE = "exact"
    try:
        return f()
    finally:
        aero.SIZE_SOLVE = keep


def test_defaults_are_the_inherited_closure():
    assert aero.SIZE_SOLVE == "iter60"
    assert (aero.MOTOR_K, aero.MOTOR_EXP, aero.WH_KG, aero.FM, aero.ETA) == (0.045, 1.2, 150.0, 0.65, 0.75)


def test_closure_root_finds_smallest_fixed_point_or_clamp():
    # update(m) = 0.5 + 0.1 m^2 has fixed points at 0.5528 and 9.447; the smaller one is the stable one
    m = aero.closure_root(lambda q: 0.5 + 0.1 * q ** 2, (1,))
    assert np.isclose(m[0], (1 - np.sqrt(1 - 0.2)) / 0.2, rtol=1e-6)
    # update(m) = 1 + m has no fixed point: clamp
    assert aero.closure_root(lambda q: 1.0 + q, (2,))[0] == aero.M_CLAMP


def test_exact_solve_is_a_fixed_point_and_matches_a_converged_iteration():
    sz = _exact(lambda: aero.size(0.11, 0.16, np.deg2rad(10), kappa_per_d=0.08, actuator="hover"))
    m = float(sz["mass"])
    assert m < 3.0
    # mass equals the closure's right-hand side at the solution
    rhs = aero.PAYLOAD + aero.ELEC + float(sz["wh"]) / aero.WH_KG + aero.frame_mass(0.11) + 4 * aero.MOTOR_K * (float(sz["Tmax"]) / 9.0) ** aero.MOTOR_EXP
    assert np.isclose(m, rhs, rtol=1e-8)
    # far from the edge (large propeller) the 60-step iteration has converged to the same mass
    assert np.isclose(m, float(aero.size(0.11, 0.16, np.deg2rad(10), kappa_per_d=0.08, actuator="hover")["mass"]), rtol=1e-6)


def test_exact_solve_reports_no_closure_where_the_truncated_iteration_returns_a_mass():
    # a 94 mm propeller at 15 min with the inherited constants: no fixed point, but 60 damped steps from 1 kg stop at about 1.5 kg
    it = float(aero.size(0.10, 0.094)["mass"])
    ex = float(_exact(lambda: aero.size(0.10, 0.094)["mass"]))
    assert it < 2.0 and ex == aero.M_CLAMP
    # just above it (96 mm) a fixed point exists, and 60 steps have not reached it (1.219 against 1.245 kg)
    it, ex = float(aero.size(0.10, 0.096)["mass"]), float(_exact(lambda: aero.size(0.10, 0.096)["mass"]))
    assert ex < aero.M_CLAMP and ex - it > 0.02


def test_component_rows_are_sourced_and_consistent():
    bat = list(csv.DictReader(open(os.path.join(DATA, "batteries.csv"))))
    fit = [r for r in bat if r["use"] == "fit"]
    assert len(fit) >= 150 and all(r["url"].startswith("https://") for r in bat)
    for r in fit:
        v = {"lipo": 3.7, "lihv": 3.8, "liion": 3.6}[r["chemistry"]]
        assert np.isclose(float(r["wh_per_kg"]), float(r["mah"]) / 1000 * v * int(r["cells"]) / (float(r["weight_g"]) / 1000), atol=0.06)
        assert 3 <= int(r["cells"]) <= 6 and 1000 <= int(r["mah"]) <= 10000
    mot = list(csv.DictReader(open(os.path.join(DATA, "motors_bench_sunnysky.csv"))))
    assert len({r["motor"] for r in mot}) >= 25 and all(float(r["thrust_gf"]) > 0 and float(r["watts"]) > 0 for r in mot)


def test_lag_law_default_and_override():
    """Milestone 7s: the lag law is aero.LAG_K (D / LAG_D0)^LAG_EXP; the default is the inherited 0.015 (D / 0.127)^1.5."""
    assert (aero.LAG_K, aero.LAG_D0, aero.LAG_EXP) == (0.015, 0.127, 1.5)
    assert np.isclose(float(aero.size(0.10, 0.127)["lag"]), 0.015)
    keep = aero.LAG_EXP
    try:
        aero.LAG_EXP = 0.0
        assert np.isclose(float(aero.size(0.10, 0.10)["lag"]), 0.015)
    finally:
        aero.LAG_EXP = keep
