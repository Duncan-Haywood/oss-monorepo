"""The noise-aware demosaic scored on real sensor noise: HDR+ bursts, the merge as the clean truth.

Every demosaic dB sweep before this one (``tools/near_clean_gate.py``, ``tools/noise_aware_estimated.py``) adds
drawn noise to a near-clean mosaic. ``tools/hdrplus_noise_truth.py`` found a truth that is the sensor's own
noise: on Google's HDR+ bursts the reference frame minus the burst merge (fitted to it per 32 x 32 cell) is the
reference's noise with the scene removed. This tool turns that into a demosaic test.

Per burst (the 57 that ``eval/hdrplus-noise-truth-2026-11-22.md`` scored; both DNGs to the white-balanced
plane as there):

1. ``fit`` (the merge carried to the reference by the cell fit) is the clean scene; ``res`` (reference minus
   fit) is the noise, at the same sensels. Cells whose fit failed are marked.
2. The truth image: ``fit`` binned ``BIN`` x ``BIN`` (4, as the drawn-noise sweeps bin LibRaw's truths), each
   colour the mean of that block's sensels of it. The merge's own remaining noise (a fraction ``m`` of the
   reference's) is averaged down by the bin (R and B over 4 sensels, G over 8).
3. The noisy mosaic, at the binned size and the file's CFA: the truth re-mosaicked, plus at each site the
   residual of a full-size sensel of the same colour in that block (the one at the same CFA offset: block
   (Y, X), site (Y % 2, X % 2), sensel (BIN Y + Y % 2, BIN X + X % 2)). Its variance is ``sigma^2 (1 - m)``
   at that sensel's level; it is scaled by ``sqrt(model(truth level) / model(sensel level)) / sqrt(1 - m)``
   with the burst's own per-colour truth model, so the noise is the reference's, at the truth's level. Its
   distribution, quantisation, hot sensels and spatial pattern are the sensor's, not drawn.
4. The whole binned frame is read and demosaicked, as the developer does a frame (a phone's 12 MP is about
   1000 x 750 here, too small for the drawn-noise sweeps' three 480 x 480 tiles). Sites past ``OUTLIER_Z``
   sigma of the truth model (a subject the merge rejected, a misalignment) and blocks whose cell fit failed are
   left out of the score with a ``MASK_GROW``-site margin; a burst with over ``DROP_MAX`` of its frame masked
   is skipped and counted.

Arms, all at the lift that ships on Bayer (``NEAR_DETAIL`` 12) and unlifted: ``D`` (directional), ``true`` (the
burst's truth model, ``noise_aware_planes.carries``' "mean" pooling), ``ship`` (``frame_noise`` as it ships,
``mpcw``), ``chen``, ``mpcws``, ``mpcw1`` (``frame_noise`` with that ``eig``), and ``profile``: the phone's
NoiseProfile as the developer uses it for a DNG that has one (per colour carried by the white balance,
``guard_profile`` per plane, then the one-gain carry: ``raw_develop_np._directional``).

Usage (from ``ventures/photo-editing``, numpy and rawpy installed)::

    PYTHONPATH=src python tools/hdrplus_demosaic_sweep.py --bursts IDS.txt --cache DIR > rows.jsonl
    python tools/hdrplus_demosaic_sweep.py --summary rows.jsonl

Results: ``eval/hdrplus-demosaic-sweep-2026-11-22.md``.
"""

from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))

import hdrplus_noise_truth as hn  # noqa: E402

BIN = 4
K = 12.0
OUTLIER_Z = 6.0
MASK_GROW = 4
DROP_MAX = 0.25
EIGS = ("chen", "mpcws", "mpcw1")


