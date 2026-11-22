"""Read noise from the optical-black (masked) sensels against the frame's own patch-PCA read term (2026-11-22).

``--noise-from-frame`` fits variance = shot * level + read through brightness bins of the picture area
(``shootflow.noise_pca.estimate_noise_pca``). The read term is the line's intercept, extrapolated to level 0
from bins that may all sit well above black, and ``fit_line`` clamps a negative one to 0. The masked sensels
at the sensor's edge see no light, so their spread is the read noise itself, independent of the scene.

For each raw (LibRaw through rawpy, so every format reads the same way): the per-colour robust sigma of the
masked margins, all four sides (a standard deviation clipped at 6 robust sigmas, after removing each line's mean so banding does not count; a per-colour mean
of the four), in units of white - black; the frame estimate on the normalised picture-area mosaic; and the
ratio sqrt(read_frame) / sigma_ob. Under 1: the frame line reads less read noise than the sensor has.

``--reader shootflow`` (2026-11-22, eval/optical-black-shootflow-readers-2026-11-22.md) reads the same rows
through shootflow's own parsers (``raw_develop.parse_raw``) instead: the full sensor as each reader keeps it, the
picture area from its ActiveArea (SensorInfo, IAD1, ``nef.masked_margins``...), its BlackLevel and WhiteLevel,
and the CFA phase relative to that area. Where LibRaw trims a masked edge by table, these readers often keep it.

Usage (from ``ventures/photo-editing``)::

    PYTHONPATH=src python tools/optical_black_floor.py [--reader shootflow] FILES... > rows.jsonl
    python tools/optical_black_floor.py --summary rows.jsonl
"""

from __future__ import annotations

import argparse
import json
import math
import sys

import numpy as np

SKIP = 4  # sensels skipped at each edge of a margin (readout ramps, the picture's own spill)
MIN_SAMPLES = 2000
QUIET_DN = 0.5  # under half a DN a margin is zeroed or digitally filled, not a sensor's read noise
# A masked line's median within 0.1% of white - black of the black level (at least 2 DN). The first run used 0.5%,
# which let dim picture lines in: the 70D's columns 72-84 sit 48-70 DN above black, an E30's crop border 13-17
# (eval/optical-black-shootflow-readers-2026-11-22.md); every masked line checked there sits within 4 DN.
BLACK_TOL = 0.001
BLACK_TOL_MIN_DN = 2.0


def black_tol(span: float, frac: float = BLACK_TOL) -> float:
    return max(frac * span, BLACK_TOL_MIN_DN)


def _depth_sigma(a: np.ndarray) -> np.ndarray:
    """Per depth line (column of ``a``), a robust sigma from same-colour differences with the next-but-one line.

    ``a`` is lines x depth. a[:, k] - a[:, k + 2] pairs same-colour sensels of one sensor line, so line banding
    (an offset shared across the depth) cancels; 1.4826 x MAD / sqrt(2) is the per-sensel spread. Each line
    takes the lower of its two neighbours' readings, so one lit neighbour does not condemn a masked line."""

    n = a.shape[1]
    out = np.full(n, np.inf)
    if n < 3:
        return out
    d = np.abs(a[:, 2:] - a[:, :-2])
    sig = 1.4826 * np.median(d, axis=0) / np.sqrt(2.0)
    # a MAD of integer differences can be 0 at sigma under 1 DN: use the RMS there
    rms = np.sqrt(np.mean(d * d, axis=0) / 2.0)
    sig = np.where(sig > 0, sig, rms)
    out[:-2] = sig
    out[2:] = np.minimum(out[2:], sig)
    return out


QUIET = 1.5  # a masked line reads within this factor of the file's quietest decile of candidate lines


