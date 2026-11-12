"""The AC-informed linearisation: exact at its point, first-order accurate near it, and a QP that
respects its own constraints."""
import warnings

import numpy as np
import pytest

warnings.filterwarnings("ignore")
pytest.importorskip("pypower")
from pypower.api import ppoption, runopf  # noqa: E402
from pypower.idx_brch import RATE_A  # noqa: E402
from pypower.idx_bus import VM  # noqa: E402
from pypower.idx_gen import GEN_BUS, PG, PMAX, PMIN  # noqa: E402

from infra_dcopf.aclin import end_flows, linearise, run_point, solve_linear  # noqa: E402
from infra_dcopf.pglib import case_path, load_m  # noqa: E402

ACOPT = ppoption(VERBOSE=0, OUT_ALL=0, OPF_ALG=560)


@pytest.fixture(scope="module")
def case30_api():
    ppc = load_m(case_path("case30_ieee", "api"))
    ac = runopf(ppc, ACOPT)
    assert ac["success"]
    vm = dict(zip(ac["bus"][:, 0].astype(int), ac["bus"][:, VM]))
    vg = np.array([vm[int(b)] for b in ppc["gen"][:, GEN_BUS]])
    return ppc, ac, vg


def test_offsets_reproduce_the_point(case30_api):
    ppc, ac, vg = case30_api
    lin = linearise(ppc, ac["gen"][:, PG], vg)
    base = run_point(ppc, ac["gen"][:, PG], vg)
    assert np.allclose(lin["s0"], end_flows(base), atol=1e-6)
    assert lin["pg0"][lin["slack"]] == pytest.approx(base["gen"][lin["slack"], PG], abs=1e-6)


def test_first_order_prediction_of_a_small_redispatch(case30_api):
    ppc, ac, vg = case30_api
    lin = linearise(ppc, ac["gen"][:, PG], vg)
    k = lin["cols"][0]
    pg = lin["pg0"].copy()
    step = -5.0 if pg[k] - 5.0 >= ppc["gen"][k, PMIN] else 5.0
    pg[k] += step
    r = run_point(ppc, pg, vg, lin["base"])
    s = lin["slack"]
    assert r["gen"][s, PG] == pytest.approx(lin["pg0"][s] + lin["a"][k] * step, abs=0.05)
    pred = lin["s0"] + lin["H"][:, k] * step
    assert np.max(np.abs(end_flows(r) - pred)) < 0.5  # MVA, second-order residual of a 5 MW move


def test_loss_factors_are_physical(case30_api):
    ppc, ac, vg = case30_api
    lin = linearise(ppc, ac["gen"][:, PG], vg)
    a = lin["a"][lin["cols"]]
    # one more MW from a unit displaces about 1 MW of slack output: more when the unit sits near the
    # load and cuts losses (case30 API: up to 1.23 MW), less when it adds them
    assert np.all(a < -0.5) and np.all(a > -1.5)
    assert np.any(a < -1.0) and np.any(a > -1.1)


def test_qp_respects_its_linear_constraints(case30_api):
    ppc, ac, vg = case30_api
    lin = linearise(ppc, ac["gen"][:, PG], vg)
    x, ok = solve_linear(ppc, lin)
    assert ok
    g = ppc["gen"]
    assert np.all(x >= g[:, PMIN] - 1e-4) and np.all(x <= g[:, PMAX] + 1e-4)
    rate = np.concatenate([ppc["branch"][:, RATE_A]] * 2)
    pred = lin["s0"] + lin["H"] @ (x - lin["pg0"])
    on = rate > 0
    assert np.all(pred[on] <= rate[on] + 1e-3)
    s = lin["slack"]
    assert x[s] == pytest.approx(lin["pg0"][s] + lin["a"] @ (x - lin["pg0"]), abs=1e-4)


def test_oracle_point_returns_the_ac_optimum_dispatch_clean(case30_api):
    ppc, ac, vg = case30_api
    lin = linearise(ppc, ac["gen"][:, PG], vg)
    x, ok = solve_linear(ppc, lin)
    r = run_point(ppc, x, vg, lin["base"])
    rate = np.concatenate([ppc["branch"][:, RATE_A]] * 2)
    on = rate > 0
    assert np.max(end_flows(r)[on] / rate[on]) <= 1.0 + 1e-4


@pytest.fixture(scope="module")
def case14_sad():
    ppc = load_m(case_path("case14_ieee", "sad"))
    ac = runopf(ppc, ACOPT)
    assert ac["success"]
    vm = dict(zip(ac["bus"][:, 0].astype(int), ac["bus"][:, VM]))
    vg = np.array([vm[int(b)] for b in ppc["gen"][:, GEN_BUS]])
    return ppc, ac, vg


def test_sad_case_limits_every_branch_angle(case14_sad):
    from infra_dcopf.aclin import angle_limited
    ppc, _ac, _vg = case14_sad
    assert len(angle_limited(ppc)) == ppc["branch"].shape[0]  # SAD tightens all of them (8.6 deg here)
    assert len(angle_limited(load_m(case_path("case14_ieee", "typ")))) == ppc["branch"].shape[0]  # TYP: 30 deg


def test_angle_rows_predict_a_small_redispatch(case14_sad):
    from infra_dcopf.aclin import angle_diffs
    ppc, ac, vg = case14_sad
    lin = linearise(ppc, ac["gen"][:, PG], vg, angles=True)
    base = run_point(ppc, ac["gen"][:, PG], vg)
    assert np.allclose(lin["d0"], angle_diffs(base, lin["aidx"]), atol=1e-9)
    k = lin["cols"][0]
    pg = lin["pg0"].copy()
    step = -5.0 if pg[k] - 5.0 >= ppc["gen"][k, PMIN] else 5.0
    pg[k] += step
    r = run_point(ppc, pg, vg, lin["base"])
    err = np.abs(angle_diffs(r, lin["aidx"]) - (lin["d0"] + lin["G"][:, k] * step))
    assert err.max() < 0.05  # degrees: second-order residual of a 5 MW move
    assert np.abs(lin["G"][:, k]).max() > 1e-3  # and the move does shift some angle


def test_angle_aware_qp_respects_its_angle_rows(case14_sad):
    from pypower.idx_brch import ANGMAX, ANGMIN
    ppc, ac, vg = case14_sad
    lin = linearise(ppc, ac["gen"][:, PG], vg, angles=True)
    x, ok = solve_linear(ppc, lin)
    assert ok
    pred = lin["d0"] + lin["G"] @ (x - lin["pg0"])
    br = ppc["branch"][lin["aidx"]]
    assert np.all(pred <= br[:, ANGMAX] + 1e-3) and np.all(pred >= br[:, ANGMIN] - 1e-3)


def test_linearise_without_angles_is_unchanged(case30_api):
    ppc, ac, vg = case30_api
    a = linearise(ppc, ac["gen"][:, PG], vg)
    b = linearise(ppc, ac["gen"][:, PG], vg, angles=True)
    assert "G" not in a
    assert np.array_equal(a["H"], b["H"]) and np.array_equal(a["a"], b["a"])
    xa, _ = solve_linear(ppc, a)
    xb, _ = solve_linear(ppc, dict(b, aidx=np.zeros(0, dtype=int), G=np.zeros((0, len(xa))), d0=np.zeros(0)))
    assert np.allclose(xa, xb, atol=1e-6)
