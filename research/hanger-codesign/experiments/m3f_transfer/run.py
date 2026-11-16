"""Milestone 3f: is the pooled rule's transfer step sound at the rim? An affine (rim-aware) transfer.

    python3 experiments/m3f_transfer/chains.py              (phase 1: the jersey's source states, ~85 min)
    python3 experiments/m3f_transfer/run.py --phase starts  (seconds per transfer: start energies, both transfers)
    python3 experiments/m3f_transfer/run.py --phase transfer (the affine transfers, ~2.5 h on 4 cores; resumable)
    python3 experiments/m3f_transfer/run.py --phase report   (seconds: results.txt, results.json)

Why: milestone 3e's pooled lowest-energy rule passed its mesh test, but its log flagged that many
jersey (A) transfers converged to minima well above the target lattice's own seeds (up to 6.4e-4 J,
against a seed spread of about 2e-5 J) and 7 of 42 hit the 400-step cap, and guessed "likely the
nearest-node rim fill, unchecked". 3e's transfer interpolates the displacement linearly inside the
source mesh's hull and copies the nearest source node's displacement outside it. Each lattice is cut at
R_SPEC + a/2, so a coarser target reaches further out than a finer source, and its outermost ring takes
a displacement that, added to its own rest position, puts it about a/2 horizontally outward of a rim that
hangs nearly vertical: a kink at the free edge. Read from 3e's results.json before this script was
written (not a result of this step): transfers from the 3.75 mm lattice (24 to 27 target nodes outside
the source hull) were never flagged (0 of 26), transfers from 2.5 and 1.875 mm (65 to 139 outside) were
flagged in 27 of 44, on both fabrics.

Method. Phase 1 rebuilds the jersey's 21 garment-load end states with 3e's chain_job, unchanged (3e
kept them only in a gitignored cache). Phase 2 re-runs every jersey transfer of 3e (same jobs, from
3e's transfer_jobs) with one change, the affine transfer: a target node inside the source hull gets the
same piecewise-linear interpolation as 3e (positions interpolated barycentrically, identical to
interpolating displacement) when it lies in one of the source's own elements; any other node (outside
the source's convex hull, or inside the hull but in one of the rim's concave notches, where 3e's
Delaunay interpolation used sliver triangles that are not elements) gets the affine extension of the deformed source element
that contains it best (among the triangles at its nearest source node, the one whose smallest
barycentric coordinate is largest), so the rim continues along the cloth's own deformed tangent plane.
Clamped nodes reset, then 3e's stage (same Newton, same cap) at A's garment-load EA, 369 N/m. The
"starts" phase also evaluates the energy of each transfer's start state under both transfers.
The suiting (D) is not rerun: its flagged transfers sit 0.4e-4 to 3.2e-4 J high, none capped, and its
1.875 mm chains are the costliest; that is a limit, not a finding.

Predictions (written before any phase-2 solve, and before phase 1 finished; LOG.md, 2026-11-16):
  P1  Reproduction: all 21 rebuilt A end states match 3e's rows (same folds, energy within 1e-12 relative).
  P2  Acceptance: with the affine transfer no A transfer hits the 400-step cap (3e: 7 of 42).
  P3  Of the 19 A transfers 3e flagged (capped, or converged more than 1e-5 J above the target lattice's
      highest own seed), at least 15 now converge within that bound.
  P4  The affine start state has lower energy than 3e's start in every transfer with at least 60 nodes
      outside the source hull (28 of the 42).
  P5  Transfers from 3.75 mm (24 to 27 nodes outside, none flagged in 3e) mostly do not move: at least
      12 of 14 end with 3e's fold count and within 2e-6 J of 3e's energy.
  P6  The pooled rule, recomputed with the affine transfers in place of 3e's (own seeds unchanged), gives
      an A DC within 0.005 of 3e's on every lattice, and still moves less than 0.01 from 2.5 to 1.875 mm.
  P7  Median Newton steps per transfer fall by at least 20% (3e: median over the 42).
Acceptance is P2 with P3: a transfer that lands its states in the target's own energy band is what
makes "pooled lowest" a statement about fold patterns rather than about rim repair.
"""
import argparse
import importlib.util
import json
import multiprocessing as mp
import sys
import time
from pathlib import Path

