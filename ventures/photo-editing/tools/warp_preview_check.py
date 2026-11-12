"""Does ShootFlow's WarpRectilinear give the camera's own geometry? Check against the DNG's embedded preview.

A camera that writes WarpRectilinear into OpcodeList3 renders its own preview
JPEG with that correction applied. This tool develops the DNG half size with the
opcode lists on and off, scales each render to the preview's size, and
block-matches patches of the preview against each: the offset (in preview
pixels) at which each patch matches best, against its distance from the frame
centre. If the warp is right, the offsets with it on stay near zero at every
radius; with it off they grow with the radius, the way the warp's own formula
says they should (printed alongside as "predicted").

    PYTHONPATH=src python3 tools/warp_preview_check.py "Leica T (Typ 701).dng" [--png out.png]

Needs numpy and Pillow. The DNG is read, not changed.
"""

from __future__ import annotations

import argparse
import io
import sys

import numpy as np
from PIL import Image

from shootflow import dng_opcodes as do
from shootflow import raw_develop as rd


def preview_jpeg(data: bytes) -> Image.Image | None:
    """The largest JPEG-compressed (6 or 7) non-raw IFD's image."""

    best = None
    for ifd in rd._all_ifds(rd._Reader(data)):
        comp = ifd.one(259, 1)
        if comp not in (6, 7) or ifd.one(262, 0) in (32803, 34892):
            continue
        offs = ifd.get(273) or ifd.get(513)
        lens = ifd.get(279) or ifd.get(514)
        if not offs or not lens:
            continue
        w = ifd.one(256, 0)
        if best is None or w > best[0]:
            best = (w, data[offs[0] : offs[0] + lens[0]])
    if best is None:
        return None
    return Image.open(io.BytesIO(best[1])).convert("L")


def render_gray(raw, opcodes: bool, size: tuple[int, int]) -> np.ndarray:
    w, h, px, _ = rd.develop(raw, rd.DevelopSettings(engine="numpy", half=True, opcodes=opcodes))
    rgb = (np.frombuffer(px.tobytes(), dtype=np.uint16).reshape(h, w, 3) >> 8).astype(np.uint8)
    return np.asarray(Image.fromarray(rgb, "RGB").convert("L").resize(size, Image.BOX), dtype=np.float64)


def _ncc(a: np.ndarray, b: np.ndarray) -> float:
    a = a - a.mean()
    b = b - b.mean()
    d = np.sqrt((a * a).sum() * (b * b).sum())
    return float((a * b).sum() / d) if d > 0 else -1.0


def match(ref: np.ndarray, img: np.ndarray, patch: int = 32, step: int = 24, search: int = 10, min_std: float = 6.0):
    """For each textured patch of ``ref``, the (dx, dy) shift of ``img`` that matches it best, to a tenth of a pixel."""

    h, w = ref.shape
    out = []
    for y in range(search + 1, h - patch - search - 1, step):
        for x in range(search + 1, w - patch - search - 1, step):
            p = ref[y : y + patch, x : x + patch]
            if p.std() < min_std:
                continue
            scores = np.full((2 * search + 1, 2 * search + 1), -1.0)
            for dy in range(-search, search + 1):
                for dx in range(-search, search + 1):
                    scores[dy + search, dx + search] = _ncc(p, img[y + dy : y + dy + patch, x + dx : x + dx + patch])
            iy, ix = np.unravel_index(np.argmax(scores), scores.shape)
            if scores[iy, ix] < 0.9 or iy in (0, 2 * search) or ix in (0, 2 * search):
                continue

            def sub(c, lo, hi):  # parabola through three scores
                den = lo - 2 * c + hi
                return 0.0 if den == 0 else 0.5 * (lo - hi) / den

            fx = ix - search + sub(scores[iy, ix], scores[iy, ix - 1], scores[iy, ix + 1])
            fy = iy - search + sub(scores[iy, ix], scores[iy - 1, ix], scores[iy + 1, ix])
            out.append((x + patch / 2, y + patch / 2, fx, fy, scores[iy, ix]))
    return out


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("dng")
    args = ap.parse_args(argv)
    with open(args.dng, "rb") as fh:
        data = fh.read()
    raw = rd.parse_raw(data)
    prev = preview_jpeg(data)
    if prev is None:
        print("no JPEG preview in this file")
        return 1
    plan = do.plan(raw.ifd, raw.ifd0)
    if not plan.warps:
        print("no WarpRectilinear in this file")
        return 1
    pw, ph = prev.size
    ref = np.asarray(prev, dtype=np.float64)
    print(f"preview {pw} x {ph}")
    rows = {}
    for on in (True, False):
        rows[on] = match(ref, render_gray(raw, on, (pw, ph)))
    # Predicted shift with the warp off: the opcode moves a pixel at radius r (green plane) to r * f(r), so the uncorrected
    # render shows the preview's feature at its source point. In preview pixels, centred on the preview.
    wp = plan.warps[0]
    kr0, kr1, kr2, kr3, _, _ = wp.plane_terms(1)
    cx, cy = wp.cx * pw, wp.cy * ph
    m = float(np.hypot(max(cx, pw - cx), max(cy, ph - cy)))
    print("radius band   n(on)  |shift| on (median, p90)   n(off)  |shift| off (median, p90)   predicted off (median)")
    for lo in np.arange(0.0, 1.0, 0.1):
        line = [f"{lo:.1f}-{lo + 0.1:.1f}"]
        for on in (True, False):
            sel = [r for r in rows[on] if lo <= np.hypot(r[0] - cx, r[1] - cy) / m < lo + 0.1]
            s = np.array([np.hypot(r[2], r[3]) for r in sel]) if sel else np.array([])
            line.append(f"{len(sel):5d}  {np.median(s):6.2f} {np.percentile(s, 90):6.2f}" if len(s) else f"{0:5d}       -      -")
        sel = [r for r in rows[False] if lo <= np.hypot(r[0] - cx, r[1] - cy) / m < lo + 0.1]
        if sel:
            pred = []
            for r in sel:
                rr = np.hypot(r[0] - cx, r[1] - cy) / m
                f = kr0 + rr * rr * (kr1 + rr * rr * (kr2 + rr * rr * kr3))
                pred.append(abs(1 - f) * rr * m)
            line.append(f"{np.median(pred):6.2f}")
        print("   ".join(line))
    # Radial fit: shift = a + b * radial unit vector component, i.e. the radial part of the shift as a fraction of radius.
    for on in (True, False):
        r = np.array(rows[on])
        if not len(r):
            continue
        ux, uy = r[:, 0] - cx, r[:, 1] - cy
        rad = (r[:, 2] * ux + r[:, 3] * uy) / np.maximum(np.hypot(ux, uy), 1e-9)
        tan = (-r[:, 2] * uy + r[:, 3] * ux) / np.maximum(np.hypot(ux, uy), 1e-9)
        print(
            f"warp {'on ' if on else 'off'}: {len(r)} patches, radial shift median {np.median(rad):+.2f} px, "
            f"mean |radial| {np.mean(np.abs(rad)):.2f}, mean |tangential| {np.mean(np.abs(tan)):.2f}, "
            f"mean NCC {np.mean(r[:, 4]):.4f}"
        )
    return 0


if __name__ == "__main__":
    sys.exit(main())
