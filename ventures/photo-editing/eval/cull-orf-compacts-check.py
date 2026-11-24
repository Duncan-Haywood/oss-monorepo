"""Scores the cull page's developed ORF previews against LibRaw.

    python eval/cull-orf-compacts-check.py thumbs OUT            # decode OUT/*.thumb.jpg to RGBA
    node eval/cull-orf-compacts.mjs OUT FILE... > OUT/rows.jsonl
    python eval/cull-orf-compacts-check.py score OUT FILE...     # needs rawpy, numpy, Pillow

The reference is LibRaw 0.22's own half-size development of the same file
(rawpy: camera white balance, its built-in colour matrix for the body, linear
sRGB, no auto-brightening): an independent reader and an independent matrix,
neither of which the page uses. Both images are put on one exposure (the
page's lift divided out, then one scale on the median luminance of pixels
neither clips), and the colour difference is CIEDE2000 per pixel at the
page's size, on pixels with luminance between 2% and 90%. Also reported: the
same against the camera's own 160 px JPEG (the fit's target, so not an
independent check) and the matrices.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image


def srgb_decode(v):
    c = v / 255.0
    return np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)


def lab(rgb):
    m = np.array([[0.4124, 0.3576, 0.1805], [0.2126, 0.7152, 0.0722], [0.0193, 0.1192, 0.9505]])
    xyz = rgb @ m.T / np.array([0.95047, 1.0, 1.08883])
    f = np.where(xyz > 216 / 24389, np.cbrt(np.maximum(xyz, 0)), (24389 / 27 * xyz + 16) / 116)
    return np.stack([116 * f[..., 1] - 16, 500 * (f[..., 0] - f[..., 1]), 200 * (f[..., 1] - f[..., 2])], -1)


def de2000(a, b):
    L1, a1, b1 = a[..., 0], a[..., 1], a[..., 2]
    L2, a2, b2 = b[..., 0], b[..., 1], b[..., 2]
    C1, C2 = np.hypot(a1, b1), np.hypot(a2, b2)
    Cb = (C1 + C2) / 2
    G = 0.5 * (1 - np.sqrt(Cb**7 / (Cb**7 + 25**7)))
    a1p, a2p = (1 + G) * a1, (1 + G) * a2
    C1p, C2p = np.hypot(a1p, b1), np.hypot(a2p, b2)
    h1p, h2p = np.degrees(np.arctan2(b1, a1p)) % 360, np.degrees(np.arctan2(b2, a2p)) % 360
    dLp, dCp = L2 - L1, C2p - C1p
    dh = h2p - h1p
    dh = np.where(dh > 180, dh - 360, np.where(dh < -180, dh + 360, dh))
    dh = np.where(C1p * C2p == 0, 0, dh)
    dHp = 2 * np.sqrt(C1p * C2p) * np.sin(np.radians(dh / 2))
    Lbp, Cbp = (L1 + L2) / 2, (C1p + C2p) / 2
    hs = h1p + h2p
    hbp = np.where(np.abs(h1p - h2p) > 180, np.where(hs < 360, (hs + 360) / 2, (hs - 360) / 2), hs / 2)
    hbp = np.where(C1p * C2p == 0, hs, hbp)
    T = 1 - 0.17 * np.cos(np.radians(hbp - 30)) + 0.24 * np.cos(np.radians(2 * hbp)) + 0.32 * np.cos(np.radians(3 * hbp + 6)) - 0.20 * np.cos(np.radians(4 * hbp - 63))
    dth = 30 * np.exp(-(((hbp - 275) / 25) ** 2))
    RC = 2 * np.sqrt(Cbp**7 / (Cbp**7 + 25**7))
    SL = 1 + 0.015 * (Lbp - 50) ** 2 / np.sqrt(20 + (Lbp - 50) ** 2)
    SC, SH = 1 + 0.045 * Cbp, 1 + 0.015 * Cbp * T
    RT = -np.sin(np.radians(2 * dth)) * RC
    return np.sqrt((dLp / SL) ** 2 + (dCp / SC) ** 2 + (dHp / SH) ** 2 + RT * (dCp / SC) * (dHp / SH))


def lum(x):
    return x @ np.array([0.2126, 0.7152, 0.0722])


def compare(ours, ref):
    """Median and 90th-percentile CIEDE2000 after one exposure scale, plus mean chroma ratio."""
    lo, lr = lum(ours), lum(ref)
    ok = (lr > 0.02) & (lr < 0.9) & (ours.max(-1) < 0.98) & (ref.max(-1) < 0.98) & (lo > 0.005)
    if ok.sum() < 100:
        return None
    s = np.median(lr[ok]) / np.median(lo[ok])
    o = np.clip(ours * s, 0, None)
    la, lb = lab(o[ok]), lab(ref[ok])
    d = de2000(la, lb)
    ca, cb = np.hypot(la[:, 1], la[:, 2]), np.hypot(lb[:, 1], lb[:, 2])
    return {"median": round(float(np.median(d)), 2), "p90": round(float(np.percentile(d, 90)), 2), "chroma_ratio": round(float(np.median(ca) / max(1e-6, np.median(cb))), 3), "pixels": int(ok.sum())}


def thumbs(out: Path):
    for j in sorted(out.glob("*.thumb.jpg")):
        im = Image.open(j).convert("RGBA")
        stem = j.name[: -len(".thumb.jpg")]
        (out / f"{stem}.thumb.rgba").write_bytes(im.tobytes())
        (out / f"{stem}.thumb.json").write_text(json.dumps({"width": im.width, "height": im.height}))
        print(stem, im.size)


def score(out: Path, files):
    import rawpy

    rows = {json.loads(l)["file"]: json.loads(l) for l in (out / "rows.jsonl").read_text().splitlines() if l.strip()}
    print("| file | run | vs LibRaw median dE00 | p90 | chroma ratio | vs camera JPEG median dE00 | matrix |")
    print("|---|---|---|---|---|---|---|")
    for f in files:
        stem = Path(f).stem
        row = rows.get(stem)
        if not row or not row.get("mosaic"):
            continue
        with rawpy.imread(f) as raw:
            lib = raw.postprocess(half_size=True, use_camera_wb=True, output_color=rawpy.ColorSpace.sRGB, gamma=(1, 1), no_auto_bright=True, output_bps=16, user_flip=0)
        lib = lib.astype(np.float64) / 65535.0
        thumb = None
        tj = out / f"{stem}.thumb.json"
        if tj.exists():
            meta = json.loads(tj.read_text())
            thumb = srgb_decode(np.frombuffer((out / f"{stem}.thumb.rgba").read_bytes(), np.uint8).reshape(meta["height"], meta["width"], 4)[..., :3].astype(np.float64))
        for run in ("plain", "fit"):
            r = row.get(run)
            if not r:
                continue
            w, h = r["width"], r["height"]
            ours = srgb_decode(np.frombuffer((out / f"{stem}.{run}.rgba").read_bytes(), np.uint8).reshape(h, w, 4)[..., :3].astype(np.float64)) / r["gain"]
            lr = lib
            if lr.shape[:2] != (h, w):
                lr = np.stack([np.asarray(Image.fromarray(lib[..., k].astype(np.float32)).resize((w, h), Image.BOX)) for k in range(3)], -1)
            v = compare(ours, lr)
            vt = None
            if thumb is not None:
                small = np.stack([np.asarray(Image.fromarray(ours[..., k].astype(np.float32)).resize((thumb.shape[1], thumb.shape[0]), Image.BOX)) for k in range(3)], -1)
                vt = compare(small, thumb)
            M = "; ".join(" ".join(f"{x:.2f}" for x in row_) for row_ in r["M"])
            print(f"| {stem} | {run} | {v['median'] if v else '-'} | {v['p90'] if v else '-'} | {v['chroma_ratio'] if v else '-'} | {vt['median'] if vt else '-'} | {M} |")


if __name__ == "__main__":
    if sys.argv[1] == "thumbs":
        thumbs(Path(sys.argv[2]))
    else:
        score(Path(sys.argv[2]), sys.argv[3:])
