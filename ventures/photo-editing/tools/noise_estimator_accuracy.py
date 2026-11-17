"""How close in-frame noise estimators come to the true noise, tile by tile, with no demosaic.

Same scenes, tiles, split, SNRs and noise draws as ``tools/noise_aware_estimated.py``. For each row, the true
sigma at four levels (5%, 18%, 40% and 70% of white) under the model the blend is given, and each
estimator's sigma at the same levels. The blend is hurt by overstatement, so the upper tail of
estimate / true is what matters (a ratio over ~1.5 costs dB; under 1 only moves toward directional).

Estimators (each a (shot, read) model fitted over eight brightness bins, as ``_noise_model`` does):

- ``spreadP``: ``estimate_noise(pct=P)``: per 24 x 24 block, the median leave-one-out residual against
  same-colour neighbours (5 x 5); the P-th percentile of blocks per bin;
- ``haarP``: per same-colour subplane (every sensel of one CFA position in the period, 2 x 2 or 6 x 6), the
  finest Haar diagonal detail (a - b - c + d) / 2 of 2 x 2 subplane samples, whose sigma is the noise sigma
  whatever the level, so smooth gradients cancel to second order; per 24 x 24 block (on the full mosaic) the
  MAD of the details falling in it as sigma, and the P-th percentile of blocks per bin.

Usage (from ``ventures/photo-editing``)::

    PYTHONPATH=src python tools/noise_estimator_accuracy.py [--bayer | --raf X-E1.raf] --cache /tmp/truths FILES... > rows.jsonl
    python tools/noise_estimator_accuracy.py --summary rows.jsonl
    PYTHONPATH=src python tools/noise_estimator_accuracy.py --clean --cache /tmp/truths FILES... > grain.jsonl
    PYTHONPATH=src python tools/noise_estimator_accuracy.py --binning FILES... > binning.jsonl

``--clean``: each estimator's sigma at 18% grey (x 1000) on the clean reference tile (no noise added), Bayer
mosaic: what the scene's own finest detail reads as. ``--binning``: ``haar2`` on the whole reference binned 4 x 4
and 8 x 8; white noise halves from one to the other, texture does not.
"""

from __future__ import annotations

import argparse
import json
import sys

import numpy as np

LEVELS = (0.05, 0.18, 0.4, 0.7)
PCTS = (15, 5, 2)


def haar_blocks(c: np.ndarray, period: int, block: int = 24) -> tuple[np.ndarray, np.ndarray]:
    """Per block x block block of the mosaic: mean level and the MAD-sigma of the Haar diagonal details of
    every same-position subplane whose 2 x 2 group starts in the block."""

    h, w = c.shape
    hb, wb = h // block, w // block
    lvl = c[: hb * block, : wb * block].reshape(hb, block, wb, block).mean(axis=(1, 3))
    det_all, ys, xs = [], [], []
    for py in range(period):
        for px in range(period):
            s = c[py::period, px::period]
            n0, n1 = s.shape[0] // 2 * 2, s.shape[1] // 2 * 2
            s = s[:n0, :n1]
            d = (s[0::2, 0::2] - s[0::2, 1::2] - s[1::2, 0::2] + s[1::2, 1::2]) / 2.0
            yy = (np.arange(d.shape[0]) * 2 * period + py)[:, None] + np.zeros(d.shape[1], dtype=int)[None, :]
            xx = (np.arange(d.shape[1]) * 2 * period + px)[None, :] + np.zeros(d.shape[0], dtype=int)[:, None]
            det_all.append(d.ravel())
            ys.append(yy.ravel())
            xs.append(xx.ravel())
    d, y, x = np.concatenate(det_all), np.concatenate(ys), np.concatenate(xs)
    by, bx = y // block, x // block
    ok = (by < hb) & (bx < wb)
    d, by, bx = d[ok], by[ok], bx[ok]
    idx = by * wb + bx
    order = np.argsort(idx, kind="stable")
    idx, d = idx[order], np.abs(d[order])
    cuts = np.searchsorted(idx, np.arange(hb * wb + 1))
    sig = np.array([np.median(d[cuts[i] : cuts[i + 1]]) if cuts[i + 1] > cuts[i] else np.nan for i in range(hb * wb)])
    return lvl, (sig * 1.4826).reshape(hb, wb)


