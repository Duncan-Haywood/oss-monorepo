import os, sys
import numpy as np
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
import prior_boosted as pb


def test_bucket_edges_hand_counted():
    cost = np.array([np.nan, 0, 500, 1000, 9999, 10000, 99999, 100000, 999999, 1e6, 5e7])
    got = pb.bucket(np.log1p(np.where(np.isnan(cost), 0, cost)) * np.where(np.isnan(cost), np.nan, 1))
    # missing and 0 -> 0; <1k -> 1; [1k,10k) -> 2; [10k,100k) -> 3; [100k,1M) -> 4; >=1M -> 5
    assert list(got) == [0, 0, 1, 2, 2, 3, 3, 4, 4, 5, 5]


def test_table_median_and_min_n():
    keys = ["a"] * 31 + ["b"] * 5
    preds = {0.1: np.arange(36.0), 0.5: np.ones(36), 0.9: np.full(36, 7.0)}
    t = pb.table(keys, preds)
    assert list(t) == ["a"] and t["a"][0.1] == 15.0 and t["a"][0.5] == 1.0 and t["a"]["n"] == 31


def test_lookup_fallback_order():
    g = {0.1: 0, 0.5: 1, 0.9: 2}
    assert pb.lookup({("a", 1): "cell"}, {"a": "type"}, g, "a", 1) == "cell"
    assert pb.lookup({}, {"a": "type"}, g, "a", 2) == "type"
    assert pb.lookup({}, {}, g, "z", 2) is g
