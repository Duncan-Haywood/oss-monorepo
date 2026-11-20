"""Rule E (box enlargement before the elastic fallback, 2026-11-19): vlin.min_box_scale's one-LP answer
agrees with run_iis's bisection, respects its cap, and enlarge=None leaves the repair frozen."""
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
from pypower.idx_gen import PG, PMAX, PMIN  # noqa: E402

from infra_dcopf import vlin  # noqa: E402
from infra_dcopf.pglib import case_path, load_m  # noqa: E402
from infra_dcopf.vsched import file_schedule  # noqa: E402
import run_iis  # noqa: E402


@pytest.fixture(scope="module")
def tight14():
    """case14 API linearised at its DC dispatch with every unit pushed 30 MW off it (clipped to its
    range), so a tiny P box cannot reach the balance."""
    ppc = load_m(case_path("case14_ieee", "api"))
    lay = vlin.Layout(ppc)
    dc = rundcopf(ppc, ppoption(VERBOSE=0, OUT_ALL=0))
    pg = dc["gen"][:, PG].copy()
    lin = vlin.linearise(ppc, pg, lay.v_of(file_schedule(ppc)), lay, analytic=True)
    lin = dict(lin)
    g = ppc["gen"]
    lin["pg0"] = np.clip(lin["pg0"] - 30.0, g[:, PMIN], g[:, PMAX])
    return ppc, lin


def test_lp_scale_matches_bisection(tight14):
    ppc, lin = tight14
    lay = lin["lay"]
    pt = np.full(lay.ng, 1.0)
    vt = np.full(lay.nv, 0.001)
    t = vlin.min_box_scale(ppc, lin, pt, vt, vlin.MARGIN)
    assert t is not None and t > 1.0
    tb = run_iis.box_scale_needed(ppc, lin, pt, vt, vlin.MARGIN)
    assert tb is not None
    assert t <= tb * 1.001 and t >= tb / 1.03  # bisection's upper end, to 2 %
    assert run_iis.empty(*run_iis._sys(ppc, lin, pt, vt, vlin.MARGIN, 0.98 * t))[0]
    assert not run_iis.empty(*run_iis._sys(ppc, lin, pt, vt, vlin.MARGIN, 1.01 * t))[0]


def test_cap_below_need_declines(tight14):
    ppc, lin = tight14
    lay = lin["lay"]
    pt = np.full(lay.ng, 1.0)
    vt = np.full(lay.nv, 0.001)
    t = vlin.min_box_scale(ppc, lin, pt, vt, vlin.MARGIN)
    assert vlin.min_box_scale(ppc, lin, pt, vt, vlin.MARGIN, cap=0.5 * t) is None
    xp, xv, ok, info = vlin.enlarged_step(ppc, lin, pt, vt, vlin.MARGIN, 0.5 * t * pt, 0.5 * t * vt, "clarabel")
    assert not ok and info["fired"] is False
    xp, xv, ok, info = vlin.enlarged_step(ppc, lin, pt, vt, vlin.MARGIN, 4 * t * pt, 4 * t * vt, "clarabel")
    assert info["fired"] and ok and abs(info["t_used"] - 1.1 * t) < 1e-9
    assert np.all(np.abs(xp - lin["pg0"])[lay.live] <= info["t_used"] * 1.0 + 1e-6)


def test_enlarge_none_is_frozen():
    ppc = load_m(case_path("case14_ieee", "sad"))
    lay = vlin.Layout(ppc)
    dc = rundcopf(ppc, ppoption(VERBOSE=0, OUT_ALL=0))
    pg, vf = dc["gen"][:, PG].copy(), file_schedule(ppc)
    a = vlin.slp(ppc, pg, vf, rounds=4, margin=vlin.MARGIN, analytic=True, solver="clarabel")
    b = vlin.slp(ppc, pg, vf, rounds=4, margin=vlin.MARGIN, analytic=True, solver="clarabel", enlarge=None)
    assert [x["status"] for x in a] == [x["status"] for x in b]
    assert [x.get("qp") for x in a] == [x.get("qp") for x in b]


def test_enlarge_once_default_is_rule_e():
    """Rule O (E-once, 2026-11-19) is opt-in: enlarge_once=False reproduces rule E, and on a run where rule E
    never takes an enlarged step rule O is identical too (it can only block a second firing)."""
    ppc = load_m(case_path("case14_ieee", "sad"))
    dc = rundcopf(ppc, ppoption(VERBOSE=0, OUT_ALL=0))
    pg, vf = dc["gen"][:, PG].copy(), file_schedule(ppc)
    kw = dict(rounds=4, margin=vlin.MARGIN, analytic=True, solver="clarabel", enlarge=2.0)
    ie, io = [], []
    e = vlin.slp(ppc, pg, vf, info=ie, **kw)
    d = vlin.slp(ppc, pg, vf, enlarge_once=False, **kw)
    o = vlin.slp(ppc, pg, vf, enlarge_once=True, info=io, **kw)
    assert [x["status"] for x in e] == [x["status"] for x in d]
    assert [x.get("qp") for x in e] == [x.get("qp") for x in d]
    if sum(1 for x in ie if x.get("ok")) <= 1:
        assert [x["status"] for x in e] == [x["status"] for x in o]
    assert not any(x.get("blocked") for x in ie)


def test_enlarge_rel_default_is_rule_e_and_round1_same_cap(tight14):
    """Rule C (2026-11-20) is opt-in: enlarge_rel=False reproduces rule E. With unhalved boxes the relative cap
    equals rule E's (the current box is the first box), and after one halving it is half of it in absolute units."""
    ppc = load_m(case_path("case14_ieee", "sad"))
    dc = rundcopf(ppc, ppoption(VERBOSE=0, OUT_ALL=0))
    pg, vf = dc["gen"][:, PG].copy(), file_schedule(ppc)
    kw = dict(rounds=4, margin=vlin.MARGIN, analytic=True, solver="clarabel", enlarge=2.0)
    e = vlin.slp(ppc, pg, vf, **kw)
    d = vlin.slp(ppc, pg, vf, enlarge_rel=False, **kw)
    assert [x["status"] for x in e] == [x["status"] for x in d]
    assert [x.get("qp") for x in e] == [x.get("qp") for x in d]
    tppc, lin = tight14
    lay = lin["lay"]
    pt, vt = np.full(lay.ng, 1.0), np.full(lay.nv, 0.001)
    t = vlin.min_box_scale(tppc, lin, pt, vt, vlin.MARGIN)
    # need t in units of the current box; halve the box and the need doubles, past a cap of 2 x current box
    _, _, ok_full, inf_full = vlin.enlarged_step(tppc, lin, t / 1.5 * pt, t / 1.5 * vt, vlin.MARGIN,
                                                 2 * t / 1.5 * pt, 2 * t / 1.5 * vt, "clarabel")
    assert inf_full["fired"] and ok_full
    _, _, ok_half, inf_half = vlin.enlarged_step(tppc, lin, t / 3 * pt, t / 3 * vt, vlin.MARGIN,
                                                 2 * t / 3 * pt, 2 * t / 3 * vt, "clarabel")
    assert not ok_half and inf_half["fired"] is False
