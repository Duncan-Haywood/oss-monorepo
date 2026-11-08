import os, sys
import numpy as np, pandas as pd
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
import prior_table3 as p3


def test_build_min_n_and_quantile():
    df = pd.DataFrame({"a": ["x"] * 31 + ["y"] * 5, "y": list(range(31)) + [9] * 5})
    t = p3.build(df, ["a"])
    assert list(t) == [("x",)] and t[("x",)][0.5] == 15.0   # median of 0..30


def test_predict_backoff_levels():
    glob = {t: -1.0 for t in p3.TAUS}
    fine = {("a", "w", 1): {t: 1.0 for t in p3.TAUS}}
    mid = {("a", "w"): {t: 2.0 for t in p3.TAUS}}
    typ = {("a",): {t: 3.0 for t in p3.TAUS}}
    tabs = [(lambda r: r, fine), (lambda r: r[:2], mid), (lambda r: r[:1], typ)]
    P, lv = p3.predict(tabs, glob, [("a", "w", 1), ("a", "w", 2), ("a", "v", 1), ("z", "w", 1)])
    assert list(P[0.5]) == [1.0, 2.0, 3.0, -1.0] and lv == [1, 1, 1, 1]
