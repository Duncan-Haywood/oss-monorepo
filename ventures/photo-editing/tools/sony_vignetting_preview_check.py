"""What brightening does a Sony camera apply from its own vignetting table? Measured against its preview JPEG.

A Sony E-mount ARW carries the lens's vignetting table (raw IFD tag 0x7032) and, with the maker note's
"Vignetting Correction = Auto" (tag 0x2011), the camera should brighten its own JPEG with it. The ARW's
largest embedded JPEG (1616 x 1080 on the A5000 and A7 III, full size on the A7 IV) is such a render. So the gain the camera applied at each radius can be read off the file with no
evenly lit frame: the preview and the raw show the same scene at the same instant, and only the camera's tone
curve, its colour matrix and its vignetting gain stand between them.

Method (numpy only):

1. The raw is reduced to a half-size R, G, B image (one value per 2 x 2 Bayer cell, black subtracted, no white
   balance). The preview is decoded and its sRGB encoding undone.
2. Each preview pixel is mapped into the raw: a scale and a centre (and, when the maker note says the camera also
   corrected distortion, the file's own distortion table, ``sony_corrections``). The scale and centre are fitted by
   block matching (``warp_preview_check.match``) until the median patch offset is a fraction of a pixel.
3. In the central disk (radius under ``--centre`` of the corner distance) a monotone map from the raw value to
   the preview value is fitted per channel: the camera's tone curve and exposure, folded together.
4. In each radius band, the camera's gain relative to the centre is the median over pixels of
   ``map^-1(preview) / raw``, using only pixels whose values sit inside the range the central fit saw.
5. That measured gain is set against four readings of the table: the shipped formula
   ``2 ** (2 ** (v / 2**13 - 1) - 0.5)`` with the knots from centre (knot 0) to corner (knot n - 1); the same
   squared (darktable's first embedded-metadata version squares it, "use the square of the correction factor");
   and both with darktable's knot positions ``(i + 0.5) / (n - 1)``. darktable's current version (v2) does not
   square. darktable is GPL and was read for its behaviour only, no code copied.

Finding (eval/sony-vignetting-preview-2026-11-23.md): on the A7 III and A7 IV the embedded JPEG follows the
maker note's distortion setting but shows none of the table's luminance lift under any of the four readings, so
it cannot judge the formula.

A dynamic-range optimiser (maker note "Dynamic Range Optimizer" not Off) brightens shadows locally and so lifts
dark corners on its own; the tool prints the setting and flags such a frame as confounded.

    PYTHONPATH=src python3 tools/sony_vignetting_preview_check.py FILE.ARW [FILE.ARW ...] [--json out.jsonl]

The ARW is read, never changed. Needs numpy and Pillow.
"""

from __future__ import annotations

import argparse
import io
import json
import math
import struct
import sys
from pathlib import Path

import numpy as np
from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parent))
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from shootflow import raw_develop as rd  # noqa: E402
from shootflow import sony_corrections as sc  # noqa: E402
from warp_preview_check import match  # noqa: E402

# Sony maker-note tags (ExifTool's Sony table): the in-camera lens corrections and the DRO.
TAG_VIG_SETTING = 0x2011
TAG_DIST_SETTING = 0x2013
TAG_DRO = 0xB025
_CORRECTION = {0: "Off", 2: "Auto", 0xFFFFFFFF: "n/a"}  # ExifTool's Sony 0x2011-0x2013
_DRO = {0: "Off", 1: "Standard", 2: "Advanced Auto", 3: "Auto", 8: "Advanced Lv1", 9: "Advanced Lv2",
        10: "Advanced Lv3", 11: "Advanced Lv4", 12: "Advanced Lv5", 16: "Lv1", 17: "Lv2", 18: "Lv3", 19: "Lv4",
        20: "Lv5"}

HYPOTHESES = {
    "ship": (False, False),  # (squared, darktable knot positions)
    "squared": (True, False),
    "dt-knots": (False, True),
    "squared+dt-knots": (True, True),
}


# ---------------------------------------------------------------- reading the file


