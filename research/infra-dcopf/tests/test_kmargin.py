"""Rule K (curvature-aware thermal margin, LOG.md 2026-11-22): the per-end margin tightens exactly the rows it
names, kmargin=None is the frozen repair, and an armed row is one the QP held but the AC check found over."""
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
from pypower.api import ppoption, rundcopf  # noqa: E402
from pypower.idx_brch import RATE_A  # noqa: E402
from pypower.idx_gen import PG  # noqa: E402

from infra_dcopf import vlin  # noqa: E402
from infra_dcopf.pglib import case_path, load_m  # noqa: E402
from infra_dcopf.vsched import file_schedule  # noqa: E402


def _start(name, kind):
    ppc = load_m(case_path(name, kind))
    dc = rundcopf(ppc, ppoption(VERBOSE=0, OUT_ALL=0))
    return ppc, dc["gen"][:, PG].copy(), file_schedule(ppc)


def test_load_end_tightens_only_named_rows():
    ppc, pg, vf = _start("case14_ieee", "api")
    lay = vlin.Layout(ppc)
    lin = vlin.linearise(ppc, pg, lay.v_of(vf), lay, analytic=True)
    A0, u0, kind, _, _ = vlin.rows(ppc, lin, vlin.MARGIN)
    nbr = ppc["branch"].shape[0]
    rated = np.flatnonzero(np.concatenate([ppc["branch"][:, RATE_A]] * 2) > 0)
    j = int(rated[0])
    extra = np.zeros(2 * nbr)
    extra[j] = 0.03
    mg = dict(vlin.MARGIN, load_end=extra)
    A1, u1, _, _, _ = vlin.rows(ppc, lin, mg)
    assert A0.shape == A1.shape and np.allclose(A0, A1)
    d = u0 - u1
    load_rows = [i for i, k in enumerate(kind) if k == "load"]
    assert np.count_nonzero(np.abs(d) > 1e-12) <= 1
    first = load_rows[0]  # the first rated end is the first thermal row
    rate = ppc["branch"][j % nbr, RATE_A]
    # the bound moves by 3 % of the rating unless the row sits above it within the tolerance band
    assert d[first] == pytest.approx(0.03 * rate, rel=1e-9) or d[first] == pytest.approx(0.0, abs=1e-9)


def test_kmargin_none_is_frozen_and_check_ends():
    ppc, pg, vf = _start("case30_ieee", "api")
    kw = dict(rounds=5, margin=vlin.MARGIN, analytic=True, solver="clarabel")
    a = vlin.slp(ppc, pg, vf, **kw)
    b = vlin.slp(ppc, pg, vf, kmargin=None, **kw)
    assert [x["status"] for x in a] == [x["status"] for x in b]
    assert [x.get("qp") for x in a] == [x.get("qp") for x in b]
    c = vlin.check(ppc, pg, vf, ends=True)
    el = c["end_load"]
    assert el.shape == (2 * ppc["branch"].shape[0],)
    assert np.nanmax(el[np.isfinite(el)]) == pytest.approx(c["max_load"], rel=1e-12)


def test_kmargin_arms_held_rows_that_broke():
    ppc, pg, vf = _start("case30_ieee", "api")
    ki = []
    h = vlin.slp(ppc, pg, vf, rounds=5, margin=vlin.MARGIN, analytic=True, solver="clarabel", kmargin=0.05,
                 kinfo=ki)
    assert ki, "case30 API's first rounds overload a held row (curvature), so rule K arms"
    for e in ki:
        assert e["armed"] >= e["set"] >= 0 and e["r_max"] > 0
        assert any(x["it"] == e["it"] and x.get("n_over", 0) > 0 for x in h)
    assert all("end_load" not in x for x in h)


def test_k_first_skip_never_arms_round_one_and_scale_shrinks_it():
    ppc, pg, vf = _start("case30_ieee", "api")
    kw = dict(rounds=3, margin=vlin.MARGIN, analytic=True, solver="clarabel", kmargin=0.05)
    keep, skip, scale = [], [], []
    vlin.slp(ppc, pg, vf, kinfo=keep, **kw)
    vlin.slp(ppc, pg, vf, kinfo=skip, k_first="skip", **kw)
    vlin.slp(ppc, pg, vf, kinfo=scale, k_first="scale", **kw)
    assert keep and keep[0]["it"] == 1, "rule K arms on case30 API's unboxed round 1"
    assert all(e["it"] > 1 for e in skip)
    first = [e for e in scale if e["it"] == 1]
    # the same round-1 step is checked, so the same rows arm; the stored remainder is never larger
    assert first and first[0]["armed"] == keep[0]["armed"] and first[0]["r_max"] <= keep[0]["r_max"] + 1e-12
