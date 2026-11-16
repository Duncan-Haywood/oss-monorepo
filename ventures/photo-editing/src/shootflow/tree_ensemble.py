"""Gradient-boosted tree ensembles evaluated with numpy alone (no lightgbm at run time).

The boosted Bayer weight (``eval/bayer-boosted-weight-2026-11-16.md``) is 400 trees of up to 63 leaves.
A raw developer should not need lightgbm to apply it, so ``from_lightgbm_dump`` flattens a model's
``dump_model()`` JSON into five arrays (feature, threshold, left, right, value per node, every tree's
nodes in one table, leaves pointing at themselves) and ``predict`` walks all samples down one tree at a
time, a level per step, with array indexing. ``save``/``load`` keep the arrays in an ``.npz``.

Supported: numerical splits with ``decision_type`` ``<=`` and ``missing_type`` ``None`` (NaN is read as
0, LightGBM's own rule for that type) or ``NaN`` (NaN goes the ``default_left`` way); ``Zero`` missing
type and categorical splits raise, because nothing here produces them. Matches ``Booster.predict`` to
float32 rounding of the thresholds' comparison (thresholds are kept as float64, as LightGBM does).
"""

from __future__ import annotations

import json
from dataclasses import dataclass

import numpy as np


@dataclass(frozen=True)
class Ensemble:
    feature: np.ndarray  # int32, -1 at a leaf
    threshold: np.ndarray  # float64
    left: np.ndarray  # int32 (a leaf points at itself)
    right: np.ndarray  # int32
    value: np.ndarray  # float64, the leaf value (0 at a split)
    nan_left: np.ndarray  # bool: where NaN goes at a split
    roots: np.ndarray  # int32, one per tree
    depth: int  # the deepest tree's depth (levels to walk)
    n_features: int


def from_lightgbm_dump(dump: dict | str) -> Ensemble:
    """Flatten ``Booster.dump_model()`` (the dict, or its JSON text) into one node table."""

    if isinstance(dump, str):
        dump = json.loads(dump)
    if dump.get("num_class", 1) != 1:
        raise ValueError("only single-output regression ensembles are supported")
    feat, thr, lft, rgt, val, nanl, roots = [], [], [], [], [], [], []
    depth = 0

    def add(node: dict, d: int) -> int:
        nonlocal depth
        i = len(feat)
        feat.append(-1)
        thr.append(0.0)
        lft.append(i)
        rgt.append(i)
        val.append(0.0)
        nanl.append(False)
        if "leaf_value" in node and "split_feature" not in node:
            val[i] = float(node["leaf_value"])
            depth = max(depth, d)
            return i
        if node.get("decision_type", "<=") != "<=":
            raise ValueError(f"unsupported split {node.get('decision_type')!r} (categorical?)")
        missing = node.get("missing_type", "None")
        if missing not in ("None", "NaN"):
            raise ValueError(f"unsupported missing_type {missing!r}")
        feat[i] = int(node["split_feature"])
        thr[i] = float(node["threshold"])
        # missing_type None: LightGBM converts NaN to 0 before the comparison, so NaN goes where 0 goes.
        nanl[i] = bool(node.get("default_left", True)) if missing == "NaN" else (0.0 <= thr[i])
        lft[i] = add(node["left_child"], d + 1)
        rgt[i] = add(node["right_child"], d + 1)
        return i

    for t in dump["tree_info"]:
        roots.append(add(t["tree_structure"], 0))
    return Ensemble(
        feature=np.asarray(feat, np.int32), threshold=np.asarray(thr, np.float64),
        left=np.asarray(lft, np.int32), right=np.asarray(rgt, np.int32), value=np.asarray(val, np.float64),
        nan_left=np.asarray(nanl, bool), roots=np.asarray(roots, np.int32), depth=depth,
        n_features=int(dump.get("max_feature_idx", max(feat + [0]))) + 1,
    )


def predict(model: Ensemble, X: np.ndarray, chunk: int = 1 << 18) -> np.ndarray:
    """Sum of every tree's leaf value for each row of ``X`` (n, n_features)."""

    X = np.asarray(X)
    if X.ndim != 2 or X.shape[1] < model.n_features:
        raise ValueError(f"X must be (n, >= {model.n_features}), got {X.shape}")
    out = np.zeros(X.shape[0], np.float64)
    feat = np.maximum(model.feature, 0)  # leaves read column 0 and stay put either way
    for s in range(0, X.shape[0], chunk):
        x = X[s : s + chunk].astype(np.float64)
        rows = np.arange(x.shape[0])
        acc = np.zeros(x.shape[0], np.float64)
        for root in model.roots:
            node = np.full(x.shape[0], root, np.int32)
            for _ in range(model.depth):
                v = x[rows, feat[node]]
                go_left = np.where(np.isnan(v), model.nan_left[node], v <= model.threshold[node])
                node = np.where(go_left, model.left[node], model.right[node])
            acc += model.value[node]
        out[s : s + chunk] = acc
    return out


def save(model: Ensemble, path) -> None:
    np.savez_compressed(path, feature=model.feature, threshold=model.threshold, left=model.left,
                        right=model.right, value=model.value, nan_left=model.nan_left, roots=model.roots,
                        depth=np.int32(model.depth), n_features=np.int32(model.n_features))


def load(path) -> Ensemble:
    with np.load(path) as z:
        return Ensemble(feature=z["feature"], threshold=z["threshold"], left=z["left"], right=z["right"],
                        value=z["value"], nan_left=z["nan_left"], roots=z["roots"], depth=int(z["depth"]),
                        n_features=int(z["n_features"]))
