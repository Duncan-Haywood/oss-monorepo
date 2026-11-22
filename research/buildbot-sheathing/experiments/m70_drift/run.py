"""Milestone 70: does the bias certificate survive a sensor bias that drifts between calibration and press?

Milestones 67 to 69 assumed one constant bias e, present both at the reference calibration and at the press. The
compensated no-flip residual is then the press pose's nose bias minus the reference's, and its sensitivity
J(p | r) = S_p - S_r (milestone 69, to 4e-14 mm/N), where S_p is the press pose's sensitivity with the
calibration held fixed. A real wrist force/torque sensor's offset wanders with temperature and time, so the bias at
the press, e_p, differs from the bias at the calibration, e_r, by a drift d = e_p - e_r. If the residual is linear
in both, row k is

    r_k = S_pk e_p - S_rk e_r = J_k e_r + S_pk d,

so over ||e_r|| <= B and ||d|| <= delta its worst case is B ||J_k|| + delta ||S_pk||, reached with e_r along J_k and
d along S_pk (same row, same sign). The drift is multiplied by the uncompensated sensitivity S, which no
calibration cancels.

This run measures S_p per press (four chain runs, calibration under zero bias, planner sized to 0.2 N), then aims
the joint worst case at each press: k* = argmax_k (B ||J_k|| + delta ||S_k||), e_r = s B J_k*/||J_k*|| and
e_p = e_r + s delta S_k*/||S_k*|| for s = +1, -1, the calibration re-made under e_r at the assigned reference of
milestone 69's two-pose set and the planner sized to B + delta (milestone 65's chain). J is milestone 67's table
re-referenced by milestone 69's subtraction (``E69.FULL``). Two gates on each planned press: milestone 69's
Y_k + B ||J_k|| <= 0.03 mm (drift ignored) and the drift gate Y_k + B ||J_k|| + delta ||S_k|| <= 0.03 mm.
Held-out section Q (8 Latin-hypercube loads, seed 70); B = 0.3, 0.4 N; delta = 0.05, 0.1, 0.2 N.
Hypotheses H271-H275 (LOG.md, registered before the run). Finished tasks go to ``partial.jsonl`` so a stopped run
resumes. M70_PROCS sets the pool (default 4); M70_N the loads; M70_POSES limits the poses per robot (timing only).
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

N = int(os.environ.get("M70_N", "8"))
os.environ["M69_N"] = str(N)
NPOSE = int(os.environ.get("M70_POSES", "0"))
HERE = os.path.dirname(os.path.abspath(__file__))
import numpy as np  # noqa: E402

spec = importlib.util.spec_from_file_location("m69", os.path.join(HERE, "..", "m69_tworef", "run.py"))
E69 = importlib.util.module_from_spec(spec)
sys.modules["m69"] = E69
spec.loader.exec_module(E69)                     # milestone 69's table, plan and wrappers

T0 = time.time()
E67, E66, E65, E63, E54, E51, E55, M1, C = (E69.E67, E69.E66, E69.E65, E69.E63, E69.E54, E69.E51, E69.E55, E69.M1,
                                             E69.C)
SPEC, AX = E69.SPEC, E69.AX
SEED = 70
E69.E61.SEED = SEED
E65.SEED = SEED
LOADS = E54.lhs(N, SEED)
BS = (0.3, 0.4)
DS = (0.05, 0.1, 0.2)
H_STEP = E67.H_STEP
UNIT = np.eye(3)
FULL, PLAN = E69.FULL, E69.PLAN


def jtab(n, p):
    """Milestone 69's two-pose J (4 x 3, mm/N) of pose p, re-referenced from milestone 67's table, and its ref."""
    r = PLAN[n]["assign"].get(p)
    if r is None or p not in FULL[n] or r not in FULL[n]:
        return None, None
    return FULL[n][p] - FULL[n][r], r


def aim(J, S, b, d):
    """Joint worst case of row k*: (k*, e_r, drift) for sign +1."""
    gJ, gS = np.linalg.norm(J, axis=1), np.linalg.norm(S, axis=1)
    ks = int(np.argmax(b * gJ + d * gS))
    uS = S[ks] / gS[ks] if gS[ks] > 1e-12 else np.zeros(3)
    uJ = J[ks] / gJ[ks] if gJ[ks] > 1e-12 else uS
    return ks, b * uJ, d * uS


def gates(p, b, d, gJ, gS):
    old = all(y + b * g <= SPEC + 1e-12 for y, g in zip(p["Y"], gJ))
    new = all(y + b * g + d * s <= SPEC + 1e-12 for y, g, s in zip(p["Y"], gJ, gS))
    return old, new


def task(args):
    n, j, lim = args
    H, phd = LOADS[j]
    phi = math.radians(phd)
    C.setup(n)
    keys = sorted(k for k in M1.KEYS if k[0] == n)
    if NPOSE:
        keys = keys[:NPOSE]
    cal = {}

    def er(ref, b, e):
        t = (ref, b) + tuple(np.round(e, 12))
        if t not in cal:
            cal[t] = E55.robust_rule(ref, M1.hose_f(ref, 0.0, 0.0), np.asarray(e, float))[2]
        return cal[t]
    rows = []
    for k in keys:
        lk = lim[str(list(k))]
        f = np.asarray(M1.hose_f(k, H, phi), float)
        J, a = jtab(n, tuple(k[1:]))
        rec = {"pose": list(k[1:]), "S": None, "cases": {}}
        if J is None:
            rows.append(rec)
            continue
        ref = (n,) + tuple(a)
        lr = lim[str(list(ref))]
        rec["ref"] = list(a)
        rec["J"] = J.tolist()
        E65.set_bound(H_STEP)
        z = np.zeros(3)
        pts = [z] + [H_STEP * UNIT[c] for c in range(3)]
        P = [E66.planned_rec(E63.run_case(k, ref, f, e, er(ref, H_STEP, z), lk, lr, H)) for e in pts]
        if not all(p is not None for p in P):
            E65.set_bound(E65.B0)
            rows.append(rec)
            continue
        R0 = np.array(P[0]["s0"])
        S = np.stack([(np.array(P[c + 1]["s0"]) - R0) / H_STEP for c in range(3)], axis=1)
        rec["S"], rec["R0"] = S.tolist(), R0.tolist()
        for b in BS:
            for d in DS:
                E65.set_bound(b + d)
                ks, eru, du = aim(J, S, b, d)
                for sgn, sc in ((1, "+"), (-1, "-")):
                    e_r, e_p = sgn * eru, sgn * (eru + du)
                    r = E63.run_case(k, ref, f, e_p, er(ref, b + d, e_r), lk, lr, H)
                    r["ks"], r["e_r"], r["e_p"] = ks, e_r.tolist(), e_p.tolist()
                    rec["cases"][f"{b:g}/{d:g}{sc}"] = r
        E65.set_bound(E65.B0)
        rows.append(rec)
    return {"robot": n, "j": j, "H": H, "phi": phd, "rows": rows}


if __name__ == "__main__":
    procs = int(os.environ.get("M70_PROCS", "4"))
    E65.set_bound(0.7)
    chk = E65.bound_now()
    assert chk and all(v == 0.7 for _, v in chk), chk
    E65.set_bound(E65.B0)
    allkeys = sorted(set(k for k in M1.KEYS) | {(n,) + tuple(r) for n in PLAN for r in PLAN[n]["refs"]}
                     | {E51.ref_key(n) for n in ("g1", "h1")})
    ctx = M1.mp.get_context("fork")
    phis = [p for _, p in LOADS]
    out = {"versions": {"python": platform.python_version(), "numpy": np.__version__,
                        "mujoco": M1.mujoco.__version__}, "spec_mm": SPEC, "seed": SEED, "loads": LOADS,
           "bs": BS, "ds": DS, "h": H_STEP, "bound_globals": [m for m, _ in chk], "npose": NPOSE}

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
                if x.get("N") == N and x.get("npose") == NPOSE:
                    done[(x["robot"], x["j"])] = x
        todo = [jb for jb in jobs if (jb[0], jb[1]) not in done]
        print(f"resuming: {len(done)} tasks from partial.jsonl, {len(todo)} to run", file=sys.stderr)
        with open(part, "a") as fp:
            for x in pool.imap_unordered(task, todo, chunksize=1):
                x["N"], x["npose"] = N, NPOSE
                fp.write(json.dumps(x, separators=(",", ":"), default=float) + "\n")
                fp.flush()
                done[(x["robot"], x["j"])] = x
                print(f"  done {x['robot']} load {x['j']} at {time.time() - T0:.0f} s", file=sys.stderr)
        res = [done[(jb[0], jb[1])] for jb in jobs]
    out["limits"], out["runs"] = lims, res
    print(f"# Milestone 70: a bias that drifts between calibration and press, held-out section Q ({N} loads, seed "
          f"{SEED}; milestone 69's two-pose references; calibration bias B along J, drift delta along S, joint "
          f"worst row, both signs; milestone 65's chain sized to B + delta; spec {SPEC} mm per row)")
    # A. S: a property of the pose? and its size against J
    print("\n## A. The uncompensated sensitivity S: robot | presses with S | poses | max spread of S over loads "
          "mm/N | median max_k ||S_k|| mm/N | largest max_k ||S_k|| | median max_k ||J_k|| | weakest drift rating "
          "0.03/max||S|| N")
    A, SP = {}, {}
    for n in ("g1", "h1"):
        per, ms, mj = {}, [], []
        for x in res:
            if x["robot"] != n:
                continue
            for rec in x["rows"]:
                if rec["S"] is None:
                    continue
                S = np.array(rec["S"])
                per.setdefault(tuple(rec["pose"]), []).append(S)
                ms.append(float(np.linalg.norm(S, axis=1).max()))
                mj.append(float(np.linalg.norm(np.array(rec["J"]), axis=1).max()))
        spread = max(float(np.abs(np.array(v) - v[0]).max()) for v in per.values())
        SP[n] = {p: np.linalg.norm(v[0], axis=1).tolist() for p, v in per.items()}
        A[n] = {"presses": len(ms), "poses": len(per), "spread": spread, "medS": float(np.median(ms)),
                "maxS": max(ms), "medJ": float(np.median(mj)), "rating": SPEC / max(ms)}
        a = A[n]
        print(f"  {n} | {a['presses']} | {a['poses']} | {a['spread']:.2e} | {a['medS']:.4f} | {a['maxS']:.4f} | "
              f"{a['medJ']:.4f} | {a['rating']:.3f}")
    # B. superposition
    print("\n## B. Superposition: robot | planned presses | max |s0 - (J e_r + S d)| mm over the four rows")
    SU = {}
    for n in ("g1", "h1"):
        dif = []
        for x in res:
            if x["robot"] != n:
                continue
            for rec in x["rows"]:
                if rec["S"] is None:
                    continue
                J, S = np.array(rec["J"]), np.array(rec["S"])
                for c in rec["cases"].values():
                    p = E66.planned_rec(c)
                    if p is None:
                        continue
                    er_, ep_ = np.array(c["e_r"]), np.array(c["e_p"])
                    pred = J @ er_ + S @ (ep_ - er_)
                    dif.append(float(np.abs(np.array(p["s0"]) - pred).max()))
        SU[n] = {"n": len(dif), "dmax": max(dif) if dif else None}
        print(f"  {n} | {len(dif)} | {SU[n]['dmax']:.2e}")
    # C. gates
    print("\n## C. By robot, B and delta: robot | B N | delta N | balance-envelope cases | planned | over spec | "
          "worst mm | old gate passed | old gate passed over spec | old worst passed mm | drift gate passed | "
          "drift gate coverage % | drift gate passed over spec | drift worst passed mm")
    G, OV = {}, []
    for n in ("g1", "h1"):
        for b in BS:
            for d in DS:
                nin = pl = ov = go = goov = gn = gnov = 0
                wc = wo = wn = 0.0
                for x in res:
                    if x["robot"] != n:
                        continue
                    for rec in x["rows"]:
                        if rec["S"] is None:
                            continue
                        gJ = np.linalg.norm(np.array(rec["J"]), axis=1)
                        gS = np.linalg.norm(np.array(rec["S"]), axis=1)
                        for sc in ("+", "-"):
                            r = rec["cases"][f"{b:g}/{d:g}{sc}"]
                            nin += r["in51"]
                            p = E66.planned_rec(r)
                            if p is None:
                                continue
                            pl += 1
                            w = max(p[kk] for kk in AX)
                            o = w > SPEC + 1e-12
                            wc, ov = max(wc, w), ov + o
                            g_old, g_new = gates(p, b, d, gJ, gS)
                            if g_old:
                                go, goov, wo = go + 1, goov + o, max(wo, w)
                            if g_new:
                                gn, gnov, wn = gn + 1, gnov + o, max(wn, w)
                                if o:
                                    OV.append({"robot": n, "B": b, "d": d, "pose": rec["pose"], "worst": w})
                s = {"in51": nin, "planned": pl, "over": ov, "cworst": wc, "old": go, "oldover": goov, "oldworst": wo,
                     "new": gn, "ncov": 100.0 * gn / max(nin, 1), "newover": gnov, "newworst": wn}
                G[f"{n} {b:g} {d:g}"] = s
                print(f"  {n} | {b:.1f} | {d:.2f} | {nin} | {pl} | {ov} | {wc:.4f} | {go} | {goov} | {wo:.4f} | {gn} | "
                      f"{s['ncov']:.2f} | {gnov} | {wn:.4f}")
    print(f"\n## D. Drift-gate-passed presses over spec: {len(OV)}")
    for o in sorted(OV, key=lambda q: -q["worst"])[:20]:
        print(f"  {o}")
    print("\n## E. Hypotheses (registered in LOG.md before this run)")
    Dh = {}
    dm = max(SU[n]["dmax"] for n in ("g1", "h1"))
    Dh["H271"] = dm <= 1e-6
    print(f"H271 (superposition: every planned press's no-flip rows equal J e_r + S d to 1e-6 mm, both robots): "
          f"largest difference {dm:.2e} -> {'held' if Dh['H271'] else 'refuted'}")
    sp = max(A[n]["spread"] for n in ("g1", "h1"))
    Dh["H272"] = sp <= 1e-6
    print(f"H272 (S is a property of the pose: spread over loads at most 1e-6 mm/N): {sp:.2e} -> "
          f"{'held' if Dh['H272'] else 'refuted'}")
    ob = {n: G[f"{n} 0.4 0.1"]["oldover"] for n in ("g1", "h1")}
    Dh["H273"] = all(v >= 1 for v in ob.values())
    print(f"H273 (drift breaks the drift-blind gate: at B 0.4 N, delta 0.1 N at least one old-gate-passed press over "
          f"spec on each robot): G1 {ob['g1']}, H1 {ob['h1']} -> {'held' if Dh['H273'] else 'refuted'}")
    nv = sum(G[kk]["newover"] for kk in G)
    Dh["H274"] = nv == 0
    print(f"H274 (the drift gate keeps every passed press inside the spec, every B, delta, both robots): {nv} over "
          f"-> {'held' if Dh['H274'] else 'refuted'}")
    rt = {n: A[n]["rating"] for n in ("g1", "h1")}
    Dh["H275"] = all(v < 0.2 for v in rt.values())
    print(f"H275 (drift is costlier than bias: weakest drift rating 0.03/max||S|| under 0.2 N on both robots): "
          f"G1 {rt['g1']:.3f}, H1 {rt['h1']:.3f} -> {'held' if Dh['H275'] else 'refuted'}")
    out["A"], out["SU"], out["G"], out["OV"], out["D"] = A, SU, G, OV, Dh
    out["Stab"] = {n: {str(list(p)): v for p, v in t.items()} for n, t in SP.items()}
    json.dump(out, open(os.path.join(HERE, "results.json"), "w"), separators=(",", ":"), default=float)
    os.remove(os.path.join(HERE, "partial.jsonl"))
    print(f"\n(run time {time.time() - T0:.0f} s; python {platform.python_version()}, numpy {np.__version__}, "
          f"mujoco {M1.mujoco.__version__})")
