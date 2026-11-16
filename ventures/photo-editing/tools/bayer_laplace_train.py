"""Fit the learned Laplacian weight of ``bayer_demosaic.directional(..., laplace="learned")``.

The open item of ``eval/bayer-adaptive-laplace-2026-11-16.md``: per red or blue sensel, a quarter or an
eighth of the sensel's own second difference gives the nearer green, and a per-sensel oracle has 17-49%
less green error than the better fixed weight, but no single local measure ranks the choice the same way
on every frame. This fits a linear model on several measures (``bayer_demosaic._laplace_features``)
across many frames.

**Target.** For each training truth (a raw frame rendered by LibRaw's AHD and binned 4 x 4, as in
``tools/bayer_demosaic_check.py``), the mosaic is demosaiced with weights 1/8 and 1/4. Over that range the
green at a red or blue sensel is close to linear in the weight w: ``g(w) = g8 + (w - 1/8) D`` with
``D = 8 (g4 - g8)``. The squared green error is then ``D^2 (w - w*)^2`` with ``w* = 1/8 - (g8 - truth) / D``,
so the model is fitted by least squares on w*, each sensel weighted by D^2 (a sensel where the weight
moves nothing counts for nothing), with a small ridge.

**Splits.** Training frames are chosen by ``--train``; the ten frames earlier notes scored (70D, D810,
A7 III, E-M10, K-1 II, A7 IV, D800E, 7D, GF7, NX1) are refused as training frames, so they stay a test set.
``--cv`` reports leave-one-frame-out green error on the training frames, which is how the feature set
(linear or with pairwise products) is chosen; the test frames are then scored once with
``tools/bayer_demosaic_check.py --variant laplace-learned``.

Usage (from ``ventures/photo-editing``)::

    PYTHONPATH=src:tools python tools/bayer_laplace_train.py --train FILE [...] --cache DIR --cv > fit.json
"""

from __future__ import annotations

import argparse
import json
import os
import sys

import numpy as np

TEST_FRAMES = (
    "Canon EOS 70D", "Nikon D810", "ILCE-7M3", "Olympus E-M10", "Pentax K-1 Mark II",
    "ILCE-7M4", "Nikon 800E", "Canon EOS 7D", "DMC-GF7", "Samsung NX1",
)
BORDER = 12


def frame_samples(path: str, per_frame: int, seed: int) -> dict:
    from bayer_demosaic_check import _pattern_bayer, binned_truth
    from xtrans_demosaic_check import mosaic

    import rawpy
    from shootflow import bayer_demosaic as bd

    pat = _pattern_bayer(rawpy.imread(path))
    truth = binned_truth(path).astype(np.float32)
    c = mosaic(truth, pat).astype(np.float32)
    g8 = bd.directional(c, pat, laplace=0.125, native=False)[..., 1]
    g4 = bd.directional(c, pat, laplace=0.25, native=False)[..., 1]
    g316 = bd.directional(c, pat, native=False)[..., 1]
    feats = bd.laplace_features(c, pat)
    h, w = c.shape
    cm = np.asarray(pat).reshape(2, 2)[np.arange(h)[:, None] % 2, np.arange(w)[None, :] % 2]
    sel = np.zeros((h, w), bool)
    sel[BORDER:-BORDER, BORDER:-BORDER] = True
    sel &= cm != 1
    idx = np.flatnonzero(sel)
    rng = np.random.default_rng(seed)
    if per_frame and idx.size > per_frame:
        idx = np.sort(rng.choice(idx, per_frame, replace=False))
    gt = truth[..., 1].ravel()[idx]
    return {
        "X": feats.reshape(feats.shape[0], -1)[:, idx].T.astype(np.float32),
        "g8": g8.ravel()[idx], "g4": g4.ravel()[idx], "g316": g316.ravel()[idx], "gt": gt,
    }


def design(X: np.ndarray, pairs: bool) -> np.ndarray:
    """Intercept, features, then (with ``pairs``) f_i f_j for i <= j: ``bayer_demosaic._laplace_learned``'s order."""

    cols = [np.ones(len(X), np.float64)] + [X[:, i].astype(np.float64) for i in range(X.shape[1])]
    if pairs:
        k = X.shape[1]
        cols += [X[:, i].astype(np.float64) * X[:, j] for i in range(k) for j in range(i, k)]
    return np.stack(cols, axis=1)


