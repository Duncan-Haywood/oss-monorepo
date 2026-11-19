"""run_iis.py: the labelled hard-QP system matches vlin.solve's, and the IIS finder returns an
irreducible subset (2026-11-19 step)."""
import sys
import warnings
from pathlib import Path

import numpy as np
import pytest

warnings.filterwarnings("ignore")
pytest.importorskip("pypower")
pytest.importorskip("scipy")
HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "src"))
sys.path.insert(0, str(HERE.parent / "experiments"))
from pypower.api import ppoption, rundcopf  # noqa: E402
from pypower.idx_gen import PG  # noqa: E402

from infra_dcopf import vlin  # noqa: E402
from infra_dcopf.pglib import case_path, load_m  # noqa: E402
from infra_dcopf.vsched import file_schedule  # noqa: E402
import run_iis  # noqa: E402


@pytest.fixture(scope="module")
def lin14():
    ppc = load_m(case_path("case14_ieee", "api"))
    lay = vlin.Layout(ppc)
    dc = rundcopf(ppc, ppoption(VERBOSE=0, OUT_ALL=0))
    lin = vlin.linearise(ppc, dc["gen"][:, PG].copy(), lay.v_of(file_schedule(ppc)), lay, analytic=True)
    return ppc, lin


def test_labels_cover_every_row_and_bound(lin14):
    ppc, lin = lin14
    lay = lin["lay"]
    pt = np.full(lay.ng, 5.0)
    vt = np.full(lay.nv, vlin.VBOX)
    G, h, lab, a_eq, b_eq = run_iis.system(ppc, lin, pt, vt, vlin.MARGIN)
    A = vlin.rows(ppc, lin, vlin.MARGIN)[0]
    n = lay.ng + lay.nv
    assert len(lab) == G.shape[0] == len(h)
    assert G.shape[0] == A.shape[0] + 2 * n + 2 * (int(lay.live.sum()) + lay.nv)
    assert all(lb.split(":")[0] in {"load", "ang", "v", "q", "Pphys", "Pdead", "Vphys", "Pbox", "Vbox"} for lb in lab)


def test_a_zero_box_is_empty_and_its_iis_is_irreducible(lin14):
    ppc, lin = lin14
    lay = lin["lay"]
    G, h, lab, a_eq, b_eq = run_iis.system(ppc, lin, np.zeros(lay.ng), np.zeros(lay.nv), vlin.MARGIN)
    # pin x to x0 and demand a balance far from it: empty
    empty, _ = run_iis.empty(G, h, a_eq, b_eq + 50.0)
    assert empty
    rows_, eq_in, _ = run_iis.iis(G, h, lab, a_eq, b_eq + 50.0)
    assert rows_
    idx = [lab.index(r) for r in rows_]
    aeq, beq = (a_eq, b_eq + 50.0) if eq_in else (np.zeros_like(a_eq), 0.0)
    assert run_iis.empty(G[idx], h[idx], aeq, beq)[0]  # the subset alone is empty
    for k in range(len(idx)):  # dropping any one row makes the rest feasible
        rest = idx[:k] + idx[k + 1:]
        assert not run_iis.empty(G[rest], h[rest], aeq, beq)[0]
    if eq_in:  # and so does dropping the balance row
        assert not run_iis.empty(G[idx], h[idx], np.zeros_like(a_eq), 0.0)[0]
