"""Milestone 68: does a gate on the per-pose sensitivity table, Y_k + B ||J_k|| <= 0.03 mm, restore the guarantee?

Milestone 67 found the no-flip compensated residual exactly linear in a constant sensor bias once the reference
calibration is re-made under it, R_k(e) = J_k e, and J_k (4 rows x 3 axes, mm/N) a property of the pose: one value
per pose over 8 loads. So B ||J_k|| is the exact worst case of the no-flip part over the bias ball |e| <= B, and a
planner can hold ||J_k|| as a table computed once, offline. Here the table is frozen from milestone 67's
results.json (section N) and the planner is milestone 65's chain sized to B with one gate after it:

  accept the planned press only if  Y_k + B ||J_k||_table <= SPEC  in every row k (nose y, z; depth point y, z),

Y_k the plan's four-row flip budget (milestone 61). A pose missing from the table is refused. Two adversaries per
press and B, both signs: 'dir', the direct-aimed bias of milestone 67 (J measured afresh at the true load with four
chain runs, planner sized to 0.2 N; u = J_k*/||J_k*||) and 'm63', milestone 63's margin-aimed bias at that B (aimed
at the flips). B = 0.3, 0.4, 0.6, 1.0 N. Section O is held out: 12 Latin-hypercube loads (seed 68). Hypotheses
H261-H265 (LOG.md, registered before the run). Finished tasks go to ``partial.jsonl`` so a stopped run resumes.
M68_PROCS sets the pool (default 4); M68_N the loads.
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

N = int(os.environ.get("M68_N", "12"))
os.environ["M67_N"] = str(N)
HERE = os.path.dirname(os.path.abspath(__file__))
import numpy as np  # noqa: E402

spec = importlib.util.spec_from_file_location("m67", os.path.join(HERE, "..", "m67_aimeddirect", "run.py"))
E67 = importlib.util.module_from_spec(spec)
sys.modules["m67"] = E67
spec.loader.exec_module(E67)                     # milestone 67's signed rows, 66's wrappers, 65's re-sized chain

T0 = time.time()
E66, E65, E63, E61, E54, E51, E55, M1, C = (E67.E66, E67.E65, E67.E63, E67.E61, E67.E54, E67.E51, E67.E55,
                                             E67.M1, E67.C)
SPEC, AX = E67.SPEC, E67.AX
SEED = 68
E61.SEED = SEED
E65.SEED = SEED
LOADS = E54.lhs(N, SEED)
BS = (0.3, 0.4, 0.6, 1.0)
ADVS = ("dir", "m63")
H_STEP = E67.H_STEP
UNIT = np.eye(3)


def load_table(path=os.path.join(HERE, "..", "m67_aimeddirect", "results.json")):
    """Per robot and pose, the row norms ||J_k|| (mm/N) from milestone 67, and the spread over its loads."""
    D = json.load(open(path))
    tab, spread = {"g1": {}, "h1": {}}, 0.0
    for x in D["runs"]:
        for rec in x["rows"]:
            a = rec["adv"]
            if a["src"] != "direct":
                continue
            p = tuple(rec["pose"])
            g = [float(v) for v in a["gn"]]
            if p in tab[x["robot"]]:
                spread = max(spread, max(abs(u - v) for u, v in zip(g, tab[x["robot"]][p])))
            else:
                tab[x["robot"]][p] = g
    return tab, spread


TABLE, TABLE_SPREAD = load_table()


def _no_direct(key, ref, rp, fm, er_r, b):
    """Milestone 66's D is not used by this gate and costs four robot evaluations per planned press of every side
    search, so it is switched off here (recorded as NaN)."""
    return np.full(4, np.nan)


E66.direct = _no_direct


def gate(p, b, gn):
    return gn is not None and all(y + b * g <= SPEC + 1e-12 for y, g in zip(p["Y"], gn))


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
            cal[t] = E55.robust_rule(ref, f_slack, np.asarray(e, float))[2]
        return cal[t]
    rows = []
    for k in keys:
        lk = lim[str(list(k))]
        f = np.asarray(M1.hose_f(k, H, phi), float)
        rec = {"pose": list(k[1:]), "adv": {}, "cases": {}}
        E65.set_bound(H_STEP)
        pts = [np.zeros(3)] + [H_STEP * UNIT[c] for c in range(3)]
        P = [E66.planned_rec(E63.run_case(k, ref, f, e, er(H_STEP, e), lk, lr, H)) for e in pts]
        if all(p is not None for p in P):
            R0 = np.array(P[0]["s0"])
            J = np.stack([(np.array(P[c + 1]["s0"]) - R0) / H_STEP for c in range(3)], axis=1)
            gn = np.linalg.norm(J, axis=1)
            ks = int(np.argmax(gn))
            ud = J[ks] / gn[ks] if gn[ks] > 1e-12 else None
            rec["J"] = {"gn": gn.tolist(), "row": AX[ks], "R0": R0.tolist()}
        else:
            ud = None
            rec["J"] = None
        for b in BS:
            E65.set_bound(b)
            um, *_ = E63.worst_dir(k, f)
            dirs = {"dir": ud if ud is not None else um, "m63": um}
            rec["adv"][f"{b:g}"] = {"dir_src": "direct" if ud is not None else "m63"}
            for a in ADVS:
                for sgn, sc in ((1, "+"), (-1, "-")):
                    e = sgn * b * np.asarray(dirs[a], float)
                    rec["cases"][f"{a}{b:g}{sc}"] = E63.run_case(k, ref, f, e, er(b, e), lk, lr, H)
        E65.set_bound(E65.B0)
        rows.append(rec)
    return {"robot": n, "j": j, "H": H, "phi": phd, "rows": rows}


if __name__ == "__main__":
    procs = int(os.environ.get("M68_PROCS", "4"))
    E65.set_bound(0.7)
    chk = E65.bound_now()
    assert chk and all(v == 0.7 for _, v in chk), chk
    E65.set_bound(E65.B0)
    allkeys = sorted(set(k for k in M1.KEYS) | {E51.ref_key(n) for n in ("g1", "h1")})
    ctx = M1.mp.get_context("fork")
    phis = [p for _, p in LOADS]
    out = {"versions": {"python": platform.python_version(), "numpy": np.__version__,
                        "mujoco": M1.mujoco.__version__}, "spec_mm": SPEC, "seed": SEED, "loads": LOADS,
           "bs": BS, "h": H_STEP, "bound_globals": [m for m, _ in chk],
           "table": {n: {str(list(p)): g for p, g in t.items()} for n, t in TABLE.items()},
           "table_spread": TABLE_SPREAD}

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
                print(f"  done {x['robot']} load {x['j']} at {time.time() - T0:.0f} s", file=sys.stderr)
        res = [done[(jb[0], jb[1])] for jb in jobs]
    out["limits"], out["runs"] = lims, res
    print(f"# Milestone 68: the gate Y_k + B ||J_k||_table <= {SPEC} mm (table frozen from milestone 67), held-out "
          f"section O ({N} loads, seed {SEED}; milestone 65's chain sized to B; adversaries: direct-aimed (dir) and "
          f"milestone 63's margin-aimed (m63), both signs)")
    print(f"modules whose bound was set: {len(chk)}; table poses G1 {len(TABLE['g1'])}, H1 {len(TABLE['h1'])}; "
          f"largest spread of a table entry over milestone 67's loads {TABLE_SPREAD:.2e} mm/N")
    print("\n## A. Does the table transfer? robot | presses with a fresh J | pose not in table | max |max_k ||J_k|| - "
          "table| mm/N | max row-wise difference mm/N")
    A = {}
    for n in ("g1", "h1"):
        fr = [(tuple(rec["pose"]), rec["J"]["gn"]) for x in res if x["robot"] == n for rec in x["rows"] if rec["J"]]
        miss = sum(1 for p, _ in fr if p not in TABLE[n])
        dm = [abs(max(g) - max(TABLE[n][p])) for p, g in fr if p in TABLE[n]]
        dr = [max(abs(u - v) for u, v in zip(g, TABLE[n][p])) for p, g in fr if p in TABLE[n]]
        A[n] = {"fresh": len(fr), "miss": miss, "dmax": max(dm) if dm else None, "drow": max(dr) if dr else None}
        print(f"  {n} | {len(fr)} | {miss} | {A[n]['dmax']:.2e} | {A[n]['drow']:.2e}")
    print("\n## B. By robot, B and adversary: robot | B N | adversary | balance-envelope cases | chain planned | "
          "chain over spec | chain worst mm | gate passed | gate coverage % | gate passed over spec | worst "
          "gate-passed row mm | refused for pose not in table")
    S, OV = {}, []
    for n in ("g1", "h1"):
        for b in BS:
            for a in ADVS:
                nin = pl = ov = gp = gov = nt = 0
                wc = wg = 0.0
                for x in res:
                    if x["robot"] != n:
                        continue
                    for rec in x["rows"]:
                        gn = TABLE[n].get(tuple(rec["pose"]))
                        for sc in ("+", "-"):
                            c = f"{a}{b:g}{sc}"
                            r = rec["cases"][c]
                            nin += r["in51"]
                            p = E66.planned_rec(r)
                            if p is None:
                                continue
                            pl += 1
                            w = max(p[k] for k in AX)
                            wc = max(wc, w)
                            ov += w > SPEC + 1e-12
                            nt += gn is None
                            if gate(p, b, gn):
                                gp += 1
                                wg = max(wg, w)
                                if w > SPEC + 1e-12:
                                    gov += 1
                                    OV.append({"robot": n, "B": b, "case": c, "pose": rec["pose"], "H": x["H"],
                                               "phi": x["phi"], "worst": w, "flips": p["flips"], "how": p["how"],
                                               "Y": p["Y"], "gn": gn})
                s = {"in51": nin, "planned": pl, "ccov": 100.0 * pl / max(nin, 1), "over": ov, "cworst": wc,
                     "gate": gp, "gcov": 100.0 * gp / max(nin, 1), "gover": gov, "gworst": wg, "notab": nt}
                S[f"{n} {b:g} {a}"] = s
                print(f"  {n} | {b:.1f} | {a} | {nin} | {pl} ({s['ccov']:.2f}%) | {ov} | {wc:.4f} | {gp} | "
                      f"{s['gcov']:.2f} | {gov} | {wg:.4f} | {nt}")
    print("\n## C. Gate-passed presses over spec (first 30, worst first): robot | B | case | pose | H N | phi deg | "
          "worst mm | flips | how")
    for o in sorted(OV, key=lambda d: -d["worst"])[:30]:
        print(f"  {o['robot']} | {o['B']:.1f} | {o['case']} | {o['pose']} | {o['H']:.1f} | {o['phi']:.1f} | "
              f"{o['worst']:.4f} | {o['flips']} | {o['how']}")
    print(f"  (total: {len(OV)})")
    print("\n## D. Hypotheses (registered in LOG.md before this run)")
    Dh = {}
    g = sum(s["gover"] for s in S.values())
    Dh["H261"] = g == 0
    print(f"H261 (every gate-passed press inside the spec, every B, both adversaries, both robots): {g} over spec -> "
          f"{'held' if Dh['H261'] else 'refuted'}")
    dm = max(A[n]["dmax"] for n in ("g1", "h1"))
    Dh["H262"] = dm <= 1e-6 and all(A[n]["miss"] == 0 for n in ("g1", "h1"))
    print(f"H262 (the fresh max_k ||J_k|| equals the table's to 1e-6 mm/N on every press): largest difference "
          f"{dm:.2e}, poses not in table G1 {A['g1']['miss']}, H1 {A['h1']['miss']} -> "
          f"{'held' if Dh['H262'] else 'refuted'}")
    c3 = {n: S[f"{n} 0.3 dir"]["gcov"] for n in ("g1", "h1")}
    Dh["H263"] = c3["g1"] >= 50.0 and c3["h1"] >= 80.0
    print(f"H263 (gate coverage at 0.3 N, direct-aimed, at least 50% G1 and 80% H1): G1 {c3['g1']:.2f}%, H1 "
          f"{c3['h1']:.2f}% -> {'held' if Dh['H263'] else 'refuted'}")
    c10 = {n: S[f"{n} 1 dir"]["gcov"] for n in ("g1", "h1")}
    Dh["H264"] = all(v < 30.0 for v in c10.values())
    print(f"H264 (gate coverage at 1.0 N, direct-aimed, under 30% on both robots): G1 {c10['g1']:.2f}%, H1 "
          f"{c10['h1']:.2f}% -> {'held' if Dh['H264'] else 'refuted'}")
    o4 = {n: S[f"{n} 0.4 dir"]["over"] for n in ("g1", "h1")}
    Dh["H265"] = all(v > 0 for v in o4.values())
    print(f"H265 (without the gate, 0.4 N direct-aimed leaves a press over spec on each robot): G1 {o4['g1']}, H1 "
          f"{o4['h1']} -> {'held' if Dh['H265'] else 'refuted'}")
    out["A"], out["S"], out["OV"], out["D"] = A, S, OV, Dh
    json.dump(out, open(os.path.join(HERE, "results.json"), "w"), separators=(",", ":"), default=float)
    os.remove(os.path.join(HERE, "partial.jsonl"))
    print(f"\n(run time {time.time() - T0:.0f} s; python {platform.python_version()}, numpy {np.__version__}, "
          f"mujoco {M1.mujoco.__version__})")
