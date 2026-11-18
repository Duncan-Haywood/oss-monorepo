"""Rule S (research/grid-linopf, 2026-11-18): merit_sum swaps the worst thermal excess for the summed one and
leaves the frozen merit, and vlin.slp's default, unchanged."""
import sys
from pathlib import Path

import pytest

from infra_dcopf import vlin

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "experiments"))


def _c(**kw):
    c = {"max_load": 1.0, "load_exc_sum": 0.0, "slack_out_mw": 0.0, "ang_exc_deg": 0.0, "v_exc_pu": 0.0,
         "q_exc_mvar": 0.0}
    c.update(kw)
    return c


def test_merit_sum_equals_merit_with_one_overload():
    c = _c(max_load=1.02, load_exc_sum=0.02, v_exc_pu=0.001)
    assert vlin.merit_sum(c, 100.0) == pytest.approx(vlin.merit(c, 100.0))


def test_merit_sum_counts_every_overload():
    c = _c(max_load=1.02, load_exc_sum=0.05)
    assert vlin.merit_sum(c, 100.0) == pytest.approx(vlin.merit(c, 100.0) + 0.03)


def test_two_merits_can_disagree_on_a_step():
    # worse worst branch, lower total: the frozen merit rejects it, rule S accepts it
    base, trial = _c(max_load=1.01, load_exc_sum=0.04), _c(max_load=1.02, load_exc_sum=0.02)
    assert not vlin.merit(trial, 100.0) < vlin.merit(base, 100.0)
    assert vlin.merit_sum(trial, 100.0) < vlin.merit_sum(base, 100.0)


def test_check_reports_summed_excess():
    pytest.importorskip("pypower")
    from infra_dcopf.pglib import case_path, load_m
    from pypower.api import runopf
    from run_pglib import ACOPT
    ppc = load_m(case_path("case14_ieee", "api"))
    r = runopf(ppc, ACOPT)
    from pypower.idx_gen import PG
    c = vlin.check(ppc, r["gen"][:, PG], r["gen"][:, 5])
    assert c["load_exc_sum"] >= max(c["max_load"] - 1.0, 0.0) - 1e-12
