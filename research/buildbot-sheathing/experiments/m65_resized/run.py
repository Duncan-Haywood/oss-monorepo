"""Milestone 65: what coverage does it cost to size the planner to a larger sensor bias, and does that restore the guarantee?

Milestone 64 kept the planner sized to B = 0.2 N and found a 0.3 N bias along milestone 63's worst direction sends
22.6% of planned G1 and 12.0% of planned H1 presses past 0.03 mm, with no drop in coverage to warn. The remedy a
practitioner can choose without a better sensor is to size the planner to the bias the sensor really has. Here every
module of milestone 61's chain (m55's robust margins r_j = B ||G_j||, m56/m58/m59's plans and four-row flip budget,
m61's leg raise and squeeze, the reference calibration and m63's adversary) runs with B set to B_PLAN, and the true
bias is B_PLAN along the adversary computed at that B_PLAN (both signs): the design-size worst case, as milestone 63
tested at 0.2 N. B_PLAN = 0.2 is the paired baseline on the same loads.

The finite-difference step of the settle gradient G_j is B itself (as in milestones 55 to 64), so at each B_PLAN the
margin is the gradient's chord over the whole ball, not a smaller-step tangent.

Section L is held out: 12 Latin-hypercube loads (seed 65; 48 were planned, cut to 12 for run time, LOG.md).
Each finished task is appended to ``partial.jsonl`` (keyed by robot, load index and N), and a rerun skips the
tasks already there, so a run stopped by a time limit resumes; the file is deleted once results.json is written. Hypotheses H250-H252 (LOG.md, registered before the run).
M65_PROCS sets the pool (default 4); M65_N the loads.
"""
import os as _os
for _v in ("OMP_NUM_THREADS", "OPENBLAS_NUM_THREADS", "MKL_NUM_THREADS"):
    _os.environ.setdefault(_v, "1")
import importlib.util
import json
import math
import os
import platform
import sys
import time

N = int(os.environ.get("M65_N", "12"))
os.environ["M63_N"] = str(N)
HERE = os.path.dirname(os.path.abspath(__file__))
import numpy as np  # noqa: E402

spec = importlib.util.spec_from_file_location("m63", os.path.join(HERE, "..", "m63_worstbias", "run.py"))
E63 = importlib.util.module_from_spec(spec)
sys.modules["m63"] = E63
spec.loader.exec_module(E63)                     # milestone 63's adversary (and 61's chain, 60's, ... 38's)

T0 = time.time()
E61, C, E54, E51, M1 = E63.E61, E63.C, E63.E54, E63.E51, E63.M1
SPEC, AX, B0 = E63.SPEC, E63.AX, E63.B
SEED = 65
E61.SEED = SEED
LOADS = E54.lhs(N, SEED)
BPLANS = (0.2, 0.3, 0.4, 0.6, 1.0)


def chain_modules():
    """Every loaded module that carries the sensor bound as a global (B, or B_E in milestones 44 and 45)."""
    return [m for m in list(sys.modules.values())
            if m is not None and (hasattr(m, "B") or hasattr(m, "B_E"))
            and os.path.abspath(getattr(m, "__file__", "") or "").startswith(os.path.dirname(HERE))]


def set_bound(b):
    """Size every margin of the chain to b (functions read the module global at call time)."""
    for m in chain_modules():
        for name in ("B", "B_E"):
            if isinstance(getattr(m, name, None), float):
                setattr(m, name, float(b))


def bound_now():
    return sorted({(m.__name__, float(getattr(m, nm))) for m in chain_modules() for nm in ("B", "B_E")
                   if isinstance(getattr(m, nm, None), float)})


def task(args):
    n, j, lim = args
    H, phd = LOADS[j]
    phi = math.radians(phd)
    C.setup(n)
    keys = sorted(k for k in M1.KEYS if k[0] == n)
    ref = E51.ref_key(n)
    f_slack = M1.hose_f(ref, 0.0, 0.0)
    lr = lim[str(list(ref))]
    cal = {}

    def er(b, e):
        t = (b,) + tuple(np.round(e, 12))
        if t not in cal:
            cal[t] = E63.E55.robust_rule(ref, f_slack, np.asarray(e, float))[2]
        return cal[t]
    rows = []
    for k in keys:
        lk = lim[str(list(k))]
        f = np.asarray(M1.hose_f(k, H, phi), float)
        rec = {"pose": list(k[1:]), "adv": {}, "cases": {}}
        for b in BPLANS:
            set_bound(b)
            u, bj, mj, gn, src = E63.worst_dir(k, f)
            rec["adv"][f"{b:g}"] = {"u": [float(x) for x in u], "bind": bj, "m": mj, "gn": gn, "src": src}
            for sgn, sc in ((1, "+"), (-1, "-")):
                e = sgn * b * u
                rec["cases"][f"B{b:g}{sc}"] = E63.run_case(k, ref, f, e, er(b, e), lk, lr, H)
        set_bound(B0)
        rows.append(rec)
    return {"robot": n, "j": j, "H": H, "phi": phd, "rows": rows}


