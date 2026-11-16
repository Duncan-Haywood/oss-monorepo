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


def truth_samples(truth: np.ndarray, pat, per_frame: int, seed: int, snr: float | None = None) -> dict:
    """Sampled features and 1/8, 1/4 and 3/16 greens at red and blue sensels of ``truth``'s mosaic. With
    ``snr`` the mosaic gets Poisson-Gaussian noise first (``add_noise``, a seed of its own) while the target
    stays the clean truth's green, so the fit learns what weight a noisy mosaic should get."""

    from xtrans_demosaic_check import add_noise, mosaic

    from shootflow import bayer_demosaic as bd

    truth = np.asarray(truth, np.float32)
    c = mosaic(truth, pat).astype(np.float32)
    if snr:
        c = add_noise(c, snr, seed=10_000 + seed).astype(np.float32)
    g8 = bd.directional(c, pat, laplace=0.125, native=False)[..., 1]
    g4 = bd.directional(c, pat, laplace=0.25, native=False)[..., 1]
    g316 = bd.directional(c, pat, native=False)[..., 1]
    feats = bd.laplace_features(c, pat, extra=bd.CORRELATION_FEATURES)  # all of them; --extra picks
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


def frame_samples(path: str, per_frame: int, seed: int, snr: float | None = None) -> dict:
    from bayer_demosaic_check import _pattern_bayer, binned_truth

    import rawpy

    pat = _pattern_bayer(rawpy.imread(path))
    return truth_samples(binned_truth(path), pat, per_frame, seed, snr)


# --synthetic-kind matched: the share of near-grey tiles and their colour spread, chosen so the synthetic
# frames' channel correlation (corr3sq at red and blue sensels) matches the 40 real training frames'
# (eval/bayer-channel-correlation-2026-11-16.md).
MATCHED_GREY_SHARE = 0.3
MATCHED_GREY_SPREAD = 0.15

PATTERNS = ((0, 1, 1, 2), (2, 1, 1, 0), (1, 0, 2, 1), (1, 2, 0, 1))


def near_nyquist_texture(seed: int, n: int = 512, tile: int = 64, grey_share: float = 0.3,
                         grey_spread: float = 0.15) -> np.ndarray:
    """A synthetic training frame of fine, aliasing-prone detail, built to be unlike the test sheet
    (``synthetic_sheet``: one centred zone plate, discs, one slanted edge): a grid of ``tile``-pixel tiles,
    each a straight grating at a random angle and frequency (0.12 to 0.5 cycles per pixel, half of them
    above 0.3) between two random colours, a woven pair of crossed gratings, or random thin strokes
    and dots like small print. Values stay in 0.05..0.85."""

    rng = np.random.default_rng(seed)
    y, x = np.mgrid[0:tile, 0:tile].astype(np.float64)
    out = np.empty((n, n, 3))
    for ty in range(0, n, tile):
        for tx in range(0, n, tile):
            a, b = rng.uniform(0.05, 0.85, 3), rng.uniform(0.05, 0.85, 3)
            if rng.random() < grey_share:  # keep some colour pairs near grey, as most real fine detail is
                m = rng.uniform(0.1, 0.8)
                a, b = m + grey_spread * (a - a.mean()), np.full(3, rng.uniform(0.05, 0.85))
            kind = rng.integers(3)
            if kind < 2:
                f = rng.uniform(0.3, 0.5) if rng.random() < 0.5 else rng.uniform(0.12, 0.3)
                th = rng.uniform(0, np.pi)
                t = 0.5 + 0.5 * np.cos(2 * np.pi * f * (x * np.cos(th) + y * np.sin(th)) + rng.uniform(0, 2 * np.pi))
                if kind == 1:  # weave: a second grating at a near-right angle
                    f2, th2 = rng.uniform(0.12, 0.5), th + np.pi / 2 + rng.uniform(-0.3, 0.3)
                    t = 0.5 * t + 0.25 + 0.25 * np.cos(2 * np.pi * f2 * (x * np.cos(th2) + y * np.sin(th2)))
            else:
                t = np.zeros((tile, tile))
                for _ in range(rng.integers(8, 30)):
                    r0, c0 = rng.integers(0, tile, 2)
                    if rng.random() < 0.6:
                        L, wd = rng.integers(3, 20), rng.integers(1, 3)
                        if rng.random() < 0.5:
                            t[r0 : r0 + wd, c0 : c0 + L] = 1.0
                        else:
                            t[r0 : r0 + L, c0 : c0 + wd] = 1.0
                    else:
                        t[r0 : r0 + 2, c0 : c0 + 2] = 1.0
            out[ty : ty + tile, tx : tx + tile] = a + (b - a) * t[..., None]
    return np.clip(out, 0.05, 0.85)


