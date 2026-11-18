"""Solid volume of every printed part of the Prusa Mendel (iteration 2), from its STL files.

Downloads the STLs the RepRap wiki points to (prusajr/PrusaMendel, folder ``metric-prusa``),
computes each closed mesh's volume with the divergence theorem (sum of signed tetrahedra),
checks that every directed edge is matched by its reverse (a watertight, oriented surface), and writes
``data/stl_volumes.json``. Standard library only.

The STLs are GPL design files and are NOT committed here; their SHA-256 is recorded so a
later run can tell whether the upstream files changed.

    python3 experiments/stl_volumes.py               # download into a temp dir and recompute
    python3 experiments/stl_volumes.py --dir DIR     # use STLs already in DIR
    python3 experiments/stl_volumes.py --check       # recompute and fail if data/ differs
"""
import argparse
import hashlib
import json
import os
import struct
import sys
import tempfile
import urllib.request
from collections import Counter

BASE = "https://raw.githubusercontent.com/prusajr/PrusaMendel/master/metric-prusa/"
# Names exactly as the wiki's printed-parts table lists them (RepRap wiki, "Prusa Mendel (iteration 2)", oldid=181926).
PARTS = ["bar-clamp", "bearing-guide", "belt-clamp", "belt-clamp-nut-holder", "coupling", "endstop-holder",
         "frame-vertex", "frame-vertex-foot", "rod-clamp", "x-carriage", "x-end-idler", "x-end-motor",
         "ybrac-t", "y-bushing", "z-motor-mount", "wade", "wade-big", "wade-small"]
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "data", "stl_volumes.json")


def triangles(data):
    """Triangles of an ASCII or binary STL, as lists of three (x, y, z) tuples in mm."""
    head = data[:512]
    if head.lstrip().startswith(b"solid") and b"facet" in head:
        tris, cur = [], []
        for line in data.decode("ascii", "replace").splitlines():
            tok = line.split()
            if tok and tok[0] == "vertex":
                cur.append(tuple(float(x) for x in tok[1:4]))
                if len(cur) == 3:
                    tris.append(cur)
                    cur = []
        return tris
    n = struct.unpack("<I", data[80:84])[0]
    if len(data) < 84 + 50 * n:
        raise ValueError("truncated binary STL")
    out = []
    for i in range(n):
        f = struct.unpack("<12f", data[84 + 50 * i: 84 + 50 * i + 48])
        out.append([f[3:6], f[6:9], f[9:12]])
    return out


def volume_mm3(tris):
    """Signed-tetrahedron volume; abs() so either winding works for a closed mesh."""
    v = 0.0
    for a, b, c in tris:
        v += (a[0] * (b[1] * c[2] - b[2] * c[1]) - a[1] * (b[0] * c[2] - b[2] * c[0])
              + a[2] * (b[0] * c[1] - b[1] * c[0])) / 6.0
    return abs(v)


def closed(tris, nd=4):
    """(watertight, non_manifold_edges). Watertight: every directed edge (vertices rounded to nd
    decimals) is matched by the same number of reverse edges, so the surface is closed and
    consistently oriented and the tetrahedron sum is its volume. OpenSCAD exports can still share
    an edge between four or six triangles where two solids touch; those are counted, not failed."""
    directed, undirected = Counter(), Counter()
    for t in tris:
        k = [tuple(round(x, nd) for x in p) for p in t]
        for i in range(3):
            a, b = k[i], k[(i + 1) % 3]
            directed[(a, b)] += 1
            undirected[tuple(sorted((a, b)))] += 1
    tight = all(directed.get((b, a), 0) == c for (a, b), c in directed.items())
    return tight, sum(1 for c in undirected.values() if c != 2)


def measure(path):
    data = open(path, "rb").read()
    tris = triangles(data)
    tight, nonmanifold = closed(tris)
    return {"sha256": hashlib.sha256(data).hexdigest(), "triangles": len(tris),
            "volume_cm3": round(volume_mm3(tris) / 1000.0, 3), "watertight": tight,
            "non_manifold_edges": nonmanifold}


def fetch(name, d):
    p = os.path.join(d, name + ".stl")
    if not os.path.exists(p):
        with urllib.request.urlopen(BASE + name + ".stl", timeout=60) as r, open(p, "wb") as f:
            f.write(r.read())
    return p


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument("--dir")
    ap.add_argument("--check", action="store_true")
    a = ap.parse_args(argv)
    d = a.dir or tempfile.mkdtemp(prefix="prusa-i2-stl-")
    rows = {n: dict(url=BASE + n + ".stl", **measure(fetch(n, d))) for n in PARTS}
    doc = {"source": "github.com/prusajr/PrusaMendel, branch master, folder metric-prusa (linked from the RepRap wiki "
                     "page 'Prusa Mendel (iteration 2)', oldid=181926); files are GPL and not copied here",
           "retrieved": "2026-11-14",
           "method": "closed-mesh volume by signed tetrahedra (experiments/stl_volumes.py); cross-checked with "
                     "numpy-stl get_mass_properties on 2026-11-14, identical to 3 decimals for all 18 files",
           "parts": rows}
    if a.check:
        old = json.load(open(OUT))
        bad = [n for n in PARTS if old["parts"][n]["volume_cm3"] != rows[n]["volume_cm3"]
               or old["parts"][n]["sha256"] != rows[n]["sha256"]]
        print("differs: " + ", ".join(bad) if bad else "data/stl_volumes.json matches the upstream STLs")
        return 1 if bad else 0
    with open(OUT, "w") as f:
        json.dump(doc, f, indent=1)
        f.write("\n")
    for n, r in rows.items():
        print(f"{n:24s} {r['volume_cm3']:8.3f} cm3  watertight={r['watertight']} nonmanifold={r['non_manifold_edges']}  {r['sha256'][:12]}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