import numpy as np
from scipy.spatial import cKDTree

HERE = Path(__file__).resolve().parent
EXP = HERE.parent
_s = importlib.util.spec_from_file_location("m3e_run", EXP / "m3e_pooled" / "run.py")
m3e = importlib.util.module_from_spec(_s)
sys.modules["m3e_run"] = m3e                      # so pool workers can pickle what they need
_s.loader.exec_module(m3e)
m3, m3c, fem, localhess, mm = m3e.m3, m3e.m3c, m3e.fem, m3e.localhess, m3e.mm

F = "A"
EA = m3e.TOP[F]
LATS = m3e.LATS
FLAG_TOL = 1e-5                                    # J above the target's highest own seed


def bary(P, tri, q):
    """Barycentric coordinates of points q (m, 2) in triangles tri (m, 3) of rest positions P."""
    a, b, c = P[tri[:, 0]], P[tri[:, 1]], P[tri[:, 2]]
    v0, v1, v2 = b - a, c - a, q - a
    d = v0[:, 0] * v1[:, 1] - v0[:, 1] * v1[:, 0]
    l1 = (v2[:, 0] * v1[:, 1] - v2[:, 1] * v1[:, 0]) / d
    l2 = (v0[:, 0] * v2[:, 1] - v0[:, 1] * v2[:, 0]) / d
    return np.column_stack([1 - l1 - l2, l1, l2])


def affine_transfer(src, X, tg):
    """Positions on tg's rest nodes: barycentric inside a source element (src.T), otherwise the affine
    extension of the best source element near the nearest source node. Returns (Y, nodes outside)."""
    Y = np.empty((tg.n, 3))
    inc = [[] for _ in range(src.n)]
    for k, t in enumerate(src.T):
        for i in t:
            inc[i].append(k)
    near = cKDTree(src.P).query(tg.P)[1]
    nout = 0
    for j in range(tg.n):
        # candidates: elements at the nearest node and at its neighbours (covers interior points)
        cand = set(inc[near[j]])
        for k in list(cand):
            for i in src.T[k]:
                cand.update(inc[i])
        cand = np.fromiter(cand, int)
        L = bary(src.P, src.T[cand], np.repeat(tg.P[j][None], len(cand), 0))
        k = int(np.argmax(L.min(1)))
        nout += L[k].min() < -1e-9
        Y[j] = L[k] @ X[src.T[cand[k]]]
    Y[tg.fixed] = tg.X0[tg.fixed]
    return Y, int(nout)


def energy(sp, Y):
    return float(sp.energy_grad(Y[sp.free].ravel(), Y)[0])


def jobs(cache):
    return [j for j in m3e.transfer_jobs(cache, LATS) if j[0] == F]


def start_job(job):
    f, a_src, seed, a_tg, cache = job
    src, tg = m3.Disc(f, EA, a_src, "kes"), m3.Disc(f, EA, a_tg, "kes")
    X = np.load(Path(cache) / f"state_{f}_{mm(a_src)}_{seed}.npz")["X"]
    Y0, n0 = m3e.transfer(src, X, tg)
    Y1, n1 = affine_transfer(src, X, tg)
    out = tg.rho0 > 0.15 - 0.5 * a_tg                        # outer ring (R_SPEC 0.15 m)
    return dict(f=f, src_a=a_src, seed=seed, a=a_tg, n_outside=n1, n_outside_3e=n0,
                e_start_3e=energy(tg, Y0), e_start_affine=energy(tg, Y1),
                max_move_mm=float(1000 * np.abs(Y1 - Y0).max()),
                rim_move_mm=float(1000 * np.linalg.norm(Y1 - Y0, axis=1)[out].mean()))


