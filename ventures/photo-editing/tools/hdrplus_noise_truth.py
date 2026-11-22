"""Score the in-frame noise reads against real sensor noise, using Google's HDR+ burst dataset.

Every other noise test in ``eval/`` adds synthetic noise to a near-clean mosaic. The HDR+ dataset
(Hasinoff et al. 2016, CC BY-SA 4.0, ``gs://hdrplusdata``, served at storage.googleapis.com) has, for each
burst, the raw reference frame the phone shot (``bursts/<id>/payload_N<ref>.dng``) and the burst merged onto
that frame's geometry (``results_20171023/<id>/merged.dng``). The merge is the same scene with a fraction of
the noise, so the reference minus the merge is mostly the reference frame's own noise, at its own levels,
with the scene removed. That gives a truth for the reads made from the reference frame alone.

Per burst (both DNGs run through the developer up to the white-balanced plane the noise-aware blend sees,
as ``tools/noise_profile_check.py`` does):

1. The merge carries lens-shading correction and its own exposure scale, the reference does not, so
   ``reference ~= g * merged + o`` is fitted per colour site in cells of ``CELL`` x ``CELL`` site sensels
   (two parameters per 1,024 samples), and the residual is ``reference - (g * merged + o)``.
2. Per colour, the residual's variance (cut at 4 sigma, iterated: ``clipped_var``) is taken in ``BINS`` brightness bins of the fitted
   clean level, and ``variance = shot * level + read`` fitted through them. Motion the merge rejected and
   alignment misses are sparse and land past the cut; in each bin only the half of the sensels where the merge
   is flattest (``GRAD_KEEP``) is used, since a sub-pixel misalignment leaves edges in the residual. The truth
   from every sensel is recorded too (``truth_all_over_low_grad``).
3. The merge still holds part of the reference's noise. For an average in which the reference is one of the
   frames, ``var(residual) = sigma^2 (1 - m)``, ``m`` the merge's remaining noise fraction, read from the
   two files' NoiseProfiles (the merge's over the reference's; 0.17 on a 7-frame burst). The truth is
   ``var(residual) / (1 - m)``. ``m`` scales every read's ratio by the same factor, so it cannot change
   which read is closer; with ``m = 0`` every ratio below rises by ``1 / sqrt(1 - m)``.
4. The pooled truth is the mean over R, G, B of the per-colour plane models (``noise_aware_planes.carries``,
   "mean"), the convention the synthetic sweeps' "true" column uses.

Then each read on the reference plane: ``noise_pca.estimate_noise_pca`` with every Bayer ``eig`` in
``READS`` (before ``FRAME_SCALE``), ``xtrans_demosaic.frame_noise`` as it ships (scale, guard), and the phone's
own NoiseProfile carried to the plane. Each as sigma at ``LEVELS`` (the plane's 50th and 90th percentile
levels and 18% grey) over the truth's.

Usage (from ``ventures/photo-editing``, numpy installed)::

    PYTHONPATH=src python tools/hdrplus_noise_truth.py --bursts IDS.txt --cache DIR > rows.jsonl
    PYTHONPATH=src python tools/hdrplus_noise_truth.py --summary rows.jsonl

``--cache`` holds the two DNGs of one burst at a time (downloaded, read, deleted unless ``--keep``).
Results: ``eval/hdrplus-noise-truth-2026-11-22.md``.
"""

from __future__ import annotations

import argparse
import json
import sys
import time
import urllib.request
from pathlib import Path

import numpy as np

from shootflow import raw_develop as rd
from shootflow import raw_develop_np as rnp
from shootflow import xtrans_demosaic as xd

BUCKET = "https://storage.googleapis.com/hdrplusdata/20171106_subset"
CELL = 32
BINS = 12
BORDER = 64
CLIP = 4.0
GRAD_KEEP = 0.5
TRUNC = 0.99887  # variance of a unit normal cut at +-4 sigma
READS = ("chen", "mpcw", "mpcws", "mpcw1")


class _Stop(Exception):
    pass


