"""Milestone 3a: a triangle finite-element tier (CST membrane with measured shear, discrete-shell
bending), checked on an exact case and on the acceptance test milestone 2a set for the top tier.

    python3 experiments/m3_fem_tier/run.py           (about an hour on 4 cores; needs numpy)
    python3 experiments/m3_fem_tier/run.py --part cantilever     (a few minutes)

Why: milestones 2a and 2b found the spring sheet's simulated Cusick drape coefficient (DC) moves
with the stretch stiffness EA and with the grid (fabric A at EA 3200: 0.70, 0.57, 0.49, 0.37 at
7.5, 5, 3.75, 2.5 mm), so it cannot be the tier a measured drape calibrates, and set the top tier's
first acceptance test: the Cusick DC flat in EA and mesh. The proposal's top tier is ARCSim or
C-IPC; both are C++ builds with native dependencies. ARCSim's element model, constant-strain
triangles plus dihedral-angle hinges, is small enough to write in numpy, so this step builds that
model (`fem.py`, without ARCSim's adaptive remeshing) with stretch and shear as separate measured
parameters, and asks whether the element alone removes the spring grid's EA and mesh dependence.

Part 1, cantilever (Peirce / ASTM D1388): strips 2 cm wide, overhang L = 2 and 4 bending lengths,
fabrics A and D of `hanger-kes`, EA 150, 800, 3200 N/m with each fabric's measured KES G, 8, 16 and
32 elements along the overhang (equilateral lattice, columns across the strip), two clamped
columns behind the edge. Score: tip drop / l (mean over the tip column) against the exact heavy
elastica (`elastica.py`, which gives the standard 41.5 degree chord at L = 2.000).

Part 2, Cusick: milestone 2a's geometry (30 cm specimen, 18 cm disc, nodes inside the disc
clamped), an equilateral lattice cut to the circle at side a = 7.5, 5, 3.75, 2.5 mm, fabrics A and
D, EA 150, 800, 3200 N/m with measured G; plus G = 0.1 EA (the spring sheet's coupling) at EA 800
and 3200 on 5 and 2.5 mm to compare like with like. Same start (tilt plus seeded noise, seed 0) and
stopping rule as milestone 2b (chunks of 2000 L-BFGS iterations until DC moves under 0.001, cap
100,000); same shadow raster.

Predictions, written before the first run (LOG.md, 2026-11-12, milestone 3a):
  F1  Calibration: at 32 elements, the cantilever tip drop is within 1% of l of the elastica in
      all 12 cases (2 fabrics x 2 lengths x 3 EA).
  F2  The cantilever is a near-isometric bend, so EA 150 -> 3200 changes the 32-element tip drop
      by under 0.5% of l in every fabric-length pair.
  F3  Mesh: at EA 3200 and measured G, the Cusick DC moves by under 0.03 from a = 3.75 to 2.5 mm
      on both fabrics (the spring sheet moved 0.12 on A, 0.01 on D).
  F4  EA: at a = 2.5 mm and measured G, DC(3200) - DC(800) is under 0.03 on both fabrics (the
      spring sheet, shear tied to EA: 0.14 on A, 0.06 on D).
  F5  Like for like: with G = 0.1 EA, the FEM's DC change from a = 5 to 2.5 mm at EA 3200 on
      fabric A is under half the spring sheet's (0.20).
  F6  With measured G, DC orders A < D at every EA and mesh.
Acceptance (milestone 2a's): F3 and F4 together. If either fails, this element is not the top
tier and the next candidate is a nonconforming or remeshing element.
"""
import argparse
import math
import multiprocessing as mp
import sys
import time
from pathlib import Path

import numpy as np

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(HERE.parent / "m2_cusick"))
sys.path.insert(0, str(HERE.parent / "m2b_locking"))
sys.path.insert(0, str(HERE.parents[2] / "hanger-kes" / "src"))
import elastica  # noqa: E402
import fem  # noqa: E402
import cusick  # noqa: E402
from kes_shear import g_si  # noqa: E402
from hanger_kes.kes import KES  # noqa: E402

FABRICS = ("A", "D")
EAS = (150.0, 800.0, 3200.0)

# ---------------------------------------------------------------- cantilever

CANT = [(f, L, ea, n) for f in FABRICS for L in (2.0, 4.0) for ea in EAS for n in (8, 16, 32)]


def strip(f, L, ea, n, width=0.02):
    _, B, W = KES[f]
    c = cusick.bending_length(B, W) / 100            # m
    l = L * c
    s = l / n                                        # column spacing
    a = s / (math.sqrt(3) / 2)
    P, T = fem.lattice(a, (-2 * s - 1e-12, l + 1e-12), (0, width), rows_along="y")
    P, T = fem.keep(P, T, (P[:, 0] > -2 * s - 1e-9) & (P[:, 0] < l + 1e-9))
    fixed = P[:, 0] <= 1e-12
    return fem.Mesh(P, T, B, W, ea, g_si(f), fixed), l


