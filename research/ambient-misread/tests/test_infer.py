import numpy as np
from ambient_misread.sim import Params, contexts, URGENCY
from ambient_misread.infer import confusion, posterior, policy_values, mean_values, simulate_policy, PRIOR

P = Params()
C = contexts()


def test_confusion_rows_sum_to_one():
    for kind in ("uniform", "adjacent"):
        for a in (0.4, 0.7, 1.0):
            assert np.allclose(confusion(a, kind).sum(axis=1), 1.0)


def test_adjacent_never_confuses_low_with_high():
    M = confusion(0.6, "adjacent")
    assert M[0, 2] == 0 and M[2, 0] == 0


def test_posterior_columns_are_distributions():
    post = posterior(confusion(0.7))
    assert np.allclose(post.sum(axis=1), 1.0)


def test_perfect_classifier_naive_equals_bayes_equals_oracle():
    v = mean_values(P, C, confusion(1.0))
    assert abs(v["naive"] - v["oracle"]) < 1e-12 and abs(v["bayes"] - v["oracle"]) < 1e-12


def test_uninformative_label_bayes_equals_blind():
    v = mean_values(P, C, confusion(1 / 3))
    assert abs(v["bayes"] - v["blind"]) < 1e-12


def test_ordering_oracle_bayes_ge_others():
    for a in (0.4, 0.6, 0.8):
        for c in C:
            v = policy_values(P, c, confusion(a))
            assert v["oracle"] >= v["bayes"] - 1e-12
            assert v["bayes"] >= v["naive"] - 1e-12
            assert v["bayes"] >= v["blind"] - 1e-12


def test_monte_carlo_matches_closed_form():
    rng = np.random.default_rng(3)
    M = confusion(0.7)
    c = (6, 0.5, 1, False)
    v = policy_values(P, c, M)
    for k in v:
        assert abs(v[k] - simulate_policy(P, c, M, k, 100000, rng)) < 0.01


def test_prior_matches_urgency_mix():
    assert np.allclose(PRIOR, [v[2] for v in URGENCY.values()])