def plane(path: Path):
    """The white-balanced sensel plane the noise-aware blend sees, its CFA, multipliers and carried profile."""

    raw = rd.read_raw(path)
    seen: dict = {}

    def grab(norm, w, h, pat, mults, hi, demosaic="directional", noise=None, *_a, **_k):
        seen.update(norm=np.asarray(norm).reshape(h, w).copy(), pat=pat, mults=tuple(mults), noise=noise)
        raise _Stop

    orig = rnp._directional
    rnp._directional = grab
    try:
        rd.develop(raw, rd.DevelopSettings(demosaic="noise-aware", engine="numpy"))
    except _Stop:
        pass
    finally:
        rnp._directional = orig
    if not seen:
        raise RuntimeError("the developer did not reach the CFA demosaic")
    pat, mults = seen["pat"], np.asarray(seen["mults"], dtype=np.float64)
    h, w = seen["norm"].shape
    prof = None if seen["noise"] is None else xd.as_planes(seen["noise"])
    return seen["norm"] * mults[xd.colour_map(pat, h, w)], tuple(pat), mults, prof, raw


def _cells(x: np.ndarray, k: int) -> np.ndarray:
    H, W = (x.shape[0] // k) * k, (x.shape[1] // k) * k
    return x[:H, :W].reshape(H // k, k, W // k, k).transpose(0, 2, 1, 3).reshape(H // k, W // k, k * k)


def site_fit(sa: np.ndarray, sb: np.ndarray):
    """One CFA site's planes (reference ``sa``, merge ``sb``) fitted per ``CELL`` x ``CELL`` cell as
    ``sa ~= (g0 + gu u + gv v) sb + o``: (fit, residual, ok, g0, the merge's gradient), each per cell as
    (cells_y, cells_x, CELL * CELL) (``_cells``' layout; ``uncells`` puts one back on the site grid)."""

    grad = (np.abs(np.roll(sb, -1, 1) - np.roll(sb, 1, 1)) + np.abs(np.roll(sb, -1, 0) - np.roll(sb, 1, 0)))
    A = _cells(sa, CELL)
    B = _cells(sb, CELL)
    G = _cells(grad, CELL)
    n = CELL * CELL
    v, u = np.mgrid[0:CELL, 0:CELL].reshape(2, n) / CELL - 0.5
    # a = (g0 + gu u + gv v) b + o per cell: lens shading changes across a cell, and a constant gain
    # leaves that change times the scene's texture in the residual
    X = np.stack([B, B * u, B * v, np.ones_like(B)], axis=-1)  # (cells_y, cells_x, n, 4)
    XtX = np.einsum("ijnk,ijnl->ijkl", X, X)
    Xty = np.einsum("ijnk,ijn->ijk", X, A)
    ok = np.linalg.cond(XtX) < 1e12
    XtX[~ok] = np.eye(4)
    beta = np.linalg.solve(XtX, Xty[..., None])[..., 0]
    fit = np.einsum("ijnk,ijk->ijn", X, beta)
    ok &= beta[..., 0] > 0
    res = (A - fit) * np.sqrt(n / (n - 4))  # the four fitted parameters' share of the variance
    return fit, res, ok, beta[..., 0], G


def uncells(x: np.ndarray, k: int = CELL) -> np.ndarray:
    """``_cells``' inverse: (cells_y, cells_x, k * k) back to (cells_y * k, cells_x * k)."""

    cy, cx = x.shape[:2]
    return x.reshape(cy, cx, k, k).transpose(0, 2, 1, 3).reshape(cy * k, cx * k)


def residual_sites(a: np.ndarray, b: np.ndarray):
    """Per CFA site (oy, ox): (fitted clean level, residual, median gain, the merge's local gradient), from
    ``a ~= (g0 + gu u + gv v) b + o`` per cell (``u``, ``v`` the place in the cell). The gradient (same-site neighbours either side, both axes) is of the merge only,
    so selecting on it does not select on the reference's noise; where it is high, a sub-pixel misalignment of
    the merge leaves scene edges in the residual."""

    out = {}
    for oy in (0, 1):
        for ox in (0, 1):
            fit, res, ok, g, G = site_fit(a[oy::2, ox::2], b[oy::2, ox::2])
            out[(oy, ox)] = (fit[ok].ravel(), res[ok].ravel(), float(np.median(g[ok])), G[ok].ravel())
    return out


def clipped_var(r: np.ndarray, k: float = CLIP, iters: int = 10) -> float:
    """Variance after dropping values over ``k`` sigma from the mean, iterated. Not MAD: a 10-bit frame's dark
    bins hold noise of under 1 DN, where the median of a quantised residual jumps between steps."""

    keep = np.ones(r.size, dtype=bool)
    for _ in range(iters):
        mu, sd = float(r[keep].mean()), float(r[keep].std())
        new = np.abs(r - mu) <= k * sd
        if (new == keep).all():
            break
        keep = new
    return float(r[keep].var()) / TRUNC


def truth_model(sites, pat, m: float, keep: float = GRAD_KEEP) -> tuple[np.ndarray, dict]:
    """Per colour (R, G, B) plane (shot, read) of the reference's noise, and the per-bin readings. ``keep``: in
    each bin, only the sensels whose merge gradient is in the lowest ``keep`` fraction (1.0: all)."""

    by_col: dict[int, list] = {0: [], 1: [], 2: []}
    for (oy, ox), (lv, r, _g, gr) in sites.items():
        by_col[pat[oy * 2 + ox]].append((lv, r, gr))
    models, bins = np.zeros((3, 2)), {}
    for k, parts in by_col.items():
        lv = np.concatenate([p[0] for p in parts])
        r = np.concatenate([p[1] for p in parts])
        gr = np.concatenate([p[2] for p in parts])
        edges = np.quantile(lv, np.linspace(0.005, 0.995, BINS + 1))
        xs, ys, ns = [], [], []
        for i in range(BINS):
            s = (lv >= edges[i]) & (lv < edges[i + 1])
            if s.sum() < 2000:
                continue
            rs = r[s]
            if keep < 1.0:
                gs = gr[s]
                rs = rs[gs <= np.quantile(gs, keep)]
            v = clipped_var(rs)
            xs.append(float(np.mean(lv[s])))  # a bin's variance is shot x its mean level + read, not its median
            ys.append(v / (1.0 - m))
            ns.append(int(s.sum()))
        x, y = np.asarray(xs), np.asarray(ys)
        A = np.stack([x, np.ones_like(x)], axis=1)
        shot, read = np.linalg.lstsq(A, y, rcond=None)[0]
        models[k] = (float(shot), float(read))
        bins[k] = {"level": [round(v, 6) for v in xs], "var": [float(f"{v:.4e}") for v in ys], "n": ns,
                   "fit_rms": float(np.sqrt(np.mean((A @ [shot, read] - y) ** 2)) / max(float(np.mean(y)), 1e-30))}
    return models, bins


def sig(model, levels) -> list[float]:
    return [float(np.sqrt(max(model[0] * x + model[1], 0.0))) for x in levels]


def fetch(burst: str, cache: Path) -> tuple[Path, Path]:
    d = cache / burst
    d.mkdir(parents=True, exist_ok=True)

    def get(url, dest):
        if not dest.exists():
            with urllib.request.urlopen(url, timeout=120) as r:
                dest.write_bytes(r.read())
        return dest

    ref = get(f"{BUCKET}/results_20171023/{burst}/reference_frame.txt", d / "reference_frame.txt")
    n = int(ref.read_text().strip())
    a = get(f"{BUCKET}/bursts/{burst}/payload_N{n:03d}.dng", d / f"payload_N{n:03d}.dng")
    b = get(f"{BUCKET}/results_20171023/{burst}/merged.dng", d / "merged.dng")
    return a, b


def _text(v) -> str:
    if isinstance(v, (tuple, list, bytes)):
        v = bytes(int(x) & 0xFF for x in v).decode("latin-1")
    return str(v or "").strip("\0 ")


def score(burst: str, a_path: Path, b_path: Path) -> dict:
    from shootflow.noise_pca import estimate_noise_pca

    t0 = time.time()
    a, pat, mults, prof_a, raw = plane(a_path)
    b, pat_b, _mb, prof_b, raw_b = plane(b_path)
    if a.shape != b.shape or pat != pat_b:
        return {"burst": burst, "skip": f"shapes {a.shape} {b.shape} or CFA {pat} {pat_b} differ"}
    a = a[BORDER:-BORDER, BORDER:-BORDER]
    b = b[BORDER:-BORDER, BORDER:-BORDER]
    np_a = rd.noise_profile(raw.ifd, raw.ifd0)
    np_b = rd.noise_profile(raw_b.ifd, raw_b.ifd0)
    if np_a is None or np_b is None:
        return {"burst": burst, "skip": "no NoiseProfile on one of the two files"}
    ta, tb = np.asarray(np_a, dtype=np.float64).reshape(-1, 2), np.asarray(np_b, dtype=np.float64).reshape(-1, 2)
    m = float(np.mean(tb[:, 0] / ta[:, 0]))
    sites = residual_sites(a, b)
    truth_planes, bins = truth_model(sites, pat, m)
    truth = tuple(truth_planes.mean(axis=0))
    all_planes, _ = truth_model(sites, pat, m, keep=1.0)
    levels = [float(np.percentile(a, 50)), float(np.percentile(a, 90)), 0.18]
    t_sig = sig(truth, levels)
    exif = raw.exif or {}
    row = {"burst": burst, "model": _text(raw.ifd0.get(272)), "iso": (exif.get(34855) or [None])[0],
           "exposure_s": (exif.get(33434) or [None])[0], "m": round(m, 4), "levels": [round(v, 5) for v in levels],
           "gain_median": {f"{k[0]}{k[1]}": round(v[2], 4) for k, v in sites.items()},
           "truth": truth, "truth_planes": truth_planes.tolist(), "truth_sigma": t_sig, "truth_bins": bins,
           "truth_all_over_low_grad": [round(x / y, 4) for x, y in zip(sig(tuple(all_planes.mean(axis=0)), levels), t_sig)]}
    reads = {}
    for e in READS:
        reads[f"pca_{e}"] = estimate_noise_pca(a, pat, eig=e)
        reads[f"frame_{e}"] = xd.frame_noise(a, pat, eig=e)
    if prof_a is not None:
        reads["profile"] = tuple(prof_a.mean(axis=0))  # the phone's NoiseProfile carried to the plane
    row["reads"] = {k: [float(v[0]), float(v[1])] for k, v in reads.items()}
    row["ratio"] = {k: [round(s / t, 4) if t > 0 else None for s, t in zip(sig(v, levels), t_sig)]
                    for k, v in reads.items()}
    row["seconds"] = round(time.time() - t0, 1)
    return row


def summary(path: Path) -> int:
    rows = [json.loads(x) for x in path.read_text().splitlines() if x.strip()]
    ok = [r for r in rows if "ratio" in r]
    print(f"{len(rows)} bursts, {len(ok)} scored, {len(rows) - len(ok)} skipped")
    if not ok:
        return 1
    keys = list(ok[0]["ratio"])
    names = ("p50 level", "p90 level", "18% grey")
    for j, nm in enumerate(names):
        print(f"\n## read / truth sigma at the plane's {nm}: median [p10, p90], max; bursts over 1.3, over 1.0")
        for k in keys:
            q = np.array([r["ratio"][k][j] for r in ok if r["ratio"][k][j] is not None])
            print(f"  {k:12s} {np.median(q):.3f} [{np.percentile(q, 10):.3f}, {np.percentile(q, 90):.3f}], "
                  f"max {q.max():.3f}; >1.3: {int((q > 1.3).sum())}, >1.0: {int((q > 1.0).sum())} of {q.size}")
    print("\n## median |log(read / truth)| at the p50 level (closer to 0 is closer to the truth)")
    for k in keys:
        q = np.array([abs(np.log(r["ratio"][k][0])) for r in ok if r["ratio"][k][0]])
        print(f"  {k:12s} {np.median(q):.3f}")
    ms = np.array([r["m"] for r in ok])
    fr = np.array([max(b["fit_rms"] for b in r["truth_bins"].values()) for r in ok])
    print(f"\nm (merge's remaining noise fraction): median {np.median(ms):.3f} [{ms.min():.3f}, {ms.max():.3f}]")
    print(f"truth line fit, worst colour's relative RMS: median {np.median(fr):.3f}, max {fr.max():.3f}")
    return 0


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--bursts", type=Path, help="file of burst ids, one per line")
    ap.add_argument("--cache", type=Path, default=Path("/tmp/hdrplus"))
    ap.add_argument("--keep", action="store_true")
    ap.add_argument("--summary", type=Path)
    args = ap.parse_args(argv)
    if args.summary:
        return summary(args.summary)
    for burst in [x.strip() for x in args.bursts.read_text().splitlines() if x.strip()]:
        try:
            a, b = fetch(burst, args.cache)
            row = score(burst, a, b)
        except Exception as exc:  # noqa: BLE001
            row = {"burst": burst, "skip": f"{type(exc).__name__}: {exc}"}
        print(json.dumps(row), flush=True)
        if not args.keep:
            for p in (args.cache / burst).glob("*.dng"):
                p.unlink()
    return 0


if __name__ == "__main__":
    sys.exit(main())
