"""Is a sweep truth's ``truth_sigma18`` its grain, or its texture? A reading from the raw instead.

``tools/near_clean_gate.py sweep`` records ``truth_sigma18``: ``frame_noise`` (the shipped noise read) on the clean
re-mosaicked truth, as sigma at 18% grey. But ``frame_noise`` is the estimator whose over-reads on texture the sweep
is trying to tell apart from noisy truths, so ``--clean-truths`` on that column can drop a row for the very reason
it loses (eval/near-clean-truth-noise-2026-11-19.md: on Nikon D780 foliage at ISO 100 it reads 6 to 12 times the
grain the raw holds). This tool reads the truth's grain without the binned scene's texture:

* ``raw_grain18`` (``raw_grain``): the raw's own noise model read at native resolution
  (``noise_pca.estimate_noise_pca`` on the tile's sensels, normalised to the black and white levels), taken at
  the raw level that the truth maps to 18% grey, times the measured transfer of white raw noise through the
  truth pipeline (``binned_truth``: LibRaw AHD, camera white balance, 4 x 4 binning, the 99.5th-percentile scale).
  The transfer is measured, not assumed: the raw is postprocessed twice, once with Gaussian noise of known sigma
  added to its sensels, and the green channel's difference is that noise as the truth sees it. Texture at native
  resolution can only raise the PCA reading, so this bounds the truth's grain from above; on the D780 and D600 it
  agrees with shot noise from the sensors' electron counts;
* ``iso``, ``exposure``: the file's EXIF (PIL; NEF, CR2, ARW and DNG are TIFF-based; ``None`` where PIL cannot);
* ``spread``: across one frame's tiles, max / min ``truth_sigma18``. One exposure has one grain, so a spread far
  above 1 is the scene, not the sensor.

Usage (from ``ventures/photo-editing``)::

    PYTHONPATH=src python tools/truth_noise_check.py --cache /tmp/truths FILES... > rows.jsonl
    python tools/truth_noise_check.py --png DIR ...     # also writes each tile as an 8-bit PNG (gamma 1/2.2)
"""

from __future__ import annotations

import argparse
import json
import sys

import numpy as np

TRANSFER_SIGMA = 0.004  # white noise added to the normalised raw to measure its transfer into the truth


def exif_of(path: str) -> dict:
    try:
        from PIL import Image

        ex = Image.open(path).getexif()
        sub = ex.get_ifd(0x8769)
        iso = sub.get(0x8827)
        iso = iso[0] if isinstance(iso, (tuple, list)) else iso
        exp = sub.get(0x829A)
        return {"iso": int(iso) if iso else None, "exposure": float(exp) if exp else None}
    except Exception:  # noqa: BLE001
        return {"iso": None, "exposure": None}


def _postprocess(raw) -> np.ndarray:
    import rawpy

    return raw.postprocess(
        demosaic_algorithm=rawpy.DemosaicAlgorithm(3), output_color=rawpy.ColorSpace.raw, gamma=(1, 1),
        no_auto_bright=True, output_bps=16, use_camera_wb=True, user_flip=0,
    ).astype(np.float64) / 65535.0


