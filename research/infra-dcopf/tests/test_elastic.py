"""The elastic-penalty diagnostics (research/grid-linopf, 2026-11-17): the hook leaves the repair
unchanged, an accept rule that reproduces the merit test changes nothing, and the true penalty at a
linearisation's base point equals the QP model's value there."""
import sys
import warnings
from pathlib import Path

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

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "experiments"))
import run_elastic  # noqa: E402


@pytest.fixture(scope="module")
def case14_api():
    ppc = load_m(case_path("case14_ieee", "api"))
    dc = rundcopf(ppc, ppoption(VERBOSE=0, OUT_ALL=0))
    return ppc, dc["gen"][:, PG].copy(), file_schedule(ppc)


def test_hook_and_merit_accept_change_nothing(case14_api):
    ppc, start, vf = case14_api
    h0, t0 = converge.traced_slp(ppc, start, vf, rounds=10)
    seen = []
    h1, t1 = converge.traced_slp(ppc, start, vf, rounds=10, hook=lambda c: seen.append(c["it"]) or {"ok": 1},
                                 accept=lambda c: c["phi_accept"])
    assert [h["status"] for h in h0] == [h["status"] for h in h1]
    assert [t.get("phi_trial") for t in t0] == [t.get("phi_trial") for t in t1]
    assert seen == [t["it"] for t in t1 if "qp" in t]
    assert all(t["hook"] == {"ok": 1} for t in t1 if "qp" in t)


def test_true_penalty_equals_model_at_base(case14_api):
    ppc, start, vf = case14_api
    lay = vlin.Layout(ppc)
    lin = vlin.linearise(ppc, start, lay.v_of(vf), lay, analytic=True)
    q, _, ok = run_elastic.qp_record(ppc, lin, None, np.full(lay.nv, vlin.VBOX), vlin.MARGIN, "clarabel", vlin.ELASTIC)
    assert ok
    xb = np.concatenate([lin["pg0"], lin["v0"]])
    cm, vm = run_elastic.model_obj(q, xb)
    ct, viol, _ = run_elastic.true_terms(ppc, lin, lin["pg0"], lin["v0"], lin["m0"], vlin.MARGIN)
    assert vm == pytest.approx(viol.sum(), rel=1e-9, abs=1e-9)
    assert cm == pytest.approx(ct, rel=1e-6)
