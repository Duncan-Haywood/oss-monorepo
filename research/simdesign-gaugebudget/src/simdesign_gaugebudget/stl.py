"""Binary STL export of the profile extruded by depth b (ear-clipping caps)."""
import struct
import numpy as np


def _ear_clip(poly: np.ndarray):
    idx = list(range(len(poly)))
    tris = []

    def cross(o, a, b):
        return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])

    def inside(p, a, b, c):
        return cross(a, b, p) >= -1e-12 and cross(b, c, p) >= -1e-12 and cross(c, a, p) >= -1e-12

    guard = 0
    while len(idx) > 3 and guard < 100000:
        guard += 1
        for k in range(len(idx)):
            i0, i1, i2 = idx[k - 1], idx[k], idx[(k + 1) % len(idx)]
            a, b, c = poly[i0], poly[i1], poly[i2]
            if cross(a, b, c) <= 1e-12:
                continue
            if any(inside(poly[j], a, b, c) for j in idx if j not in (i0, i1, i2)):
                continue
            tris.append((i0, i1, i2))
            idx.pop(k)
            break
        else:
            raise ValueError("ear clipping failed")
    tris.append(tuple(idx))
    return tris


def triangles(poly: np.ndarray, b: float) -> np.ndarray:
    n = len(poly)
    out = []
    for i0, i1, i2 in _ear_clip(poly):
        out.append([(*poly[i0], 0), (*poly[i2], 0), (*poly[i1], 0)])   # bottom, normal -z
        out.append([(*poly[i0], b), (*poly[i1], b), (*poly[i2], b)])   # top, normal +z
    for i in range(n):
        a, c = poly[i], poly[(i + 1) % n]
        out.append([(*a, 0), (*c, 0), (*c, b)])
        out.append([(*a, 0), (*c, b), (*a, b)])
    return np.array(out, dtype=float)


def write_extruded_stl(path: str, poly: np.ndarray, b: float, name: str = "bracket") -> dict:
    t = triangles(np.asarray(poly, float), b)
    with open(path, "wb") as f:
        f.write(name.encode()[:80].ljust(80, b" "))
        f.write(struct.pack("<I", len(t)))
        for tri in t:
            n = np.cross(tri[1] - tri[0], tri[2] - tri[0])
            nn = np.linalg.norm(n)
            n = n / nn if nn > 0 else n
            f.write(struct.pack("<12fH", *n, *tri.ravel(), 0))
    vol = float(np.sum(np.einsum("ij,ij->i", t[:, 0], np.cross(t[:, 1], t[:, 2]))) / 6.0)
    return {"triangles": int(len(t)), "volume_mm3": vol}
