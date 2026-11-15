"""Milestone 3e: a pooled cross-mesh lowest-energy rule for the Cusick drape coefficient, on one solver.

    python3 experiments/m3e_pooled/run.py --phase chains     (about 1.5 hours on 4 cores; resumable)
    python3 experiments/m3e_pooled/run.py --phase transfer   (about 1 hour on 4 cores; resumable)
    python3 experiments/m3e_pooled/run.py --phase report     (seconds: results.txt, results.json)
    python3 experiments/m3e_pooled/run.py --quick            (7.5 and 5 mm, seeds 0 and 1, minutes)

Why: milestone 3d registered a selection rule (the drape coefficient, DC, of the lowest-energy of
seven seeds per fabric, lattice and stretch stiffness EA) and it failed its acceptance test on the
suiting (D: +0.0205 from 2.5 to 1.875 mm at 1896 N/m, bar 0.01), because none of the seven 1.875 mm
seeds found the 7-fold pattern that was lowest at 2.5 mm. Post hoc, that 2.5 mm state carried onto
1.875 mm and re-solved stayed 7-fold and was the lowest state found there. So the rule failed by
sampling, and 3d's Next (a2) is to register the pooled version and test it. 3d also mixed solvers
(its 2.5 mm column was 3c's coloured Hessian, the other two the local one); here every lattice uses
3d's element-local Hessian Newton, so mesh and solver are no longer confounded.

Method (3a's `Disc` and element, measured KES shear, 3c's start, stage and record, 3d's LocalNewton;
nothing in the physics changes):
  Phase 1 (chains). Seeds 0 to 6, chains A 150 -> 254 -> 369 and D 150 -> 800 -> 1341 -> 1896 N/m, on
  the 3.75, 2.5 and 1.875 mm lattices; every stage recorded as in 3d, the end state at the garment-
  load stiffness (A 369, D 1896 N/m) saved. To save about 110 core-minutes, the 1.875 mm suiting runs
  only seeds 0, 1 and 2: in 3d its seven seeds collapsed to three states with identical energies
  ({0, 5}, {2, 4, 6}, {1, 3}), so seeds 3 to 6 are taken from 3d's results.json if T1 holds for the
  three that are rerun (if it does not, the report says so and uses only rerun seeds).
  Phase 2 (transfer). For each fabric at its garment-load EA, each target lattice L, and each distinct
  converged end state on each other lattice (distinct: fold count differs or energy differs by more
  than 1e-9 relative), interpolate the state's displacement from its rest mesh onto L's rest nodes
  (piecewise linear, nearest outside the hull, clamped nodes reset: 3d's post hoc transfer) and solve
  one stage at that EA with the same Newton settings.
  Rule (registered here, before any phase-1 or phase-2 solve of this script): on each lattice the
  reported DC is that of the lowest-energy converged state among that lattice's own seed end states
  and all states transferred onto it. Energies are compared only within a lattice.

Predictions (written before the first run of this script; LOG.md, 2026-11-15, milestone 3e):
  T1  Reproduction: the rerun 3.75 and 1.875 mm chains match 3d's rows at every stage (same fold
      count, DC within 0.002) in all rerun chains but at most one.
  T2  Acceptance: the pooled lowest-energy DC moves by less than 0.01 from 2.5 to 1.875 mm at both
      garment-load cases (A 369, D 1896 N/m).
  T3  It also moves by less than 0.01 from 3.75 to 2.5 mm at both.
  T4  On D the pooled lowest state on the 2.5 and 1.875 mm lattices has 7 folds. (Not blind: 3d's
      post hoc found a 7-fold state lowest on 1.875 mm.)
  T5  A transferred state keeps its source fold count after re-solving in at least 75% of transfers.
  T6  Pooling changes the answer: in at least 2 of the 6 (fabric, lattice) cells the pooled lowest
      is a transferred state, not one of the lattice's own seeds.
  T7  With one solver throughout, the seed-mean DC changes by less than 0.01 from 2.5 to 1.875 mm at
      both garment-load cases.
Acceptance for the milestone is T2: a mesh-flat selection rule is what calibration against a
measured drape coefficient and node count (milestone 4) needs.
"""
import argparse
import importlib.util
import json
import multiprocessing as mp
import time
from pathlib import Path

