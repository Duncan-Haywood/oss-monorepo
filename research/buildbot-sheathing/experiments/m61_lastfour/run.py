"""Milestone 61: milestone 60's last unplanned presses: a wider arm squeeze, and the planner's own envelope.

Milestone 60 (seed 60) left 4 of 9408 in-envelope cases unplanned after raising the leg preload: an H1 case binding
on the right elbow, and 3 G1 cases with no force plan on any side. A development probe on those four (probe.py,
probe2.py, probe3.py; seed 60, not held out) found the elbow case planned by a squeeze above milestone 38's S* = 10 N
(S* is the smallest squeeze with milestone 38's lowest G1 residual, not a hardware bound), and the G1 cases outside or
at the edge of the planner's own limit L_p (the hold QP with holding threshold and leg preload), which is tighter than
the envelope gate (milestone 50's balance-and-cones LP).

The chain per in-envelope case:
  1. milestone 59's four-row rule (``m59.rule_all``, pose sides then per-load sides);
  2. if no plan: milestone 60's uniform leg preload raise, smallest margin first on LEG (<= 0.18 N m);
  3. if still none: milestone 59's rule with the squeeze bound S* replaced by S on SQ (smallest first; the arms'
     MJCF torque limits still checked; base leg margins).
For every pose and load direction L_p is bisected (``m55.plan_forces`` on the pose's sides, 20 steps on [0, 60] N)
and reported against the balance limit. Section H is held out: 48 Latin-hypercube loads (seed 61), 6 random-direction
0.2 N errors (seed 61). Check: with no escalation, milestone 59's rule against milestone 58's own ``rule_all``
("iso") on the first M61_CHECK loads per robot. Hypotheses H238-H240 (LOG.md, registered before the run).
M61_PROCS sets the pool (default 4); M61_N the loads.
"""
import os as _os
for _v in ("OMP_NUM_THREADS", "OPENBLAS_NUM_THREADS", "MKL_NUM_THREADS"):
    _os.environ.setdefault(_v, "1")
import json
import math
import os
import platform
import sys
import time

N = int(os.environ.get("M61_N", "48"))
os.environ["M59_N"] = str(N)
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "m60_jointpreload"))
import numpy as np  # noqa: E402
import core as C  # noqa: E402  (milestone 60's core: m59's rule and the leg raise)

T0 = time.time()
E59, E58, E55, E54, E51, M1 = C.E59, C.E58, C.E55, C.E54, C.E51, C.M1
SPEC, B, EPS, AX = E59.SPEC, E59.B, E59.EPS, E59.AX
NCHECK = int(os.environ.get("M61_CHECK", "2"))
SEED = 61
LOADS = E54.lhs(N, SEED)
ERRS = [B * a for a in E55.rand_dirs(6, SEED)]
LEG = [0.12, 0.14, 0.16, 0.18]                    # N m, milestone 60's ladder up to H235's ceiling
SQ = [12.5, 15.0, 17.5, 20.0]                     # N, the squeeze ladder (H238's ceiling 20 N)
BAND = 0.5                                        # N, H239/H240's band below L_p (chosen from the probe)
S0 = E58.R45.S_STAR


def lp(key, phi, hmax=60.0, it=20):
    """The planner's own limit: largest H (N) at direction phi with a force plan on the pose's sides."""
    ok = lambda H: E55.plan_forces(key, np.asarray(M1.hose_f(key, H, phi), float)) is not None  # noqa: E731
    if not ok(0.0):
        return None
    if ok(hmax):
        return hmax
    a, b = 0.0, hmax
    for _ in range(it):
        m = (a + b) / 2
        a, b = (m, b) if ok(m) else (a, m)
    return a


def task_limits(args):
    key, phis = args
    C.setup(key[0])
    return key, [E54.limit(key, math.radians(p)) for p in phis], [lp(key, math.radians(p)) for p in phis]


def brief(o):
    return None if o is None or o.get("y") is None else {k: o[k] for k in (*AX, "flips", "how")}


def squeeze(key, ref, f, e, er_r):
    o = None
    for S in SQ:
        E58.R45.S_STAR = S
        try:
            o = E59.rule_all(key, ref, f, e, er_r)[C.CFG]
        finally:
            E58.R45.S_STAR = S0
        if o.get("y") is not None:
            return S, o
    return None, o