def transfer_job(job):
    f, a_src, seed, a_tg, cache = job
    out = Path(cache) / f"affine_{f}_{mm(a_src)}_{seed}_to_{mm(a_tg)}.json"
    if out.exists():
        return json.loads(out.read_text())
    t = time.time()
    src, tg = m3.Disc(f, EA, a_src, "kes"), m3.Disc(f, EA, a_tg, "kes")
    X = np.load(Path(cache) / f"state_{f}_{mm(a_src)}_{seed}.npz")["X"]
    Y, nout = affine_transfer(src, X, tg)
    nw, w = localhess.LocalNewton(tg, Y), fem.GRAV * tg.mass.max()
    Y, info = m3c.stage(tg, nw, w, Y)
    r = m3c.record(tg, nw, w, Y, info, f=f, a=a_tg, seed=seed, ea=EA, src_a=a_src,
                   sec=time.time() - t, n_outside_hull=nout)
    print(f"affine {f} {mm(a_src)}->{mm(a_tg)}mm seed {seed}: DC {r['dc']:.4f} folds {r['folds']} "
          f"E {r['energy']:.8e} steps {r['steps']} conv {r['conv']} {r['sec']:.0f}s", flush=True)
    out.write_text(json.dumps(r))
    return r


def report(cache):
    old = json.loads((EXP / "m3e_pooled" / "results.json").read_text())
    O = {(r["a"], r["seed"]): r for r in old["rows"] if r["f"] == F and r["ea"] == EA}
    OX = {(r["src_a"], r["seed"], r["a"]): r for r in old["transfers"] if r["f"] == F}
    o = [f"milestone 3f: affine (rim-aware) transfer against 3e's nearest-fill transfer, fabric {F}, EA {EA:g} N/m"]
    # P1
    new = {}
    for p in sorted(Path(cache).glob(f"chain_{F}_*.json")):
        for r in json.loads(p.read_text()):
            if r["ea"] == EA:
                new[(r["a"], r["seed"])] = r
    o.append("P1 rebuilt end states: a_mm seed folds(3e) energy(3e) energy(3f) rel_diff")
    p1 = 0
    for k in sorted(O):
        r, s = new.get(k), O[k]
        if r is None:
            o.append(f"   {mm(k[0])} {k[1]}: missing")
            continue
        d = abs(r["energy"] - s["energy"]) / abs(s["energy"])
        ok = r["folds"] == s["folds"] and d <= 1e-12
        p1 += ok
        o.append(f"   {mm(k[0])} {k[1]} {s['folds']} {s['energy']:.10e} {r['energy']:.10e} {d:.1e}")
    o.append(f"P1 reproduced: {p1} of {len(O)}: {'held' if p1 == len(O) else 'refuted'}")
    # starts
    st = json.loads((HERE / "starts.json").read_text())
    S = {(r["src_a"], r["seed"], r["a"]): r for r in st}
    # transfers
    xf = {(r["src_a"], r["seed"], r["a"]): r for r in
          (json.loads(p.read_text()) for p in Path(cache).glob(f"affine_{F}_*.json"))}
    hi = {a: max(s["energy"] for (aa, _), s in O.items() if aa == a and s["conv"]) for a in LATS}
    lo = {a: min(s["energy"] for (aa, _), s in O.items() if aa == a and s["conv"]) for a in LATS}
    flagged = lambda r: (not r["conv"]) or r["energy"] > hi[r["a"]] + FLAG_TOL
    o += ["", "transfers: from_mm seed to_mm n_outside | 3e: start_E end_E folds steps conv flagged | "
              "affine: start_E end_E folds steps conv flagged DC | end_E_minus_target_lowest_seed (3e, affine) J"]
    cap_new = cap_old = 0
    fl_old, fl_fixed, p4n, p4, p5n, p5 = 0, 0, 0, 0, 0, 0
    steps_old, steps_new = [], []
    for k in sorted(OX, key=lambda k: (k[2], k[0], k[1])):
        a, n = OX[k], xf.get(k)
        s = S[k]
        if n is None:
            o.append(f"{mm(k[0])} {k[1]} {mm(k[2])}: affine not run")
            continue
        cap_old += not a["conv"]
        cap_new += n["steps"] >= m3c.CAP - 1 and not n["conv"]
        steps_old.append(a["steps"])
        steps_new.append(n["steps"])
        if flagged(a):
            fl_old += 1
            fl_fixed += not flagged(n)
        if k[0] != 0.00375:
            p4n += 1
            p4 += s["e_start_affine"] < s["e_start_3e"]
        if k[0] == 0.00375:
            p5n += 1
            p5 += n["folds"] == a["folds"] and abs(n["energy"] - a["energy"]) <= 2e-6
        o.append(f"{mm(k[0])} {k[1]} {mm(k[2])} {s['n_outside']} | {s['e_start_3e']:.6e} {a['energy']:.8e} {a['folds']} "
                 f"{a['steps']} {'yes' if a['conv'] else 'no'} {'F' if flagged(a) else '-'} | {s['e_start_affine']:.6e} "
                 f"{n['energy']:.8e} {n['folds']} {n['steps']} {'yes' if n['conv'] else 'no'} {'F' if flagged(n) else '-'} "
                 f"{n['dc']:.4f} | {a['energy'] - lo[k[2]]:+.2e} {n['energy'] - lo[k[2]]:+.2e}")
    o.append("")
    o.append(f"P2 affine transfers at the step cap: {cap_new} of {len(xf)} (3e: {cap_old} of {len(OX)}): "
             f"{'held' if cap_new == 0 else 'refuted'}")
    o.append(f"P3 3e-flagged transfers now within the target's own band + {FLAG_TOL:g} J: {fl_fixed} of {fl_old}: "
             f"{'held' if fl_fixed >= 15 else 'refuted'}")
    o.append(f"P4 affine start below 3e's start, transfers from 2.5 and 1.875 mm: {p4} of {p4n}: "
             f"{'held' if p4 == p4n else 'refuted'}")
    o.append(f"P5 3.75 mm-sourced transfers unchanged (folds, |dE| <= 2e-6 J): {p5} of {p5n}: "
             f"{'held' if p5 >= 12 else 'refuted'}")
    # P6 pooled
    pool = {}
    o.append("P6 pooled lowest-energy DC per lattice: a_mm 3e(DC folds from) affine(DC folds from)")
    for a in LATS:
        own = [s for (aa, _), s in O.items() if aa == a and s["conv"]]
        c_new = min(own + [r for r in xf.values() if r["a"] == a and r["conv"]], key=lambda r: r["energy"])
        c_old = old["pooled"][f"{F} {mm(a)}"]
        pool[a] = c_new
        fr = lambda r: f"{mm(r['src_a'])} mm seed {r['seed']}" if "src_a" in r else f"own seed {r['seed']}"
        o.append(f"   {mm(a)} {c_old['dc']:.4f} {c_old['folds']} {fr(c_old)} | {c_new['dc']:.4f} {c_new['folds']} {fr(c_new)}")
    dmax = max(abs(pool[a]["dc"] - old["pooled"][f"{F} {mm(a)}"]["dc"]) for a in LATS)
    d2 = pool[0.001875]["dc"] - pool[0.0025]["dc"]
    o.append(f"P6 max |pooled DC change| {dmax:.4f}, pooled DC(1.875) - DC(2.5) {d2:+.4f}: "
             f"{'held' if dmax < 0.005 and abs(d2) < 0.01 else 'refuted'}")
    mo, mn = float(np.median(steps_old)), float(np.median(steps_new))
    o.append(f"P7 median Newton steps 3e {mo:g}, affine {mn:g} ({100 * (mn - mo) / mo:+.0f}%): "
             f"{'held' if mn <= 0.8 * mo else 'refuted'}")
    o.append(f"acceptance (P2 and P3): {'passed' if cap_new == 0 and fl_fixed >= 15 else 'failed'}")
    res = dict(rows=list(new.values()), starts=st, transfers=list(xf.values()),
               pooled={mm(a): pool[a] for a in LATS})
    (HERE / "results.json").write_text(json.dumps(res, indent=1))
    (HERE / "results.txt").write_text("\n".join(o) + "\n")
    print("\n".join(o))


def main(phase, cache):
    cache = Path(cache)
    J = jobs(cache)
    if phase == "starts":
        with mp.Pool(4) as pool:
            st = list(pool.imap(start_job, J, chunksize=1))
        (HERE / "starts.json").write_text(json.dumps(st, indent=1))
        print(f"{len(st)} starts")
    elif phase == "transfer":
        J = sorted(J, key=lambda j: j[3], reverse=True)     # coarse targets first: cheap results early
        with mp.Pool(4) as pool:
            list(pool.imap_unordered(transfer_job, J, chunksize=1))
        print("DONE", flush=True)
    else:
        report(cache)


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--phase", choices=("starts", "transfer", "report"), default="report")
    ap.add_argument("--cache", default=str(HERE / "cache"))
    a = ap.parse_args()
    main(a.phase, a.cache)