import numpy as np
from scipy.interpolate import LinearNDInterpolator, NearestNDInterpolator

HERE = Path(__file__).resolve().parent
EXP = HERE.parent
_s = importlib.util.spec_from_file_location("m3d_run", EXP / "m3d_local_hessian" / "run.py")
m3d = importlib.util.module_from_spec(_s)          # 3d's run.py, loaded under its own name
_s.loader.exec_module(m3d)                         # (it imports 3a's run.py as "run")
m3c, m3, fem, localhess = m3d.m3c, m3d.m3, m3d.fem, m3d.localhess

CHAIN = m3c.CHAIN
TOP = m3c.TOP                                      # {"A": 369.0, "D": 1896.0}
SEEDS = m3c.SEEDS
LATS = (0.00375, 0.0025, 0.001875)
QLATS = (0.0075, 0.005)
SKIP = {("D", 0.001875): (3, 4, 5, 6)}             # taken from 3d if T1 holds
TWINS = {3: 1, 4: 2, 5: 0, 6: 2}                   # 3d's identical-energy groups on D at 1.875 mm


def mm(a):
    return f"{a * 1000:g}"


def chain_job(job):
    f, a, seed, cache = job
    out = Path(cache) / f"chain_{f}_{mm(a)}_{seed}.json"
    if out.exists():
        return json.loads(out.read_text())
    sp = m3.Disc(f, CHAIN[f][0], a, "kes")
    X = sp.start(seed)
    nw, w = localhess.LocalNewton(sp, X), fem.GRAV * sp.mass.max()
    rows = []
    # per-stage checkpoint: the solver keeps no state between stages, so resuming from the saved
    # positions is exact. (Names are built as strings: Path.with_suffix would read "1.875_0" as a
    # suffix and make every seed's checkpoint the same file, a bug the first launch hit.)
    base = f"partial_{f}_{mm(a)}_{seed}"
    pj = Path(cache) / f"{base}.json"
    pz = lambda k: Path(cache) / f"{base}_stage{k}.npy"
    if pj.exists():
        rows = json.loads(pj.read_text())
        X = np.load(pz(len(rows) - 1))
    for ea in CHAIN[f][len(rows):]:
        t = time.time()
        sp.EA = ea
        X, info = m3c.stage(sp, nw, w, X)
        r = m3c.record(sp, nw, w, X, info, f=f, a=a, seed=seed, ea=ea, sec=time.time() - t)
        print(f"chain {f} {mm(a)}mm seed {seed} EA {ea:g}: DC {r['dc']:.4f} folds {r['folds']} "
              f"E {r['energy']:.8e} lam {r['lam']} steps {r['steps']} {r['sec']:.0f}s", flush=True)
        rows.append(r)
        np.save(pz(len(rows) - 1), X)                        # positions first, then the row list
        tmp = Path(cache) / f"{base}.json.tmp"               # that names them, by rename, so a kill
        tmp.write_text(json.dumps(rows))                     # mid-write leaves the last good stage
        tmp.replace(pj)
    np.savez_compressed(Path(cache) / f"state_{f}_{mm(a)}_{seed}.npz", X=X)
    out.write_text(json.dumps(rows))
    return rows


def transfer(src_sp, X, tg):
    """3d post hoc's transfer: displacement interpolated on the rest mesh, clamped nodes reset."""
    U = X - src_sp.X0
    D = LinearNDInterpolator(src_sp.P, U)(tg.P)
    bad = np.isnan(D).any(1)
    D[bad] = NearestNDInterpolator(src_sp.P, U)(tg.P[bad])
    Y = tg.X0 + D
    Y[tg.fixed] = tg.X0[tg.fixed]
    return Y, int(bad.sum())


