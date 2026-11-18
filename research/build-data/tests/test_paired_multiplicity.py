import os, sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
import paired_multiplicity as pm


def test_pval_at_interval_edge_is_005():
    assert abs(pm.pval(1.96, 0.0, 3.92) - 0.05) < 1e-3


def test_holm_hand_count():
    # sorted p: .01 (<.05/4=.0125 yes), .02 (<.05/3=.0167 no) -> stop
    assert pm.holm([0.02, 0.01, 0.04, 0.5]) == [False, True, False, False]


def test_bh_hand_count():
    # thresholds .0125,.025,.0375,.05: .01 ok, .02 ok, .04 no(.0375), .5 no -> first two
    assert pm.bh([0.02, 0.01, 0.04, 0.5]) == [True, True, False, False]


def test_year_filter_and_pooling(tmp_path):
    import json, io, contextlib
    cell = {"rel": 0.01, "diff": 1.0, "lo": 0.5, "hi": 1.5, "significant": True}
    for yr in ("2022", "2023"):
        (tmp_path / f"paired_x_a2i_{yr}.json").write_text(json.dumps({"city": "x", "target": "a2i", "cells": {"0.5": cell}}))
    out = io.StringIO()
    with contextlib.redirect_stdout(out):
        pm.main(str(tmp_path), "2022")
    assert "1 cells, test year 2022" in out.getvalue()
    out = io.StringIO()
    with contextlib.redirect_stdout(out):
        pm.main(str(tmp_path), "all")
    assert "2 cells, test year all" in out.getvalue()
