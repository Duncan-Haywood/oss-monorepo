"""Milestone 4k: the fleet prior, the basin check, and a warm start that lands where the cold
start does on a well-behaved subset."""
import gzip, json, os, sys
import numpy as np
import pytest

HERE = os.path.dirname(__file__)
EXP = os.path.join(HERE, "..", "experiments", "m4k_warm")
sys.path.insert(0, EXP)
sys.path.insert(0, os.path.join(HERE, "..", "experiments", "m4j_tum"))
import importlib.util  # noqa: E402
import tumunit as tu  # noqa: E402


def _load(name, file):
    spec = importlib.util.spec_from_file_location(name, os.path.join(EXP, file))
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    return m


run = _load("m4k_run", "run.py")
analyse = _load("m4k_analyse", "analyse.py")


def test_fleet_prior_is_tum_mean():
    assert run.F_PRIOR == pytest.approx((516.9 + 537.3) / 2)
    # both units' published focal lengths sit within 2% of it, well inside the 10% basin
    for u in tu.UNITS:
        c = tu.TUM_CALIB[u]
        assert abs((c[0] + c[1]) / 2 / run.F_PRIOR - 1) < 0.02 < analyse.BASIN


def test_basin_drops_only_far_solves():
    s = lambda f: dict(f=f, status=1)  # noqa: E731
    sols = {"fr1": {(0, 1, 2): s(run.F_PRIOR * 1.09), (0, 1, 3): s(run.F_PRIOR * 1.11), (0, 1, 4): None},
            "fr3": {(0, 1, 2): s(9289.0), (0, 1, 3): s(run.F_PRIOR * 0.95)}}
    b = analyse.basin(sols)
    assert b["fr1"][(0, 1, 2)] is not None and b["fr1"][(0, 1, 3)] is None and b["fr1"][(0, 1, 4)] is None
    assert b["fr3"][(0, 1, 2)] is None and b["fr3"][(0, 1, 3)] is not None
    assert sols["fr1"][(0, 1, 3)] is not None          # the input is not modified


def test_warm_start_matches_cold_on_a_converged_set():
    with gzip.open(os.path.join(HERE, "..", "experiments", "m4j_tum", "results.json.gz"), "rt") as fh:
        cold = {tuple(r["views"]): r["sol"] for r in json.load(fh)["solutions"] if r["cam"] == "fr3"}
    obs, size, _ = tu.load("fr3")
    v = (0, 2, 5, 8, 11, 12)
    w = tu.sc.selfcal_fixed_best(obs[list(v)], size, run.F_PRIOR, nk=1, refs=(0, len(v) // 2))
    assert cold[v]["status"] > 0 and w["status"] > 0
    assert w["f"] == pytest.approx(cold[v]["f"], rel=1e-6)
    # The evaluation count is compared with a cold solve run here, not with the stored one:
    # MINPACK's LM path differs by SciPy/BLAS build, and on SciPy 1.18.1 / NumPy 2.5.3 this
    # set takes 47 cold and 42 warm against the stored 22 and 12 (only 22 and 16 of 41 fr3
    # 6-view counts matched the stored cold and warm ones, 2026-11-18). f agrees to 1e-6.
    c = tu.sc.selfcal_fixed_best(obs[list(v)], size, tu.f0("fr3"), nk=1, refs=(0, len(v) // 2))
    assert c["status"] > 0 and c["f"] == pytest.approx(cold[v]["f"], rel=1e-6)
    assert w["nfev"] <= c["nfev"]
