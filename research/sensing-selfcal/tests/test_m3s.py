"""Milestone 3s: causal priors from a camera's earlier windows only (experiments/m3s_causal)."""
import importlib.util, os
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
_s = importlib.util.spec_from_file_location("m3s_run", os.path.join(HERE, "..", "experiments", "m3s_causal", "run.py"))
run = importlib.util.module_from_spec(_s)
_s.loader.exec_module(run)


def test_no_prior_until_n_min_earlier_windows():
    h = [[520, 320 + i, 250, 0.1, 0] for i in range(run.N_MIN - 1)]
    assert run.causal_prior(h) is None
    pr = run.causal_prior(h + [[520, 400, 250, 0.3, 0]])
    assert [j for j, _, _ in pr] == [1, 2, 3]
    cx = [r[1] for r in h] + [400]
    assert pr[0][1] == np.median(cx) and abs(pr[0][2] - run.mad_sd(cx)) < 1e-12


def test_order_is_by_time_per_camera_across_sequences():
    ws = [{"seq": "fr1_desk", "unit": "fr1", "window": 0}, {"seq": "fr1_xyz", "unit": "fr1", "window": 1},
          {"seq": "fr1_xyz", "unit": "fr1", "window": 0}, {"seq": "fr3_stf", "unit": "fr3", "window": 0}]
    t0 = {("fr1_desk", 0): 1305031452.8, ("fr1_xyz", 0): 1305031102.2, ("fr1_xyz", 1): 1305031103.4,
          ("fr3_stf", 0): 1.0}
    o = run.order(ws, t0)
    assert [(w["seq"], w["window"]) for w in o["fr1"]] == [("fr1_xyz", 0), ("fr1_xyz", 1), ("fr1_desk", 0)]
    assert len(o["fr3"]) == 1


def test_mad_sd_of_a_normal_sample_is_its_sd():
    x = np.random.default_rng(0).normal(0, 2.0, 20000)
    assert abs(run.mad_sd(x) - 2.0) < 0.05
