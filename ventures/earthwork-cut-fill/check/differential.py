"""Differential check of earthwork.mjs against scipy.spatial.Delaunay (Qhull)
and an independently derived closed form for cut and fill on a triangle.

    node dump.mjs > sets.json && python3 differential.py sets.json

Closed form: on a triangle of area A with depth linear and vertex depths
d1 > 0 > d2, d3, the positive part integrates to A*d1**3 / (3*(d1-d2)*(d1-d3)).
"""
import json, sys
import numpy as np
from scipy.spatial import Delaunay


def pos_part(A, d):
    d = sorted(d, reverse=True)
    if d[2] >= 0:
        return A * sum(d) / 3
    if d[0] <= 0:
        return 0.0
    if d[1] <= 0:  # one positive vertex
        return A * d[0] ** 3 / (3 * (d[0] - d[1]) * (d[0] - d[2]))
    # two positive: total minus the negative corner at d[2]
    neg = A * (-d[2]) ** 3 / (3 * (d[0] - d[2]) * (d[1] - d[2]))
    return A * sum(d) / 3 + neg


def main(path):
    worst = 0.0
    for s in json.load(open(path)):
        P = np.array(s["pts"])
        xy = P[:, :2] - P[:, :2].min(axis=0)
        q = Delaunay(xy)
        ours = {tuple(sorted(t)) for t in s["tris"]}
        theirs = {tuple(sorted(int(i) for i in t)) for t in q.simplices}
        same = ours == theirs
        pl = s["plane"]
        cut = fill = 0.0
        for t in q.simplices:
            V = P[t]
            u, w = V[1, :2] - V[0, :2], V[2, :2] - V[0, :2]
            A = abs(u[0] * w[1] - u[1] * w[0]) / 2
            dz = [pl["elevation"] + pl["slopeX"] / 100 * (x - pl["x0"]) + pl["slopeY"] / 100 * (y - pl["y0"]) - z for x, y, z in V]
            fill += pos_part(A, dz)
            cut += pos_part(A, [-d for d in dz])
        rc = abs(cut - s["cut"]) / cut
        rf = abs(fill - s["fill"]) / fill
        worst = max(worst, rc, rf)
        print(f"seed {s['seed']}: {len(ours)} triangles, same set as Qhull: {same}; "
              f"cut {s['cut']:.3f} vs {cut:.3f} ft3, fill {s['fill']:.3f} vs {fill:.3f} ft3")
        if not same:
            sys.exit(f"seed {s['seed']}: triangle sets differ ({len(ours ^ theirs)} triangles)")
    print(f"worst relative volume difference: {worst:.2e}")
    if worst > 1e-9:
        sys.exit("volumes differ")


if __name__ == "__main__":
    main(sys.argv[1])