def full_fit(a: np.ndarray, b: np.ndarray):
    """(fit, residual, ok) on the full sensel grid, cropped to whole cells: ``hn.site_fit`` per CFA site."""

    sh = [(s // (2 * hn.CELL)) * 2 * hn.CELL for s in a.shape]
    a, b = a[: sh[0], : sh[1]], b[: sh[0], : sh[1]]
    fit = np.zeros(sh)
    res = np.zeros(sh)
    ok = np.zeros(sh, dtype=bool)
    for oy in (0, 1):
        for ox in (0, 1):
            f, r, o, _g, _G = hn.site_fit(a[oy::2, ox::2], b[oy::2, ox::2])
            fit[oy::2, ox::2] = hn.uncells(f)
            res[oy::2, ox::2] = hn.uncells(r)
            ok[oy::2, ox::2] = hn.uncells(np.repeat(o[..., None], hn.CELL * hn.CELL, axis=-1))
    return fit, res, ok


def binned_scene(fit, res, ok, pat, planes, m, k: int = BIN):
    """(truth (H, W, 3), noisy mosaic (H, W), bad block mask, z of each site's noise) at 1/k size."""

    from shootflow.xtrans_demosaic import colour_map

    H, W = fit.shape[0] // k, fit.shape[1] // k
    fit, res, ok = fit[: H * k, : W * k], res[: H * k, : W * k], ok[: H * k, : W * k]
    cm = colour_map(pat, H * k, W * k)
    truth = np.zeros((H, W, 3))
    for c in range(3):
        msk = (cm == c).astype(np.float64)
        num = (fit * msk).reshape(H, k, W, k).sum(axis=(1, 3))
        den = msk.reshape(H, k, W, k).sum(axis=(1, 3))
        truth[..., c] = num / den
    bad = ~ok.reshape(H, k, W, k).all(axis=(1, 3))
    small = colour_map(pat, H, W)
    Y, X = np.mgrid[0:H, 0:W]
    sy, sx = k * Y + Y % 2, k * X + X % 2
    # the full-size sensel at the same CFA offset has the same colour as the small grid's site
    assert (cm[sy, sx] == small).all(), "CFA offsets do not line up"
    clean = np.take_along_axis(truth, small[..., None].astype(np.int64), axis=2)[..., 0]
    p = np.asarray(planes, dtype=np.float64)

    def var(level, col):
        return np.maximum(p[col, 0] * level + p[col, 1], 1e-30)

    # The residual's variance is model(sensel level) x (1 - m) (``planes`` are already over 1 - m); scaled to
    # model(truth level), the reference's whole noise at the level the truth has there.
    v_want = var(clean, small)
    noise = res[sy, sx] * np.sqrt(v_want / (var(fit[sy, sx], small) * (1.0 - m)))
    z = noise / np.sqrt(v_want)
    return truth, clean + noise, bad, z


def profile_model(c, pat, prof_raw, mults):
    """The phone's NoiseProfile as ``raw_develop_np._directional`` uses it: carried per colour, guarded per
    plane, then the one-gain carry of the planes' mean pair."""

    from shootflow.xtrans_demosaic import as_planes, guard_profile

    g = np.asarray(mults, dtype=np.float64)
    raw = as_planes(prof_raw)
    per = np.stack([raw[:, 0] * g, raw[:, 1] * g * g], axis=1)
    used, _ = guard_profile(c, pat, per)
    raw = np.stack([used[:, 0] / g, used[:, 1] / (g * g)], axis=1)
    shot, read = raw.mean(axis=0)
    return float(shot) * float(np.mean(g)), float(read) * float(np.mean(g * g))


def arms(c, pat, models: dict) -> dict:
    from shootflow import xtrans_demosaic as xd
    from shootflow.bayer_demosaic import directional

    import xtrans_demosaic_check as chk

    ramp, luma = xd.RAMPS[2], xd.LUMA_RAMPS[2]
    b = chk.ours_bilinear(c, pat)
    d = directional(c, pat)
    out = {"D": d}
    for name, noise in models.items():
        q = xd.frame_measures(c, pat, b, d, noise=noise, blocks=True)["q_blocks"]
        out[name] = xd.blend(b, d, q, ramp[0], ramp[1], luma_ramp=luma)
        out[f"{name}+{K:g}"] = xd.blend(b, d, xd.lift_near_detail(q, K), ramp[0], ramp[1], luma_ramp=luma)
    return out


def score_burst(burst: str, a_path: Path, b_path: Path) -> list[dict]:
    from shootflow import raw_develop as rd
    from shootflow import xtrans_demosaic as xd
    a, pat, mults, _prof, raw = hn.plane(a_path)
    b, pat_b, _mb, _pb, raw_b = hn.plane(b_path)
    if a.shape != b.shape or pat != pat_b:
        return [{"burst": burst, "skip": f"shapes {a.shape} {b.shape} or CFA {pat} {pat_b} differ"}]
    if len(pat) != 4:
        return [{"burst": burst, "skip": f"CFA {pat} is not 2 x 2"}]
    B = hn.BORDER
    a, b = a[B:-B, B:-B], b[B:-B, B:-B]
    np_a, np_b = rd.noise_profile(raw.ifd, raw.ifd0), rd.noise_profile(raw_b.ifd, raw_b.ifd0)
    prof_raw = rd.noise_profile_planes(raw.ifd, raw.ifd0)
    if np_a is None or np_b is None or prof_raw is None:
        return [{"burst": burst, "skip": "no NoiseProfile on one of the two files"}]
    ta, tb = np.asarray(np_a, dtype=np.float64).reshape(-1, 2), np.asarray(np_b, dtype=np.float64).reshape(-1, 2)
    m = float(np.mean(tb[:, 0] / ta[:, 0]))
    planes, _bins = hn.truth_model(hn.residual_sites(a, b), pat, m)  # per colour, the reference's noise
    fit, res, ok = full_fit(a, b)
    truth, noisy, bad, z = binned_scene(fit, res, ok, pat, planes, m)
    true_model = tuple(float(v) for v in planes.mean(axis=0))
    # Whole frame, as the developer reads it: sites past OUTLIER_Z (a subject the merge rejected, a
    # misalignment) and blocks with a failed cell fit stay in the frame the reads and the blend see, but are
    # left out of the score with a MASK_GROW-site margin.
    drop = _grow(bad | (np.abs(z) > OUTLIER_Z), MASK_GROW)
    share = float(drop.mean())
    base = {"burst": burst, "model": hn._text(raw.ifd0.get(272)), "size": list(noisy.shape), "m": round(m, 4),
            "dropped_share": round(share, 5)}
    if share > DROP_MAX:
        return [{**base, "skip": f"{share:.3f} of the frame masked (over {DROP_MAX:g})"}]
    t0 = time.perf_counter()
    c = noisy
    models = {"true": true_model, "ship": xd.frame_noise(c, pat)}
    for e in EIGS:
        models[e] = xd.frame_noise(c, pat, eig=e)
    models["profile"] = profile_model(c, pat, prof_raw, mults)
    cps, lps = {}, {}
    for arm, arr in arms(c, pat, models).items():
        cps[arm], lps[arm] = masked_scores(arr, truth, ~drop)
    sig = lambda mo: round(float(max(mo[0] * 0.18 + mo[1], 0.0) ** 0.5), 6)  # noqa: E731
    return [{**base, "iso": (raw.exif or {}).get(34855, [None])[0], "true_sigma18": sig(true_model),
             "sigma18": {k: sig(v) for k, v in models.items()}, "level_p50": round(float(np.median(c)), 5),
             "level_p99": round(float(np.percentile(c, 99)), 5), "cpsnr": cps, "lpsnr": lps,
             "s": round(time.perf_counter() - t0, 1)}]


def _grow(mask: np.ndarray, r: int) -> np.ndarray:
    """``mask`` grown by ``r`` sites in each direction (a square), by running maxima along each axis."""

    out = mask.copy()
    for ax in (0, 1):
        acc = out.copy()
        for s in range(1, r + 1):
            acc |= np.roll(out, s, ax) | np.roll(out, -s, ax)
        out = acc
    return out


def masked_scores(test: np.ndarray, truth: np.ndarray, keep: np.ndarray) -> tuple[float, float]:
    """(colour PSNR, luma PSNR) as ``xtrans_demosaic_check.scores`` takes them (peak 1, its border cut), over the
    sites in ``keep`` only."""

    import xtrans_demosaic_check as chk

    sl = (slice(chk.BORDER, -chk.BORDER), slice(chk.BORDER, -chk.BORDER))
    t, r, k = test[sl], truth[sl], keep[sl]
    mse = float(np.mean(((t - r) ** 2)[k]))
    lum = lambda a: 0.2126 * a[..., 0] + 0.7152 * a[..., 1] + 0.0722 * a[..., 2]  # noqa: E731
    lmse = float(np.mean(((lum(t) - lum(r)) ** 2)[k]))
    return round(10 * np.log10(1.0 / max(mse, 1e-20)), 3), round(10 * np.log10(1.0 / max(lmse, 1e-20)), 3)


# ---- the committed questions (eval/hdrplus-demosaic-sweep-2026-11-22.md) ----

def _load(path: Path) -> list[dict]:
    return [r for r in (json.loads(x) for x in path.read_text().splitlines() if x.strip()) if "cpsnr" in r]


def _gain(rows, metric, arm, ref):
    key = "cpsnr" if metric == "c" else "lpsnr"
    return np.array([r[key][arm] - r[key][ref] for r in rows])


def _losers(rows, arm, ref="D", bar=0.1) -> set:
    return {i for i, r in enumerate(rows)
            if min(r["cpsnr"][arm] - r["cpsnr"][ref], r["lpsnr"][arm] - r["lpsnr"][ref]) < -bar}


def _thirds(rows) -> list[np.ndarray]:
    s = np.array([r["true_sigma18"] for r in rows])
    cut = np.quantile(s, [1 / 3, 2 / 3])
    return [np.where(s <= cut[0])[0], np.where((s > cut[0]) & (s <= cut[1]))[0], np.where(s > cut[1])[0]]


def summary(path: Path) -> int:
    allrows = [json.loads(x) for x in path.read_text().splitlines() if x.strip()]
    rows = [r for r in allrows if "cpsnr" in r]
    skips = [r for r in allrows if "skip" in r]
    print(f"{len(allrows)} rows: {len(rows)} bursts scored, {len(skips)} skipped")
    reasons: dict[str, int] = {}
    for r in skips:
        k = r["skip"].split(" ", 1)[1] if r["skip"][0].isdigit() else r["skip"]
        k = "failed cell fit" if "failed cell" in k else ("outliers" if "sigma" in k else k)
        reasons[k] = reasons.get(k, 0) + 1
    print("  skipped:", ", ".join(f"{k} {v}" for k, v in sorted(reasons.items())))
    if not rows:
        return 1
    k = f"+{K:g}"
    names = ["D", "true", "true" + k, "ship", "ship" + k] + [x for e in EIGS for x in (e, e + k)] + ["profile", "profile" + k]
    print("\n## every arm over D (mean dB), losers (> 0.1 dB to D on luma or colour), worst")
    print(f"  {'arm':12s} {'luma':>8s} {'colour':>8s} {'losers':>6s} {'worst':>7s}")
    for a in names[1:]:
        dl, dc = _gain(rows, "l", a, "D"), _gain(rows, "c", a, "D")
        print(f"  {a:12s} {dl.mean():+8.3f} {dc.mean():+8.3f} {len(_losers(rows, a)):6d} {np.minimum(dl, dc).min():+7.2f}")
    ship = "ship" + k
    th = _thirds(rows)
    print(f"\n## against {ship}, by thirds of the true sigma at 18% grey (low, mid, high noise)")
    for a in [x + k for x in ("true",) + EIGS + ("profile",)]:
        dl, dc = _gain(rows, "l", a, ship), _gain(rows, "c", a, ship)
        cells = "  ".join(f"{dl[ix].mean():+.3f}/{dc[ix].mean():+.3f}" for ix in th)
        worse = int(((dl < -0.1) | (dc < -0.1)).sum())
        print(f"  {a:12s} luma {dl.mean():+.4f} colour {dc.mean():+.4f}; thirds (luma/colour) {cells}; "
              f"rows > 0.1 dB under {ship}: {worse}")
    print("\n## sigma at 18% grey over the true model's (median [p10, p90])")
    for a in ("ship",) + EIGS + ("profile",):
        q = np.array([r["sigma18"][a] / r["true_sigma18"] for r in rows])
        print(f"  {a:8s} {np.median(q):.3f} [{np.percentile(q, 10):.3f}, {np.percentile(q, 90):.3f}]")

    # R1, the committed test of mpcws+12 against what ships
    cand = "mpcws" + k
    dl, dc = _gain(rows, "l", cand, ship), _gain(rows, "c", cand, ship)
    cell_min = min(min(dl[ix].mean(), dc[ix].mean()) for ix in th)
    new = _losers(rows, cand) - _losers(rows, ship)
    direct = int(((dl < -0.1) | (dc < -0.1)).sum())
    h = {
        f"h1 mean luma and colour over {ship} at least -0.005 dB ({dl.mean():+.4f}, {dc.mean():+.4f}), "
        f"every third at least -0.02 ({cell_min:+.4f})": dl.mean() >= -0.005 and dc.mean() >= -0.005 and cell_min >= -0.02,
        f"h2 no new loser to D ({len(new)} new; {len(_losers(rows, cand))} vs {len(_losers(rows, ship))})":
            not new and len(_losers(rows, cand)) <= len(_losers(rows, ship)),
        f"h3 mean luma gain over {ship} at least +0.02 dB ({dl.mean():+.4f})": dl.mean() >= 0.02,
        f"h4 no tile more than 0.1 dB under {ship} on luma or colour ({direct})": direct == 0,
    }
    print(f"\n## R1: {cand} against {ship}")
    for t, v in h.items():
        print(f"  {'PASS' if v else 'FAIL'}  {t}")
    print(f"  => {'all pass: mpcws becomes the Bayer default' if all(h.values()) else 'a hypothesis failed: defaults stay'}")
    return 0


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--bursts", type=Path)
    ap.add_argument("--cache", type=Path, default=Path("/tmp/hdrplus"))
    ap.add_argument("--keep", action="store_true")
    ap.add_argument("--summary", type=Path)
    args = ap.parse_args(argv)
    if args.summary:
        return summary(args.summary)
    for burst in [x.strip() for x in args.bursts.read_text().splitlines() if x.strip()]:
        try:
            a, b = hn.fetch(burst, args.cache)
            rows = score_burst(burst, a, b)
        except Exception as exc:  # noqa: BLE001
            rows = [{"burst": burst, "skip": f"{type(exc).__name__}: {exc}"}]
        for row in rows:
            print(json.dumps(row), flush=True)
        if not args.keep:
            for p in (args.cache / burst).glob("*.dng"):
                p.unlink()
    return 0


if __name__ == "__main__":
    sys.exit(main())