def _bin(rgb: np.ndarray, f: int = 4) -> np.ndarray:
    h, w = (rgb.shape[0] // f) * f, (rgb.shape[1] // f) * f
    return rgb[:h, :w].reshape(h // f, f, w // f, f, rgb.shape[2]).mean(axis=(1, 3))


def raw_grain(path: str, spots, size: int = 480, seed: int = 1) -> dict:
    """Per truth tile ``(ty, tx)`` in ``spots`` (``xtrans_frame_choice.tiles`` coordinates), the upper bound on
    the truth's grain as sigma at 18% grey (see the module docstring), plus the frame's transfer ``t`` (truth
    green units per unit of white noise on the normalised raw) and gain ``g`` (truth green over binned raw green).
    Bayer raws only (``raw_pattern`` 2 x 2); returns ``{}`` otherwise."""

    import rawpy

    from shootflow.noise_pca import estimate_noise_pca

    raw = rawpy.imread(path)
    pat2 = np.asarray(raw.raw_pattern)
    if pat2.shape != (2, 2):
        return {}
    col = np.where(pat2 == 3, 1, pat2)
    pat = tuple(int(x) for x in col.ravel())
    vis = raw.raw_image_visible
    orig = vis.copy()
    blk = float(np.mean(raw.black_level_per_channel))
    wl = float(raw.white_level)
    b0 = _bin(_postprocess(raw))
    norm = max(float(np.percentile(b0, 99.5)), 1e-6)
    truth = np.clip(b0 / norm * 0.8, 0.0, 0.95)
    rng = np.random.default_rng(seed)
    noisy = np.clip(orig.astype(np.float64) + rng.normal(size=orig.shape) * TRANSFER_SIGMA * (wl - blk), 0, wl)
    vis[:] = np.round(noisy).astype(orig.dtype)
    try:
        b1 = _bin(_postprocess(raw))
    finally:
        vis[:] = orig
    t = float(np.std(((b1 - b0) / norm * 0.8)[:, :, 1])) / TRANSFER_SIGMA
    added = (np.round(noisy) - orig.astype(np.float64)) / (wl - blk)  # the white noise as LibRaw saw it
    r = (orig.astype(np.float64) - blk) / (wl - blk)
    green = np.zeros(r.shape, dtype=bool)
    for i in range(2):
        for j in range(2):
            if col[i, j] == 1:
                green[i::2, j::2] = True
    hh, ww = (r.shape[0] // 4) * 4, (r.shape[1] // 4) * 4
    gb = np.nanmean(np.where(green, r, np.nan)[:hh, :ww].reshape(hh // 4, 4, ww // 4, 4), axis=(1, 3))
    h2, w2 = min(gb.shape[0], truth.shape[0]), min(gb.shape[1], truth.shape[1])
    x, y = gb[:h2, :w2].ravel(), truth[:h2, :w2, 1].ravel()
    m = (y > 0.02) & (y < 0.9) & np.isfinite(x)
    g = float(np.sum(x[m] * y[m]) / np.sum(x[m] * x[m]))
    level = 0.18 / g
    sites = [(i, j) for i in range(2) for j in range(2) if col[i, j] == 1]
    out, gg = {}, {}
    for ty, tx in spots:
        sub = r[ty * 4 : (ty + size) * 4, tx * 4 : (tx + size) * 4]  # tiles start on even rows/columns: same phase
        shot, read = estimate_noise_pca(sub, pat)
        out[(ty, tx)] = round(t * float(np.sqrt(max(shot * level + read, 0.0))), 6)
        noise = added[ty * 4 : (ty + size) * 4, tx * 4 : (tx + size) * 4]
        gg[(ty, tx)] = green_pair18(sub, noise, sites, level, t * TRANSFER_SIGMA)
    return {"t": round(t, 4), "g": round(g, 4), "tiles": out, "gg": gg}


def _site_bins(a: np.ndarray, sites) -> tuple[np.ndarray, np.ndarray]:
    """Each green site's sensels averaged over the truth's 4 x 4 blocks (2 x 2 of that site's plane)."""

    planes = []
    for i, j in sites:
        p = a[i::2, j::2]
        h, w = (p.shape[0] // 2) * 2, (p.shape[1] // 2) * 2
        planes.append(p[:h, :w].reshape(h // 2, 2, w // 2, 2).mean(axis=(1, 3)))
    h, w = min(planes[0].shape[0], planes[1].shape[0]), min(planes[0].shape[1], planes[1].shape[1])
    return planes[0][:h, :w], planes[1][:h, :w]


def green_pair18(sub: np.ndarray, noise: np.ndarray, sites, level: float, white_in_truth: float,
                 nbins: int = 16) -> float | None:
    """The truth's grain at 18% grey from the difference of the two green sites, each binned over the truth's
    4 x 4 blocks (eval/noise-pca-mpcws-noisy-truth-2026-11-22.md). The scene cancels to within the sites'
    one-sensel diagonal offset; noise correlated over a few sensels survives the binning as it does in the
    truth. Per brightness bin, (1.4826 x MAD)^2 of the difference about its median; variance = a x level + b
    fitted (weighted by count) and read at ``level`` (the raw level the truth maps to 18% grey). ``noise`` is
    the white noise added to measure the truth's transfer and ``white_in_truth`` that noise's sigma in the
    truth: their ratio to the same difference taken of ``noise`` puts the reading in truth units. ``None``
    without two green sites or too few usable bins."""

    if len(sites) != 2:
        return None
    a1, a2 = _site_bins(sub, sites)
    d, lv = (a1 - a2).ravel(), ((a1 + a2) / 2).ravel()
    n1, n2 = _site_bins(noise, sites)
    dn = float(np.std(n1 - n2))
    if dn <= 0:
        return None
    m = (lv > 0.002) & (lv < 0.9) & np.isfinite(d)
    if m.sum() < 400:
        return None
    d, lv = d[m], lv[m]
    edges = np.unique(np.quantile(lv, np.linspace(0, 1, nbins + 1)))
    xs, ys, ws = [], [], []
    for lo, hi in zip(edges[:-1], edges[1:]):
        k = (lv >= lo) & (lv <= hi)
        if k.sum() < 50:
            continue
        dk = d[k]
        xs.append(float(np.mean(lv[k])))
        ys.append((1.4826 * float(np.median(np.abs(dk - np.median(dk))))) ** 2)
        ws.append(float(k.sum()))
    if len(xs) < 2:
        return None
    x, y, w = np.array(xs), np.array(ys), np.array(ws)
    A = np.stack([x, np.ones_like(x)], axis=1) * np.sqrt(w)[:, None]
    (sa, sb), *_ = np.linalg.lstsq(A, y * np.sqrt(w), rcond=None)
    if sa < 0:  # no shot slope to read: the level-free spread
        sa, sb = 0.0, float(np.sum(w * y) / np.sum(w))
    v = max(sa * level + sb, 0.0)
    return round(white_in_truth / dn * float(np.sqrt(v)), 6)


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("files", nargs="+")
    ap.add_argument("--cache")
    ap.add_argument("--png", help="write each tile here as PNG")
    args = ap.parse_args(argv)

    sys.path.insert(0, __file__.rsplit("/", 1)[0])
    import xtrans_demosaic_check as chk
    from xtrans_frame_choice import _truth, tiles

    from shootflow.xtrans_demosaic import frame_noise

    pat = (0, 1, 1, 2)
    for path in args.files:
        name = path.rsplit("/", 1)[-1]
        ex = exif_of(path)
        cut = tiles(_truth(path, args.cache), 480, 3)
        rg = raw_grain(path, [s for s, _ in cut])
        rows = []
        for (ty, tx), truth in cut:
            ts, tr = frame_noise(chk.mosaic(truth, pat), pat)
            rows.append({"file": name, "tile": [ty, tx], **ex,
                         "truth_sigma18": round(float((ts * 0.18 + tr) ** 0.5), 6),
                         "raw_grain18": rg.get("tiles", {}).get((ty, tx)), "gg18": rg.get("gg", {}).get((ty, tx)),
                         "t": rg.get("t"), "g": rg.get("g")})
            if args.png:
                from PIL import Image

                img = (np.clip(truth / max(float(np.percentile(truth, 99.5)), 1e-6), 0, 1) ** (1 / 2.2) * 255).astype(np.uint8)
                Image.fromarray(img).save(f"{args.png}/{name}_{ty}_{tx}.png")
        ts = [r["truth_sigma18"] for r in rows if r["truth_sigma18"] > 0]
        spread = round(max(ts) / min(ts), 2) if ts else None
        for r in rows:
            r["spread"] = spread
            sys.stdout.write(json.dumps(r) + "\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
