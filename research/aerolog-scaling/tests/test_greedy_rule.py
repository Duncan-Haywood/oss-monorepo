import importlib.util
import os
import sys

import numpy as np

HERE = os.path.join(os.path.dirname(__file__), "..", "experiments", "hub_airspace")
sys.path.insert(0, HERE)
spec = importlib.util.spec_from_file_location("greedy_rule_test", os.path.join(HERE, "greedy_rule.py"))
gr = importlib.util.module_from_spec(spec)
spec.loader.exec_module(gr)


def _table(m, k, conflict):
    """G[i, j, a, b] = conflict[i, j] when a == b (same band), else 0."""
    G = np.zeros((m, m, k, k))
    for a in range(k):
        G[:, :, a, a] = conflict
    G[np.arange(m), np.arange(m)] = 0.0
    return G


def test_greedy_separates_conflicting_operators():
    c = np.array([[0, 1, 0], [1, 0, 1], [0, 1, 0]], float)
    lab = gr.greedy(_table(3, 2, c), [0, 1, 2])
    # 0 -> band 0 (tie, lowest); 1 conflicts with 0 -> band 1; 2 conflicts with 1 only -> band 0
    assert lab == (0, 1, 0)


def test_greedy_follows_insertion_order():
    c = np.ones((3, 3)) - np.eye(3)
    assert gr.greedy(_table(3, 3, c), [2, 1, 0]) == (2, 1, 0)


def test_greedy_matches_pair_cost_of_descend():
    rng = np.random.default_rng(3)
    m, k = 6, 3
    G = rng.random((m, m, k, k))
    G[np.arange(m), np.arange(m)] = 0.0
    lab = gr.greedy(G, list(range(m)))
    # the last operator's band is its cheapest given everyone else
    i = m - 1
    cost = [sum(G[i, j, a, lab[j]] for j in range(m - 1)) for a in range(k)]
    assert lab[i] == int(np.argmin(cost))


def test_orders():
    b = np.array([1.0, -2.0, 1.0, 0.5])
    deg = np.array([1.0, 5.0, 3.0, 2.0])
    assert gr.offset_order(b, deg) == [1, 3, 2, 0]
    assert gr.offset_order(b, deg, descending=True) == [2, 0, 3, 1]
    assert gr.degree_order(deg) == [1, 2, 3, 0]
