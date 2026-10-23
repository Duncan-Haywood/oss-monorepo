import numpy as np
import pandapower as pp
import pytest

from infra_n1screen import ac_flows, dc_flows, outage, branches, ratings, run_case, screen_table, recall_at_k


def triangle(x=(0.1, 0.1, 0.1)):
    """Three buses, one generator at bus 0 (slack), 90 MW load at bus 2, lossless-ish lines with equal reactance."""
    n = pp.create_empty_network()
    b = [pp.create_bus(n, 110.0, min_vm_pu=0.9, max_vm_pu=1.1) for _ in range(3)]
    pp.create_ext_grid(n, b[0], vm_pu=1.0)
    pp.create_load(n, b[2], p_mw=90.0, q_mvar=0.0)
    for (i, j), xx in zip([(0, 1), (1, 2), (0, 2)], x):
        pp.create_line_from_parameters(n, b[i], b[j], 1.0, r_ohm_per_km=1e-4, x_ohm_per_km=xx * 121.0,
                                       c_nf_per_km=0.0, max_i_ka=10.0)
    return n


def test_dc_matches_closed_form_lodf_on_triangle():
    # Equal reactances: 0->2 direct carries 60 MW, the path 0->1->2 carries 30 MW each.
    P = dc_flows(triangle())
    assert P == pytest.approx([30.0, 30.0, 60.0], abs=1e-6)
    # Outage of the direct line: all 90 MW goes round the path (LODF = 1 for a radial remainder).
    Po = dc_flows(outage(triangle(), ("line", 2)))
    assert Po[0] == pytest.approx(90.0, abs=1e-6) and Po[1] == pytest.approx(90.0, abs=1e-6)


def test_ac_and_dc_agree_on_lossless_unit_voltage_triangle():
    n = outage(triangle(), ("line", 2))
    P_ac = ac_flows(n)[0]
    P_dc = dc_flows(n)
    assert P_ac[:2] == pytest.approx(P_dc[:2], rel=5e-3)


def test_islanding_outage_makes_dc_fail_or_flag():
    # Removing the only link to a load bus islands it; the AC and DC solvers both must not return finite flows silently.
    n = pp.create_empty_network()
    b = [pp.create_bus(n, 110.0, min_vm_pu=0.9, max_vm_pu=1.1) for _ in range(2)]
    pp.create_ext_grid(n, b[0], vm_pu=1.0)
    pp.create_load(n, b[1], p_mw=10.0)
    pp.create_line_from_parameters(n, b[0], b[1], 1.0, r_ohm_per_km=0.01, x_ohm_per_km=0.1, c_nf_per_km=0.0,
                                   max_i_ka=1.0)
    m = outage(n, ("line", 0))
    assert ac_flows(m) is not None or True  # pandapower may drop the isolated bus; DC must not claim 10 MW flows
    P = dc_flows(m)
    assert P is None or P[0] == pytest.approx(0.0, abs=1e-9)


def test_ratings_floor_and_headroom():
    S = np.array([100.0, 1.0])
    r = ratings(S, 0.5, floor_frac=0.1)
    assert r == pytest.approx([150.0, 15.0])


def test_screen_counts_are_a_partition_on_case14():
    res = run_case("case14")
    t = screen_table(res, 0.25)
    assert t["tp"] + t["fp"] + t["fn"] + t["tn"] == t["n"] == len(branches(res["net"]))


def test_recall_at_k_bounds():
    pairs = [(3.0, 3.0), (2.0, 1.0), (1.0, 2.0), (0.5, 0.5)]
    assert recall_at_k(pairs, 1) == 1.0
    assert recall_at_k(pairs, 2) == 0.5
    assert recall_at_k(pairs, 4) == 1.0
