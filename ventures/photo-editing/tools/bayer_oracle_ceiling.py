"""How much of the per-sensel oracle can a weight that is smooth in space reach?

``eval/bayer-oracle-ceiling-2026-11-16.md``. For the learned Laplacian weight of
``bayer_demosaic.directional(..., laplace="learned")``, the trainer (``tools/bayer_laplace_train.py``)
reports a per-sensel oracle: the best weight in [1/8, 1/4] at every red and blue sensel, knowing the truth.
This tool scores, on whole frames, the **tile oracle**: one weight per non-overlapping b x b tile, the
D^2-weighted least-squares weight of the tile's red and blue sensels, clipped to [1/8, 1/4]. The green error
at a sensel is ``D^2 (w - w*)^2`` (the trainer's linear model), so that weight is the exact best constant for
the tile, and the tile oracle bounds every model whose weight is constant on b x b tiles.

It also writes, per copy, the trainer's 200,000 sampled sensels (same seed, same border, same order) with a
centred b x b box-averaged target, so ``--cv`` can fit B's model to the smoothed target and score it
leave-one-frame-out against the per-sensel truth.

Usage (from ``ventures/photo-editing``)::

    PYTHONPATH=src:tools python tools/bayer_oracle_ceiling.py --train FILE [...] --cache DIR \\
        --noise-snr 50 --noise-snr 25 [--cv] > ceiling.jsonl
"""

from __future__ import annotations

import argparse
import json
import os
import sys

import numpy as np

TILES = (1, 2, 4, 8, 16, 32)
BOX = 4  # the smoothed target's box (sensels)
BORDER = 12  # tools/bayer_laplace_train.BORDER


def rb_mask(h: int, w: int, pat) -> np.ndarray:
    cm = np.asarray(pat).reshape(2, 2)[np.arange(h)[:, None] % 2, np.arange(w)[None, :] % 2]
    sel = np.zeros((h, w), bool)
    sel[BORDER:-BORDER, BORDER:-BORDER] = True
    return sel & (cm != 1)