def cant_one(c):
    f, L, ea, n = c
    t = time.time()
    m, l = strip(f, L, ea, n)
    tip = np.abs(m.P[:, 0] - m.P[:, 0].max()) < 1e-9
    X = m.X0.copy()
    w_node = fem.GRAV * m.mass.max()
    prev, total = None, 0
    while total < 60000:
        X, used = m.solve(X, 2000, tol=1e-7 * w_node)
        total += used
        drop = -X[tip, 2].mean() / l
        if used < 2000 or (prev is not None and abs(drop - prev) < 1e-5):
            break
        prev = drop
    ref = elastica.cantilever(L)["drop"]
    return c, dict(drop=drop, ref=ref, err=drop - ref, iters=total, sec=time.time() - t)


# ---------------------------------------------------------------- Cusick

AS = (0.0075, 0.005, 0.00375, 0.0025)
CUS = ([(f, ea, a, "kes") for f in FABRICS for ea in EAS for a in AS]
       + [(f, ea, a, "tied") for f in FABRICS for ea in (800.0, 3200.0) for a in (0.005, 0.0025)])


class Disc(fem.Mesh):
    """Cusick specimen on an equilateral lattice, with milestone 2a's start, shadow and folds."""

    def __init__(self, f, ea, a, shear):
        _, B, W = KES[f]
        cut = cusick.R_SPEC + 0.5 * a
        P, T = fem.lattice(a, (-cut - a, cut + a), (-cut - a, cut + a))
        P, T = fem.keep(P, T, np.hypot(P[:, 0], P[:, 1]) <= cut + 1e-12)
        Gs = g_si(f) if shear == "kes" else 0.1 * ea
        rho = np.hypot(P[:, 0], P[:, 1])
        super().__init__(P, T, B, W, ea, Gs, rho <= cusick.R_DISC + 1e-12)
        self.rho0 = rho
        self.tris = self.T

    def start(self, seed, amp=0.002, slope=0.05):
        rng = np.random.default_rng(seed)
        X = self.X0.copy()
        t = np.clip((self.rho0 - cusick.R_DISC) / (cusick.R_SPEC - cusick.R_DISC), 0, 1)
        X[:, 2] = -slope * (self.rho0 - cusick.R_DISC).clip(0) + amp * t * rng.standard_normal(self.n)
        X[self.fixed, 2] = 0.0
        return X

    shadow_area = cusick.Specimen.shadow_area
    flat_area = cusick.Specimen.flat_area
    dc = cusick.Specimen.dc


def cus_one(c, seed=0, chunk=2000, tol=0.001, maxit=100000):
    f, ea, a, shear = c
    t = time.time()
    sp = Disc(f, ea, a, shear)
    X = sp.start(seed)
    traj, total = [], 0
    while total < maxit:
        X, used = sp.solve(X, chunk, tol=1e-7)
        total += used
        traj.append(sp.dc(X))
        if used < chunk or (len(traj) > 1 and abs(traj[-1] - traj[-2]) < tol):
            break
    last = abs(traj[-1] - traj[-2]) if len(traj) > 1 else 0.0
    return c, dict(dc=traj[-1], iters=total, last=last, folds=cusick.nodes(X, sp), n=sp.n,
                   sec=time.time() - t)


def dcv(res, f, ea, a, shear="kes"):
    return res[(f, ea, a, shear)]["dc"]


# spring-sheet DC from milestone 2b's results.txt (shear tied to EA at 0.1), for F3 to F5
SPRING = {("A", 800.0): {0.005: 0.3512, 0.0025: 0.2262}, ("A", 3200.0): {0.005: 0.5671, 0.00375: 0.4909, 0.0025: 0.3671},
          ("D", 800.0): {0.005: 0.5456, 0.0025: 0.5709}, ("D", 3200.0): {0.005: 0.6362, 0.00375: 0.6254, 0.0025: 0.6320}}


