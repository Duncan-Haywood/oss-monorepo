"""Milestone 7's diagnostics: the traced repair reproduces vlin.slp, the remainder shrinks with the step
as a second-order term should, and broken rows are flagged on the side they break."""
import warnings

import numpy as np
import pytest

warnings.filterwarnings("ignore")
pytest.importorskip("pypower")
pytest.importorskip("clarabel")
from pypower.api import ppoption, rundcopf  # noqa: E402
from pypower.idx_gen import PG  # noqa: E402

from infra_dcopf import converge, vlin  # noqa: E402
from infra_dcopf.pglib import case_path, load_m  # noqa: E402
from infra_dcopf.vsched import file_schedule  # noqa: E402


@pytest.fixture(scope="module")
def case14_api():
    ppc = load_m(case_path("case14_ieee", "api"))
    dc = rundcopf(ppc, ppoption(VERBOSE=0, OUT_ALL=0))
    return ppc, dc["gen"][:, PG].copy(), file_schedule(ppc)


def test_traced_slp_matches_vlin_slp(case14_api):
    ppc, start, vf = case14_api
    ref = vlin.slp(ppc, start, vf, margin=vlin.MARGIN, analytic=True, solver="clarabel")
    hist, trace = converge.traced_slp(ppc, start, vf, rounds=10)
    assert [h["status"] for h in hist] == [h["status"] for h in ref]
    assert np.allclose(hist[-1]["pg"], ref[-1]["pg"])
    assert len(trace) == len(hist)
    assert all(t["smin"] > 0 for t in trace)


def test_remainder_is_second_order(case14_api):
    """Halving a step quarters the linearisation's remainder (to within a factor 1.5)."""
    ppc, start, vf = case14_api
    lay = vlin.Layout(ppc)
    v = lay.v_of(vf)
    lin = vlin.linearise(ppc, start, v, lay, analytic=True)
    rng = np.random.default_rng(0)
    d = np.zeros(lay.ng + lay.nv)
    live = np.where(lay.live)[0]
    live = live[live != lay.slack]
    d[live] = rng.normal(0, 5.0, len(live))
    d[lay.ng:] = rng.normal(0, 0.01, lay.nv)
    errs = []
    for s in (1.0, 0.5):
        x0 = np.concatenate([lin["pg0"], lin["v0"]])
        x = x0 + s * d
        r = vlin.run_point(ppc, x[:lay.ng], lay.vg_of(x[lay.ng:]))
        m1 = vlin.measure(ppc, r, lay, lin["aidx"])
        errs.append(np.abs(m1 - lin["m0"] - lin["J"] @ (s * d)).max())
    assert 4 / 1.5 < errs[0] / errs[1] < 4 * 1.5


def test_broken_rows_sides():
    meta = {"fam": np.array(["load", "v", "v"]), "lo": np.array([-np.inf, 0.94, 0.94]),
            "hi": np.array([100.0, 1.06, 1.06]), "mu": np.array([0.1, 0.001, 0.001]),
            "use": np.array([True, True, True])}
    idx, side = converge.broken_rows(meta, np.array([100.5, 1.0, 0.93]))
    assert list(idx) == [0, 2] and list(side) == [1.0, -1.0]


def test_classify():
    assert converge.classify({"status": "clean"}) is None
    assert converge.classify({"status": "not clean", "qp": "elastic", "broken": []}) == "elastic"
    assert converge.classify({"status": "not clean", "qp": "hard", "broken": [{"fam": "q", "r": 3.0}]}) == "curvature"
    assert converge.classify({"status": "not clean", "qp": "hard", "broken": [{"fam": "q", "r": 0.5}]}) == "other"
