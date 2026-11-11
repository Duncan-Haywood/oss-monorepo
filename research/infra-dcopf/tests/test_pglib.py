"""PGLib reader and solver validation against the library's published PowerModels.jl objectives."""
import sys
import warnings
from pathlib import Path

import numpy as np
import pytest

warnings.filterwarnings("ignore")
pypower = pytest.importorskip("pypower")
from pypower.api import ppoption, rundcopf, runopf  # noqa: E402

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "experiments"))
from infra_dcopf.pglib import baseline, case_path, load_m  # noqa: E402
from run_pglib import pm_convention  # noqa: E402

Q = ppoption(VERBOSE=0, OUT_ALL=0)


def test_reader_shapes_case14():
    p = load_m(case_path("case14_ieee"))
    assert p["baseMVA"] == 100.0
    assert p["bus"].shape == (14, 13)
    assert p["branch"].shape == (20, 13)
    assert p["gen"].shape[0] == 5 and p["gen"].shape[1] == 21
    assert p["gencost"].shape == (5, 7)
    assert p["bus"][:, 2].sum() == pytest.approx(259.0)


def test_baseline_table_parsed():
    b = baseline()
    assert b[("case14_ieee", "typ")] == (2051.5, 2178.1)
    assert b[("case118_ieee", "api")] == (231290.0, 249610.0)
    assert np.isnan(b[("case30_ieee", "sad")][0])  # published as "inf." (DC infeasible)


@pytest.mark.parametrize("kind", ["typ", "api"])
def test_ac_opf_matches_published_case118(kind):
    r = runopf(load_m(case_path("case118_ieee", kind)), ppoption(VERBOSE=0, OUT_ALL=0, OPF_ALG=560))
    assert r["success"]
    assert r["f"] == pytest.approx(baseline()[("case118_ieee", kind)][1], rel=1e-4)


def test_powermodels_dc_convention_reproduces_published_dc_and_matpower_does_not():
    p = load_m(case_path("case14_ieee", "api"))
    pub = baseline()[("case14_ieee", "api")][0]
    assert rundcopf(pm_convention(p), Q)["f"] == pytest.approx(pub, rel=1e-4)
    assert abs(rundcopf(p, Q)["f"] / pub - 1) > 0.02  # MATPOWER's 1/(x tap) B matrix: 4664 vs 4798