def maker_note_settings(data: bytes) -> dict:
    """The camera's vignetting, distortion and DRO settings from the Sony maker note (a plain IFD with no header
    on these bodies, offsets relative to the file)."""

    reader = rd._Reader(data)
    out = {}
    exif = None
    for ifd in rd._all_ifds(reader):
        off = ifd.get(34665)
        if off:
            exif = int(off[0])
            break
    if exif is None:
        return out
    try:
        note = None
        n = struct.unpack_from(reader.end + "H", data, exif)[0]
        for i in range(n):
            tag, typ, cnt, val = struct.unpack_from(reader.end + "HHII", data, exif + 2 + 12 * i)
            if tag == 0x927C:
                note = val
        if note is None:
            return out
        if data[note:note + 4] == b"SONY":
            note += 12
        n = struct.unpack_from(reader.end + "H", data, note)[0]
        for i in range(n):
            tag, typ, cnt, val = struct.unpack_from(reader.end + "HHII", data, note + 2 + 12 * i)
            if typ == 3 and cnt == 1:
                v = struct.unpack_from(reader.end + "H", data, note + 2 + 12 * i + 8)[0]
            elif typ == 4 and cnt == 1:
                v = val
            else:
                continue
            if tag == TAG_VIG_SETTING:
                out["vignetting"] = _CORRECTION.get(v, str(v))
            elif tag == TAG_DIST_SETTING:
                out["distortion"] = _CORRECTION.get(v, str(v))
            elif tag == TAG_DRO:
                out["dro"] = _DRO.get(v, str(v))
    except struct.error:
        pass
    return out


def preview_rgb(data: bytes) -> np.ndarray | None:
    """The largest JPEG-compressed, non-raw IFD image, as float RGB 0..1 (still sRGB encoded)."""

    best = None
    for ifd in rd._all_ifds(rd._Reader(data)):
        if ifd.one(259, 1) not in (6, 7) or ifd.one(262, 0) in (32803, 34892):
            continue
        offs = ifd.get(273) or ifd.get(513)
        lens = ifd.get(279) or ifd.get(514)
        if not offs or not lens:
            continue
        try:
            img = Image.open(io.BytesIO(data[offs[0]:offs[0] + lens[0]]))
            img.load()
        except Exception:  # noqa: BLE001 - a broken thumbnail is skipped
            continue
        if best is None or img.size[0] > best.size[0]:
            best = img
    if best is None:
        return None
    return np.asarray(best.convert("RGB"), dtype=np.float64) / 255.0


def srgb_to_linear(v: np.ndarray) -> np.ndarray:
    return np.where(v <= 0.04045, v / 12.92, ((v + 0.055) / 1.055) ** 2.4)


