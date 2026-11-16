"""A gradient-boosted Laplacian weight for the Bayer demosaic, against the linear B on the same folds.

``eval/bayer-boosted-weight-2026-11-16.md`` (pre-registered there before any score). The linear weight B
(``bayer_demosaic.LEARNED_LAPLACE``) reaches +0.385 dB of green MSE over 3/16 leave-one-frame-out; the 4 x 4
tile oracle (``tools/bayer_oracle_ceiling.py``) bounds weights that are constant on 4 x 4 tiles at +0.833 dB.
This fits LightGBM on 29 features (the eight ``laplace_features``, the four correlation features, log|D|,
and the 5 x 5 mean and standard deviation of each base feature) to the trainer's D^2-weighted target w*,
and scores it five-fold by source frame against B's model refitted on the same folds.

Usage (from ``ventures/photo-editing``; needs rawpy and lightgbm)::

    PYTHONPATH=src:tools python tools/bayer_boosted_weight.py --train <40 files> --cache DIR \\
        --noise-snr 50 --noise-snr 25 --cv [--test <10 files>] > boosted.jsonl
"""

from __future__ import annotations

import argparse
import json
import os
import sys

import numpy as np

BORDER = 12  # tools/bayer_laplace_train.BORDER
WINDOW = 5
TRAIN_PER_COPY = 30_000
PARAMS = {
    "objective": "regression", "num_leaves": 63, "learning_rate": 0.05, "min_data_in_leaf": 400,
    "min_sum_hessian_in_leaf": 0.0, "feature_fraction": 0.8, "bagging_fraction": 0.8, "bagging_freq": 1,
    "seed": 0, "verbose": -1, "num_threads": 0,
}
ROUNDS = 400
BASE = 8
FEATURE_NAMES = (
    [f"f{i}" for i in range(BASE)] + ["corr3", "corr3sq", "corr5", "corr5sq", "logabsD"]
    + [f"f{i}_mean5" for i in range(BASE)] + [f"f{i}_std5" for i in range(BASE)]
)


def window_mean(a: np.ndarray, size: int = WINDOW) -> np.ndarray:
    """Mean over the centred ``size`` x ``size`` window, edges reflected."""

    r = size // 2
    p = np.pad(a.astype(np.float64), r, mode="reflect")
    s = np.zeros((p.shape[0] + 1, p.shape[1] + 1))
    s[1:, 1:] = p.cumsum(0).cumsum(1)
    h, w = a.shape
    tot = s[size : size + h, size : size + w] - s[:h, size : size + w] - s[size : size + h, :w] + s[:h, :w]
    return tot / (size * size)


def feature_stack(c: np.ndarray, pat, D: np.ndarray) -> np.ndarray:
    """(29, h, w) features of the mosaic ``c``; ``D = 8 (g4 - g8)`` is computed from the mosaic too."""

    from shootflow import bayer_demosaic as bd

    f = bd.laplace_features(c, pat, extra=bd.CORRELATION_FEATURES).astype(np.float64)
    base = f[:BASE]
    means = [window_mean(x) for x in base]
    stds = [np.sqrt(np.maximum(window_mean(x * x) - m * m, 0.0)) for x, m in zip(base, means)]
    out = [*f, np.log10(np.abs(D) + 1e-6), *means, *stds]
    return np.stack(out).astype(np.float32)


def copy_samples(truth: np.ndarray, pat, seed: int, snr: float | None, per_frame: int | None) -> dict:
    """The trainer's sensels for one copy (``bayer_laplace_train.truth_samples``: same noise seed, border,
    sampling seed and order) with the 29 features, the greens and B's weight. ``per_frame`` None or 0 keeps
    every red and blue sensel inside the border (the test frames)."""

    from xtrans_demosaic_check import add_noise, mosaic

    from shootflow import bayer_demosaic as bd

    truth = np.asarray(truth, np.float32)
    c = mosaic(truth, pat).astype(np.float32)
    if snr:
        c = add_noise(c, snr, seed=10_000 + seed).astype(np.float32)
    g8 = bd.directional(c, pat, laplace=0.125, native=False)[..., 1].astype(np.float64)
    g4 = bd.directional(c, pat, laplace=0.25, native=False)[..., 1].astype(np.float64)
    g316 = bd.directional(c, pat, native=False)[..., 1].astype(np.float64)
    D = 8.0 * (g4 - g8)
    feats = feature_stack(c, pat, D)
    wB = bd._laplace_learned(list(bd.laplace_features(c, pat)), bd.LEARNED_LAPLACE).astype(np.float64)
    h, w = c.shape
    cm = np.asarray(pat).reshape(2, 2)[np.arange(h)[:, None] % 2, np.arange(w)[None, :] % 2]
    sel = np.zeros((h, w), bool)
    sel[BORDER:-BORDER, BORDER:-BORDER] = True
    sel &= cm != 1
    idx = np.flatnonzero(sel)
    rng = np.random.default_rng(seed)
    if per_frame and idx.size > per_frame:
        idx = np.sort(rng.choice(idx, per_frame, replace=False))
    return {
        "X": feats.reshape(feats.shape[0], -1)[:, idx].T.copy(),
        "g8": g8.ravel()[idx], "g4": g4.ravel()[idx], "g316": g316.ravel()[idx],
        "gt": truth[..., 1].astype(np.float64).ravel()[idx], "wB": wB.ravel()[idx],
    }