def two_scale_blocks(c: np.ndarray, period: int, block: int = 48) -> tuple[np.ndarray, np.ndarray]:
    """Per block x block block: mean level and a noise sigma that cancels self-similar texture. On each
    same-position subplane, s1^2 is the mean square of the finest Haar diagonal details and s2^2 that of the
    next scale's (details of the 2 x 2 subplane means). White noise of sigma n gives n^2 and n^2 / 4; texture
    whose diagonal energy is the same at both scales adds equally to both, so n^2 = (s1^2 - s2^2) / 0.75."""

    h, w = c.shape
    hb, wb = h // block, w // block
    c = c[: hb * block, : wb * block]
    lvl = c.reshape(hb, block, wb, block).mean(axis=(1, 3))
    q = block // period  # subplane samples per block side
    q4 = q // 4 * 4
    e1 = np.zeros((hb, wb))
    e2 = np.zeros((hb, wb))
    for py in range(period):
        for px in range(period):
            s = c[py::period, px::period].reshape(hb, q, wb, q)[:, :q4, :, :q4]
            d1 = (s[:, 0::2, :, 0::2] - s[:, 0::2, :, 1::2] - s[:, 1::2, :, 0::2] + s[:, 1::2, :, 1::2]) / 2.0
            m = (s[:, 0::2, :, 0::2] + s[:, 0::2, :, 1::2] + s[:, 1::2, :, 0::2] + s[:, 1::2, :, 1::2]) / 4.0
            d2 = (m[:, 0::2, :, 0::2] - m[:, 0::2, :, 1::2] - m[:, 1::2, :, 0::2] + m[:, 1::2, :, 1::2]) / 2.0
            e1 += (d1**2).mean(axis=(1, 3))
            e2 += (d2**2).mean(axis=(1, 3))
    n2 = np.clip(e1 - e2, 0.0, None) / (0.75 * period * period)
    return lvl, np.sqrt(n2)


def models(c, pat) -> dict:
    from shootflow.xtrans_demosaic import _noise_model, estimate_noise

    out = {f"spread{p}": estimate_noise(c, pat, pct=p) for p in PCTS}
    lvl, sig = haar_blocks(c, 6 if len(pat) == 36 else 2)
    ok = np.isfinite(sig)
    for p in PCTS:
        out[f"haar{p}"] = _noise_model(np.clip(lvl[ok], 0, None), sig[ok], pct=p)
    lvl, sig = two_scale_blocks(c, 6 if len(pat) == 36 else 2)
    for p in (50, 15):
        out[f"two{p}"] = _noise_model(np.clip(lvl, 0, None).ravel(), sig.ravel(), pct=p)
    from shootflow.noise_pca import estimate_noise_pca

    out["pca4"] = estimate_noise_pca(c, pat, d=4, mosaic=False)
    out["pca5"] = estimate_noise_pca(c, pat, d=5, mosaic=False)
    for d in (4, 6, 8):
        out[f"m{d}"] = estimate_noise_pca(c, pat, d=d, mosaic=True)
    return out


def sweep(args) -> int:
    import rawpy

    sys.path.insert(0, __file__.rsplit("/", 1)[0])
    import xtrans_demosaic_check as chk
    from noise_aware_estimated import seed_of
    from noise_aware_planes import carries, draw, gains_of
    from xtrans_frame_choice import _truth, split_of, tiles

    pat = (0, 1, 1, 2) if args.bayer else chk._pattern(rawpy.imread(args.raf))
    for path in args.files:
        name = path.rsplit("/", 1)[-1]
        try:
            truth_full = _truth(path, args.cache)
            gains = gains_of(path)
        except Exception as exc:  # noqa: BLE001
            print(json.dumps({"file": name, "skipped": f"{type(exc).__name__}: {exc}"}), flush=True)
            continue
        for (ty, tx), truth in tiles(truth_full, args.tile, args.crops):
            clean = chk.mosaic(truth, pat)
            for snr in (200.0, 60.0, 25.0, 12.0):
                for sc in ("equal", "wb"):
                    seed = seed_of(name, ty, tx, snr, sc)
                    if sc == "equal":
                        c = chk.add_noise(clean, snr, seed=seed)
                        sig2 = (0.18 / snr) ** 2
                        model = (0.8 * sig2 / 0.18, 0.2 * sig2)
                    else:
                        c, raw_model = draw(clean, pat, gains, snr, ((1.0, 1.0),) * 3, seed)
                        model, _ = carries(raw_model, gains)
                    sig = lambda m: [float(np.sqrt(max(m[0] * x + m[1], 0.0))) for x in LEVELS]  # noqa: E731
                    rec = {"layout": "bayer" if args.bayer else "xtrans", "file": name, "split": split_of(name),
                           "tile": [ty, tx], "snr": snr, "scenario": sc, "true": sig(model)}
                    for k, m in models(c, pat).items():
                        rec[k] = sig(m)
                    print(json.dumps(rec), flush=True)
    return 0


