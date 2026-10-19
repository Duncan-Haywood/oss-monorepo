"""Write a finger as an ASCII STL: the PLA body as a prism with a V-groove front face.

The profile (top view, x towards the object, y across the width, extruded along the finger length L):
back face at x = 0, the pad edges at x = t, the groove apex recessed by (w/2) tan(theta). This approximates the
simulated pad (two tilted plates); the exported mesh itself was not simulated. The TPU pad is a separate
print and is not exported.
"""
import math
import numpy as np


def finger_mesh(w, t, L, v):
    d = min((w / 2.0) * math.tan(math.radians(35.0 * v)), 0.8 * t)
    prof = [(0, -w / 2), (t, -w / 2), (t - d, 0.0), (t, w / 2), (0, w / 2)]
    tri2 = [(0, 1, 2), (0, 2, 4), (2, 3, 4)]                     # counter-clockwise in (x, y)
    V = [(x, y, 0.0) for x, y in prof] + [(x, y, L) for x, y in prof]
    T = [(a, c, b) for a, b, c in tri2]                           # bottom cap faces down
    T += [(a + 5, b + 5, c + 5) for a, b, c in tri2]              # top cap faces up
    for i in range(5):                                            # side walls, outward
        j = (i + 1) % 5
        T += [(i, j, j + 5), (i, j + 5, i + 5)]
    return np.array(V, float), T


def volume_mm3(V, T):
    return abs(sum(np.dot(V[a], np.cross(V[b], V[c])) for a, b, c in T)) / 6.0


def is_watertight(T):
    from collections import Counter
    e = Counter()
    for a, b, c in T:
        for p, q in ((a, b), (b, c), (c, a)):
            e[(p, q)] += 1
    return all(e[(q, p)] == n for (p, q), n in e.items())


def write_stl(path, name, w, t, L, v):
    V, T = finger_mesh(w, t, L, v)
    with open(path, "w") as f:
        f.write("solid %s\n" % name)
        for a, b, c in T:
            n = np.cross(V[b] - V[a], V[c] - V[a]); n = n / (np.linalg.norm(n) or 1.0)
            f.write(" facet normal %.6f %.6f %.6f\n  outer loop\n" % tuple(n))
            for k in (a, b, c):
                f.write("   vertex %.4f %.4f %.4f\n" % tuple(V[k]))
            f.write("  endloop\n endfacet\n")
        f.write("endsolid %s\n" % name)
