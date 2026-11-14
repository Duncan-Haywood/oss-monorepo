"""Milestone 3d: an element-local Hessian, and a third lattice for the lowest-energy selection rule.

    python3 experiments/m3d_local_hessian/run.py          (about 1.5 hours on 4 cores; numpy, scipy)
    python3 experiments/m3d_local_hessian/run.py --quick  (7.5 mm lattice, seeds 0 and 1, minutes)

Why: milestone 3c left the suiting's (D) Cusick drape coefficient (DC) mesh-dependent as a seed mean
(+0.0325 from 3.75 to 2.5 mm at 1896 N/m, bar 0.03) but flat as the lowest-energy seed (+0.001 to
+0.006), a reading found post hoc. Its Next (a): register a selection rule and test it on a third,
finer lattice (1.875 mm). At 3c's cost (5.1 s per Newton step at 2.5 mm, 85% of it the coloured
finite-difference Hessian; about 10 s at 1.875 mm) that lattice was a 5 to 6 hour job. `localhess.py`
builds the Hessian from element blocks instead (membrane exact, hinges by local central differences);
on two states it matches milestone 3a's coloured Hessian to 2e-10 and 8e-10 in relative Frobenius
norm (checked before this script was written, and in `test_m3d`).

Method:
  Part 0 (agreement). Relative Frobenius and matrix-vector difference between the local and the
  coloured Hessian at the seed-3 start state, fabrics A and D at EA 800, lattices 7.5 and 2.5 mm.
  Part 1 (reproduction). 3c's 3.75 mm part 1 rerun with the local Hessian, nothing else changed:
  3a's `Disc`, measured KES G, start = 5% tilt plus seeded 2 mm noise, Newton gtol 1e-5 node weights,
  cap 400 per stage, chains A 150 -> 254 -> 369 and D 150 -> 800 -> 1341 -> 1896 N/m, seeds 0 to 6
  (14 chains, 49 stages), each end state's DC, fold count, energy and smallest Hessian eigenvalue.
  Compared stage by stage with 3c's committed `results.json`.
  Part 2 (third lattice). The same 14 chains on the 1.875 mm lattice (23,509 nodes).
  Selection rule (registered here, before any 1.875 mm solve): at each fabric, lattice and EA, the
  reported DC is that of the lowest-energy converged end state among the seven seeds (energies are
  compared only within a lattice). The 2.5 mm values come from 3c's results.json: lowest-energy DC
  A 254: 0.1568, A 369: 0.1586, D 1341: 0.5754, D 1896: 0.5807; seed means 0.1608, 0.1624, 0.5976,
  0.6036.

Predictions (written before the first run of this script; LOG.md, 2026-11-14, milestone 3d):
  R1  Speed: the median wall time per Newton step (stage seconds over stage steps, eigenvalue check
      included, as in 3c) on the 3.75 mm lattice is at least 3 times lower than 3c's 1.96 s.
  R2  Reproduction: at least 12 of 14 chains reach, at every stage, the same fold count as 3c and a
      DC within 0.002 of 3c's.
  S1  Acceptance of the rule: the lowest-energy DC moves by less than 0.01 from 2.5 to 1.875 mm at
      all four sourced values (A 254, 369; D 1341, 1896).
  S2  The seed-mean DC on D at 1896 N/m rises again from 2.5 to 1.875 mm, by more than +0.01, and the
      mean D fold count at 1896 is at least 3c's 2.5 mm mean (8.57).
  S3  The seed-mean change from 2.5 to 1.875 mm is under 0.03 at all four sourced values.
  S4  Every part-2 stage converges (98 of 98 in 3c's terms: here 49 of 49).
Acceptance for the milestone is S1: a selection rule that is mesh-flat at the third lattice is what
a calibration against a measured DC (milestone 4) would use.
"""
import argparse
import importlib.util
import json
import multiprocessing as mp
import sys
import time
from pathlib import Path

import numpy as np
import scipy.sparse.linalg as spla

HERE = Path(__file__).resolve().parent
EXP = HERE.parent
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(EXP / "m3_fem_tier"))
import run as m3  # noqa: E402,F401  (milestone 3a's run.py: `Disc`; 3c imports it the same way)
_s = importlib.util.spec_from_file_location("m3c_run", EXP / "m3c_branches" / "run.py")
m3c = importlib.util.module_from_spec(_s)
_s.loader.exec_module(m3c)
import fem  # noqa: E402
import cusick  # noqa: E402
import localhess  # noqa: E402

CHAIN = m3c.CHAIN
SOURCED = m3c.SOURCED
SEEDS = m3c.SEEDS
CAP = m3c.CAP
A_REPRO, A_NEW, A_PREV = 0.00375, 0.001875, 0.0025


