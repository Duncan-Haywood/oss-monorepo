"""Milestone 4m: grouping by old set, the choice rule, the blind rate and the within-set AUC on known cases."""
import importlib.util, os
import numpy as np

EXP = os.path.join(os.path.dirname(__file__), "..", "experiments", "m4m_wait")
spec = importlib.util.spec_from_file_location("m4m_score", os.path.join(EXP, "score.py"))
sc = importlib.util.module_from_spec(spec)
spec.loader.exec_module(sc)


def test_groups_drop_old_sets_with_one_candidate():
    old = np.array([5, 5, 9, 3, 3, 3])
    g, n = sc.groups(old)
    assert n == 2
    assert g[2] == -1
    assert g[0] == g[1] and g[3] == g[4] == g[5] and g[0] != g[3]


def test_choose_takes_highest_score_and_breaks_ties_by_new_mask():
    old = np.array([1, 1, 1, 2, 2])
    new = np.array([40, 8, 16, 4, 2])
    score = np.array([0.5, 0.9, 0.9, 0.1, 0.3])
    g, n = sc.groups(old)
    ch = sc.choose(g, n, score, new)
    assert sorted(ch.tolist()) == [1, 4]      # tie at 0.9 goes to new mask 8, not 16


def test_group_mean_is_the_blind_pick_rate():
    old = np.array([1, 1, 1, 1, 2, 2])
    x = np.array([1, 0, 0, 1, 1, 1], bool)
    g, n = sc.groups(old)
    m = sc.group_mean(g, n, x)
    assert sorted(m.tolist()) == [0.5, 1.0]


def test_within_auc_ignores_pairs_across_old_sets():
    # group 0 ranked perfectly, group 1 perfectly reversed; across groups a high score always fires
    g = np.array([0, 0, 1, 1])
    score = np.array([0.1, 0.2, 0.9, 0.8])
    label = np.array([0, 1, 0, 1], bool)
    assert sc.within_auc(g, score, label) == 0.5
    assert sc.within_auc(np.array([0, 0, -1, -1]), score, label) == 1.0
    assert np.isnan(sc.within_auc(np.array([0, 0]), np.array([1.0, 2.0]), np.array([1, 1], bool)))


def test_pooled_weights_each_old_set_once():
    S = {"a": {"d": dict(n_old_sets=1, pi=dict(chosen_pm2=1.0), random_pm2=0.5)},
         "b": {"d": dict(n_old_sets=3, pi=dict(chosen_pm2=0.0), random_pm2=0.25)}}
    p = sc.pooled(S, ("a", "b"), "d")
    assert p["chosen"] == 0.25 and abs(p["random"] - 0.3125) < 1e-12 and p["ratio"] == 0.8