def task(args):
    n, j, lim, lpl = args
    H, phd = LOADS[j]
    phi = math.radians(phd)
    C.setup(n)
    keys = sorted(k for k in M1.KEYS if k[0] == n)
    ref = E51.ref_key(n)
    f_slack = M1.hose_f(ref, 0.0, 0.0)
    rows, checks = [], []
    for ai, e in enumerate(ERRS):
        e = np.asarray(e, float)
        _, _, er_r, _, _, _ = E55.robust_rule(ref, f_slack, e)
        for k in keys:
            lk, lr, pk = lim[str(list(k))], lim[str(list(ref))], lpl[str(list(k))]
            in51 = lk is not None and H <= lk + EPS and lr is not None and H <= lr + EPS
            inp = bool(in51 and pk is not None and H <= pk - BAND + EPS)
            row = {"pose": list(k[1:]), "axis": ai, "in51": bool(in51), "inp": inp, "cal": er_r is not None,
                   "lp": pk, "lim": lk}
            if not in51 or er_r is None:
                rows.append(row)
                continue
            f = M1.hose_f(k, H, phi)
            fm = np.asarray(f, float) + e
            o = E59.rule_all(k, ref, f, e, er_r)[C.CFG]
            row["out"] = brief(o) or {"how": "none", "bind": o.get("bind")}
            if o["how"] == "none":
                Mu, ou = C.escalate(k, ref, f, e, er_r, None, LEG)
                st = {"bind": o.get("bind"), "Mu": Mu, "u": brief(ou)}
                if Mu is None:
                    St, os_ = squeeze(k, ref, f, e, er_r)
                    st |= {"S": St, "s": brief(os_), "pf_pose": E55.plan_forces(k, fm) is not None,
                           "pf_true": E55.plan_forces(k, np.asarray(f, float)) is not None}
                    if St is None:                # any hold-side combination with a force plan?
                        anyside = []
                        import itertools
                        for comb in itertools.product((-1.0, 1.0), repeat=len(E59.E53.sides(k))):
                            anyside.append(E55.with_sides(k, np.array(comb),
                                                          lambda: E55.plan_forces(k, fm) is not None))
                        st["pf_any"] = any(anyside)
                row["esc"] = st
            rows.append(row)
            if j < NCHECK:
                o58 = E58.rule_all(k, ref, f, e, er_r)["iso"]
                a, b = o58.get("y"), o.get("y")
                checks.append({"how58": o58["how"], "how": o["how"], "mismatch": (a is None) != (b is None),
                               "d": 0.0 if (a is None or b is None) else max(abs(a - b), abs(o58["z"] - o["z"]))})
    return {"robot": n, "j": j, "H": H, "phi": phd, "rows": rows, "checks": checks}


def planned(r):
    if r["out"].get("y") is not None:
        return True
    e = r.get("esc", {})
    return e.get("Mu") is not None or e.get("S") is not None