def main(part):
    out = []
    if part in ("all", "cantilever"):
        with mp.Pool() as pool:
            cr = dict(pool.map(cant_one, CANT))
        out += ["milestone 3a part 1: heavy cantilever, FEM tip drop / l against the exact elastica",
                "fabric L_over_c EA elements drop elastica err_pct_of_l iters sec"]
        for c in CANT:
            r = cr[c]
            out.append(f"{c[0]} {c[1]:g} {c[2]:g} {c[3]} {r['drop']:.5f} {r['ref']:.5f} {100*r['err']:+.3f} {r['iters']} {r['sec']:.1f}")
        e32 = [abs(cr[c]["err"]) for c in CANT if c[3] == 32]
        out.append(f"F1 max |err| at 32 elements {100*max(e32):.3f}% of l: {'held' if max(e32) < 0.01 else 'refuted'}")
        spans = []
        for f in FABRICS:
            for L in (2.0, 4.0):
                d = [cr[(f, L, ea, 32)]["drop"] for ea in EAS]
                spans.append(max(d) - min(d))
                out.append(f"F2 {f} L={L:g}: EA span of 32-element drop {100*(max(d)-min(d)):.3f}% of l")
        out.append(f"F2 {'held' if max(spans) < 0.005 else 'refuted'}")
        out.append("")
    if part in ("all", "cusick"):
        res = {}
        order = sorted(CUS, key=lambda c: (c[2], -c[1]))
        t0 = time.time()
        with mp.Pool() as pool:
            for c, r in pool.imap_unordered(cus_one, order):
                res[c] = r
                print(c, f"{r['dc']:.4f} {r['iters']} {r['sec']:.0f}s", flush=True)
        out += ["milestone 3a part 2: simulated Cusick DC on the FEM tier",
                "fabric EA a_mm shear nodes DC iters last_change folds sec"]
        for c in CUS:
            r = res[c]
            out.append(f"{c[0]} {c[1]:g} {c[2]*1000:g} {c[3]} {r['n']} {r['dc']:.4f} {r['iters']} {r['last']:.5f} {r['folds']} {r['sec']:.0f}")
        out += ["", "fabric EA (measured G) " + " ".join(f"DC@{a*1000:g}mm" for a in AS)]
        for f in FABRICS:
            for ea in EAS:
                out.append(f"{f} {ea:g} " + " ".join(f"{dcv(res, f, ea, a):.4f}" for a in AS))
        out.append("")
        v = []
        for f in FABRICS:
            d = dcv(res, f, 3200.0, 0.0025) - dcv(res, f, 3200.0, 0.00375)
            v.append(abs(d) < 0.03)
            out.append(f"F3 {f}: DC(2.5 mm) - DC(3.75 mm) at EA 3200 {d:+.4f} (spring sheet {SPRING[(f, 3200.0)][0.0025]-SPRING[(f, 3200.0)][0.00375]:+.4f})")
        f3 = all(v)
        out.append(f"F3 {'held' if f3 else 'refuted'}")
        v = []
        for f in FABRICS:
            d = dcv(res, f, 3200.0, 0.0025) - dcv(res, f, 800.0, 0.0025)
            v.append(abs(d) < 0.03)
            out.append(f"F4 {f}: DC(3200) - DC(800) at 2.5 mm {d:+.4f} (spring sheet {SPRING[(f, 3200.0)][0.0025]-SPRING[(f, 800.0)][0.0025]:+.4f})")
        f4 = all(v)
        out.append(f"F4 {'held' if f4 else 'refuted'}")
        for f in FABRICS:
            for ea in (800.0, 3200.0):
                fe = dcv(res, f, ea, 0.0025, "tied") - dcv(res, f, ea, 0.005, "tied")
                sp = SPRING[(f, ea)][0.0025] - SPRING[(f, ea)][0.005]
                out.append(f"tied shear {f} EA {ea:g}: 5 -> 2.5 mm FEM {fe:+.4f}, spring {sp:+.4f}; "
                           f"FEM {dcv(res, f, ea, 0.005, 'tied'):.4f}/{dcv(res, f, ea, 0.0025, 'tied'):.4f}")
        fe = dcv(res, "A", 3200.0, 0.0025, "tied") - dcv(res, "A", 3200.0, 0.005, "tied")
        out.append(f"F5 A: |FEM change| {abs(fe):.4f} against half the spring sheet's {0.5*abs(SPRING[('A', 3200.0)][0.0025]-SPRING[('A', 3200.0)][0.005]):.4f}: "
                   f"{'held' if abs(fe) < 0.5 * abs(SPRING[('A', 3200.0)][0.0025]-SPRING[('A', 3200.0)][0.005]) else 'refuted'}")
        ok = all(dcv(res, "A", ea, a) < dcv(res, "D", ea, a) for ea in EAS for a in AS)
        out.append(f"F6 A < D at every EA and mesh: {'held' if ok else 'refuted'}")
        out.append(f"acceptance (F3 and F4): {'passed' if f3 and f4 else 'failed'}")
        out.append(f"wall {time.time()-t0:.0f}s")
    name = "results.txt" if part == "all" else f"results_{part}.txt"
    (HERE / name).write_text("\n".join(out) + "\n")
    print("\n".join(out))


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--part", default="all", choices=("all", "cantilever", "cusick"))
    main(ap.parse_args().part)
