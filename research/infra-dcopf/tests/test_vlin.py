"""The joint (P, V) linearisation: its check agrees with milestone 3's at the AC optimum, its voltage
sensitivities predict a small setpoint move, and from the case-file start it repairs case14 API."""
import warnings

import numpy as np
import pytest

warnings.filterwarnings("ignore")
pytest.importorskip("pypower")
from pypower.api import ppoption, rundcopf, runopf  # noqa: E402
from pypower.idx_gen import PG  # noqa: E402

from infra_dcopf import vlin  # noqa: E402
from infra_dcopf.pglib import case_path, load_m  # noqa: E402
from infra_dcopf.vsched import ACOPT, file_schedule, opt_schedule  # noqa: E402


@pytest.fixture(scope="module")
def case14_api():
    ppc = load_m(case_path("case14_ieee", "api"))
    ac = runopf(ppc, ACOPT)
    assert ac["success"]
    return ppc, ac


def test_check_is_clean_at_the_ac_optimum(case14_api):
    ppc, ac = case14_api
    c = vlin.check(ppc, ac["gen"][:, PG], opt_schedule(ppc, ac))
    assert c["clean"]
    assert c["cost"] == pytest.approx(ac["f"], rel=1e-5)


def test_layout_round_trips_the_schedule(case14_api):
    ppc, ac = case14_api
    lay = vlin.Layout(ppc)
    vo = opt_schedule(ppc, ac)
    assert np.allclose(lay.vg_of(lay.v_of(vo))[lay.live], vo[lay.live])


def test_voltage_sensitivity_predicts_a_small_move(case14_api):
    ppc, ac = case14_api
    lay = vlin.Layout(ppc)
    pg, v = ac["gen"][:, PG].copy(), lay.v_of(opt_schedule(ppc, ac))
    lin = vlin.linearise(ppc, pg, v, lay)
    dv = np.zeros(lay.nv)
    dv[-1] = -0.004
    r = vlin.run_point(ppc, lin["pg0"], lay.vg_of(v + dv))
    got = vlin.measure(ppc, r, lay, lin["aidx"])
    pred = lin["m0"] + lin["J"][:, lay.ng:] @ dv
    # first order: the error is far below the change itself
    assert np.abs(got - pred).max() < 0.2 * max(np.abs(got - lin["m0"]).max(), 1e-9)


def test_slp_repairs_case14_api_from_the_file_schedule(case14_api):
    ppc, ac = case14_api
    dc = rundcopf(ppc, ppoption(VERBOSE=0, OUT_ALL=0))
    start = dc["gen"][:, PG]
    hist = vlin.slp(ppc, start, file_schedule(ppc))
    best = vlin.best_of(hist, ppc["baseMVA"])
    assert best["clean"]
    assert best["cost"] == pytest.approx(ac["f"], rel=1e-3)


def test_shrink_pulls_bounds_in_but_not_past_the_midpoint():
    lo, hi = vlin.shrink(np.array([0.0, 1.0, -np.inf]), np.array([10.0, 1.1, 5.0]), 0.1)
    assert np.allclose(lo[:2], [0.1, 1.05]) and np.isneginf(lo[2])
    assert np.allclose(hi, [9.9, 1.05, 4.9])