def clean(args) -> int:
    sys.path.insert(0, __file__.rsplit("/", 1)[0])
    import xtrans_demosaic_check as chk
    from xtrans_frame_choice import _truth, split_of, tiles

    pat = (0, 1, 1, 2)
    for path in args.files:
        name = path.rsplit("/", 1)[-1]
        try:
            t = _truth(path, args.cache)
        except Exception:  # noqa: BLE001
            continue
        for (ty, tx), truth in tiles(t, args.tile, args.crops):
            m = models(chk.mosaic(truth, pat), pat)
            rec = {"file": name, "split": split_of(name), "tile": [ty, tx]}
            rec.update({k: round(float(np.sqrt(max(v[0] * 0.18 + v[1], 0.0))) * 1000, 3) for k, v in m.items()})
            print(json.dumps(rec), flush=True)
    return 0


def binning(args) -> int:
    sys.path.insert(0, __file__.rsplit("/", 1)[0])
    import xtrans_demosaic_check as chk

    pat = (0, 1, 1, 2)
    for path in args.files:
        try:
            t4, t8 = chk.binned_truth(path, 4), chk.binned_truth(path, 8)
        except Exception:  # noqa: BLE001
            continue

        def sig(t):
            m = models(chk.mosaic(t[: t.shape[0] // 48 * 48, : t.shape[1] // 48 * 48], pat), pat)["haar2"]
            return float(np.sqrt(max(m[0] * 0.18 + m[1], 0.0)))

        s4, s8 = sig(t4), sig(t8)
        print(json.dumps({"file": path.rsplit("/", 1)[-1], "s4": s4, "s8": s8, "ratio": round(s8 / s4, 3)}), flush=True)
    return 0


def summary(paths) -> int:
    rows = [json.loads(line) for p in paths for line in open(p) if line.strip()]
    rows = [r for r in rows if "true" in r]
    keys = [k for k in rows[0] if k.startswith(("spread", "haar", "two", "pca", "m"))]
    for layout in sorted({r["layout"] for r in rows}):
        for split in ("tune", "held"):
            rs = [r for r in rows if r["layout"] == layout and r["split"] == split]
            print(f"## {layout} {split}: {len(rs)} rows; estimate / true sigma at 18% grey (median, p90, p99, max)")
            for k in keys:
                q = np.array([r[k][1] / r["true"][1] for r in rs])
                print(f"  {k:9s} {np.median(q):6.2f} {np.percentile(q, 90):6.2f} {np.percentile(q, 99):7.2f} {q.max():7.2f}")
                for snr in (200.0, 60.0, 25.0, 12.0):
                    qs = np.array([r[k][1] / r["true"][1] for r in rs if r["snr"] == snr])
                    print(f"      snr {snr:5g}: {np.median(qs):6.2f} {np.percentile(qs, 90):6.2f} {qs.max():7.2f}")
    return 0


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("files", nargs="*")
    ap.add_argument("--raf")
    ap.add_argument("--bayer", action="store_true")
    ap.add_argument("--tile", type=int, default=480)
    ap.add_argument("--crops", type=int, default=3)
    ap.add_argument("--cache")
    ap.add_argument("--summary", action="store_true")
    ap.add_argument("--clean", action="store_true")
    ap.add_argument("--binning", action="store_true")
    a = ap.parse_args()
    sys.exit(summary(a.files) if a.summary else clean(a) if a.clean else binning(a) if a.binning else sweep(a))
