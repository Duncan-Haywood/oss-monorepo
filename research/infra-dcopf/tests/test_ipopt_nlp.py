"""IPOPT swapped in for PIPS under PYPOWER's unchanged AC OPF (src/infra_dcopf/ipopt_nlp.py)."""
import warnings

import pytest

warnings.filterwarnings("ignore")
pytest.importorskip("pypower")
pytest.importorskip("cyipopt")
from pypower.api import runopf  # noqa: E402
import pypower.pipsopf_solver as ps  # noqa: E402

from infra_dcopf import ipopt_nlp  # noqa: E402
from infra_dcopf.pglib import case_path, load_m  # noqa: E402
from infra_dcopf.vsched import ACOPT  # noqa: E402


@pytest.mark.parametrize("name", ["case14_ieee", "case30_ieee"])
def test_ipopt_matches_pips(name):
    ppc = load_m(case_path(name, "typ"))
    a = runopf(ppc, ACOPT)
    with ipopt_nlp.use_ipopt():
        b = runopf(ppc, ACOPT)
    assert a["success"] and b["success"] and ipopt_nlp.LAST["status"] == 0
    assert abs(a["f"] - b["f"]) <= 1e-5 * abs(a["f"])
    assert abs(a["bus"][:, 7] - b["bus"][:, 7]).max() < 1e-3  # VM


def test_use_ipopt_restores_pips():
    old = ps.pips
    with ipopt_nlp.use_ipopt():
        assert ps.pips is ipopt_nlp.ipopt_pips
    assert ps.pips is old
