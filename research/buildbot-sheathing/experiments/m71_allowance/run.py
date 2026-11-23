"""Milestone 71: a frozen drift table and an exact per-press drift allowance.

Milestone 70 measured each press's uncompensated sensitivity S (four chain runs per press) and found the compensated
no-flip residual exactly J e_r + S d, with S one matrix per pose over its loads (spread 3e-14 mm/N). So S, like J
(milestone 68), can be frozen into a per-pose table, and the drift gate Y_k + B ||J_k|| + delta ||S_k|| <= 0.03 mm
needs no measurement at press time. Read the other way, the gate gives each press a drift allowance

    a = min_k (0.03 - Y_k - B ||J_k||) / ||S_k||,

the largest drift between calibration and press that the certificate tolerates. If the residual is exact, the
allowance is tight: a drift of a little more than a, aimed along the binding row's S, takes the press out of spec.
Divided by a sensor's drift rate it is the longest time a press may wait after a re-zero.

This run freezes milestone 70's S table and milestone 69's two-pose J table and, on held-out section R (8 Latin-
hypercube loads, seed 71), at B = 0.4 N, computes each press's allowance a0 from the tables alone (Y = 0, as before
the run Y is unknown), then presses at delta = 0.9 a0, 1.1 a0 and 0.1 N, the bias and drift aimed jointly as in
milestone 70 (e_r along J_k*, drift along S_k*, both signs), planner sized to B + delta (milestone 65's chain).
Hypotheses H276-H280 (LOG.md, registered before the run). Finished tasks go to ``partial.jsonl`` so a stopped run
resumes. M71_PROCS sets the pool (default 4); M71_N the loads; M71_POSES limits the poses per robot and M71_SEED
the load draw (timing only).
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

N = int(os.environ.get("M71_N", "8"))
os.environ["M70_N"] = str(N)
NPOSE = int(os.environ.get("M71_POSES", "0"))
SEED = int(os.environ.get("M71_SEED", "71"))
HERE = os.path.dirname(os.path.abspath(__file__))
import numpy as np  # noqa: E402

spec = importlib.util.spec_from_file_location("m70", os.path.join(HERE, "..", "m70_drift", "run.py"))
E70 = importlib.util.module_from_spec(spec)
sys.modules["m70"] = E70
spec.loader.exec_module(E70)                     # milestone 70's aim, J table and wrappers

T0 = time.time()
E69, E66, E65, E63, E54, E55, M1, C = E70.E69, E70.E66, E70.E65, E70.E63, E70.E54, E70.E55, E70.M1, E70.C
SPEC, AX = E70.SPEC, E70.AX
E69.E61.SEED = SEED
E65.SEED = SEED
LOADS = E54.lhs(N, SEED)
BIAS = 0.4                                   # not "B": milestone 65's set_bound rewrites any module float named B
FRACS = (0.9, 1.1)
DFIX = 0.1
RATES = (0.01, 0.02, 0.05, 0.1, 0.2, 0.5)      # N/h, swept: no drift rate for this sensor class was found


def stab():
    """Milestone 70's S, one 4 x 3 matrix (mm/N) per (robot, pose), from its first load with S."""
    d = json.load(open(os.path.join(HERE, "..", "m70_drift", "results.json")))
    t = {}
    for x in d["runs"]:
        for rec in x["rows"]:
            if rec["S"] is not None:
                t.setdefault(x["robot"], {}).setdefault(tuple(rec["pose"]), np.array(rec["S"]))
    return t


STAB = stab()


def allowance(Y, J, S, b):
    gJ, gS = np.linalg.norm(J, axis=1), np.linalg.norm(S, axis=1)
    return float(np.min((SPEC - np.asarray(Y, float) - b * gJ) / gS))


