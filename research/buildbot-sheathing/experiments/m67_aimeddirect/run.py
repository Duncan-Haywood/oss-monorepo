"""Milestone 67: does the 0.2 N guarantee survive a bias aimed at the direct term, with the calibration re-made under it?

Milestone 66 priced the bias's direct term D_k (the no-flip residual's sensitivity to the true load, the reference
calibration held fixed) and found it linear at 0.16 to 0.18 mm per N per press: to first order a 0.2 N bias aimed at
that sensitivity would move the nose 0.032 to 0.036 mm before any flip, yet no adversary so far aimed there. A constant
bias is present at the reference calibration too, and the compensation subtracts the reference pose's error, so part
of the direct effect may cancel. Here the adversary measures the full sensitivity, through the whole chain:

  R_k(e) = signed no-flip compensated residual of row k (nose y, z; depth point y, z) of the press the chain plans
           when the measured load is f + e, with the reference calibration re-made under the same bias e;
  J_k    = (R_k(h u_c) - R_k(0)) / h,  c = x, y, z,  h = 0.2 N (the chord over the ball, as for every gradient here);
  u      = J_k* / ||J_k*||,  k* = argmax_k ||J_k||   (the direction that moves some row the most, to first order).

The planner is milestone 65's chain sized to B (every margin; milestone 66's D is recorded beside it, no gate). The
true bias is B along +/- u for B = 0.15, 0.2 and 0.3 N, the direction computed once per press (planner sized to
0.2 N) and reused at each B. Cases whose zero-bias or any step press is unplanned fall back to milestone 63's
margin-aimed direction (counted). Section N is held out: 8 Latin-hypercube loads (seed 67). Hypotheses H257-H260
(LOG.md, registered before the run). Finished tasks go to ``partial.jsonl`` so a stopped run resumes.
M67_PROCS sets the pool (default 4); M67_N the loads.
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

N = int(os.environ.get("M67_N", "8"))
os.environ["M66_N"] = str(N)
HERE = os.path.dirname(os.path.abspath(__file__))
import numpy as np  # noqa: E402

spec = importlib.util.spec_from_file_location("m66", os.path.join(HERE, "..", "m66_directterm", "run.py"))
E66 = importlib.util.module_from_spec(spec)
sys.modules["m66"] = E66
spec.loader.exec_module(E66)                     # milestone 66's wrappers (D on every press), 65's re-sized chain

T0 = time.time()
E65, E63, E61, E59, E54, M1 = E66.E65, E66.E63, E66.E61, E66.E59, E66.E54, E66.M1
E55, E51, C = E63.E55, E65.E51, E65.C
SPEC, AX = E66.SPEC, E66.AX
SEED = 67
E61.SEED = SEED
E65.SEED = SEED
LOADS = E54.lhs(N, SEED)
BS = (0.15, 0.2, 0.3)
H_STEP = 0.2
UNIT = np.eye(3)
_resid = E59.resid


def resid(key, ref, rp, f, er_r):
    """Milestone 66's record plus the signed no-flip residual per row (mm) and the plan's side signs."""
    o = _resid(key, ref, rp, f, er_r)
    o["s0"] = [float(x) for x in E66.v0(key, ref, rp, f, er_r)]
    o["sides"] = [float(x) for x in np.ravel(rp.get("s", []))][:64]
    return o


_brief = E61.brief


def brief(o):
    r = _brief(o)
    if r is not None:
        r |= {"s0": o["s0"], "sides": o["sides"]}
    return r


E59.resid, E61.brief = resid, brief


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
        rec = {"pose": list(k[1:]), "cases": {}}
        E65.set_bound(H_STEP)
        pts = [np.zeros(3)] + [H_STEP * UNIT[c] for c in range(3)]
        P = [E66.planned_rec(E63.run_case(k, ref, f, e, er(H_STEP, e), lk, lr, H)) for e in pts]
        if all(p is not None for p in P):
            R0 = np.array(P[0]["s0"])
            J = np.stack([(np.array(P[c + 1]["s0"]) - R0) / H_STEP for c in range(3)], axis=1)   # 4 x 3, mm/N
            gn = np.linalg.norm(J, axis=1)
            ks = int(np.argmax(gn))
            u = J[ks] / gn[ks]
            same = all(p["how"] == P[0]["how"] and p["flips"] == P[0]["flips"] and p.get("sides") == P[0].get("sides")
                       for p in P[1:])
            rec["adv"] = {"src": "direct", "u": [float(x) for x in u], "row": AX[ks], "J": J.tolist(),
                          "gn": gn.tolist(), "R0": R0.tolist(), "D0": P[0]["D"], "Y0": P[0]["Y"], "same": bool(same)}
        else:
            u, *_ = E63.worst_dir(k, f)
            rec["adv"] = {"src": "m63", "u": [float(x) for x in u], "in51": P[0] is not None}
        for b in BS:
            E65.set_bound(b)
            for sgn, sc in ((1, "+"), (-1, "-")):
                e = sgn * b * u
                rec["cases"][f"B{b:g}{sc}"] = E63.run_case(k, ref, f, e, er(b, e), lk, lr, H)
        E65.set_bound(E65.B0)
        rows.append(rec)
    return {"robot": n, "j": j, "H": H, "phi": phd, "rows": rows}


if __name__ == "__main__":
    procs = int(os.environ.get("M67_PROCS", "4"))
    E65.set_bound(0.7)
    chk = E65.bound_now()
    assert chk and all(v == 0.7 for _, v in chk), chk
    E65.set_bound(E65.B0)
    allkeys = sorted(set(k for k in M1.KEYS) | {E51.ref_key(n) for n in ("g1", "h1")})
    ctx = M1.mp.get_context("fork")
    phis = [p for _, p in LOADS]
    out = {"versions": {"python": platform.python_version(), "numpy": np.__version__,
                        "mujoco": M1.mujoco.__version__}, "spec_mm": SPEC, "seed": SEED, "loads": LOADS,
           "bs": BS, "h": H_STEP, "bound_globals": [m for m, _ in chk]}

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
    print(f"# Milestone 67: a bias aimed at the full direct sensitivity (press minus reference, calibration re-made "
          f"under the bias), held-out section N ({N} loads, seed {SEED}; milestone 65's chain sized to B; true bias B "
          f"along +/- u; spec {SPEC} mm per row)")
    print(f"modules whose bound was set: {len(chk)}")
    print("\n## A. The direction, per robot: robot | presses with a direct-aimed direction | m63 fallback | "
          "same plan path at all four points | aimed row (y, z, yd, zd) | median ||J_k*|| mm/N | median max_k D_k/B "
          "mm/N (milestone 66's term at the same press) | median ratio ||J_k*|| / max_k D_k/B")
    A = {}
    for n in ("g1", "h1"):
        ads = [rec["adv"] for x in res if x["robot"] == n for rec in x["rows"]]
        dr = [a for a in ads if a["src"] == "direct"]
        jg = [max(a["gn"]) for a in dr]
        dd = [max(a["D0"]) / H_STEP for a in dr]
        rat = [g / d for g, d in zip(jg, dd) if d > 0]
        rows_ = {a: sum(1 for d in dr if d["row"] == a) for a in AX}
        A[n] = {"direct": len(dr), "fallback": len(ads) - len(dr), "same": sum(d["same"] for d in dr),
                "rows": rows_, "Jmed": float(np.median(jg)) if jg else None,
                "Dmed": float(np.median(dd)) if dd else None, "ratio": float(np.median(rat)) if rat else None,
                "ratio_p90": float(np.percentile(rat, 90)) if rat else None,
                "Jmax": float(max(jg)) if jg else None}
        a = A[n]
        print(f"  {n} | {a['direct']} | {a['fallback']} | {a['same']} | "
              + ", ".join(f"{r} {v}" for r, v in rows_.items())
              + f" | {a['Jmed']:.4f} | {a['Dmed']:.4f} | {a['ratio']:.3f} (90th pct {a['ratio_p90']:.3f}; "
              f"max ||J|| {a['Jmax']:.4f})")
    print("\n## B. Under the aimed bias, by robot and B (planner sized to B): robot | B N | balance-envelope cases | "
          "planned | coverage % | over spec | worst row mm | over spec with no flip | median |r_k*| - |R_k*(0)| "
          "per N of bias mm/N (direct-aimed presses)")
    S, OV = {}, []
    for n in ("g1", "h1"):
        for b in BS:
            pl = nin = ov = nof = 0
            w = 0.0
            gain = []
            for x in res:
                if x["robot"] != n:
                    continue
                for rec in x["rows"]:
                    ad = rec["adv"]
                    for sc in ("+", "-"):
                        c = f"B{b:g}{sc}"
                        r = rec["cases"][c]
                        nin += r["in51"]
                        p = E66.planned_rec(r)
                        if p is None:
                            continue
                        pl += 1
                        wr = max(p[a] for a in AX)
                        w = max(w, wr)
                        if wr > SPEC + 1e-12:
                            ov += 1
                            nof += p["flips"] == 0
                            OV.append({"robot": n, "B": b, "case": c, "pose": rec["pose"], "H": x["H"],
                                       "phi": x["phi"], "worst": wr, "flips": p["flips"], "how": p["how"],
                                       "src": ad["src"]})
                        if ad["src"] == "direct" and p["flips"] == 0:
                            ks = AX.index(ad["row"])
                            gain.append((abs(p["s0"][ks]) - abs(ad["R0"][ks])) / b)
            s = {"in51": nin, "planned": pl, "cov": 100.0 * pl / max(nin, 1), "over": ov, "worst": w,
                 "over_noflip": nof, "gain_med": float(np.median(gain)) if gain else None,
                 "gain_max": float(max(gain)) if gain else None}
            S[f"{n} {b:g}"] = s
            gm = "-" if s["gain_med"] is None else f"{s['gain_med']:.4f} (max {s['gain_max']:.4f})"
            print(f"  {n} | {b:.2f} | {nin} | {pl} | {s['cov']:.2f} | {ov} | {w:.4f} | {nof} | {gm}")
    print("\n## C. Over-spec presses (first 30, worst first): robot | B | case | pose | H N | phi deg | worst mm | "
          "flips | how | direction")
    for o in sorted(OV, key=lambda d: -d["worst"])[:30]:
        print(f"  {o['robot']} | {o['B']:.2f} | {o['case']} | {o['pose']} | {o['H']:.1f} | {o['phi']:.1f} | "
              f"{o['worst']:.4f} | {o['flips']} | {o['how']} | {o['src']}")
    print(f"  (total: {len(OV)})")
    print("\n## D. Hypotheses (registered in LOG.md before this run)")
    Dh = {}
    o2 = {n: S[f"{n} 0.2"]["over"] for n in ("g1", "h1")}
    Dh["H257"] = all(v == 0 for v in o2.values())
    print(f"H257 (the 0.2 N guarantee survives the aimed bias: no planned press over spec at 0.2 N, both robots): "
          f"over spec G1 {o2['g1']}, H1 {o2['h1']} -> {'held' if Dh['H257'] else 'refuted'}")
    Dh["H258"] = all(A[n]["ratio"] is not None and A[n]["ratio"] < 0.5 for n in ("g1", "h1"))
    print(f"H258 (the calibration cancels most of the direct term: median ||J_k*|| / max_k D_k/B under 0.5, both "
          f"robots): G1 {A['g1']['ratio']:.3f}, H1 {A['h1']['ratio']:.3f} -> {'held' if Dh['H258'] else 'refuted'}")
    o15 = {n: S[f"{n} 0.15"]["over"] for n in ("g1", "h1")}
    Dh["H259"] = all(v == 0 for v in o15.values())
    print(f"H259 (0.15 N, under milestone 66's certified median, holds: no planned press over spec, both robots): "
          f"over spec G1 {o15['g1']}, H1 {o15['h1']} -> {'held' if Dh['H259'] else 'refuted'}")
    o3 = {n: S[f"{n} 0.3"]["over"] for n in ("g1", "h1")}
    Dh["H260"] = any(v > 0 for v in o3.values())
    print(f"H260 (the aimed bias finds what milestone 63's missed at 0.3 N: at least one planned press over spec on "
          f"at least one robot): over spec G1 {o3['g1']}, H1 {o3['h1']} -> {'held' if Dh['H260'] else 'refuted'}")
    out["A"], out["S"], out["OV"], out["D"] = A, S, OV, Dh
    json.dump(out, open(os.path.join(HERE, "results.json"), "w"), separators=(",", ":"), default=float)
    os.remove(os.path.join(HERE, "partial.jsonl"))
    print(f"\n(run time {time.time() - T0:.0f} s; python {platform.python_version()}, numpy {np.__version__}, "
          f"mujoco {M1.mujoco.__version__})")
