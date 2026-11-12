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
