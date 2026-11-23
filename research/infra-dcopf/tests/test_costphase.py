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
