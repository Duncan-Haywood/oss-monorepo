import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "experiments" / "proof_success"))
import pytest  # noqa: E402

np = pytest.importorskip("numpy")
pytest.importorskip("sklearn")
import analyse  # noqa: E402


def row(seq, proved, t):
    return {"design": "d", "seq": seq, "cells": 90, "depth": 10, "ref_cells": 100, "input_bits": 8, "proved": proved, "t_sat": t}


def test_label_needs_proof_within_threshold():
    assert analyse.label(row([], True, 0.5), 1)
    assert not analyse.label(row([], True, 2.0), 1)
    assert not analyse.label(row([], False, 0.1), 10)


def test_features_count_passes_and_ratio():
    f = analyse.feats(row(["rewrite", "rewrite", "dc2"], True, 0.1))
    assert f[0] == 3 and f[2] == 2 and f[6] == 1
    assert f[len(analyse.PASSES) + 3] == pytest.approx(0.9)
    assert len(analyse.feats(row([], True, 0.1), design_level=False)) == len(f) - 2


def test_auc_undefined_for_one_class():
    assert analyse.auc([True, True], [0.1, 0.2]) is None
