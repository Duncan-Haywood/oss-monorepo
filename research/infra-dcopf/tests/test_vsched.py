"""Voltage schedules and the reactive stage: the reference carries the schedule, pinning holds P,
and the reactive stage at the AC optimum's own dispatch recovers the AC optimum."""
import warnings

import numpy as np
import pytest

warnings.filterwarnings("ignore")
pytest.importorskip("pypower")
from pypower.api import runopf  # noqa: E402
from pypower.idx_bus import VM  # noqa: E402
from pypower.idx_gen import GEN_BUS, PG, PMAX, PMIN  # noqa: E402

from infra_dcopf.aclin import slack_gen  # noqa: E402
from infra_dcopf.pglib import case_path, load_m  # noqa: E402
from infra_dcopf.vsched import ACOPT, file_schedule, opt_schedule, pinned, reactive_stage, ref_for  # noqa: E402


@pytest.fixture(scope="module")
def case14_api():
    ppc = load_m(case_path("case14_ieee", "api"))
    ac = runopf(ppc, ACOPT)
    assert ac["success"]
    return ppc, ac


def test_ref_for_puts_the_schedule_on_generator_buses(case14_api):
    ppc, ac = case14_api
    vg = opt_schedule(ppc, ac)
    ref = ref_for(ppc, vg)
    pos = {int(b): i for i, b in enumerate(ref["bus"][:, 0])}
    got = np.array([ref["bus"][pos[int(b)], VM] for b in ppc["gen"][:, GEN_BUS]])
    assert np.allclose(got, vg)


def test_pglib_file_schedule_is_flat(case14_api):
    ppc, _ = case14_api
    assert np.allclose(file_schedule(ppc), 1.0)


def test_pinned_holds_non_slack_units(case14_api):
    ppc, ac = case14_api
    pg = ac["gen"][:, PG]
    p = pinned(ppc, pg)
    s = slack_gen(ppc)
    for k in range(len(pg)):
        if k == s:
            assert p["gen"][k, PMAX] == ppc["gen"][k, PMAX]
        else:
            assert p["gen"][k, PMAX] - p["gen"][k, PMIN] <= 0.02 + 1e-12


def test_reactive_stage_at_the_optimum_recovers_it(case14_api):
    ppc, ac = case14_api
    pg, vg, r = reactive_stage(ppc, ac["gen"][:, PG])
    assert r["f"] == pytest.approx(ac["f"], rel=1e-4)
    assert np.max(np.abs(pg - ac["gen"][:, PG])) < 0.5
