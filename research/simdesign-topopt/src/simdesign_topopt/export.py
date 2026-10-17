"""Density field -> printable part: threshold, keep the connected body, check feature size, extrude to STL."""
import struct
import numpy as np
from scipy import ndimage


def binarise(x, volfrac=None, thresh=0.5):
    """Threshold at `thresh`, or at the density quantile that keeps `volfrac` of the area."""
    if volfrac is not None:
        thresh = float(np.quantile(x, 1 - volfrac))
    return x > thresh


def largest_component(mask):
    lab, n = ndimage.label(mask)  # 4-connectivity
    if n <= 1:
        return mask.copy(), n
    sizes = ndimage.sum(mask, lab, index=np.arange(1, n + 1))
    return lab == (1 + int(np.argmax(sizes))), n


def min_feature_px(mask):
    """Smallest bar width, in pixels: twice the smallest local maximum of the distance transform
    along the skeleton-free approximation 'thinnest 1-pixel-wide run in either axis'. Returns
    the shortest run length of solid pixels along rows or columns, an upper bound on min width."""
    best = np.inf
    for m in (mask, mask.T):
        for row in m:
            run = 0
            for v in np.append(row, False):
                if v: run += 1
                elif run: best = min(best, run); run = 0
    return int(best) if np.isfinite(best) else 0


def _quads(mask, h, z0, z1):
    """Boundary quads of the extruded pixel mask; pixel (j, i) spans x in [i, i+1], y in [ny-j-1, ny-j]."""
    ny, nx = mask.shape
    tris = []
    P = np.pad(mask, 1)
    def q(a, b, c, d):  # counter-clockwise quad seen from outside
        tris.append((a, b, c)); tris.append((a, c, d))
    for j in range(ny):
        for i in range(nx):
            if not mask[j, i]: continue
            x0, x1, y0, y1 = i * h, (i + 1) * h, (ny - j - 1) * h, (ny - j) * h
            q((x0, y0, z1), (x1, y0, z1), (x1, y1, z1), (x0, y1, z1))  # top
            q((x0, y0, z0), (x0, y1, z0), (x1, y1, z0), (x1, y0, z0))  # bottom
            if not P[j + 1, i]:  # left neighbour empty
                q((x0, y1, z0), (x0, y0, z0), (x0, y0, z1), (x0, y1, z1))
            if not P[j + 1, i + 2]:  # right
                q((x1, y0, z0), (x1, y1, z0), (x1, y1, z1), (x1, y0, z1))
            if not P[j + 2, i + 1]:  # below (smaller y)
                q((x0, y0, z0), (x1, y0, z0), (x1, y0, z1), (x0, y0, z1))
            if not P[j, i + 1]:  # above (larger y)
                q((x1, y1, z0), (x0, y1, z0), (x0, y1, z1), (x1, y1, z1))
    return tris


def write_extruded_stl(mask, path, pixel_mm=1.0, thickness_mm=5.0):
    """Binary STL of the pixel mask extruded by thickness. Returns the triangle count."""
    tris = _quads(mask, pixel_mm, 0.0, thickness_mm)
    with open(path, "wb") as fh:
        fh.write(b"simdesign-topopt".ljust(80, b" "))
        fh.write(struct.pack("<I", len(tris)))
        for a, b, c in tris:
            a, b, c = map(np.array, (a, b, c))
            n = np.cross(b - a, c - a); nn = np.linalg.norm(n)
            n = n / nn if nn else n
            fh.write(struct.pack("<12fH", *n, *a, *b, *c, 0))
    return len(tris)


def stl_volume(path):
    """Signed volume of a binary STL by the divergence theorem (mm^3)."""
    with open(path, "rb") as fh:
        fh.read(80); n = struct.unpack("<I", fh.read(4))[0]
        v = 0.0
        for _ in range(n):
            d = struct.unpack("<12fH", fh.read(50))
            a, b, c = np.array(d[3:6]), np.array(d[6:9]), np.array(d[9:12])
            v += np.dot(a, np.cross(b, c)) / 6
    return float(v)
