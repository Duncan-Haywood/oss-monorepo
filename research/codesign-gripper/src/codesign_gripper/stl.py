"""Write a finger as an ASCII STL from the same box geometry the simulator uses (no CAD kernel needed).
Two rotated plates form the V; a backing bar joins them. Units mm; the finger stands on z = 0 with its
V apex at the origin and the object side toward -y (mirror the part for the second finger)."""
import math
import numpy as np


def _box_tris(c, hs, rot):
    sx, sy, sz = hs
    v = np.array([[sx * i, sy * j, sz * k] for i in (-1, 1) for j in (-1, 1) for k in (-1, 1)], float)
    v = v @ rot.T + c
    quads = [(0, 1, 3, 2), (4, 6, 7, 5), (0, 4, 5, 1), (2, 3, 7, 6), (0, 2, 6, 4), (1, 5, 7, 3)]
    tris = []
    for a, b, cc, d in quads:
        tris += [(v[a], v[b], v[cc]), (v[a], v[cc], v[d])]
    return tris


def finger_triangles(x):
    L, t, w, a = x
    ar = math.radians(a)
    tris = []
    for j in (-1, 1):
        ux, uy = j * math.cos(ar), -math.sin(ar)
        nx, ny = -j * math.sin(ar), -math.cos(ar)
        h = w / 4.0
        c = np.array([h * ux - t / 2 * nx, h * uy - t / 2 * ny, L / 2])
        phi = math.atan2(uy, ux)
        rot = np.array([[math.cos(phi), -math.sin(phi), 0], [math.sin(phi), math.cos(phi), 0], [0, 0, 1]])
        tris += _box_tris(c, (h, t / 2, L / 2), rot)
    return tris


def write_stl(x, path, name="finger"):
    def normal(p, q, r):
        n = np.cross(q - p, r - p)
        m = np.linalg.norm(n)
        return n / m if m > 0 else n
    with open(path, "w") as f:
        f.write(f"solid {name}\n")
        for p, q, r in finger_triangles(x):
            n = normal(p, q, r)
            f.write(f" facet normal {n[0]:.6f} {n[1]:.6f} {n[2]:.6f}\n  outer loop\n")
            for v in (p, q, r):
                f.write(f"   vertex {v[0]:.5f} {v[1]:.5f} {v[2]:.5f}\n")
            f.write("  endloop\n endfacet\n")
        f.write(f"endsolid {name}\n")