def resid_of(r):
    return r["out"] if r["out"].get("y") is not None else (r.get("esc", {}).get("u") or r.get("esc", {}).get("s") or {})


if __name__ == "__main__":
    procs = int(os.environ.get("M65_PROCS", "4"))
    set_bound(0.7)
    chk = bound_now()
    assert chk and all(v == 0.7 for _, v in chk), chk
    set_bound(B0)
    allkeys = sorted(set(k for k in M1.KEYS) | {E51.ref_key(n) for n in ("g1", "h1")})
    ctx = M1.mp.get_context("fork")
    phis = [p for _, p in LOADS]
    out = {"versions": {"python": platform.python_version(), "numpy": np.__version__,
                        "mujoco": M1.mujoco.__version__}, "spec_mm": SPEC, "B0": B0, "seed": SEED, "loads": LOADS,
           "bplans": BPLANS, "bound_globals": [m for m, _ in chk]}

    def tl(args):
        key, ph = args
        C.setup(key[0])
        return key, [E54.limit(key, math.radians(p)) for p in ph]
    with ctx.Pool(procs) as pool:
        L = pool.map(tl, [(k, phis) for k in allkeys], chunksize=1)
        lims = {str(list(k)): v for k, v in L}
        jobs = [(n, j, {kk: v[j] for kk, v in lims.items()}) for n in ("g1", "h1") for j in range(N)]
        part = os.path.join(HERE, "partial.jsonl")
        done = {}
        if os.path.exists(part):
            for line in open(part):
                x = json.loads(line)
                if x.get("N") == N:
                    done[(x["robot"], x["j"])] = x
        todo = [jb for jb in jobs if (jb[0], jb[1]) not in done]
        print(f"resuming: {len(done)} tasks from partial.jsonl, {len(todo)} to run", file=sys.stderr)
        with open(part, "a") as fp:
            for x in pool.imap_unordered(task, todo, chunksize=1):
                x["N"] = N
                fp.write(json.dumps(x, separators=(",", ":"), default=float) + "\n")
                fp.flush()
                done[(x["robot"], x["j"])] = x
        res = [done[(jb[0], jb[1])] for jb in jobs]
    out["limits"], out["runs"] = lims, res
    print(f"# Milestone 65: the planner re-sized to the bias, held-out section L ({N} loads, seed {SEED}; milestone "
          f"61's chain with every margin sized to B_plan, true bias B_plan along milestone 63's adversary at that "
          f"B_plan; spec {SPEC} mm per row)")
    print(f"modules whose bound was set: {len(chk)} ({', '.join(m for m, _ in chk)})")
    print("\n## A. By robot and B_plan: robot | B_plan N | balance-envelope cases | calibration failed | planned | "
          "coverage % | unplanned | over spec | worst |y|, |z|, |y_d|, |z_d| (mm) | planned with a flip | escalated")
    S, OV, PL = {}, [], {}
    for n in ("g1", "h1"):
        for b in BPLANS:
            names = [f"B{b:g}+", f"B{b:g}-"]
            cs = [(x, rec, c, rec["cases"][c]) for x in res if x["robot"] == n for rec in x["rows"] for c in names]
            nin = sum(r["in51"] for *_, r in cs)
            ncal = sum(r["in51"] and not r["cal"] for *_, r in cs)
            pl, wa, over, flip, esc = 0, {a: 0.0 for a in AX}, 0, 0, 0
            plset = set()
            for x, rec, c, r in cs:
                oc = E63.outcome(r)
                if not oc or not oc[0]:
                    continue
                pl += 1
                plset.add((x["j"], tuple(rec["pose"]), c[-1]))
                o = resid_of(r)
                for a in AX:
                    wa[a] = max(wa[a], o[a])
                fl = oc[2] or 0
                flip += fl > 0
                esc += oc[3] in ("leg raise", "squeeze")
                if oc[1] > SPEC + 1e-12:
                    over += 1
                    OV.append({"robot": n, "B": b, "case": c, "pose": rec["pose"], "H": x["H"], "phi": x["phi"],
                               "worst": oc[1], "flips": fl, "how": oc[3]})
            PL[(n, b)] = plset
            s = {"in51": nin, "calfail": ncal, "planned": pl, "cov": 100.0 * pl / max(nin, 1), "over": over,
                 "worst": wa, "wmax": max(wa.values()), "flip": flip, "esc": esc}
            S[f"{n} {b:g}"] = s
            print(f"  {n} | {b:.1f} | {nin} | {ncal} | {pl} | {s['cov']:.2f} | {nin - pl} | {over} | "
                  + ", ".join(f"{wa[a]:.4f}" for a in AX) + f" | {flip} | {esc}")
    print("\n## B. Where coverage goes, by robot and B_plan: robot | B_plan N | unplanned with H over the balance limit "
          "band | unplanned by pose (x m, s): count | planned at 0.2 N but not at B_plan | planned at B_plan but "
          "not at 0.2 N")
    for n in ("g1", "h1"):
        for b in BPLANS:
            by = {}
            for x in res:
                if x["robot"] != n:
                    continue
                for rec in x["rows"]:
                    for c in (f"B{b:g}+", f"B{b:g}-"):
                        r = rec["cases"][c]
                        oc = E63.outcome(r)
                        if r["in51"] and (not oc or not oc[0]):
                            by[tuple(rec["pose"])] = by.get(tuple(rec["pose"]), 0) + 1
            lost = len(PL[(n, 0.2)] - PL[(n, b)])
            gain = len(PL[(n, b)] - PL[(n, 0.2)])
            top = "; ".join(f"{p}: {v}" for p, v in sorted(by.items(), key=lambda t: -t[1])[:6]) or "none"
            print(f"  {n} | {b:.1f} | {top} | {lost} | {gain}")
    print("\n## C. Coverage relative to B_plan 0.2 (robot: B_plan -> planned / planned at 0.2)")
    for n in ("g1", "h1"):
        p0 = max(S[f"{n} 0.2"]["planned"], 1)
        print(f"  {n}: " + "; ".join(f"{b:.1f} -> {S[f'{n} {b:g}']['planned'] / p0:.4f}" for b in BPLANS))
    print("\n## D. Planned presses over spec (first 30): robot | B_plan | case | pose | H N | phi deg | worst row mm | "
          "flips | how")
    for o in sorted(OV, key=lambda d: (d["B"], -d["worst"]))[:30]:
        print(f"  {o['robot']} | {o['B']:.1f} | {o['case']} | {o['pose']} | {o['H']:.2f} | {o['phi']:.1f} | "
              f"{o['worst']:.4f} | {o['flips']} | {o['how']}")
    print(f"  (total over spec: {len(OV)})")
    print("\n## E. Hypotheses (registered in LOG.md before this run)")
    D = {}
    big = [b for b in BPLANS if b > 0.2]
    nov = {b: sum(S[f"{n} {b:g}"]["over"] for n in ("g1", "h1")) for b in big}
    D["H250"] = all(v == 0 for v in nov.values())
    print("H250 (sized to B_plan 0.3 to 1.0 N, every planned press inside the spec on both robots): over spec "
          + ", ".join(f"{b:.1f} N {v}" for b, v in nov.items()) + f" -> {'held' if D['H250'] else 'refuted'}")
    D["H251"] = all(S[f"{n} 0.3"]["cov"] >= 95.0 for n in ("g1", "h1"))
    print(f"H251 (coverage at 0.3 N at least 95% on both robots): G1 {S['g1 0.3']['cov']:.2f}%, H1 "
          f"{S['h1 0.3']['cov']:.2f}% -> {'held' if D['H251'] else 'refuted'}")
    D["H252"] = any(S[f"{n} 1"]["cov"] < 80.0 for n in ("g1", "h1"))
    print(f"H252 (coverage at 1.0 N under 80% on at least one robot): G1 {S['g1 1']['cov']:.2f}%, H1 "
          f"{S['h1 1']['cov']:.2f}% -> {'held' if D['H252'] else 'refuted'}")
    out["S"], out["OV"], out["D"] = S, OV, D
    json.dump(out, open(os.path.join(HERE, "results.json"), "w"), separators=(",", ":"), default=float)
    os.remove(os.path.join(HERE, "partial.jsonl"))
    print(f"\n(run time {time.time() - T0:.0f} s; python {platform.python_version()}, numpy {np.__version__}, "
          f"mujoco {M1.mujoco.__version__})")
