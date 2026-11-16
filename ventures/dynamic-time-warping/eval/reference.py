"""Write eval/reference.json: DTW results from dtw-python (Giorgino 2009) for engine.test.mjs.

    pip install dtw-python==1.9.0 numpy
    python3 eval/reference.py > eval/reference.json

dtw-python is used only to produce these numbers; none of its code is in the engine.
"""
import json
import sys

import numpy as np
import dtw as dtwlib
from dtw import dtw

rng = np.random.default_rng(20261116)
cases = []
shapes = [(12, 12), (20, 15), (15, 24), (40, 40), (33, 50)]
for n, m in shapes:
    t1 = np.linspace(0, 3, n)
    t2 = np.linspace(0, 3, m) ** 1.2
    x = np.round(np.sin(2 * t1) + 0.3 * rng.standard_normal(n), 4)
    y = np.round(np.sin(2 * t2) + 0.3 * rng.standard_normal(m), 4)
    for step in ["symmetric1", "symmetric2", "asymmetric"]:
        for wt, wa in [("none", None), ("band", 3), ("band", 6), ("itakura", None)]:
            if wt == "itakura" and (m > 2 * n or n > 2 * m):
                continue
            for dist in ["abs", "squared"]:
                kw = dict(step_pattern=step, keep_internals=False,
                          dist_method="cityblock" if dist == "abs" else "sqeuclidean")
                if wt == "band":
                    kw.update(window_type="slantedband", window_args={"window_size": wa})
                elif wt == "itakura":
                    kw.update(window_type="itakura")
                try:
                    a = dtw(x, y, **kw)
                except ValueError:
                    cases.append(dict(x=x.tolist(), y=y.tolist(), step=step, windowType=wt, window=wa, dist=dist, distance=None))
                    continue
                cases.append(dict(x=x.tolist(), y=y.tolist(), step=step, windowType=wt, window=wa, dist=dist,
                                  distance=float(a.distance),
                                  normalizedDistance=None if np.isnan(a.normalizedDistance) else float(a.normalizedDistance),
                                  path=[[int(i), int(j)] for i, j in zip(a.index1, a.index2)]))

subseq = []
for n, m in [(10, 80), (25, 200), (40, 300)]:
    y = np.round(np.cumsum(rng.standard_normal(m)), 4)
    start = int(rng.integers(0, m - 2 * n))
    x = np.round(y[start:start + n][:: 1] + 0.2 * rng.standard_normal(n), 4)
    for dist in ["abs", "squared"]:
        a = dtw(x, y, step_pattern="asymmetric", open_begin=True, open_end=True,
                dist_method="cityblock" if dist == "abs" else "sqeuclidean")
        subseq.append(dict(x=x.tolist(), y=y.tolist(), dist=dist, distance=float(a.distance),
                           normalizedDistance=float(a.normalizedDistance),
                           start=int(a.index2[0]), end=int(a.index2[-1])))

json.dump({"generator": f"dtw-python {dtwlib.__version__}, numpy {np.__version__}", "pairs": cases, "subsequence": subseq}, sys.stdout)
