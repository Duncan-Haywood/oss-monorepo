"""Rule CP (post-feasibility cost phase, LOG.md 2026-11-23): it never leaves the clean set, never raises the cost,
and with no rounds returns its start unchanged."""
import sys
import warnings
from pathlib import Path

import numpy as np
import pytest

warnings.filterwarnings("ignore")
pytest.importorskip("pypower")
pytest.importorskip("scipy")
pytest.importorskip("clarabel")
HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "src"))
from pypower.api import ppoption, rundcopf  # noqa: E402
from pypower.idx_gen import PG  # noqa: E402

from infra_dcopf import vlin  # noqa: E402
from infra_dcopf.pglib import case_path, load_m  # noqa: E402
from infra_dcopf.vsched import file_schedule  # noqa: E402


def _clean(name, kind):
    ppc = load_m(case_path(name, kind))
    dc = rundcopf(ppc, ppoption(VERBOSE=0, OUT_ALL=0))
    hist = vlin.slp(ppc, dc["gen"][:, PG].copy(), file_schedule(ppc), rounds=30, margin=vlin.MARGIN,
                    analytic=True, solver="clarabel")
    cl = next(h for h in hist if h.get("clean"))
    return ppc, cl


def test_cost_phase_stays_clean_and_never_dearer():
    ppc, cl = _clean("case14_ieee", "typ")
    pg, vg, c, recs = vlin.cost_phase(ppc, cl["pg"], cl["vg"], cl, margin=vlin.MARGIN)
    assert c["clean"]
    assert c["cost"] <= cl["cost"]
    assert len(recs) == vlin.CP_ROUNDS
    costs = [r["cost"] for r in recs]
    assert all(b <= a for a, b in zip([cl["cost"]] + costs, costs))
    again = vlin.check(ppc, pg, vg)
    assert again["clean"] and abs(again["cost"] - c["cost"]) <= 1e-6 * c["cost"]


def test_cost_phase_zero_rounds_is_identity():
    ppc, cl = _clean("case14_ieee", "typ")
    pg, vg, c, recs = vlin.cost_phase(ppc, cl["pg"], cl["vg"], cl, rounds=0)
    assert recs == [] and c is cl
    assert np.allclose(pg, cl["pg"]) and np.allclose(vg, cl["vg"])


def test_rule_cs_cap_puts_the_point_inside_every_margined_row():
    """Rule CS (LOG.md 2026-11-23): with margin cap=True no bound is pulled in past the point's own value, so the
    linearisation point satisfies every row; the cap only loosens, never tightens, the frozen margins."""
    ppc, cl = _clean("case14_ieee", "typ")
    lay = vlin.Layout(ppc)
    lin = vlin.linearise(ppc, cl["pg"], lay.v_of(cl["vg"]), lay, analytic=True)
    x0 = np.concatenate([lin["pg0"], lin["v0"]])
    tight = dict(vlin.MARGIN, load=0.5, v=0.04, q=50.0)  # wide margins put the point outside some rows
    A, u, _k, _ae, _be = vlin.rows(ppc, lin, tight)
    assert (A @ x0 - u).max() > 1e-6
    Ac, uc, _k, _ae, _be = vlin.rows(ppc, lin, dict(tight, cap=True))
    assert (Ac @ x0 - uc).max() <= 1e-9
    assert np.all(uc >= u - 1e-12)
    pg, vg, c, recs = vlin.cost_phase(ppc, cl["pg"], cl["vg"], cl, margin=dict(tight, cap=True))
    assert c["clean"] and c["cost"] <= cl["cost"]
    assert not any(r["status"] == "QP infeasible" for r in recs)