def fit(frames: list[dict], pairs: bool, ridge: float) -> np.ndarray:
    A: np.ndarray | None = None
    B: np.ndarray | None = None
    for f in frames:
        D = 8.0 * (f["g4"].astype(np.float64) - f["g8"])
        ok = np.abs(D) > 1e-9
        Z = design(f["X"][ok], pairs)
        wstar = 0.125 - (f["g8"][ok] - f["gt"][ok]) / D[ok]
        wt = D[ok] ** 2 / max(float(np.sum(D[ok] ** 2)), 1e-30)  # each frame counts equally
        ZtW = Z.T * wt
        a, b = ZtW @ Z, ZtW @ wstar
        A = a if A is None else A + a
        B = b if B is None else B + b
    assert A is not None and B is not None, "no training frames"
    reg = ridge * np.eye(A.shape[0]) * np.trace(A) / A.shape[0]
    reg[0, 0] = 0.0
    return np.linalg.solve(A + reg, B)


def green_mse(f: dict, coef: np.ndarray | None, pairs: bool) -> dict:
    D = 8.0 * (f["g4"].astype(np.float64) - f["g8"])
    gt = f["gt"].astype(np.float64)
    out = {
        "1/8": float(np.mean((f["g8"] - gt) ** 2)),
        "1/4": float(np.mean((f["g4"] - gt) ** 2)),
        "3/16": float(np.mean((f["g316"] - gt) ** 2)),
    }
    with np.errstate(divide="ignore", invalid="ignore"):
        wstar = np.where(np.abs(D) > 1e-9, 0.125 - (f["g8"] - gt) / D, 0.1875)
    out["oracle"] = float(np.mean((f["g8"] + (np.clip(wstar, 0.125, 0.25) - 0.125) * D - gt) ** 2))
    if coef is not None:
        w = np.clip(design(f["X"], pairs) @ coef, 0.125, 0.25)
        out["learned"] = float(np.mean((f["g8"] + (w - 0.125) * D - gt) ** 2))
        out["learned_mean_w"] = float(np.mean(w))
    return out


def load(paths: list[str], cache: str | None, per_frame: int) -> list[dict]:
    frames = []
    for i, path in enumerate(paths):
        name = os.path.basename(path)
        if any(t in name for t in TEST_FRAMES):
            raise SystemExit(f"{name} is a test frame (scored by earlier notes); it cannot train the model")
        cp = os.path.join(cache, name + ".npz") if cache else None
        if cp and os.path.exists(cp):
            d = dict(np.load(cp))
        else:
            d = frame_samples(path, per_frame, seed=i)
            if cp:
                os.makedirs(cache, exist_ok=True)
                np.savez(cp, **d)
        d["name"] = name
        frames.append(d)
        print(f"loaded {name}: {len(d['gt'])} sensels", file=sys.stderr, flush=True)
    return frames


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--train", nargs="+", required=True)
    ap.add_argument("--cache")
    ap.add_argument("--per-frame", type=int, default=200_000)
    ap.add_argument("--pairs", action="store_true", help="add pairwise products of the features")
    ap.add_argument("--ridge", type=float, default=1e-3)
    ap.add_argument("--cv", action="store_true", help="leave-one-frame-out green error")
    args = ap.parse_args(argv)
    frames = load(args.train, args.cache, args.per_frame)
    if args.cv:
        for i, f in enumerate(frames):
            coef = fit(frames[:i] + frames[i + 1 :], args.pairs, args.ridge)
            print(json.dumps({"cv_frame": f["name"], "pairs": args.pairs, "ridge": args.ridge,
                              **green_mse(f, coef, args.pairs)}), flush=True)
    coef = fit(frames, args.pairs, args.ridge)
    print(json.dumps({"fit": [round(float(v), 6) for v in coef], "pairs": args.pairs, "ridge": args.ridge,
                      "frames": [f["name"] for f in frames]}))
    return 0


if __name__ == "__main__":
    sys.exit(main())