def setup(f, ea, a, X):
    sp = m3.Disc(f, ea, a, "kes")
    return sp, localhess.LocalNewton(sp, X), fem.GRAV * sp.mass.max()


def seed_chain(job):
    f, a, seed = job
    sp = m3.Disc(f, CHAIN[f][0], a, "kes")
    X = sp.start(seed)
    nw, w = localhess.LocalNewton(sp, X), fem.GRAV * sp.mass.max()
    out = []
    for ea in CHAIN[f]:
        t = time.time()
        sp.EA = ea
        X, info = m3c.stage(sp, nw, w, X)
        r = m3c.record(sp, nw, w, X, info, f=f, a=a, seed=seed, ea=ea, sec=time.time() - t)
        print(f"{f} {a*1000:g}mm seed {seed} EA {ea:g}: DC {r['dc']:.4f} folds {r['folds']} "
              f"E {r['energy']:.6e} lam {r['lam']} steps {r['steps']} {r['sec']:.0f}s", flush=True)
        out.append(r)
    return out


def agreement():
    out = []
    for f in ("A", "D"):
        for a in (0.0075, 0.0025):
            sp, nw, w = m3c.setup(f, 800.0, a)
            X = sp.start(3)
            v = X[sp.free].ravel()
            grad = lambda u: sp.energy_grad(u, X)[1]
            t = time.time()
            Hf = nw.hessian(grad, v, grad(v), 1e-7)
            tf = time.time() - t
            t = time.time()
            Hl = localhess.hessian(sp, X)
            tl = time.time() - t
            p = np.random.default_rng(0).standard_normal(len(v))
            D = Hf - Hl
            out.append(dict(f=f, a=a, n=sp.n, relF=float(spla.norm(D) / spla.norm(Hf)),
                            relHp=float(np.linalg.norm(D @ p) / np.linalg.norm(Hf @ p)), sec_fd=tf, sec_local=tl))
    return out


def summ(rows, f, ea, a):
    rs = [r for r in rows if (r["f"], r["ea"], r["a"]) == (f, ea, a) and r["conv"]]
    lo = min(rs, key=lambda r: r["energy"])
    return dict(n=len(rs), mean=float(np.mean([r["dc"] for r in rs])),
                sd=float(np.std([r["dc"] for r in rs], ddof=1)) if len(rs) > 1 else 0.0,
                lowE_dc=lo["dc"], lowE_seed=lo["seed"], lowE_folds=lo["folds"],
                mean_folds=float(np.mean([r["folds"] for r in rs])),
                folds=sorted(r["folds"] for r in rs))