def target(f: dict) -> tuple[np.ndarray, np.ndarray]:
    """(w*, weight) for the sensels where the weight moves the green; each copy's weights sum to one."""

    D = 8.0 * (f["g4"] - f["g8"])
    ok = np.abs(D) > 1e-9
    wstar = np.full_like(D, 0.1875)
    wstar[ok] = 0.125 - (f["g8"][ok] - f["gt"][ok]) / D[ok]
    wt = np.where(ok, D * D, 0.0)
    return wstar, wt / max(float(wt.sum()), 1e-30)


def gain(f: dict, w: np.ndarray) -> float:
    """Green-MSE gain over 3/16, dB, of the weight map ``w`` (clipped to [1/8, 1/4])."""

    D = 8.0 * (f["g4"] - f["g8"])
    w = np.clip(w, 0.125, 0.25)
    m = float(np.mean((f["g8"] + (w - 0.125) * D - f["gt"]) ** 2))
    m316 = float(np.mean((f["g316"] - f["gt"]) ** 2))
    return 10.0 * float(np.log10(m316 / m))


def train_rows(f: dict, seed: int, n: int = TRAIN_PER_COPY) -> np.ndarray:
    rng = np.random.default_rng(20_000 + seed)
    k = len(f["gt"])
    return np.sort(rng.choice(k, n, replace=False)) if k > n else np.arange(k)


def fit_boosted(copies: list[dict]):
    import lightgbm as lgb

    Xs, ys, ws = [], [], []
    for f in copies:
        rows = train_rows(f, f["index"])
        wstar, wt = target(f)
        Xs.append(f["X"][rows])
        ys.append(wstar[rows])
        ws.append(wt[rows] / max(float(wt[rows].sum()), 1e-30))  # each copy counts once
    data = lgb.Dataset(np.concatenate(Xs), np.concatenate(ys), weight=np.concatenate(ws),
                       feature_name=FEATURE_NAMES, free_raw_data=True)
    return lgb.train(PARAMS, data, num_boost_round=ROUNDS)


def fit_linear(copies: list[dict], ridge: float = 1e-5) -> np.ndarray:
    """B's model (``bayer_laplace_train``: eight features, pairwise, ridge) on these copies' sensels."""

    from bayer_laplace_train import design, solve

    stats = []
    for f in copies:
        wstar, wt = target(f)
        ok = wt > 0
        Z = design(f["X"][ok, :BASE], True)
        ZtW = Z.T * wt[ok]
        stats.append((ZtW @ Z, ZtW @ wstar[ok]))
    return solve(stats, ridge)


def predict_linear(coef: np.ndarray, f: dict) -> np.ndarray:
    from bayer_laplace_train import design

    return design(f["X"][:, :BASE], True) @ coef


def load_copies(paths, cache, snrs, per_frame, index_offset=0, kind="train"):
    from bayer_demosaic_check import _pattern_bayer, binned_truth

    import rawpy

    copies = []
    for i, path in enumerate(paths):
        name = os.path.basename(path)
        truth = pat = None
        for snr in (None, *snrs):
            key = name if snr is None else f"{name}.snr{snr:g}"
            cp = os.path.join(cache, f"{key}.boosted-{kind}.npz")
            if os.path.exists(cp):
                z = dict(np.load(cp))
            else:
                if truth is None:
                    truth, pat = binned_truth(path), _pattern_bayer(rawpy.imread(path))
                z = copy_samples(truth, pat, index_offset + i, snr, per_frame)
                os.makedirs(cache, exist_ok=True)
                np.savez(cp, **z)
            z.update(name=key, group=name, index=index_offset + i, fold=i % 5, snr=snr)
            copies.append(z)
            print(f"loaded {key}: {len(z['gt'])} sensels", file=sys.stderr, flush=True)
    return copies


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--train", nargs="+", required=True)
    ap.add_argument("--test", nargs="*", default=[])
    ap.add_argument("--cache", required=True)
    ap.add_argument("--per-frame", type=int, default=200_000)
    ap.add_argument("--noise-snr", type=float, action="append", default=[])
    ap.add_argument("--cv", action="store_true")
    args = ap.parse_args(argv)

    from bayer_laplace_train import TEST_FRAMES

    for p in args.train:
        if any(t in os.path.basename(p) for t in TEST_FRAMES):
            raise SystemExit(f"{p} is a test frame; it cannot train the model")
    copies = load_copies(args.train, args.cache, args.noise_snr, args.per_frame)
    if args.cv:
        for k in range(5):
            train = [f for f in copies if f["fold"] != k]
            held = [f for f in copies if f["fold"] == k]
            model, coef = fit_boosted(train), fit_linear(train)
            for f in held:
                print(json.dumps({
                    "cv_copy": f["name"], "fold": k, "snr": f["snr"],
                    "cv_gain_boosted": round(gain(f, model.predict(f["X"], num_threads=0)), 4),
                    "cv_gain_linear": round(gain(f, predict_linear(coef, f)), 4),
                    "gain_B_shipped": round(gain(f, f["wB"]), 4),
                }), flush=True)
            print(f"fold {k} done", file=sys.stderr, flush=True)
    if args.test:
        model = fit_boosted(copies)
        imp = dict(zip(FEATURE_NAMES, (float(v) for v in model.feature_importance("gain"))))
        print(json.dumps({"importance_gain": imp}), flush=True)
        del copies
        tests = load_copies(args.test, args.cache, args.noise_snr, None, index_offset=0, kind="test")
        for f in tests:
            print(json.dumps({
                "test_copy": f["name"], "snr": f["snr"], "sensels": int(len(f["gt"])),
                "test_gain_boosted": round(gain(f, model.predict(f["X"], num_threads=0)), 4),
                "test_gain_B": round(gain(f, f["wB"]), 4),
            }), flush=True)
    return 0


if __name__ == "__main__":
    sys.exit(main())