def margin_sigma(raw: np.ndarray, colors: np.ndarray, top: int, left: int, h: int, w: int,
                 black: float | None = None, tol: float | None = None, quiet: float | None = None) -> dict | None:
    """Robust sigma (raw DN) of the masked margins, per CFA colour index, and how many sensels it used.

    ``raw`` is the full sensor, ``colors`` LibRaw's per-sensel colour index, (top, left, h, w) the visible
    area. Each of the four margins is used when it is at least 2 * SKIP + 8 sensels deep. Columns (rows) of a
    single value are padding, not masked sensels (a D800E ends in thirty columns of 1: README, "The edge
    columns that hold no picture"), and are dropped."""

    H, W = raw.shape
    strips = []
    if left >= 2 * SKIP + 8:
        strips.append(("v", slice(top + SKIP, top + h - SKIP), slice(SKIP, left - SKIP)))
    if W - (left + w) >= 2 * SKIP + 8:
        strips.append(("v", slice(top + SKIP, top + h - SKIP), slice(left + w + SKIP, W - SKIP)))
    if top >= 2 * SKIP + 8:
        strips.append(("h", slice(SKIP, top - SKIP), slice(left + SKIP, left + w - SKIP)))
    if H - (top + h) >= 2 * SKIP + 8:
        strips.append(("h", slice(top + h + SKIP, H - SKIP), slice(left + SKIP, left + w - SKIP)))
    if not strips:
        return None
    kept = []
    for orient, sy, sx in strips:
        a = raw[sy, sx].astype(np.float64)
        col = colors[sy, sx]
        if orient == "h":  # work on lines across the margin's depth: rows of a top/bottom strip are lines
            a, col = a.T, col.T
        live = np.ptp(a, axis=0) > 0  # a constant column is padding
        if black is not None and tol is not None:
            live &= np.abs(np.median(a, axis=0) - black) <= tol
        if live.any():
            kept.append((a, col, live, _depth_sigma(a)))
    if quiet is not None and kept:
        # A dim picture line within ``tol`` of black passes the median test (ORF, SRW and RW2 crops keep lit
        # border lines: eval/optical-black-shootflow-readers-2026-11-22.md). Masked sensels are the quietest
        # lines on the sensor, so keep only those within ``quiet`` x the file's quietest decile.
        allsig = np.concatenate([sg[lv] for _, _, lv, sg in kept])
        s0 = float(np.percentile(allsig, 10))
        kept = [(a, col, lv & (sg <= quiet * max(s0, 0.5)), sg) for a, col, lv, sg in kept]
    vals: dict[int, list[np.ndarray]] = {}
    for a, col, live, _ in kept:
        a, col = a[:, live], col[:, live]
        if a.size == 0:
            continue
        for c in np.unique(col):
            m = col == c
            # per-line mean removed per colour: line banding is pattern noise, not per-sensel read noise
            rows = np.where(m, a, np.nan)
            ok = m.sum(axis=1) >= 2
            d = rows[ok] - np.nanmean(rows[ok], axis=1, keepdims=True)
            # each line's mean costs one degree of freedom: scale its residuals by sqrt(n / (n - 1))
            n = m[ok].sum(axis=1, keepdims=True)
            d = (d * np.sqrt(n / (n - 1)))[m[ok]]
            vals.setdefault(int(c), []).append(d)
    out = {}
    for c, parts in vals.items():
        d = np.concatenate(parts)
        if d.size < MIN_SAMPLES:
            continue
        # a standard deviation, not a MAD: on integer sensels at 1-3 DN the MAD is quantised (sigma 2.0 reads
        # 1.48); hot and dead masked sensels are clipped at 6 robust sigmas (at least 6 DN) first
        s0 = max(1.4826 * float(np.median(np.abs(d))), 1.0)
        d = d[np.abs(d) < 6 * s0]
        out[c] = (float(np.sqrt(np.mean(d * d))), int(d.size))
    return out or None