def half_rgb(raw: rd.RawImage) -> tuple[np.ndarray, float]:
    """(H/2, W/2, 3) camera R, G, B from an RGGB-family 2 x 2 mosaic, black subtracted; and the white level."""

    ifd = raw.ifd
    a = np.frombuffer(raw.values, dtype=np.uint16 if raw.values.typecode == "H" else np.uint32)
    a = a.reshape(raw.height, raw.width).astype(np.float64)
    black = ifd.get(0xC61A) or (0,)
    white = float((ifd.get(0xC61D) or (65535,))[0])
    a -= float(np.mean(black))
    pattern = tuple(ifd.get(33422) or (0, 1, 1, 2))
    h2, w2 = raw.height // 2, raw.width // 2
    a = a[: 2 * h2, : 2 * w2]
    planes = {0: [], 1: [], 2: []}
    for k, colour in enumerate(pattern[:4]):
        planes[int(colour)].append(a[k // 2::2, k % 2::2])
    out = np.stack([np.mean(planes[c], axis=0) for c in (0, 1, 2)], axis=-1)
    return out, white - float(np.mean(black))


# ---------------------------------------------------------------- geometry


class Mapping:
    """Preview pixel centre -> half-size raw coordinates: scale ``s`` about raw centre ``(cx, cy)``, through the
    distortion table when the camera applied it."""

    def __init__(self, s: float, cx: float, cy: float, corr: sc.SonyCorrections | None, r_knots: float):
        self.s, self.cx, self.cy, self.corr, self.r_knots = s, cx, cy, corr, r_knots

    def source(self, u: np.ndarray, v: np.ndarray, pw: int, ph: int):
        px = (u + 0.5 - pw / 2.0) * self.s
        py = (v + 0.5 - ph / 2.0) * self.s
        f = 1.0
        if self.corr is not None and self.corr.distortion:
            rho = np.hypot(px, py) / self.r_knots
            f = np.interp(np.clip(rho, 0, 1), np.linspace(0, 1, len(self.corr.distortion)),
                          np.asarray(self.corr.distortion, dtype=np.float64)) * sc.DISTORTION_SCALE + 1.0
        return self.cx + px * f, self.cy + py * f


def bilinear(img: np.ndarray, x: np.ndarray, y: np.ndarray) -> np.ndarray:
    h, w = img.shape[:2]
    x = np.clip(x - 0.5, 0, w - 1.001)
    y = np.clip(y - 0.5, 0, h - 1.001)
    x0 = np.floor(x).astype(int)
    y0 = np.floor(y).astype(int)
    fx = x - x0
    fy = y - y0
    if img.ndim == 3:
        fx = fx[..., None]
        fy = fy[..., None]
    return (img[y0, x0] * (1 - fx) * (1 - fy) + img[y0, x0 + 1] * fx * (1 - fy)
            + img[y0 + 1, x0] * (1 - fx) * fy + img[y0 + 1, x0 + 1] * fx * fy)


def box_sample(img: np.ndarray, mp: Mapping, pw: int, ph: int, sub: int = 3) -> np.ndarray:
    """The raw resampled onto the preview grid, averaging ``sub`` x ``sub`` bilinear taps per preview pixel (the
    preview pixel covers about ``s`` x ``s`` half-size pixels)."""

    acc = None
    vv, uu = np.mgrid[0:ph, 0:pw].astype(np.float64)
    for j in range(sub):
        for i in range(sub):
            x, y = mp.source(uu + (i + 0.5) / sub - 0.5, vv + (j + 0.5) / sub - 0.5, pw, ph)
            s = bilinear(img, x, y)
            acc = s if acc is None else acc + s
    return acc / (sub * sub)


def fit_mapping(raw_rgb: np.ndarray, white: float, prev: np.ndarray, corr, use_dist: bool, crop) -> tuple[Mapping, dict]:
    """Scale and centre fitted by block matching the preview's grey against the resampled raw's."""

    h2, w2 = raw_rgb.shape[:2]
    ph, pw = prev.shape[:2]
    if crop is not None:
        (ox, oy), (cw, ch) = crop
        cx, cy, pic_w = (ox + cw / 2.0) / 2.0, (oy + ch / 2.0) / 2.0, cw / 2.0
    else:
        cx, cy, pic_w = w2 / 2.0, h2 / 2.0, w2
    size = corr.size if (corr is not None and corr.size) else (crop[1] if crop is not None else (2 * w2, 2 * h2))
    r_knots = math.hypot(size[0] / 4.0, size[1] / 4.0)
    mp = Mapping(pic_w / pw, cx, cy, corr if use_dist else None, r_knots)
    ref = 255.0 * np.sqrt(np.clip(srgb_to_linear(prev) @ [0.2126, 0.7152, 0.0722], 0, 1))
    grey = raw_rgb @ np.array([0.25, 0.5, 0.25])
    info = {}
    for it in range(4):
        img = box_sample(grey, mp, pw, ph, sub=2)
        img = 255.0 * np.sqrt(np.clip(img / np.percentile(img, 99.5), 0, 1))
        rows = match(ref, img, patch=32, step=40, search=8, min_std=6.0)
        if len(rows) < 12:
            info["patches"] = len(rows)
            break
        r = np.asarray(rows)
        # Feature at preview (x, y) is found in the render at (x + fx, y + fy): the mapping must move by that.
        x = r[:, 0] - pw / 2.0
        y = r[:, 1] - ph / 2.0
        fx, fy = r[:, 2], r[:, 3]
        # Least squares: fx = ds_rel * x + dcx, fy = ds_rel * y + dcy (in preview pixels).
        a = np.zeros((2 * len(r), 3))
        a[: len(r), 0], a[: len(r), 1] = x, 1.0
        a[len(r):, 0], a[len(r):, 2] = y, 1.0
        b = np.concatenate([fx, fy])
        sol, *_ = np.linalg.lstsq(a, b, rcond=None)
        resid = np.hypot(fx - (sol[0] * x + sol[1]), fy - (sol[0] * y + sol[2]))
        info = {"iteration": it, "patches": len(r), "shift_median_px": float(np.median(np.hypot(fx, fy))),
                "residual_median_px": float(np.median(resid)), "residual_p90_px": float(np.percentile(resid, 90))}
        mp.cx += sol[1] * mp.s
        mp.cy += sol[2] * mp.s
        mp.s *= 1.0 + sol[0]
        if abs(sol[0]) * pw < 0.05 and abs(sol[1]) < 0.05 and abs(sol[2]) < 0.05:
            break
    return mp, info


# ---------------------------------------------------------------- the gain


def table_gain(corr: sc.SonyCorrections, rho: np.ndarray, squared: bool, dt_knots: bool) -> np.ndarray:
    knots = np.asarray(corr.vignetting, dtype=np.float64)
    n = len(knots)
    xs = (np.arange(n) + (0.5 if dt_knots else 0.0)) / (n - 1)
    v = np.interp(rho, xs, knots) * sc.VIGNETTING_SCALE
    g = 2.0 ** (2.0 ** (v - 1.0) - 0.5)
    return g * g if squared else g


def estimate_bands(rawp: np.ndarray, rawmax: np.ndarray, plin: np.ndarray, rho: np.ndarray, white: float,
                   centre: float = 0.2, bands: int = 10) -> dict:
    """Per channel, the camera's gain over the centre in stops, per radius band (steps 3 and 4 of the docstring).

    ``rawp`` and ``plin``: (h, w, 3) raw (linear, black subtracted) and preview (sRGB undone) on one grid;
    ``rawmax``: the largest raw channel there (for clipping); ``rho``: sensor radius per pixel."""

    out_ch = {}
    edges = np.linspace(0.0, float(rho.max()), bands + 1)
    for ch, name in enumerate("RGB"):
        d = rawp[..., ch]
        p = plin[..., ch]
        ok = (d > 0.002 * white) & (rawmax < 0.9 * white) & (p > 0.01) & (p < 0.97)
        cen = ok & (rho < centre)
        if cen.sum() < 500:
            continue
        # Monotone map raw -> preview from the centre: binned medians on log raw, made non-decreasing.
        ld = np.log(d[cen])
        lo, hi = np.percentile(ld, [1, 99])
        nb = 24
        e = np.linspace(lo, hi, nb + 1)
        xb, yb = [], []
        for k in range(nb):
            m = (ld >= e[k]) & (ld < e[k + 1])
            if m.sum() >= 30:
                xb.append(np.median(ld[m]))
                yb.append(np.median(p[cen][m]))
        if len(xb) < 6:
            continue
        xb = np.asarray(xb)
        yb = np.maximum.accumulate(np.asarray(yb))
        # Inverse: preview -> log raw-equivalent, within the fitted range only.
        keep = np.concatenate([[True], np.diff(yb) > 1e-6])
        xb, yb = xb[keep], yb[keep]
        inside = ok & (p > yb[0]) & (p < yb[-1])
        est = np.interp(p, yb, xb)
        lk = (est - np.log(np.maximum(d, 1e-9))) / math.log(2.0)  # log2 of camera gain over the centre's
        c0 = float(np.median(lk[cen & inside]))
        rows = []
        for k in range(bands):
            m = inside & (rho >= edges[k]) & (rho < edges[k + 1])
            if m.sum() < 200:
                rows.append(None)
                continue
            vals = lk[m] - c0
            rows.append({"rho": float(np.median(rho[m])), "n": int(m.sum()), "stops": float(np.median(vals)),
                         "iqr": float(np.subtract(*np.percentile(vals, [75, 25])))})
        out_ch[name] = rows
    return out_ch


def measure(path: str, centre: float = 0.2, bands: int = 10, distortion: str = "auto") -> dict:
    data = Path(path).read_bytes()
    raw = rd.parse_raw(data)
    corr = sc.from_arw(data)
    settings = maker_note_settings(data)
    prev = preview_rgb(data)
    rec = {"file": Path(path).name, "settings": settings}
    if corr is None or not corr.vignetting or prev is None:
        rec["skipped"] = "no vignetting table" if prev is not None else "no preview"
        return rec
    # The preview is stored the sensor's way up (EXIF Orientation is for viewers), like the raw: no turn.
    raw_rgb, white = half_rgb(raw)
    crop = None
    if raw.ifd.get(0xC61F) and raw.ifd.get(0xC620):
        o, c = raw.ifd.get(0xC61F), raw.ifd.get(0xC620)
        crop = ((float(o[0]), float(o[1])), (float(c[0]), float(c[1])))
    use_dist = bool(corr.distortion) and (settings.get("distortion") == "Auto" if distortion == "auto"
                                          else distortion == "on")
    mp, geo = fit_mapping(raw_rgb, white, prev, corr, use_dist, crop)
    rec["geometry"] = geo | {"scale": mp.s, "distortion_applied": use_dist}
    ph, pw = prev.shape[:2]
    rawp = box_sample(raw_rgb, mp, pw, ph, sub=3)
    # Clipped raw sensels poison the ratio: mark a preview pixel whose source neighbourhood is near white.
    rawmax = box_sample(raw_rgb.max(axis=-1), mp, pw, ph, sub=3)
    plin = srgb_to_linear(prev)
    vv, uu = np.mgrid[0:ph, 0:pw].astype(np.float64)
    sx, sy = mp.source(uu, vv, pw, ph)
    rho = np.hypot(sx - mp.cx, sy - mp.cy) / mp.r_knots  # sensor radius, 0 centre .. 1 corner of the table's frame
    rec["rho_preview_corner"] = float(rho.max())
    out_ch = estimate_bands(rawp, rawmax, plin, rho, white, centre, bands)
    rec["bands"] = out_ch
    # The four readings, relative to their own mean over the centre disk.
    rc = rho[rho < centre]
    preds = {}
    for key, (sq, dk) in HYPOTHESES.items():
        g0 = float(np.mean(np.log2(table_gain(corr, rc, sq, dk))))
        preds[key] = g0
    rec["predicted"] = {}
    score = {}
    for key, (sq, dk) in HYPOTHESES.items():
        errs = []
        rec["predicted"][key] = []
        for k in range(bands):
            g = out_ch.get("G", [None] * bands)[k]
            if g is None:
                rec["predicted"][key].append(None)
                continue
            pr = float(np.log2(table_gain(corr, np.array([g["rho"]]), sq, dk))[0] - preds[key])
            rec["predicted"][key].append(pr)
            errs.append(g["stops"] - pr)
        score[key] = {"rms_stops": float(np.sqrt(np.mean(np.square(errs)))) if errs else None,
                      "outer_band_error": float(errs[-1]) if errs else None}
    rec["score_green"] = score
    rec["confounded"] = settings.get("dro") not in (None, "Off") or settings.get("vignetting") != "Auto"
    return rec


def report(rec: dict) -> str:
    lines = [f"== {rec['file']}  settings {rec.get('settings')}"]
    if "skipped" in rec:
        return lines[0] + f"  skipped: {rec['skipped']}"
    g = rec["geometry"]
    lines.append(f"geometry: {g}")
    lines.append(f"preview corner at sensor rho {rec['rho_preview_corner']:.3f}"
                 + ("   CONFOUNDED (DRO on or vignetting correction not Auto)" if rec["confounded"] else ""))
    hdr = "rho    " + "  ".join(f"{c:>12}" for c in "RGB") + "  | " + "  ".join(f"{k:>16}" for k in HYPOTHESES)
    lines.append("measured camera gain over the centre, stops (median, IQR); predicted by each reading")
    lines.append(hdr)
    bands = rec["bands"]
    n = max(len(v) for v in bands.values()) if bands else 0
    for k in range(n):
        gk = bands.get("G", [None] * n)[k]
        if gk is None:
            continue
        cells = []
        for c in "RGB":
            b = bands.get(c, [None] * n)[k]
            cells.append(f"{b['stops']:+.2f} ({b['iqr']:.2f})" if b else " " * 12)
        pr = [rec["predicted"][key][k] for key in HYPOTHESES]
        lines.append(f"{gk['rho']:.3f}  " + "  ".join(f"{c:>12}" for c in cells) + "  | "
                     + "  ".join(f"{p:>+16.2f}" if p is not None else " " * 16 for p in pr))
    lines.append("green fit: " + "; ".join(f"{k} rms {v['rms_stops']:.3f}, outer {v['outer_band_error']:+.2f}"
                                           for k, v in rec["score_green"].items() if v["rms_stops"] is not None))
    return "\n".join(lines)


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("files", nargs="+")
    ap.add_argument("--centre", type=float, default=0.2, help="radius of the central disk the tone map is fitted on")
    ap.add_argument("--bands", type=int, default=10)
    ap.add_argument("--json", help="append one JSON line per file")
    ap.add_argument("--distortion", choices=("auto", "on", "off"), default="auto",
                    help="map the preview through the file's distortion table: as the maker note says (auto), always "
                         "or never; comparing the fits' residuals says whether the preview carries the correction")
    args = ap.parse_args(argv)
    for f in args.files:
        rec = measure(f, args.centre, args.bands, args.distortion)
        print(report(rec))
        if args.json:
            with open(args.json, "a") as fh:
                fh.write(json.dumps(rec) + "\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