def synthetic_samples(i: int, per_frame: int, snr: float | None = None, kind: str = "nyquist") -> dict:
    pat = PATTERNS[i % 4]
    if kind == "matched":
        tex = near_nyquist_texture(seed=500 + i, grey_share=MATCHED_GREY_SHARE, grey_spread=MATCHED_GREY_SPREAD)
    else:
        tex = near_nyquist_texture(seed=500 + i)
    return truth_samples(tex, pat, per_frame, seed=500 + i, snr=snr)


def design(X: np.ndarray, pairs: bool) -> np.ndarray:
    """Intercept, features, then (with ``pairs``) f_i f_j for i <= j: ``bayer_demosaic._laplace_learned``'s order."""

    cols = [np.ones(len(X), np.float64)] + [X[:, i].astype(np.float64) for i in range(X.shape[1])]
    if pairs:
        k = X.shape[1]
        cols += [X[:, i].astype(np.float64) * X[:, j] for i in range(k) for j in range(i, k)]
    return np.stack(cols, axis=1)


def normal_equations(f: dict, pairs: bool) -> tuple[np.ndarray, np.ndarray]:
    """One frame's weighted Z'WZ and Z'Ww*, each frame normalised to count once (times its ``weight``)."""

    D = 8.0 * (f["g4"].astype(np.float64) - f["g8"])
    ok = np.abs(D) > 1e-9
    Z = design(f["X"][ok], pairs)
    wstar = 0.125 - (f["g8"][ok] - f["gt"][ok]) / D[ok]
    # each frame counts equally (times its own weight: --synthetic-weight, --noise-weight)
    wt = float(f.get("weight", 1.0)) * D[ok] ** 2 / max(float(np.sum(D[ok] ** 2)), 1e-30)
    ZtW = Z.T * wt
    return ZtW @ Z, ZtW @ wstar


def solve(stats: list[tuple[np.ndarray, np.ndarray]], ridge: float) -> np.ndarray:
    assert stats, "no training frames"
    A = sum(s[0] for s in stats)
    B = sum(s[1] for s in stats)
    reg = ridge * np.eye(A.shape[0]) * np.trace(A) / A.shape[0]
    reg[0, 0] = 0.0
    return np.linalg.solve(A + reg, B)


def fit(frames: list[dict], pairs: bool, ridge: float) -> np.ndarray:
    return solve([normal_equations(f, pairs) for f in frames], ridge)


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


def _cached(cache: str | None, key: str, make) -> dict:
    cp = os.path.join(cache, key + ".npz") if cache else None
    if cp and os.path.exists(cp):
        return dict(np.load(cp))
    d = make()
    if cp:
        os.makedirs(cache, exist_ok=True)
        np.savez(cp, **d)
    return d


def select_features(d: dict, extra=()) -> dict:
    """Keep the eight base features and the named correlation features, in ``extra``'s order. A cache from
    before the correlation features (8 columns) serves only ``extra=()``."""

    from shootflow import bayer_demosaic as bd

    X = d["X"]
    if X.shape[1] == 8 and extra:
        raise SystemExit("this cache holds 8 features only: use a new --cache for --extra")
    cols = list(range(8)) + [8 + bd.CORRELATION_FEATURES.index(n) for n in extra]
    return {**d, "X": X[:, cols]}