def task(args):
    n, j, lim = args
    H, phd = LOADS[j]
    phi = math.radians(phd)
    C.setup(n)
    keys = sorted(k for k in M1.KEYS if k[0] == n)
    if NPOSE:
        keys = keys[:NPOSE]
    cal = {}

    def er(ref, bb, e):
        t = (ref, bb) + tuple(np.round(e, 12))
        if t not in cal:
            cal[t] = E55.robust_rule(ref, M1.hose_f(ref, 0.0, 0.0), np.asarray(e, float))[2]
        return cal[t]
    rows = []
    for k in keys:
        lk = lim[str(list(k))]
        f = np.asarray(M1.hose_f(k, H, phi), float)
        J, a = E70.jtab(n, tuple(k[1:]))
        S = STAB.get(n, {}).get(tuple(k[1:]))
        rec = {"pose": list(k[1:]), "a0": None, "cases": {}}
        if J is None or S is None:
            rows.append(rec)
            continue
        ref = (n,) + tuple(a)
        lr = lim[str(list(ref))]
        a0 = allowance(np.zeros(4), J, S, BIAS)
        rec.update(ref=list(a), J=J.tolist(), S=S.tolist(), a0=a0)
        if a0 <= 0:
            rows.append(rec)
            continue
        for tag, d in (("0.9a", FRACS[0] * a0), ("1.1a", FRACS[1] * a0), ("0.1", DFIX)):
            E65.set_bound(BIAS + d)
            ks, eru, du = E70.aim(J, S, BIAS, d)
            for sgn, sc in ((1, "+"), (-1, "-")):
                e_r, e_p = sgn * eru, sgn * (eru + du)
                r = E63.run_case(k, ref, f, e_p, er(ref, BIAS + d, e_r), lk, lr, H)
                r["ks"], r["d"], r["e_r"], r["e_p"] = ks, d, e_r.tolist(), e_p.tolist()
                rec["cases"][tag + sc] = r
        E65.set_bound(E65.B0)
        rows.append(rec)
    return {"robot": n, "j": j, "H": H, "phi": phd, "rows": rows}


def worst(p):
    return max(p[kk] for kk in AX)