def main(quick):
    lats = (0.0075,) if quick else (A_NEW, A_REPRO)
    seeds = SEEDS[:2] if quick else SEEDS
    t0 = time.time()
    ag = [] if quick else agreement()
    jobs = [(f, a, s) for a in lats for f in CHAIN for s in seeds]   # finest lattice first
    with mp.Pool(4) as pool:
        rows = [r for rs in pool.imap_unordered(seed_chain, jobs, chunksize=1) for r in rs]
    tag = "_quick" if quick else ""
    (HERE / f"results{tag}.json").write_text(json.dumps(dict(agreement=ag, rows=rows), indent=1))
    o = ["milestone 3d: element-local Hessian; 3c's chains at 3.75 mm (reproduction) and 1.875 mm (third lattice)"]
    if ag:
        o.append("part 0: fabric a_mm nodes relF relHp sec_coloured_fd sec_local")
        o += [f"{g['f']} {g['a']*1000:g} {g['n']} {g['relF']:.2e} {g['relHp']:.2e} {g['sec_fd']:.2f} {g['sec_local']:.2f}"
              for g in ag]
    o.append("stages: fabric EA a_mm seed nodes DC folds energy_J newton_steps gmax_over_w converged lam_min sec")
    for r in sorted(rows, key=lambda r: (r["a"], r["f"], r["ea"], r["seed"])):
        lam = f"{r['lam']:.2e}" if r["lam"] is not None else "-"
        o.append(f"{r['f']} {r['ea']:g} {r['a']*1000:g} {r['seed']} {r['n']} {r['dc']:.4f} {r['folds']} "
                 f"{r['energy']:.8e} {r['steps']} {r['gmax']:.1e} {'yes' if r['conv'] else 'no'} {lam} {r['sec']:.0f}")
    if not quick:
        old = [r for r in json.loads((EXP / "m3c_branches" / "results.json").read_text()) if r["part"] == 1]
        key = lambda r: (r["f"], r["ea"], r["a"], r["seed"])
        O = {key(r): r for r in old}
        rep = [r for r in rows if r["a"] == A_REPRO]
        sec = float(np.median([r["sec"] / max(r["steps"], 1) for r in rep]))
        sec3c = float(np.median([r["sec"] / max(r["steps"], 1) for r in old if r["a"] == A_REPRO]))
        o += ["", f"R1 median s per Newton step at 3.75 mm: {sec:.3f} against 3c's {sec3c:.3f} "
                  f"({sec3c/sec:.1f}x): {'held' if sec3c / sec >= 3 else 'refuted'}"]
        same = 0
        o.append("R2 per chain (fabric seed): stages matching 3c (same folds, |dDC| <= 0.002), max |dDC|, max |dE| J")
        for f in CHAIN:
            for s in SEEDS:
                st = [r for r in rep if (r["f"], r["seed"]) == (f, s)]
                ok = [r["folds"] == O[key(r)]["folds"] and abs(r["dc"] - O[key(r)]["dc"]) <= 0.002 for r in st]
                same += all(ok) and len(ok) == len(CHAIN[f])
                o.append(f"   {f} {s}: {sum(ok)} of {len(st)}, {max(abs(r['dc'] - O[key(r)]['dc']) for r in st):.4f}, "
                         f"{max(abs(r['energy'] - O[key(r)]['energy']) for r in st):.2e}")
        o.append(f"R2 chains reproduced at every stage: {same} of 14: {'held' if same >= 12 else 'refuted'}")
        o += ["", "summary: fabric EA a_mm n mean_DC sd lowE_DC lowE_seed lowE_folds mean_folds fold_counts"]
        S = {}
        for f in SOURCED:
            for ea in SOURCED[f]:
                for a, src in ((A_REPRO, rows), (A_PREV, old), (A_NEW, rows)):
                    s = S[(f, ea, a)] = summ(src, f, ea, a)
                    o.append(f"{f} {ea:g} {a*1000:g} {s['n']} {s['mean']:.4f} {s['sd']:.4f} {s['lowE_dc']:.4f} "
                             f"{s['lowE_seed']} {s['lowE_folds']} {s['mean_folds']:.2f} {s['folds']}")
        d1 = {(f, ea): S[(f, ea, A_NEW)]["lowE_dc"] - S[(f, ea, A_PREV)]["lowE_dc"] for f in SOURCED for ea in SOURCED[f]}
        s1 = all(abs(v) < 0.01 for v in d1.values())
        o.append("S1 lowest-energy DC(1.875) - DC(2.5): " + ", ".join(f"{f} {ea:g} {v:+.4f}" for (f, ea), v in d1.items())
                 + f": {'held' if s1 else 'refuted'}")
        dm = {(f, ea): S[(f, ea, A_NEW)]["mean"] - S[(f, ea, A_PREV)]["mean"] for f in SOURCED for ea in SOURCED[f]}
        s2 = dm[("D", 1896.0)] > 0.01 and S[("D", 1896.0, A_NEW)]["mean_folds"] >= S[("D", 1896.0, A_PREV)]["mean_folds"]
        o.append(f"S2 D 1896 mean DC change {dm[('D', 1896.0)]:+.4f}, mean folds {S[('D', 1896.0, A_PREV)]['mean_folds']:.2f}"
                 f" -> {S[('D', 1896.0, A_NEW)]['mean_folds']:.2f}: {'held' if s2 else 'refuted'}")
        s3 = all(abs(v) < 0.03 for v in dm.values())
        o.append("S3 seed-mean DC(1.875) - DC(2.5): " + ", ".join(f"{f} {ea:g} {v:+.4f}" for (f, ea), v in dm.items())
                 + f": {'held' if s3 else 'refuted'}")
        new = [r for r in rows if r["a"] == A_NEW]
        conv = sum(r["conv"] for r in new)
        o.append(f"S4 1.875 mm stages converged: {conv} of {len(new)}: {'held' if conv == len(new) else 'refuted'}")
        neg = [r for r in rows if r["conv"] and r["lam"] is not None and r["lam"] <= 0]
        o.append(f"(unscored) converged end states with lam_min <= 0: {len(neg)} of {sum(r['conv'] for r in rows)}")
        o.append(f"acceptance (S1): {'passed' if s1 else 'failed'}")
    o.append(f"wall {time.time()-t0:.0f}s")
    (HERE / f"results{tag}.txt").write_text("\n".join(o) + "\n")
    print("\n".join(o))


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--quick", action="store_true")
    main(ap.parse_args().quick)