def load(paths: list[str], cache: str | None, per_frame: int, snrs=(), synthetic: int = 0,
         synthetic_weight: float = 1.0, noise_weight: float = 1.0, extra=(), synthetic_kind: str = "nyquist") -> list[dict]:
    """Every training copy, each tagged with its ``group`` (the source frame) so cross-validation holds a
    frame out together with its noisy copies."""

    frames = []
    for i, path in enumerate(paths):
        name = os.path.basename(path)
        if any(t in name for t in TEST_FRAMES):
            raise SystemExit(f"{name} is a test frame (scored by earlier notes); it cannot train the model")
        for snr in (None, *snrs):
            key = name if snr is None else f"{name}.snr{snr:g}"
            d = select_features(_cached(cache, key, lambda: frame_samples(path, per_frame, seed=i, snr=snr)), extra)
            d.update(name=key, group=name, weight=1.0 if snr is None else noise_weight, synthetic=False)
            frames.append(d)
            print(f"loaded {key}: {len(d['gt'])} sensels", file=sys.stderr, flush=True)
    for i in range(synthetic):
        for snr in (None, *snrs):
            stem = "near-nyquist" if synthetic_kind == "nyquist" else f"near-nyquist-{synthetic_kind}"
            key = f"{stem}-{i}" + ("" if snr is None else f".snr{snr:g}")
            d = select_features(_cached(cache, key, lambda: synthetic_samples(i, per_frame, snr, synthetic_kind)), extra)
            d.update(name=key, group=f"near-nyquist-{i}", synthetic=True,
                     weight=synthetic_weight * (1.0 if snr is None else noise_weight))
            frames.append(d)
            print(f"loaded {key}: {len(d['gt'])} sensels", file=sys.stderr, flush=True)
    return frames


def cv_folds(frames: list[dict]):
    """(held-out indices, training indices) per real source frame: a real frame is held out with every one of
    its copies (noisy ones too), and synthetic frames are never held out, so they train every fold."""

    groups = list(dict.fromkeys(f["group"] for f in frames if not f["synthetic"]))
    for g in groups:
        held = [i for i, f in enumerate(frames) if f["group"] == g]
        yield held, [i for i, f in enumerate(frames) if f["group"] != g]


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--train", nargs="+", required=True)
    ap.add_argument("--cache")
    ap.add_argument("--per-frame", type=int, default=200_000)
    ap.add_argument("--pairs", action="store_true", help="add pairwise products of the features")
    ap.add_argument("--ridge", type=float, default=1e-3)
    ap.add_argument("--noise-snr", type=float, action="append", default=[],
                    help="also train on a noisy copy of every frame at this SNR (target: the clean green)")
    ap.add_argument("--noise-weight", type=float, default=1.0, help="weight of each noisy copy against its clean frame")
    ap.add_argument("--synthetic", type=int, default=0, help="add this many near-Nyquist synthetic frames")
    ap.add_argument("--synthetic-weight", type=float, default=1.0)
    ap.add_argument("--extra", action="append", default=[], choices=("corr3", "corr3sq", "corr5", "corr5sq"),
                    help="add this correlation feature (bayer_demosaic.CORRELATION_FEATURES) to the eight")
    ap.add_argument("--synthetic-kind", default="nyquist", choices=("nyquist", "matched"),
                    help="matched: tile colour pairs drawn so the channels' detail correlation matches real frames")
    ap.add_argument("--cv", action="store_true",
                    help="leave-one-frame-out green error (a real frame is held out with its noisy copies)")
    args = ap.parse_args(argv)
    frames = load(args.train, args.cache, args.per_frame, args.noise_snr, args.synthetic,
                  args.synthetic_weight, args.noise_weight, tuple(args.extra), args.synthetic_kind)
    if args.cv:
        stats = [normal_equations(f, args.pairs) for f in frames]
        for held, train in cv_folds(frames):
            coef = solve([stats[i] for i in train], args.ridge)
            for f in (frames[i] for i in held):
                print(json.dumps({"cv_frame": f["name"], "pairs": args.pairs, "ridge": args.ridge,
                                      "noise_snr": args.noise_snr, "synthetic": args.synthetic,
                                      "synthetic_weight": args.synthetic_weight, "extra": args.extra,
                                      **green_mse(f, coef, args.pairs)}), flush=True)
    coef = solve(stats, args.ridge) if args.cv else fit(frames, args.pairs, args.ridge)
    print(json.dumps({"fit": [round(float(v), 6) for v in coef], "pairs": args.pairs, "ridge": args.ridge,
                      "noise_snr": args.noise_snr, "synthetic": args.synthetic,
                      "synthetic_weight": args.synthetic_weight, "noise_weight": args.noise_weight,
                      "extra": args.extra, "synthetic_kind": args.synthetic_kind,
                      "frames": [f["name"] for f in frames]}))
    return 0


if __name__ == "__main__":
    sys.exit(main())
