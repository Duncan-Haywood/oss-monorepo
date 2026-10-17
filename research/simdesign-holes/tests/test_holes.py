import os, sys
import numpy as np
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
from simdesign_holes.fem import Plate, MATERIALS, solve_plate
from simdesign_holes.design import PROCESSES, FREE, size_plate, kt, stress_w

STEEL = MATERIALS["steel sheet"]


def test_no_hole_is_uniform():
    r = solve_plate(Plate(W=30, d=0.0), STEEL)
    assert abs(r["kt_gross"] - 1.0) < 0.01


def test_small_hole_approaches_kirsch():
    r = solve_plate(Plate(W=60, d=1.5), STEEL)   # d/W = 0.025
    assert 2.80 < r["kt_net"] < 3.05


def test_kt_falls_with_hole_size():
    ks = [solve_plate(Plate(W=30, d=30 * x), STEEL)["kt_net"] for x in (0.05, 0.2, 0.5)]
    assert ks[0] > ks[1] > ks[2] > 1.5


def test_kt_is_load_and_material_independent_to_poisson_effect():
    a = solve_plate(Plate(W=30, d=6, T=100), STEEL)["kt_net"]
    b = solve_plate(Plate(W=30, d=6, T=900), MATERIALS["plastic"])["kt_net"]
    assert abs(a - b) < 1e-3   # only Poisson's ratio differs (0.30 vs 0.36); the hole makes the body multiply connected


def test_stress_width_satisfies_limit():
    for m in ("net section", "Kt = 3", "FE"):
        W = stress_w(m, 8.0, 3.0, 100.0)
        assert abs(kt(m, 8.0 / W) * 1000.0 / ((W - 8.0) * 3.0) - 100.0) < 1e-3


def test_models_order_by_conservatism():
    p = FREE["steel sheet"]
    m = {k: size_plate(p, 8, k, rules=False)["mass_g"] for k in ("net section", "FE", "Kt = 3")}
    assert m["net section"] < m["FE"] < m["Kt = 3"]


def test_rules_never_lighten():
    for proc in PROCESSES.values():
        for d in (8, 12):
            a = size_plate(proc, d, "FE", rules=True)
            b = size_plate(FREE[proc.material], d, "FE", rules=False)
            if a["feasible"]:
                assert a["mass_g"] >= b["mass_g"] - 1e-9


def test_hole_below_process_minimum_is_infeasible():
    assert not size_plate(PROCESSES["CNC routing"], 4, "FE")["feasible"]
    assert not size_plate(PROCESSES["casting"], 4, "FE")["feasible"]


def test_edge_rule_respected():
    s = size_plate(PROCESSES["CNC routing"], 12, "FE")
    assert s["W"] >= 2 * 1.5 * 12 - 1e-9
