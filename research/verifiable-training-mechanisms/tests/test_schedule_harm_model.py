"""Milestone 84's schedule-only harm model (experiments/schedule_harm_model/analyze.py) against hand-checked cases
and the committed results."""
import importlib.util
import json
import os

import pytest

np = pytest.importorskip("numpy")
EXP = os.path.join(os.path.dirname(__file__), "..", "experiments", "schedule_harm_model")
_spec = importlib.util.spec_from_file_location("shm_analyze", os.path.join(EXP, "analyze.py"))
A = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(A)


def test_predictors_segment_and_remaining():
    seg, rem = A.predictors([3.0, 2.0, 1.0])
    assert list(seg) == [3.0, 2.0, 1.0]
    assert list(rem) == [6.0, 3.0, 1.0]  # remaining learning rate counts the segment itself


def test_corr_flat_profile_is_nan():
    assert np.isnan(A.corr(np.ones(5), np.arange(5.0)))
    assert A.corr(np.arange(5.0), 2 * np.arange(5.0)) == pytest.approx(1.0)


def test_model_coverage_on_exact_model_matches_oracle():
    # when the measured harm is exactly proportional to the model, model and oracle coverages coincide
    seg = np.linspace(4.0, 0.1, 30)
    h = A.C_LEVEL * seg * 1.3
    g = A.game_a(h, h, h, np.ones(30), A.C_LEVEL * seg, 5)
    assert g["model"] == pytest.approx(g["oracle"], rel=1e-6)
    assert g["gain_model"] > 1


def test_committed_results_reproduce_headline():
    R = json.load(open(os.path.join(EXP, "results.json")))
    seeds = [str(s) for s in range(40)]
    for name in ("step", "linear", "warmcos", "sgdr"):
        sc = R["schedules"][name]
        assert sum(sc["seg_lr"]) == pytest.approx(150.0, rel=1e-4)
        h = A.m82.harms(sc, seeds).mean(0)
        seg, rem = A.predictors(sc["seg_lr"])
        assert A.corr(h, seg) > 0.99 > A.corr(h, rem)
        assert np.sqrt(np.mean((A.C_LEVEL * seg - h) ** 2)) / h.mean() < 0.1