def transfer_job(job):
    f, a_src, seed, a_tg, cache = job
    out = Path(cache) / f"xfer_{f}_{mm(a_src)}_{seed}_to_{mm(a_tg)}.json"
    if out.exists():
        return json.loads(out.read_text())
    t = time.time()
    ea = TOP[f]
    src = m3.Disc(f, ea, a_src, "kes")
    X = np.load(Path(cache) / f"state_{f}_{mm(a_src)}_{seed}.npz")["X"]
    tg = m3.Disc(f, ea, a_tg, "kes")
    Y, nout = transfer(src, X, tg)
    nw, w = localhess.LocalNewton(tg, Y), fem.GRAV * tg.mass.max()
    Y, info = m3c.stage(tg, nw, w, Y)
    r = m3c.record(tg, nw, w, Y, info, f=f, a=a_tg, seed=seed, ea=ea, src_a=a_src,
                   sec=time.time() - t, n_outside_hull=nout)
    print(f"xfer {f} {mm(a_src)}->{mm(a_tg)}mm seed {seed}: DC {r['dc']:.4f} folds {r['folds']} "
          f"E {r['energy']:.8e} lam {r['lam']} steps {r['steps']} {r['sec']:.0f}s", flush=True)
    out.write_text(json.dumps(r))
    return r


def distinct(rows):
    """One representative per distinct converged state (fold count, energy to 1e-9 relative)."""
    keep = []
    for r in sorted((r for r in rows if r["conv"]), key=lambda r: (r["energy"], r["seed"])):
        if not any(k["folds"] == r["folds"] and abs(k["energy"] - r["energy"]) <= 1e-9 * abs(r["energy"])
                   for k in keep):
            keep.append(r)
    return keep


def load_chains(cache, lats, quick):
    rows = []
    for p in sorted(Path(cache).glob("chain_*.json")):
        rows += json.loads(p.read_text())
    return [r for r in rows if r["a"] in lats]


def top_rows(rows):
    return [r for r in rows if r["ea"] == TOP[r["f"]]]


def transfer_jobs(cache, lats):
    ends = top_rows(load_chains(cache, lats, False))
    jobs = []
    for f in CHAIN:
        for a_src in lats:
            for r in distinct([r for r in ends if (r["f"], r["a"]) == (f, a_src)]):
                jobs += [(f, a_src, r["seed"], a_tg, str(cache)) for a_tg in lats if a_tg != a_src]
    jobs.sort(key=lambda j: -1 / j[3])            # finest target first
    return jobs


