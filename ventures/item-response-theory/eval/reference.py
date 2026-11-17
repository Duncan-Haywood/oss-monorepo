"""Independent reference: fit the same data with girth (MIT, pip install girth)
and save the estimates for engine.test.mjs to compare against.

    python -I eval/reference.py      # writes eval/reference.json

girth is a separate implementation of marginal maximum likelihood
(https://github.com/eribean/girth). Its quadrature is set to 61 points on
[-6, 6] to match engine.mjs.
"""
import csv
import json
import pathlib
import sys

import girth
import numpy as np

HERE = pathlib.Path(__file__).resolve().parent
OPTS = {"quadrature_n": 61, "quadrature_bounds": (-6, 6), "max_iteration": 1000}


def load(path, weighted):
    with open(path) as f:
        rows = list(csv.reader(f))
    body = rows[1:]
    out = []
    for r in body:
        if weighted:
            out += [[int(v) for v in r[:-1]]] * int(r[-1])
        else:
            out.append([int(v) for v in r])
    return np.array(out, dtype=int).T  # items x people


def fit(data):
    one = girth.onepl_mml(data, options=OPTS)
    two = girth.twopl_mml(data, options=OPTS)
    return {
        "1pl": {"a": float(one["Discrimination"]), "b": [float(v) for v in one["Difficulty"]]},
        "2pl": {"a": [float(v) for v in two["Discrimination"]], "b": [float(v) for v in two["Difficulty"]]},
    }


ref = {
    "tool": "girth",
    "python": sys.version.split()[0],
    "numpy": np.__version__,
    "options": {"quadrature_n": 61, "quadrature_bounds": [-6, 6]},
    "lsat6": fit(load(HERE.parent / "data" / "lsat6.csv", weighted=True)),
    "sim2pl": fit(load(HERE / "sim-2pl.csv", weighted=False)),
}
(HERE / "reference.json").write_text(json.dumps(ref, indent=1) + "\n")
print(json.dumps(ref, indent=1))