if __name__ == "__main__":
    procs = int(os.environ.get("M61_PROCS", "4"))
    allkeys = sorted(set(k for k in M1.KEYS) | {E51.ref_key(n) for n in ("g1", "h1")})
    ctx = M1.mp.get_context("fork")
    out = {"versions": {"python": platform.python_version(), "numpy": np.__version__,
                        "mujoco": M1.mujoco.__version__}, "spec_mm": SPEC, "B": B, "seed": SEED, "loads": LOADS,
           "errs": [list(map(float, e)) for e in ERRS], "leg": LEG, "sq": SQ, "band": BAND, "S0": S0}
    with ctx.Pool(procs) as pool:
        phis = [p for _, p in LOADS]
        L = pool.map(task_limits, [(k, phis) for k in allkeys], chunksize=1)
        lims = {str(list(k)): v for k, v, _ in L}
        lps = {str(list(k)): w for k, _, w in L}
        jobs = [(n, j, {kk: v[j] for kk, v in lims.items()}, {kk: v[j] for kk, v in lps.items()})
                for n in ("g1", "h1") for j in range(N)]
        res = pool.map(task, jobs, chunksize=1)
    out["limits"], out["lp"], out["runs"] = lims, lps, res
    print(f"# Milestone 61: the last unplanned presses, held-out section H ({N} loads, seed {SEED}; four-row rule, "
          f"spec {SPEC} mm; leg ladder {LEG} N m; squeeze ladder {SQ} N (S* {S0:g} N); band {BAND} N; B = {B:.2f} N)")
    print("errors (6 random directions, seed 61): "
          + "; ".join("(" + ", ".join(f"{c:+.3f}" for c in e) + ")" for e in ERRS))
    ch = [c for x in res for c in x["checks"]]
    print(f"check (four-row, no escalation, against milestone 58's rule_all 'iso', first {NCHECK} loads per robot): "
          f"{len(ch)} cases, plan/no-plan mismatches {sum(c['mismatch'] for c in ch)}, 'how' mismatches "
          f"{sum(c['how58'] != c['how'] for c in ch)}, largest |y| or |z| difference "
          f"{max((c['d'] for c in ch), default=0.0):.1e} mm")
    print("\n## A. The planner's limit L_p against the balance limit (every pose and load direction): robot | "
          "pairs | L_p none | balance - L_p median, max (N) | pairs with L_p < balance - 0.01 N")
    G = {}
    for n in ("g1", "h1"):
        d, none, tot = [], 0, 0
        for kk in lims:
            if f"'{n}'" not in kk:
                continue
            for a, b in zip(lims[kk], lps[kk]):
                if a is None:
                    continue
                tot += 1
                if b is None:
                    none += 1
                    continue
                d.append(a - b)
        G[n] = {"pairs": tot, "none": none, "med": float(np.median(d)), "max": float(max(d)),
                "n_gap": int(sum(x > 0.01 for x in d))}
        print(f"  {n} | {tot} | {none} | {G[n]['med']:.3f}, {G[n]['max']:.3f} | {G[n]['n_gap']}")
    print("\n## B. Coverage: robot | in-envelope | m59 rule | + leg raise | + squeeze | unplanned | coverage | "
          "planner-envelope cases | of them planned | balance-envelope cases the planner gate drops")
    S = {}
    for n in ("g1", "h1"):
        rr = [r for x in res if x["robot"] == n for r in x["rows"] if r["in51"] and "out" in r]
        nin = sum(r["in51"] for x in res if x["robot"] == n for r in x["rows"])
        base = sum(r["out"].get("y") is not None for r in rr)
        nu = sum(1 for r in rr if r.get("esc", {}).get("Mu") is not None)
        ns = sum(1 for r in rr if r.get("esc", {}).get("S") is not None)
        un = [r for r in rr if not planned(r)]
        pin = [r for r in rr if r["inp"]]
        s = {"in51": nin, "base": base, "u": nu, "s": ns, "un": len(un), "cov": 100.0 * (nin - len(un)) / max(nin, 1),
             "inp": len(pin), "inp_pl": sum(planned(r) for r in pin), "drop": nin - len(pin)}
        S[n] = s
        print(f"  {n} | {nin} | {base} | {nu} | {ns} | {len(un)} | {s['cov']:.2f}% | {s['inp']} | {s['inp_pl']} | "
              f"{s['drop']} ({100.0 * s['drop'] / max(nin, 1):.2f}%)")
    print("\n## C. Each case the rule leaves unplanned: robot | pose | H N | phi deg | error | binding joint | leg M "
          "| squeeze S (|y|, |z|, |y_d|, |z_d| mm; flips) | force plan: pose sides measured, true load, any side | "
          "L_p, balance (N) | in planner envelope")
    allesc = []
    for x in res:
        for r in x["rows"]:
            if "esc" not in r:
                continue
            e = r["esc"]
            allesc.append((x, r, e))

            def fo(M, o):
                return "-" if M is None else (f"{M:g} (" + ", ".join(f"{o[a]:.4f}" for a in AX) + f"; {o['flips']})")
            pf = ("-" if "pf_pose" not in e else
                  f"{e['pf_pose']}, {e['pf_true']}, {e.get('pf_any', '-')}")
            lpv = "-" if r["lp"] is None else f"{r['lp']:.3f}"
            print(f"  {x['robot']} | {r['pose']} | {x['H']:.2f} | {x['phi']:.1f} | {r['axis']} | {e['bind']} | "
                  f"{fo(e['Mu'], e['u'])} | {fo(e.get('S'), e.get('s'))} | {pf} | {lpv}, {r['lim']:.3f} | {r['inp']}")
    print("\n## D. Hypotheses (registered in LOG.md before this run)")
    D = {}
    arm = [(x, r, e) for x, r, e in allesc if e["Mu"] is None and e.get("pf_pose")]
    ok = [e for _, _, e in arm if e.get("S") is not None and e["S"] <= 20.0 + 1e-12
          and all(e["s"][a] <= SPEC + 1e-12 for a in AX) and e["s"]["flips"] == 0]
    D["H238"] = None if not arm else len(ok) == len(arm)
    print(f"H238 (a squeeze <= 20 N plans every case left with a pose-side force plan, in spec, no flip): cases "
          f"{len(arm)}, planned so {len(ok)} -> "
          + ("untestable" if D["H238"] is None else ("held" if D["H238"] else "refuted")))
    nf = [(x, r, e) for x, r, e in allesc if e.get("S") is None and e["Mu"] is None and not e.get("pf_any", True)]
    inb = [1 for x, r, e in nf if r["lp"] is None or x["H"] > r["lp"] - BAND]
    D["H239"] = None if not nf else len(inb) == len(nf)
    print(f"H239 (every case with no force plan on any side has H > L_p - {BAND} N): cases {len(nf)}, in the band "
          f"{len(inb)} -> " + ("untestable" if D["H239"] is None else ("held" if D["H239"] else "refuted")))
    miss = sum(S[n]["inp"] - S[n]["inp_pl"] for n in S)
    D["H240"] = miss == 0
    print(f"H240 (the chain plans every case inside the planner envelope, H <= L_p - {BAND} N): cases "
          f"{sum(S[n]['inp'] for n in S)}, unplanned {miss} -> {'held' if D['H240'] else 'refuted'}")
    out["G"], out["S"], out["D"] = G, S, D
    json.dump(out, open(os.path.join(HERE, "results.json"), "w"), separators=(",", ":"), default=float)
    print(f"\n(run time {time.time() - T0:.0f} s; python {platform.python_version()}, numpy {np.__version__}, "
          f"mujoco {M1.mujoco.__version__})")