def row_for(path: str, quiet: float | None = QUIET, tol_frac: float = BLACK_TOL) -> dict:
    import rawpy

    from shootflow.noise_pca import estimate_noise_pca

    name = path.rsplit("/", 1)[-1]
    with rawpy.imread(path) as r:
        if r.raw_pattern is None or r.raw_pattern.shape != (2, 2):
            return {"file": name, "skipped": "not a 2x2 Bayer mosaic"}
        s = r.sizes
        raw = np.array(r.raw_image, copy=True)
        colors = np.array(r.raw_colors, copy=True)
        black = float(np.mean(r.black_level_per_channel))
        white = float(r.white_level)
        top, left, h, w = s.top_margin, s.left_margin, s.height, s.width
        if black <= 0:
            return {"file": name, "skipped": "black level 0: masked sensels are clipped at 0, their spread understates read noise"}
        ob = margin_sigma(raw, colors, top, left, h, w, black=black, tol=black_tol(white - black, tol_frac), quiet=quiet)
        if ob is None:
            return {"file": name, "skipped": f"no masked margin (sensor {s.raw_width}x{s.raw_height}, picture {w}x{h} at {left},{top})"}
        vis = np.array(r.raw_image_visible, dtype=np.float64)
        pat = tuple(int(v) for v in r.raw_pattern.flatten())
    span = white - black
    # LibRaw colour indices: 0 R, 1 G, 2 B, 3 second G; the estimator takes 0/1/2
    pat = tuple(1 if v == 3 else v for v in pat)
    hh, ww = (vis.shape[0] // 2) * 2, (vis.shape[1] // 2) * 2
    c = (vis[:hh, :ww] - black) / span
    shot, read = estimate_noise_pca(c, pat)
    sig_ob = float(np.mean([v[0] for v in ob.values()])) / span
    frame_read = math.sqrt(max(read, 0.0))
    return {
        "file": name,
        "black": round(black, 2),
        "white": white,
        "ob_sensels": int(sum(v[1] for v in ob.values())),
        "sigma_ob_dn": round(sig_ob * span, 3),
        "sigma_ob": sig_ob,
        "shot": shot,
        "read": read,
        "sigma_read_frame": frame_read,
        "ratio": frame_read / sig_ob if sig_ob > 0 else None,
        # what the floor would change: sigma at 1% of white (deep shadow) under each model
        "sigma_1pct_frame": math.sqrt(max(shot * 0.01 + read, 0.0)),
        "sigma_1pct_floored": math.sqrt(max(shot * 0.01 + max(read, sig_ob ** 2), 0.0)),
    }


def _shootflow_sensor(path: str):
    """(raw, colors, black, white, (top, left, h, w), pattern, source) from shootflow's own reader, or a skip str.

    ``colors`` uses LibRaw's indices (0 R, 1 G, 2 B, 3 second G) so ``margin_sigma`` treats both greens apart;
    the DNG-style CFAPattern is relative to the ActiveArea's corner, so the phase is taken from there."""

    from shootflow import raw_develop as rd

    raw_img = rd.parse_raw(open(path, "rb").read())
    if raw_img.samples_per_pixel != 1:
        return "not a CFA mosaic (LinearRaw)"
    ifd = raw_img.ifd
    try:
        pat = rd._cfa_pattern(ifd)
    except rd.DevelopError as exc:
        return f"CFA: {exc}"
    if len(pat) != 4:
        return "not a 2x2 Bayer mosaic"
    H, W = raw_img.height, raw_img.width
    active = ifd.get(rd.TAG_ACTIVE_AREA)
    if active and len(active) == 4:
        top, left, bottom, right = (int(v) for v in active)
    else:
        top, left, bottom, right = 0, 0, H, W
    lin, black_tab, dh, dv, white, _, _ = rd._levels(raw_img, top, left, bottom - top, right - left, 3)
    black = float(np.mean([v[0] for row in black_tab for v in row]))
    if dh or dv:  # per-column/row black deltas: their mean belongs to the black level too
        black += (float(np.mean(dh)) if dh else 0.0) + (float(np.mean(dv)) if dv else 0.0)
    raw = np.frombuffer(raw_img.values, dtype=np.uint32 if raw_img.values.typecode == "I" else np.uint16)
    raw = raw.reshape(H, W)
    if lin:  # BlackLevel and WhiteLevel are in linearised units: put the sensels there too
        table = np.asarray(lin, dtype=np.float64)
        raw = table[np.minimum(raw, len(table) - 1)]
    # second green: the G on the blue row of a 2x2 pattern gets index 3, as LibRaw does
    lib = list(pat)
    for k in range(4):
        if pat[k] == 1 and 2 in pat[(k // 2) * 2 : (k // 2) * 2 + 2]:
            lib[k] = 3
    yy = (np.arange(H)[:, None] - top) % 2
    xx = (np.arange(W)[None, :] - left) % 2
    colors = np.array(lib)[yy * 2 + xx]
    area = (top, left, bottom - top, right - left)
    # Most of shootflow's maker readers keep the whole sensor as the ActiveArea and put the camera's picture in
    # DefaultCrop (origin relative to the ActiveArea): ORF, RW2, ARW, SRW, PEF. Outside that crop are masked
    # sensels and lit border lines alike; margin_sigma's black-level test keeps only the first.
    origin, size = ifd.get(rd.TAG_CROP_ORIGIN), ifd.get(rd.TAG_CROP_SIZE)
    crop = None
    if origin and size and len(origin) == 2 and len(size) == 2:
        cx, cy = (int(round(float(v))) for v in origin)
        cw, ch = (int(round(float(v))) for v in size)
        if 0 <= cx and 0 <= cy and cx + cw <= area[3] and cy + ch <= area[2] and (cw, ch) != (area[3], area[2]):
            crop = (top + cy, left + cx, ch, cw)
    return raw, colors, black, float(white[0]), area, crop, tuple(pat), raw_img.source, bool(lin)


def row_for_shootflow(path: str, quiet: float | None = QUIET, tol_frac: float = BLACK_TOL) -> dict:
    from shootflow.noise_pca import estimate_noise_pca

    name = path.rsplit("/", 1)[-1]
    got = _shootflow_sensor(path)
    if isinstance(got, str):
        return {"file": name, "skipped": got}
    raw, colors, black, white, active, crop, pat, source, lin = got
    # the picture is the camera's crop when the reader gives one, else the ActiveArea
    top, left, h, w = crop or active
    span = white - black
    if black <= 0:
        return {"file": name, "reader": source,
                "skipped": "black level 0: masked sensels are clipped at 0, their spread understates read noise"}
    ob = margin_sigma(raw, colors, top, left, h, w, black=black, tol=black_tol(span, tol_frac), quiet=quiet)
    if ob is None:
        return {"file": name, "reader": source,
                "skipped": f"no masked margin (sensor {raw.shape[1]}x{raw.shape[0]}, picture {w}x{h} at {left},{top})"}
    hh, ww = (h // 2) * 2, (w // 2) * 2
    c = (raw[top : top + hh, left : left + ww].astype(np.float64) - black) / span
    # pat is relative to the ActiveArea's corner; a crop starting on an odd line or column shifts its phase
    dy, dx = (top - active[0]) % 2, (left - active[1]) % 2
    pat_c = tuple(pat[((y + dy) % 2) * 2 + (x + dx) % 2] for y in range(2) for x in range(2))
    shot, read = estimate_noise_pca(c, pat_c)
    # what develop's frame read sees: the whole ActiveArea, crop margins included (phase kept: even offsets only)
    read_active = shot_active = None
    if crop is not None:
        at, al, ah, aw = active
        ca = (raw[at : at + (ah // 2) * 2, al : al + (aw // 2) * 2].astype(np.float64) - black) / span
        shot_active, read_active = estimate_noise_pca(ca, pat)
    sig_ob = float(np.mean([v[0] for v in ob.values()])) / span
    frame_read = math.sqrt(max(read, 0.0))
    margins = {"left": left, "top": top, "right": raw.shape[1] - left - w, "bottom": raw.shape[0] - top - h}
    return {
        "file": name,
        "reader": source,
        "margins": margins,
        "linearised": lin,
        "black": round(black, 2),
        "white": white,
        "ob_sensels": int(sum(v[1] for v in ob.values())),
        "sigma_ob_dn": round(sig_ob * span, 3),
        "sigma_ob": sig_ob,
        "shot": shot,
        "read": read,
        "sigma_read_frame": frame_read,
        "ratio": frame_read / sig_ob if sig_ob > 0 else None,
        "sigma_1pct_frame": math.sqrt(max(shot * 0.01 + read, 0.0)),
        "sigma_1pct_floored": math.sqrt(max(shot * 0.01 + max(read, sig_ob ** 2), 0.0)),
        "picture": "crop" if crop else "active",
        "shot_active": shot_active,
        "read_active": read_active,
    }


def summary(path: str) -> int:
    rows = [json.loads(line) for line in open(path) if line.strip()]
    for r in rows:
        if "sigma_ob_dn" in r and r["sigma_ob_dn"] < QUIET_DN:
            r["skipped"] = f"masked margin reads {r['sigma_ob_dn']:.2f} DN, too quiet to be read noise"
    skipped = [r for r in rows if "skipped" in r]
    ok = [r for r in rows if "skipped" not in r and r.get("ratio") is not None]
    print(f"{len(ok)} raws read, {len(skipped)} skipped")
    if not ok:
        return 0
    ratios = np.array([r["ratio"] for r in ok])
    zero = sum(1 for r in ok if r["read"] <= 0)
    print(f"frame read term clamped to 0: {zero} of {len(ok)}")
    print(f"sqrt(read_frame) / sigma_ob: median {np.median(ratios):.2f}, "
          f"under 0.5: {int((ratios < 0.5).sum())}, under 0.8: {int((ratios < 0.8).sum())}, "
          f"0.8-1.25: {int(((ratios >= 0.8) & (ratios <= 1.25)).sum())}, over 1.25: {int((ratios > 1.25).sum())}")
    lift = np.array([r["sigma_1pct_floored"] / r["sigma_1pct_frame"] if r["sigma_1pct_frame"] > 0 else np.inf
                     for r in ok])
    print(f"sigma at 1% of white, floored / frame: median {np.median(lift[np.isfinite(lift)]):.2f}, "
          f"raised over 10%: {int((lift > 1.1).sum())}")
    print()
    print("| file | OB sigma (DN) | OB sigma x1000 | frame read sigma x1000 | ratio | 1% sigma lift |")
    print("|---|---:|---:|---:|---:|---:|")
    for r, lf in sorted(zip(ok, lift), key=lambda t: t[0]["ratio"]):
        print(f"| {r['file']} | {r['sigma_ob_dn']:.2f} | {r['sigma_ob'] * 1000:.3f} | "
              f"{r['sigma_read_frame'] * 1000:.3f} | {r['ratio']:.2f} | {lf:.2f}x |")
    for r in skipped:
        print(f"skipped {r['file']}: {r['skipped']}")
    return 0


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("files", nargs="*")
    ap.add_argument("--summary", metavar="ROWS")
    ap.add_argument("--reader", choices=("libraw", "shootflow"), default="libraw",
                    help="libraw (rawpy, the first run) or shootflow's own parsers")
    ap.add_argument("--no-quiet", action="store_true",
                    help="skip the quiet-line test (the first run's reading, eval/optical-black-floor-2026-11-22.md)")
    ap.add_argument("--black-tol", type=float, default=BLACK_TOL,
                    help="masked-line median tolerance as a fraction of white - black (the first run: 0.005)")
    args = ap.parse_args(argv)
    if args.summary:
        return summary(args.summary)
    one = row_for_shootflow if args.reader == "shootflow" else row_for
    quiet = None if args.no_quiet else QUIET
    for p in args.files:
        try:
            rec = one(p, quiet=quiet, tol_frac=args.black_tol)
        except Exception as exc:  # noqa: BLE001
            rec = {"file": p.rsplit("/", 1)[-1], "skipped": f"{type(exc).__name__}: {exc}"}
        print(json.dumps(rec), flush=True)
    return 0


if __name__ == "__main__":
    sys.exit(main())