def tile_weights(num: np.ndarray, den: np.ndarray, b: int) -> np.ndarray:
    """The clipped weight num/den summed over each b x b tile (anchored at the top left), spread back to
    every sensel of the tile. A tile with no weight (den 0) gets 3/16; it scores the same whatever it gets."""

    h, w = num.shape
    H, W = -(-h // b) * b, -(-w // b) * b
    n, d = np.zeros((H, W)), np.zeros((H, W))
    n[:h, :w], d[:h, :w] = num, den
    ns = n.reshape(H // b, b, W // b, b).sum(axis=(1, 3))
    ds = d.reshape(H // b, b, W // b, b).sum(axis=(1, 3))
    with np.errstate(divide="ignore", invalid="ignore"):
        t = np.where(ds > 0, ns / ds, 0.1875)
    t = np.clip(t, 0.125, 0.25)
    return np.repeat(np.repeat(t, b, axis=0), b, axis=1)[:h, :w]


def box_sum(a: np.ndarray, b: int) -> np.ndarray:
    """Sum over the b x b box at rows y - b//2 .. y - b//2 + b - 1 (and the same in columns), zero outside."""

    lo = b // 2
    p = np.pad(a, ((lo + 1, b - lo), (lo + 1, b - lo)))
    s = p.cumsum(0).cumsum(1)
    h, w = a.shape
    return s[b : b + h, b : b + w] - s[:h, b : b + w] - s[b : b + h, :w] + s[:h, :w]


def box_target(num: np.ndarray, den: np.ndarray, b: int) -> np.ndarray:
    ns, ds = box_sum(num, b), box_sum(den, b)
    with np.errstate(divide="ignore", invalid="ignore"):
        return np.where(ds > 0, ns / ds, 0.1875)


def copy_rows(truth: np.ndarray, pat, seed: int, snr: float | None, per_frame: int) -> tuple[dict, dict]:
    """(full-frame scores, trainer-identical samples with the smoothed target) for one copy."""

    from xtrans_demosaic_check import add_noise, mosaic

    from shootflow import bayer_demosaic as bd

    truth = np.asarray(truth, np.float32)
    c = mosaic(truth, pat).astype(np.float32)
    if snr:
        c = add_noise(c, snr, seed=10_000 + seed).astype(np.float32)
    g8 = bd.directional(c, pat, laplace=0.125, native=False)[..., 1].astype(np.float64)
    g4 = bd.directional(c, pat, laplace=0.25, native=False)[..., 1].astype(np.float64)
    g316 = bd.directional(c, pat, native=False)[..., 1].astype(np.float64)
    feats = bd.laplace_features(c, pat)  # the eight
    wB = bd._laplace_learned(list(feats), bd.LEARNED_LAPLACE).astype(np.float64)
    gt = truth[..., 1].astype(np.float64)
    h, w = c.shape
    sel = rb_mask(h, w, pat)
    D = 8.0 * (g4 - g8)
    e8 = g8 - gt
    # D^2 w* = D^2 / 8 - D (g8 - gt): no division, zero where the weight moves nothing
    num = np.where(sel, D * D / 8.0 - D * e8, 0.0)
    den = np.where(sel, D * D, 0.0)

    def mse(wmap):
        return float(np.mean((e8 + (wmap - 0.125) * D)[sel] ** 2))

    m316 = float(np.mean((g316 - gt)[sel] ** 2))
    scores = {"sensels": int(sel.sum()), "3/16": m316, "1/8": mse(np.full_like(D, 0.125)),
              "1/4": mse(np.full_like(D, 0.25)), "B": mse(wB)}
    for b in TILES:
        scores[f"tile{b}"] = mse(tile_weights(num, den, b))
    scores[f"box{BOX}_target_as_weight"] = mse(np.clip(box_target(num, den, BOX), 0.125, 0.25))

    # the trainer's sample (bayer_laplace_train.truth_samples: same rng, same selection, same order)
    idx = np.flatnonzero(sel)
    rng = np.random.default_rng(seed)
    if per_frame and idx.size > per_frame:
        idx = np.sort(rng.choice(idx, per_frame, replace=False))
    samples = {
        "X": feats.reshape(feats.shape[0], -1)[:, idx].T.astype(np.float32),
        "g8": g8.ravel()[idx], "g4": g4.ravel()[idx], "g316": g316.ravel()[idx], "gt": gt.ravel()[idx],
        "wbox": box_target(num, den, BOX).ravel()[idx],
        "dbox": box_sum(den, BOX).ravel()[idx],
    }
    return scores, samples


def db(ref: float, m: float) -> float:
    return 10.0 * float(np.log10(ref / m))


def normal_equations(f: dict, target: str, pairs: bool = True):
    from bayer_laplace_train import design

    D = 8.0 * (f["g4"].astype(np.float64) - f["g8"])
    ok = np.abs(D) > 1e-9
    Z = design(f["X"][ok], pairs)
    t = 0.125 - (f["g8"][ok] - f["gt"][ok]) / D[ok] if target == "sensel" else f["wbox"][ok]
    wt = f.get("weight", 1.0) * D[ok] ** 2 / max(float(np.sum(D[ok] ** 2)), 1e-30)
    ZtW = Z.T * wt
    return ZtW @ Z, ZtW @ t


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--train", nargs="+", required=True)
    ap.add_argument("--cache", required=True)
    ap.add_argument("--per-frame", type=int, default=200_000)
    ap.add_argument("--noise-snr", type=float, action="append", default=[])
    ap.add_argument("--ridge", type=float, default=1e-5)
    ap.add_argument("--cv", action="store_true", help="leave-one-frame-out: B's model on w* and on the box target")
    args = ap.parse_args(argv)

    from bayer_demosaic_check import _pattern_bayer, binned_truth
    from bayer_laplace_train import TEST_FRAMES, design, solve

    import rawpy

    copies = []
    for i, path in enumerate(args.train):
        name = os.path.basename(path)
        if any(t in name for t in TEST_FRAMES):
            raise SystemExit(f"{name} is a test frame; this note uses training frames only")
        truth = pat = None
        for snr in (None, *args.noise_snr):
            key = name if snr is None else f"{name}.snr{snr:g}"
            cp = os.path.join(args.cache, key + ".ceiling.npz")
            if os.path.exists(cp):
                z = dict(np.load(cp, allow_pickle=False))
                scores = json.loads(str(z.pop("scores")))
            else:
                if truth is None:
                    truth, pat = binned_truth(path), _pattern_bayer(rawpy.imread(path))
                scores, z = copy_rows(truth, pat, i, snr, args.per_frame)
                os.makedirs(args.cache, exist_ok=True)
                np.savez(cp, scores=json.dumps(scores), **z)
            row = {"copy": key, "group": name, "snr": snr, **scores}
            for k in ("1/8", "1/4", "B", *(f"tile{b}" for b in TILES), f"box{BOX}_target_as_weight"):
                row[f"gain_{k}"] = round(db(scores["3/16"], scores[k]), 4)
            print(json.dumps(row), flush=True)
            z.update(name=key, group=name, weight=1.0)
            copies.append(z)
    if args.cv:
        groups = list(dict.fromkeys(f["group"] for f in copies))
        stats = {t: [normal_equations(f, t) for f in copies] for t in ("sensel", "box")}
        for g in groups:
            held = [i for i, f in enumerate(copies) if f["group"] == g]
            train = [i for i, f in enumerate(copies) if f["group"] != g]
            coefs = {t: solve([stats[t][i] for i in train], args.ridge) for t in stats}
            for i in held:
                f = copies[i]
                D = 8.0 * (f["g4"].astype(np.float64) - f["g8"])
                gt = f["gt"].astype(np.float64)
                m316 = float(np.mean((f["g316"] - gt) ** 2))
                out = {"cv_copy": f["name"], "ridge": args.ridge}
                for t, coef in coefs.items():
                    wmap = np.clip(design(f["X"], True) @ coef, 0.125, 0.25)
                    out[f"cv_gain_{t}"] = round(db(m316, float(np.mean((f["g8"] + (wmap - 0.125) * D - gt) ** 2))), 4)
                print(json.dumps(out), flush=True)
    return 0


if __name__ == "__main__":
    sys.exit(main())