def report(cache, lats, quick):
    t0 = time.time()
    rows = load_chains(cache, lats, quick)
    xf = [json.loads(p.read_text()) for p in sorted(Path(cache).glob("xfer_*.json"))]
    xf = [r for r in xf if r["a"] in lats and r["src_a"] in lats]
    o = [f"milestone 3e: pooled cross-mesh lowest-energy rule, one solver (local Hessian) on "
         f"{', '.join(mm(a) for a in lats)} mm"]
    o.append("stages: fabric EA a_mm seed nodes DC folds energy_J newton_steps gmax_over_w converged lam_min sec")
    for r in sorted(rows, key=lambda r: (r["a"], r["f"], r["ea"], r["seed"])):
        lam = f"{r['lam']:.2e}" if r["lam"] is not None else "-"
        o.append(f"{r['f']} {r['ea']:g} {mm(r['a'])} {r['seed']} {r['n']} {r['dc']:.4f} {r['folds']} "
                 f"{r['energy']:.8e} {r['steps']} {r['gmax']:.1e} {'yes' if r['conv'] else 'no'} {lam} {r['sec']:.0f}")
    o += ["", "transfers: fabric EA from_mm seed to_mm source_folds DC folds energy_J steps converged lam_min sec"]
    ends = top_rows(rows)
    E = {(r["f"], r["a"], r["seed"]): r for r in ends}
    kept = 0
    for r in sorted(xf, key=lambda r: (r["f"], r["a"], r["src_a"], r["seed"])):
        s = E[(r["f"], r["src_a"], r["seed"])]
        kept += r["conv"] and r["folds"] == s["folds"]
        lam = f"{r['lam']:.2e}" if r["lam"] is not None else "-"
        o.append(f"{r['f']} {r['ea']:g} {mm(r['src_a'])} {r['seed']} {mm(r['a'])} {s['folds']} {r['dc']:.4f} "
                 f"{r['folds']} {r['energy']:.8e} {r['steps']} {'yes' if r['conv'] else 'no'} {lam} {r['sec']:.0f}")
    res = dict(rows=rows, transfers=xf)
    if quick:
        (HERE / "results_quick.json").write_text(json.dumps(res, indent=1))
        (HERE / "results_quick.txt").write_text("\n".join(o) + "\n")
        print("\n".join(o))
        return
    # T1: reproduction of 3d's local-Hessian rows
    old = json.loads((EXP / "m3d_local_hessian" / "results.json").read_text())["rows"]
    key = lambda r: (r["f"], r["ea"], r["a"], r["seed"])
    O = {key(r): r for r in old}
    rep = [r for r in rows if r["a"] in (0.00375, 0.001875)]
    chains = sorted({(r["f"], r["a"], r["seed"]) for r in rep})
    same = 0
    o += ["", "T1 per rerun chain (fabric a_mm seed): stages matching 3d (same folds, |dDC| <= 0.002), max |dDC|, max |dE| J"]
    for c in chains:
        st = [r for r in rep if (r["f"], r["a"], r["seed"]) == c]
        ok = [r["folds"] == O[key(r)]["folds"] and abs(r["dc"] - O[key(r)]["dc"]) <= 0.002 for r in st]
        same += all(ok) and len(ok) == len(CHAIN[c[0]])
        o.append(f"   {c[0]} {mm(c[1])} {c[2]}: {sum(ok)} of {len(st)}, "
                 f"{max(abs(r['dc'] - O[key(r)]['dc']) for r in st):.4f}, "
                 f"{max(abs(r['energy'] - O[key(r)]['energy']) for r in st):.2e}")
    t1 = same >= len(chains) - 1
    o.append(f"T1 chains reproduced at every stage: {same} of {len(chains)}: {'held' if t1 else 'refuted'}")
    # the D 1.875 mm seeds not rerun: from 3d, only if T1 held for the rerun ones
    own = {}
    for f in CHAIN:
        for a in lats:
            rs = [r for r in ends if (r["f"], r["a"]) == (f, a)]
            if (f, a) in SKIP and t1:
                rs += [dict(O[(f, TOP[f], a, s)], from_3d=True) for s in SKIP[(f, a)]]
            own[(f, a)] = rs
    o += ["", "cells at garment-load EA: fabric EA a_mm | own seeds: n mean_DC sd lowE_DC lowE_seed lowE_folds fold_counts "
              "| pooled: n_candidates lowE_DC lowE_folds lowE_from lowE_minus_own_lowE_J"]
    P, M = {}, {}
    pooled_is_xfer = 0
    for f in CHAIN:
        for a in lats:
            rs = [r for r in own[(f, a)] if r["conv"]]
            lo = min(rs, key=lambda r: r["energy"])
            cand = rs + [r for r in xf if (r["f"], r["a"]) == (f, a) and r["conv"]]
            pl = min(cand, key=lambda r: r["energy"])
            isx = "src_a" in pl
            pooled_is_xfer += isx
            dcs = [r["dc"] for r in rs]
            M[(f, a)], P[(f, a)] = float(np.mean(dcs)), pl
            frm = f"{mm(pl['src_a'])} mm seed {pl['seed']}" if isx else f"own seed {pl['seed']}"
            o.append(f"{f} {TOP[f]:g} {mm(a)} | {len(rs)} {np.mean(dcs):.4f} {np.std(dcs, ddof=1):.4f} {lo['dc']:.4f} "
                     f"{lo['seed']} {lo['folds']} {sorted(r['folds'] for r in rs)} | {len(cand)} {pl['dc']:.4f} "
                     f"{pl['folds']} {frm} {pl['energy'] - lo['energy']:+.3e}")
    fine, mid, coarse = 0.001875, 0.0025, 0.00375
    d2 = {f: P[(f, fine)]["dc"] - P[(f, mid)]["dc"] for f in CHAIN}
    d3 = {f: P[(f, mid)]["dc"] - P[(f, coarse)]["dc"] for f in CHAIN}
    t2 = all(abs(v) < 0.01 for v in d2.values())
    t3 = all(abs(v) < 0.01 for v in d3.values())
    o.append("")
    o.append("T2 pooled lowest-energy DC(1.875) - DC(2.5): " + ", ".join(f"{f} {TOP[f]:g} {v:+.4f}" for f, v in d2.items())
             + f": {'held' if t2 else 'refuted'}")
    o.append("T3 pooled lowest-energy DC(2.5) - DC(3.75): " + ", ".join(f"{f} {TOP[f]:g} {v:+.4f}" for f, v in d3.items())
             + f": {'held' if t3 else 'refuted'}")
    t4 = all(P[("D", a)]["folds"] == 7 for a in (mid, fine))
    o.append(f"T4 D pooled lowest folds at 2.5, 1.875 mm: {P[('D', mid)]['folds']}, {P[('D', fine)]['folds']}: "
             f"{'held' if t4 else 'refuted'}")
    t5 = kept >= 0.75 * len(xf)
    o.append(f"T5 transfers keeping source fold count: {kept} of {len(xf)}: {'held' if t5 else 'refuted'}")
    t6 = pooled_is_xfer >= 2
    o.append(f"T6 cells whose pooled lowest is a transfer: {pooled_is_xfer} of 6: {'held' if t6 else 'refuted'}")
    dm = {f: M[(f, fine)] - M[(f, mid)] for f in CHAIN}
    t7 = all(abs(v) < 0.01 for v in dm.values())
    o.append("T7 seed-mean DC(1.875) - DC(2.5), one solver: " + ", ".join(f"{f} {TOP[f]:g} {v:+.4f}" for f, v in dm.items())
             + f": {'held' if t7 else 'refuted'}")
    dmc = {f: M[(f, mid)] - M[(f, coarse)] for f in CHAIN}
    o.append("(unscored) seed-mean DC(2.5) - DC(3.75), one solver: " + ", ".join(f"{f} {v:+.4f}" for f, v in dmc.items()))
    neg = [r for r in rows + xf if r["conv"] and r["lam"] is not None and r["lam"] <= 0]
    o.append(f"(unscored) converged states with lam_min <= 0: {len(neg)} of {sum(r['conv'] for r in rows + xf)}")
    nc = [r for r in rows + xf if not r["conv"]]
    o.append(f"(unscored) unconverged stages or transfers: {len(nc)}")
    o.append(f"acceptance (T2): {'passed' if t2 else 'failed'}")
    res["pooled"] = {f"{f} {mm(a)}": P[(f, a)] for (f, a) in P}
    res["seed_mean"] = {f"{f} {mm(a)}": M[(f, a)] for (f, a) in M}
    (HERE / "results.json").write_text(json.dumps(res, indent=1))
    (HERE / "results.txt").write_text("\n".join(o) + "\n")
    print("\n".join(o))
    print(f"report {time.time() - t0:.1f}s")


def main(phase, quick, cache):
    cache = Path(cache)
    cache.mkdir(parents=True, exist_ok=True)
    lats = QLATS if quick else LATS
    seeds = SEEDS[:2] if quick else SEEDS
    if quick:
        phases = ("chains", "transfer", "report")
    else:
        phases = (phase,)
    for ph in phases:
        if ph == "chains":
            jobs = [(f, a, s, str(cache)) for a in sorted(lats) for f in ("D", "A") for s in seeds
                    if quick or s not in SKIP.get((f, a), ())]
            with mp.Pool(4) as pool:
                list(pool.imap_unordered(chain_job, jobs, chunksize=1))
        elif ph == "transfer":
            with mp.Pool(4) as pool:
                list(pool.imap_unordered(transfer_job, transfer_jobs(cache, lats), chunksize=1))
        else:
            report(cache, lats, quick)


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--phase", choices=("chains", "transfer", "report"), default="report")
    ap.add_argument("--quick", action="store_true")
    ap.add_argument("--cache", default=None)
    a = ap.parse_args()
    main(a.phase, a.quick, a.cache or str(HERE / ("cache_quick" if a.quick else "cache")))
