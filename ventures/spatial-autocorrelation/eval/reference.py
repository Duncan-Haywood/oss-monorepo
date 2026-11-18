"""Reference values from PySAL (esda 2.9.0, libpysal 4.14.1) for reference.test.mjs.

Each case builds its weights with libpysal (not with our engine), runs esda's
Moran, Geary, G, Moran_Local and G_Local(star=True) and stores the analytic
numbers; reference.test.mjs runs engine.mjs on the same inputs and compares.

Run: python -I eval/reference.py > eval/reference.json
"""
import csv
import json
import sys
import warnings
from pathlib import Path

warnings.filterwarnings("ignore")
import numpy as np  # noqa: E402
import esda  # noqa: E402
import libpysal  # noqa: E402
from libpysal.weights import W, KNN, DistanceBand  # noqa: E402

here = Path(__file__).resolve().parent.parent
rows = list(csv.DictReader(open(here / "data/us-state-income.csv")))
names = [r["state"] for r in rows]
nb = {r["state"]: r["neighbors"].split(";") for r in csv.DictReader(open(here / "data/us-state-neighbors.csv"))}

R = 6371.0088


def hav(lon, lat):
    lo, la = np.radians(lon), np.radians(lat)
    dla = la[:, None] - la[None, :]
    dlo = lo[:, None] - lo[None, :]
    h = np.sin(dla / 2) ** 2 + np.cos(la[:, None]) * np.cos(la[None, :]) * np.sin(dlo / 2) ** 2
    return 2 * R * np.arcsin(np.minimum(1, np.sqrt(h)))


def knn_from_matrix(D, k):
    n = len(D)
    neigh = {}
    for i in range(n):
        order = sorted((j for j in range(n) if j != i), key=lambda j: (D[i, j], j))
        neigh[i] = order[:k]
    return W(neigh, silence_warnings=True)


def stats(y, w, transform, case):
    y = np.asarray(y, float)
    out = {"case": case, "transform": transform}
    w.transform = transform
    m = esda.Moran(y, w, transformation=transform, permutations=999)
    out["moran"] = dict(I=m.I, EI=m.EI, VI_norm=m.VI_norm, z_norm=m.z_norm, p_norm=m.p_norm, VI_rand=m.VI_rand, z_rand=m.z_rand, p_rand=m.p_rand, p_sim=m.p_sim)
    out["s"] = dict(s0=w.s0, s1=w.s1, s2=w.s2)
    w.transform = transform
    g = esda.Geary(y, w, transformation=transform, permutations=999)
    out["geary"] = dict(C=g.C, VC_norm=g.VC_norm, VC_rand=g.VC_rand, z_norm=g.z_norm, z_rand=g.z_rand, p_norm_two=2 * g.p_norm, p_rand_two=2 * g.p_rand, p_sim=g.p_sim)
    w.transform = "B"
    if (y >= 0).all():
        G = esda.G(y, w, permutations=999)
        out["G"] = dict(G=G.G, EG=G.EG, VG=G.VG, z_norm=G.z_norm, p_norm_two=2 * G.p_norm, p_sim=G.p_sim)
    w.transform = transform
    lm = esda.Moran_Local(y, w, transformation=transform, permutations=999, seed=1)
    out["local"] = dict(Is=lm.Is.tolist(), q=lm.q.tolist(), EIc=lm.EIc.tolist(), VIc=lm.VIc.tolist(), p_sim=lm.p_sim.tolist())
    w.transform = "B"
    gs = esda.G_Local(y, w, transform="B", star=True, permutations=0)
    out["gistar"] = gs.Zs.tolist()
    w.transform = "O"
    return out


cases = []
# 1. per-capita income 2009 and 1929, queen contiguity (the page's example), row-standardised
idx = {s: i for i, s in enumerate(names)}
wq = W({idx[s]: [idx[t] for t in nb[s]] for s in names}, silence_warnings=True)
for col in ["pci2009", "pci1929"]:
    cases.append({"input": {"weights": "list", "variables": col, "transform": "r"}, "uses": "us-state", **stats([float(r[col]) for r in rows], wq, "R", f"{col} queen r")})
cases.append({"input": {"weights": "list", "variables": "pci1970", "transform": "b"}, "uses": "us-state", **stats([float(r["pci1970"]) for r in rows], wq, "B", "pci1970 queen b")})
# 2. great-circle k nearest neighbours on the state centroids
lon = np.array([float(r["lon"]) for r in rows]); lat = np.array([float(r["lat"]) for r in rows])
D = hav(lon, lat)
for k in (4, 8):
    cases.append({"input": {"weights": "knn", "k": k, "variables": "pci2009", "transform": "r"}, "uses": "us-state", **stats([float(r["pci2009"]) for r in rows], knn_from_matrix(D, k), "R", f"pci2009 knn{k} haversine r")})
# 3. planar points with libpysal's own DistanceBand (binary and inverse distance)
rs = np.random.default_rng(20261118)
n = 120
pts = rs.uniform(0, 100, size=(n, 2))
trend = 0.04 * pts[:, 0] + 0.02 * pts[:, 1]
val = np.round(np.exp(trend + rs.normal(0, 0.5, n)), 4)
neg = np.round(trend - 3 + rs.normal(0, 1, n), 4)
planar = "x,y,v,w\n" + "\n".join(f"{a:.4f},{b:.4f},{c},{d}" for (a, b), c, d in zip(pts, val, neg))
P = np.array([[float(t) for t in line.split(",")[:2]] for line in planar.split("\n")[1:]])
db = DistanceBand(P, threshold=15.0, binary=True, silence_warnings=True)
cases.append({"input": {"text": planar, "weights": "band", "threshold": 15, "variables": "v", "transform": "r"}, **stats(val, db, "R", "planar band15 r")})
inv = DistanceBand(P, threshold=20.0, binary=False, alpha=-1.0, silence_warnings=True)
cases.append({"input": {"text": planar, "weights": "inverse", "threshold": 20, "power": 1, "variables": "w", "transform": "r"}, **stats(neg, inv, "R", "planar inverse20 r (negative values)")})
inv2 = DistanceBand(P, threshold=20.0, binary=False, alpha=-2.0, silence_warnings=True)
cases.append({"input": {"text": planar, "weights": "inverse", "threshold": 20, "power": 2, "variables": "v", "transform": "none"}, **stats(val, inv2, "O", "planar inverse^2 raw")})
knnp = KNN.from_array(P, k=6)
cases.append({"input": {"text": planar, "weights": "knn", "k": 6, "variables": "v", "transform": "r"}, "libpysal_knn": True, **stats(val, knnp, "R", "planar knn6 (libpysal KNN) r")})

json.dump({"generator": "eval/reference.py", "esda": esda.__version__, "libpysal": libpysal.__version__, "numpy": np.__version__, "python": sys.version.split()[0], "cases": cases}, sys.stdout, indent=1)
