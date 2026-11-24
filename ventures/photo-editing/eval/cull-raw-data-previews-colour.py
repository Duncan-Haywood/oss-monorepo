"""How close the cull page's raw-data previews (site/rawmosaic.mjs) come to
shootflow's own DNG development of the same file.

Reference: shootflow.raw_develop.develop at half size with the DNG colour model,
tone curve off and opcodes on (what `shootflow develop` does, less the look), and
a second reference with the dcraw colour model (the construction the page uses).
Both images are shrunk to 256 px on the long side, put back to linear light,
matched in exposure by one least-squares gain on luminance (the page lifts its
own exposure), and compared in CIELAB (D65) over pixels below 0.9 in both.
Also, where the DNG carries an embedded JPEG, the same comparison against it.
    python3 eval/cull-raw-data-previews-colour.py OUT     # numpy, Pillow
"""

import io
import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))
from shootflow import raw_develop as rd  # noqa: E402

SIDE = 256
M = np.array([[0.4124564, 0.3575761, 0.1804375], [0.2126729, 0.7151522, 0.072175], [0.0193339, 0.119192, 0.9503041]])
WHITE = M.sum(axis=1)


def lin(a):
    a = a.astype(np.float64)
    return np.where(a <= 0.04045, a / 12.92, ((a + 0.055) / 1.055) ** 2.4)


def small(img: Image.Image, size):
    return lin(np.asarray(img.convert("RGB").resize(size, Image.BOX)) / 255.0)


def lab(rgb):
    xyz = rgb @ M.T / WHITE
    f = np.where(xyz > 216 / 24389, np.cbrt(xyz), (24389 / 27 * xyz + 16) / 116)
    return np.stack([116 * f[..., 1] - 16, 500 * (f[..., 0] - f[..., 1]), 200 * (f[..., 1] - f[..., 2])], -1)


def compare(page, ref):
    y = lambda a: a @ M[1]
    ok = (page.max(-1) < 0.9) & (ref.max(-1) < 0.9) & (y(ref) > 0.002)
    if ok.sum() < 100:
        return None
    g = float((y(page)[ok] * y(ref)[ok]).sum() / (y(page)[ok] ** 2).sum())
    p = np.clip(page * g, 0, 1)
    d = np.linalg.norm(lab(p) - lab(ref), axis=-1)[ok]
    dc = np.linalg.norm((lab(p) - lab(ref))[..., 1:], axis=-1)[ok]
    return float(np.median(d)), float(np.percentile(d, 90)), float(np.median(dc))


def orient(img, o):
    return {2: Image.FLIP_LEFT_RIGHT, 3: Image.ROTATE_180, 4: Image.FLIP_TOP_BOTTOM, 5: Image.TRANSPOSE,
            6: Image.ROTATE_270, 7: Image.TRANSVERSE, 8: Image.ROTATE_90}.get(o) and img.transpose(
        {2: Image.FLIP_LEFT_RIGHT, 3: Image.ROTATE_180, 4: Image.FLIP_TOP_BOTTOM, 5: Image.TRANSPOSE,
         6: Image.ROTATE_270, 7: Image.TRANSVERSE, 8: Image.ROTATE_90}[o]) or img


out = Path(sys.argv[1])
rows = {"dng": [], "dcraw": [], "jpeg": []}
print("file\tref\tmedian_dE\tp90_dE\tmedian_dChroma")
for meta in sorted(out.glob("*.json")):
    info = json.loads(meta.read_text())
    page = orient(Image.open(out / (meta.stem + ".ppm")), info.get("orientation") or 1)
    s = SIDE / max(page.size)
    size = (round(page.size[0] * s), round(page.size[1] * s))
    pg = small(page, size)
    raw = rd.read_raw(info["file"])
    for colour in ("dng", "dcraw"):
        w, h, rgb16, _ = rd.develop(raw, rd.DevelopSettings(half=True, colour=colour, tone_curve=False, default_tone="never"))
        ref = Image.fromarray((np.asarray(rgb16, dtype=np.uint16).reshape(h, w, 3) >> 8).astype(np.uint8))
        r = compare(pg, small(ref, size))
        if r:
            rows[colour].append(r)
            print(f"{meta.stem}\t{colour}\t{r[0]:.2f}\t{r[1]:.2f}\t{r[2]:.2f}")
    data = Path(info["file"]).read_bytes()
    j = data.find(b"\xff\xd8\xff")
    best = None
    while j >= 0:
        try:
            im = Image.open(io.BytesIO(data[j:]))
            im.load()
            if im.size[0] >= 640 and (best is None or im.size[0] > best.size[0]):
                best = im
        except Exception:
            pass
        j = data.find(b"\xff\xd8\xff", j + 3)
    if best is not None:
        bo = orient(best, info.get("orientation") or 1)
        if abs(bo.size[0] / bo.size[1] - size[0] / size[1]) > 0.05:
            bo = best
        r = compare(pg, small(bo, size))
        if r:
            rows["jpeg"].append(r)
            print(f"{meta.stem}\tcamera JPEG\t{r[0]:.2f}\t{r[1]:.2f}\t{r[2]:.2f}")
for k, v in rows.items():
    if v:
        a = np.array(v)
        print(f"# vs {k}: {len(v)} files, median of medians dE {np.median(a[:, 0]):.2f}, worst file median {a[:, 0].max():.2f}, median chroma {np.median(a[:, 2]):.2f}")
