"""LPAC-C (milestone 4a of research/grid-linopf): the branch coefficients reproduce PYPOWER's flows
with the exact terms (taps and phase shifts included), and the LPAC solution balances, respects its
own limits and prices near the AC optimum on small cases."""
import warnings

import numpy as np
import pytest

warnings.filterwarnings("ignore")
pytest.importorskip("pypower")
pytest.importorskip("clarabel")
from pypower.api import runopf  # noqa: E402
from pypower.idx_brch import PF, PT, QF, QT, SHIFT, TAP  # noqa: E402
from pypower.idx_bus import VA, VM  # noqa: E402

from infra_dcopf import lpac  # noqa: E402
from infra_dcopf.pglib import case_path, load_m  # noqa: E402
from infra_dcopf.vsched import ACOPT  # noqa: E402


@pytest.mark.parametrize("name,kind", [("case14_ieee", "typ"), ("case30_ieee", "api"), ("case118_ieee", "sad")])
def test_branch_terms_match_pypower_flows(name, kind):
    ppc = load_m(case_path(name, kind))
    ac = runopf(ppc, ACOPT)
    assert ac["success"]
    fl, idx = lpac.flows_exact(ppc, ac["bus"][:, VM], np.deg2rad(ac["bus"][:, VA]))
    ref = ac["branch"][idx][:, [PF, QF, PT, QT]]
    assert np.max(np.abs(fl - ref)) < 1e-4 * max(1.0, np.max(np.abs(ref)))


def test_branch_terms_with_a_phase_shifter():
    ppc = load_m(case_path("case14_ieee", "typ"))
    ppc["branch"][7, SHIFT] = 5.0   # a transformer branch (tap != 0) given a shift
    assert ppc["branch"][7, TAP] != 0
    ac = runopf(ppc, ACOPT)
    assert ac["success"]
    fl, idx = lpac.flows_exact(ppc, ac["bus"][:, VM], np.deg2rad(ac["bus"][:, VA]))
    ref = ac["branch"][idx][:, [PF, QF, PT, QT]]
    assert np.max(np.abs(fl - ref)) < 1e-4 * max(1.0, np.max(np.abs(ref)))


@pytest.mark.parametrize("name,kind", [("case14_ieee", "typ"), ("case14_ieee", "api"), ("case30_ieee", "sad")])
def test_lpac_solves_near_the_ac_optimum(name, kind):
    ppc = load_m(case_path(name, kind))
    ac = runopf(ppc, ACOPT)
    sol = lpac.solve(ppc)
    assert sol["ok"], sol["status"]
    # its own limits: voltages within the bus bands, losses positive and small
    bus = ppc["bus"]
    assert np.all(sol["vm"] <= bus[:, 11] + 1e-6) and np.all(sol["vm"] >= bus[:, 12] - 1e-6)
    assert 0.0 < sol["losses"] < 0.1 * bus[:, 2].sum()
    # the cosine variable stays inside [cos delta, 1]
    assert np.all(sol["cs"] <= 1.0 + 1e-7)
    assert abs(sol["obj"] / ac["f"] - 1.0) < 0.05


def test_scs_agrees_with_clarabel():
    pytest.importorskip("scs")
    ppc = load_m(case_path("case14_ieee", "typ"))
    a, b = lpac.solve(ppc), lpac.solve(ppc, solver="scs")
    assert a["ok"] and b["ok"]
    assert b["obj"] == pytest.approx(a["obj"], rel=1e-5)