if __name__ == "__main__":
    procs = int(os.environ.get("M71_PROCS", "4"))
    E65.set_bound(0.7)
    chk = E65.bound_now()
    assert chk and all(v == 0.7 for _, v in chk), chk
    E65.set_bound(E65.B0)
    PLAN = E70.PLAN
    allkeys = sorted(set(k for k in M1.KEYS) | {(n,) + tuple(r) for n in PLAN for r in PLAN[n]["refs"]}
                     | {E70.E51.ref_key(n) for n in ("g1", "h1")})
    ctx = M1.mp.get_context("fork")
    phis = [p for _, p in LOADS]
    out = {"versions": {"python": platform.python_version(), "numpy": np.__version__,
                        "mujoco": M1.mujoco.__version__}, "spec_mm": SPEC, "seed": SEED, "loads": LOADS, "B": BIAS,
           "fracs": FRACS, "dfix": DFIX, "rates": RATES, "bound_globals": [m for m, _ in chk], "npose": NPOSE}

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
                if x.get("N") == N and x.get("npose") == NPOSE and x.get("seed") == SEED:
                    done[(x["robot"], x["j"])] = x
        todo = [jb for jb in jobs if (jb[0], jb[1]) not in done]
        print(f"resuming: {len(done)} tasks from partial.jsonl, {len(todo)} to run", file=sys.stderr)
        with open(part, "a") as fp:
            for x in pool.imap_unordered(task, todo, chunksize=1):
                x["N"], x["npose"], x["seed"] = N, NPOSE, SEED
                fp.write(json.dumps(x, separators=(",", ":"), default=float) + "\n")
                fp.flush()
                done[(x["robot"], x["j"])] = x
                print(f"  done {x['robot']} load {x['j']} at {time.time() - T0:.0f} s", file=sys.stderr)
        res = [done[(jb[0], jb[1])] for jb in jobs]
    out["limits"], out["runs"] = lims, res
    print(f"# Milestone 71: a frozen drift table and an exact per-press drift allowance, held-out section R ({N} "
          f"loads, seed {SEED}; milestone 70's S table and milestone 69's two-pose J table, frozen; B = {BIAS} N; drift "
          f"0.9 a0, 1.1 a0 and {DFIX} N aimed jointly along the worst row, both signs; milestone 65's chain sized to "
          f"B + delta; spec {SPEC} mm per row)")
    # A. superposition with the frozen tables
    print("\n## A. Frozen tables: robot | poses in the S table | planned presses | max |s0 - (J e_r + S d)| mm")
    SU = {}
    for n in ("g1", "h1"):
        dif = []
        for x in res:
            if x["robot"] != n:
                continue
            for rec in x["rows"]:
                if not rec["cases"]:
                    continue
                J, S = np.array(rec["J"]), np.array(rec["S"])
                for c in rec["cases"].values():
                    p = E66.planned_rec(c)
                    if p is None:
                        continue
                    er_, ep_ = np.array(c["e_r"]), np.array(c["e_p"])
                    dif.append(float(np.abs(np.array(p["s0"]) - (J @ er_ + S @ (ep_ - er_))).max()))
        SU[n] = {"poses": len(STAB.get(n, {})), "n": len(dif), "dmax": max(dif) if dif else float("nan")}
        print(f"  {n} | {SU[n]['poses']} | {len(dif)} | {SU[n]['dmax']:.2e}")
    # B. per case tag
    print("\n## B. By robot and drift: robot | drift | balance-envelope cases | planned | over spec | worst mm | "
          "gate passed (Y + B||J|| + delta||S|| <= spec, frozen tables) | gate passed over spec | worst passed mm | "
          "planned with Y = 0 on every row | of those over spec | of those inside spec (min mm)")
    G, OVP, TIGHT = {}, [], []
    for n in ("g1", "h1"):
        for tag in ("0.9a", "1.1a", "0.1"):
            nin = pl = ov = gp = gov = y0 = y0ov = 0
            wc = wp = 0.0
            y0in = []
            for x in res:
                if x["robot"] != n:
                    continue
                for rec in x["rows"]:
                    if not rec["cases"]:
                        continue
                    gJ = np.linalg.norm(np.array(rec["J"]), axis=1)
                    gS = np.linalg.norm(np.array(rec["S"]), axis=1)
                    for sc in ("+", "-"):
                        r = rec["cases"][tag + sc]
                        nin += r["in51"]
                        p = E66.planned_rec(r)
                        if p is None:
                            continue
                        pl += 1
                        w = worst(p)
                        o = w > SPEC + 1e-12
                        ov, wc = ov + o, max(wc, w)
                        g = all(y + BIAS * a + r["d"] * s <= SPEC + 1e-12 for y, a, s in zip(p["Y"], gJ, gS))
                        if g:
                            gp, gov, wp = gp + 1, gov + o, max(wp, w)
                            if o:
                                OVP.append({"robot": n, "tag": tag + sc, "pose": rec["pose"], "worst": w})
                        if max(p["Y"]) == 0 and p.get("flips", 0) == 0:
                            y0 += 1
                            y0ov += o
                            if not o:
                                y0in.append(w)
                                if tag == "1.1a":
                                    TIGHT.append({"robot": n, "sc": sc, "pose": rec["pose"], "worst": w})
            s = {"in51": nin, "planned": pl, "over": ov, "worst": wc, "gate": gp, "gateover": gov, "gateworst": wp,
                 "cov": 100.0 * gp / max(nin, 1), "y0": y0, "y0over": y0ov, "y0in": len(y0in),
                 "y0inmin": min(y0in) if y0in else None}
            G[f"{n} {tag}"] = s
            mi = f"{s['y0inmin']:.4f}" if y0in else "-"
            print(f"  {n} | {tag} | {nin} | {pl} | {ov} | {wc:.4f} | {gp} | {gov} | {wp:.4f} | {y0} | {y0ov} | "
                  f"{len(y0in)} ({mi})")
    # C. the allowance, from the run's Y
    print("\n## C. Drift allowance a = min_k (0.03 - Y_k - B||J_k||)/||S_k|| per press (Y from the 0.9 a0 presses, "
          "larger of the two signs): robot | presses | presses with Y > 0 | min N | 10th pct | median | 90th pct | "
          "max")
    AL = {}
    for n in ("g1", "h1"):
        al, ypos = [], 0
        for x in res:
            if x["robot"] != n:
                continue
            for rec in x["rows"]:
                if not rec["cases"]:
                    continue
                Ys = [E66.planned_rec(rec["cases"]["0.9a" + sc]) for sc in "+-"]
                Ys = [p["Y"] for p in Ys if p is not None]
                if not Ys:
                    continue
                Y = np.max(np.array(Ys), axis=0)
                ypos += Y.max() > 0
                al.append(allowance(Y, np.array(rec["J"]), np.array(rec["S"]), BIAS))
        al = np.array(al)
        q = np.quantile(al, [0.1, 0.5, 0.9])
        AL[n] = {"n": len(al), "ypos": int(ypos), "min": float(al.min()), "q10": float(q[0]), "med": float(q[1]),
                 "q90": float(q[2]), "max": float(al.max()), "all": al.tolist()}
        a = AL[n]
        print(f"  {n} | {a['n']} | {a['ypos']} | {a['min']:.4f} | {a['q10']:.4f} | {a['med']:.4f} | {a['q90']:.4f} | "
              f"{a['max']:.4f}")
    # D. re-zero interval
    print("\n## D. Longest wait after a re-zero, minutes = 60 a / rate (rate swept, not sourced): robot | rate N/h | "
          "weakest press | 10th pct | median")
    RZ = {}
    for n in ("g1", "h1"):
        for rt in RATES:
            a = AL[n]
            RZ[f"{n} {rt:g}"] = [60 * a["min"] / rt, 60 * a["q10"] / rt, 60 * a["med"] / rt]
            print(f"  {n} | {rt:g} | {RZ[f'{n} {rt:g}'][0]:.1f} | {RZ[f'{n} {rt:g}'][1]:.1f} | "
                  f"{RZ[f'{n} {rt:g}'][2]:.1f}")
    print(f"\n## E. Gate-passed presses over spec: {len(OVP)}")
    for o in sorted(OVP, key=lambda q: -q["worst"])[:20]:
        print(f"  {o}")
    print(f"\n## F. 1.1 a0 presses with Y = 0 and no flip left inside spec: {len(TIGHT)}")
    for o in sorted(TIGHT, key=lambda q: q["worst"])[:20]:
        print(f"  {o}")
    print("\n## G. Hypotheses (registered in LOG.md before this run)")
    Dh = {}
    dm = max(SU[n]["dmax"] for n in ("g1", "h1"))
    Dh["H276"] = bool(dm <= 1e-6)
    print(f"H276 (the frozen tables predict every planned press's no-flip rows, J e_r + S d, to 1e-6 mm, both "
          f"robots): largest difference {dm:.2e} -> {'held' if Dh['H276'] else 'refuted'}")
    nv = sum(G[kk]["gateover"] for kk in G)
    Dh["H277"] = nv == 0
    print(f"H277 (the frozen-table drift gate passes no press over spec, every drift, both robots): {nv} over -> "
          f"{'held' if Dh['H277'] else 'refuted'}")
    o9 = {n: G[f"{n} 0.9a"]["y0over"] for n in ("g1", "h1")}
    Dh["H278"] = all(v == 0 for v in o9.values())
    print(f"H278 (the allowance is safe: no 0.9 a0 press with Y = 0 and no flip is over spec): G1 {o9['g1']}, H1 "
          f"{o9['h1']} -> {'held' if Dh['H278'] else 'refuted'}")
    t1 = {n: G[f"{n} 1.1a"]["y0in"] for n in ("g1", "h1")}
    Dh["H279"] = all(v == 0 for v in t1.values()) and all(G[f"{n} 1.1a"]["y0"] > 0 for n in ("g1", "h1"))
    print(f"H279 (the allowance is tight: every 1.1 a0 press with Y = 0 and no flip is over spec): inside spec G1 "
          f"{t1['g1']} of {G['g1 1.1a']['y0']}, H1 {t1['h1']} of {G['h1 1.1a']['y0']} -> "
          f"{'held' if Dh['H279'] else 'refuted'}")
    pred = {"g1": 0.1023, "h1": 0.1504}
    rel = {n: AL[n]["med"] / pred[n] for n in ("g1", "h1")}
    Dh["H280"] = all(0.75 <= v <= 1.25 for v in rel.values())
    print(f"H280 (the median allowance at B 0.4 N is within 25% of section Q's, 0.102 N G1 and 0.150 N H1): G1 "
          f"{AL['g1']['med']:.4f} ({rel['g1']:.2f}), H1 {AL['h1']['med']:.4f} ({rel['h1']:.2f}) -> "
          f"{'held' if Dh['H280'] else 'refuted'}")
    out.update(SU=SU, G=G, AL=AL, RZ=RZ, OVP=OVP, TIGHT=TIGHT, D=Dh)
    json.dump(out, open(os.path.join(HERE, "results.json"), "w"), separators=(",", ":"), default=float)
    os.remove(os.path.join(HERE, "partial.jsonl"))
    print(f"\n(run time {time.time() - T0:.0f} s; python {platform.python_version()}, numpy {np.__version__}, "
          f"mujoco {M1.mujoco.__version__})")
