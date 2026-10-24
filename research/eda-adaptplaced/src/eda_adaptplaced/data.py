"""Join the committed feature dataset (eda-surrogate's, Yosys generic cells) with the OpenROAD results in placed.jsonl."""
import json
import os

import numpy as np

from .models import matrix


def load(exp_dir):
    """Rows of dataset.jsonl that have a placed result without error, each with the placed numbers added; and the placed meta."""
    ds = [json.loads(l) for l in open(os.path.join(exp_dir, "dataset.jsonl")) if l.strip()]
    pl = [json.loads(l) for l in open(os.path.join(exp_dir, "placed.jsonl")) if l.strip()]
    meta = pl[0]["meta"]
    key = lambda r: (r["family"], json.dumps(r["params"], sort_keys=True))
    placed = {key(r): r for r in pl[1:] if "error" not in r}
    rows = []
    for r in ds:
        p = placed.get(key(r))
        if p is not None:
            rows.append({**r, "placed": p})
    return rows, meta


def features(rows):
    return matrix(rows)[0]


def target(rows, name):
    if name == "cells":
        return np.array([r["cells"] for r in rows], float)
    if name == "area":
        return np.array([r["placed"]["repaired_area"] for r in rows], float)
    if name == "period":
        return np.array([r["placed"]["placed_period_ns"] for r in rows], float)
    raise ValueError(name)
