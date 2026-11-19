"""Milestone 60: a raised leg preload for the presses milestone 59's bound leaves without a plan.

Milestone 59's four-row rule (nose and depth point, along and across the wall, 0.015 mm flip budget per row) left
19 of 5424 in-envelope H1 cases without a plan, binding on the left knee (10) and right ankle (8), with 1 case
with no plan on any side. All sat at the tallest poses (1.4 m and 1.6 m, offset 0). The binding joint's torque
sits so near the holding threshold tau_f (0.2 N m) that the 0.2 N sensor error can carry it across, so its flip
is priced and the budget refuses it. The leg preload (milestone 37, 0.1 N m from tau_f; milestones 44/45's
per-pose and tiered versions) is what keeps leg joints out of that band, so for each unplanned case two
escalations are tried, applied to that case only, smallest margin first on the ladder LADDER:
  targeted: the binding joint's margin raised to M (every other row keeps its margin);
  uniform:  every leg joint's margin raised to at least M.
A free joint's margin caps below tau_f (|tau| <= tau_f - M), so M < 0.2 N m can bind any free leg joint.
The rule is otherwise milestone 59's (``m59.rule_all``, four-row config): pose sides first, then per-load sides.
Also reported: the controller's leg effort (sum of squared leg torques at the window's high end, pose sides) with
and without the uniform escalation. Section G is held out: 48 Latin-hypercube loads (seed 60) with 6
random-direction 0.2 N errors (seed 60). Check: with no escalation, the four-row rule against milestone 58's own
``rule_all`` ("iso") on the first M60_CHECK loads per robot (milestone 59 found the two identical).
Hypotheses H235-H237 (LOG.md, registered before the run, from a development probe on seed 59's 19 cases).
M60_PROCS sets the pool (default 4); M60_N the loads.
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

N = int(os.environ.get("M60_N", "48"))
os.environ["M59_N"] = str(N)
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import numpy as np  # noqa: E402
import core as C  # noqa: E402

T0 = time.time()
HERE = C.HERE
E59, E58, E55, E54, E51, M1 = C.E59, C.E58, C.E55, C.E54, C.E51, C.M1
SPEC, B, EPS, AX = E59.SPEC, E59.B, E59.EPS, E59.AX
NCHECK = int(os.environ.get("M60_CHECK", "2"))
SEED = 60
LOADS = E54.lhs(N, SEED)
ERRS = [B * a for a in E55.rand_dirs(6, SEED)]
LADDER = [0.12, 0.14, 0.16, 0.18, 0.19, 0.25, 0.3]
CAP = 0.18                                        # N m, H235's registered ceiling


def brief(o):
    return None if o is None or o.get("y") is None else {k: o[k] for k in (*AX, "flips", "how")}


def task(args):
    n, j, lim = args
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
            lk, lr = lim[str(list(k))], lim[str(list(ref))]
            in51 = lk is not None and H <= lk + EPS and lr is not None and H <= lr + EPS
            row = {"pose": list(k[1:]), "axis": ai, "in51": bool(in51), "cal": er_r is not None}
            if not in51 or er_r is None:
                rows.append(row)
                continue
            f = M1.hose_f(k, H, phi)
            o = E59.rule_all(k, ref, f, e, er_r)[C.CFG]
            row["out"] = brief(o) or {"how": "none", "bind": o.get("bind")}
            if o["how"] == "none":
                b = o.get("bind")
                legs = set(int(x) for x in M1.ROB[n][2])
                js = None if b is None or C.leg_index(n, b) not in legs else [C.leg_index(n, b)]
                Mt, ot = C.escalate(k, ref, f, e, er_r, js, LADDER) if js else (None, None)
                Mu, ou = C.escalate(k, ref, f, e, er_r, None, LADDER)
                fm = np.asarray(f, float) + e
                row["esc"] = {"bind": b, "Mt": Mt, "t": brief(ot), "Mu": Mu, "u": brief(ou),
                              "eff0": C.effort(k, fm), "effu": None if Mu is None else C.effort(k, fm, None, Mu)}
            rows.append(row)
            if j < NCHECK:
                o58 = E58.rule_all(k, ref, f, e, er_r)["iso"]
                a, b = o58.get("y"), o.get("y")
                checks.append({"how58": o58["how"], "how": o["how"], "mismatch": (a is None) != (b is None),
                               "d": 0.0 if (a is None or b is None) else max(abs(a - b), abs(o58["z"] - o["z"]))})
    return {"robot": n, "j": j, "H": H, "phi": phd, "rows": rows, "checks": checks}


def worst(outs):
    w = {a: 0.0 for a in AX}
    for o in outs:
        for a in AX:
            w[a] = max(w[a], o[a])
    return w


if __name__ == "__main__":
    procs = int(os.environ.get("M60_PROCS", "4"))
    allkeys = sorted(set(k for k in M1.KEYS) | {E51.ref_key(n) for n in ("g1", "h1")})
    ctx = M1.mp.get_context("fork")
    out = {"versions": {"python": platform.python_version(), "numpy": np.__version__,
                        "mujoco": M1.mujoco.__version__}, "spec_mm": SPEC, "B": B, "seed": SEED, "loads": LOADS,
           "errs": [list(map(float, e)) for e in ERRS], "ladder": LADDER, "tauf": M1.TAUF}
    with ctx.Pool(procs) as pool:
        phis = [p for _, p in LOADS]
        L = pool.map(E58.task_limits, [(k, phis) for k in allkeys], chunksize=1)
        lims = {str(list(k)): v for k, v in L}
        jobs = [(n, j, {kk: v[j] for kk, v in lims.items()}) for n in ("g1", "h1") for j in range(N)]
        res = pool.map(task, jobs, chunksize=1)
    out["limits"] = lims
    out["runs"] = res
    print(f"# Milestone 60: a raised leg preload for the unplanned presses, held-out section G ({N} loads, seed "
          f"{SEED}; four-row rule, spec {SPEC} mm; tau_f {M1.TAUF} N m; ladder {LADDER} N m; B = {B:.2f} N)")
    print("errors (6 random directions, seed 60): "
          + "; ".join("(" + ", ".join(f"{c:+.3f}" for c in e) + ")" for e in ERRS))
    ch = [c for x in res for c in x["checks"]]
    print(f"check (four-row, no escalation, against milestone 58's rule_all 'iso', first {NCHECK} loads per robot): "
          f"{len(ch)} cases, plan/no-plan mismatches {sum(c['mismatch'] for c in ch)}, 'how' mismatches "
          f"{sum(c['how58'] != c['how'] for c in ch)}, largest |y| or |z| difference "
          f"{max((c['d'] for c in ch), default=0.0):.1e} mm")
    S = {}
    print("\n## A. Coverage: robot | in-envelope | planned (m59 rule) | unplanned | + targeted | + uniform | "
          "coverage m59 -> uniform | worst |y|, |z|, |y_d|, |z_d| of the base plans (mm)")
    for n in ("g1", "h1"):
        rr = [r for x in res if x["robot"] == n for r in x["rows"] if r["in51"] and "out" in r]
        base = [r["out"] for r in rr if r["out"].get("y") is not None]
        esc = [r["esc"] for r in rr if "esc" in r]
        nt = sum(e["Mt"] is not None for e in esc)
        nu = sum(e["Mu"] is not None for e in esc)
        nin = sum(r["in51"] for x in res if x["robot"] == n for r in x["rows"])
        wb = worst(base)
        s = {"in51": nin, "pl": len(base), "none": len(esc), "t": nt, "u": nu,
             "cov0": 100.0 * len(base) / max(nin, 1), "covu": 100.0 * (len(base) + nu) / max(nin, 1), "wb": wb}
        S[n] = s
        print(f"  {n} | {nin} | {len(base)} | {len(esc)} | {nt} | {nu} | {s['cov0']:.2f}% -> {s['covu']:.2f}% | "
              + ", ".join(f"{wb[a]:.4f}" for a in AX))
    print("\n## B. Each unplanned case: robot | pose | H N | phi deg | error | binding joint | targeted M (|y|, |z|, "
          "|y_d|, |z_d| mm; flips) | uniform M (same) | leg effort base -> uniform (N^2 m^2)")
    allesc = []
    for x in res:
        for r in x["rows"]:
            if "esc" not in r:
                continue
            e = r["esc"]
            allesc.append((x["robot"], e))

            def f(M, o):
                return "-" if M is None else (f"{M:.2f} (" + ", ".join(f"{o[a]:.4f}" for a in AX)
                                              + f"; {o['flips']})")
            ef = ("-" if e["eff0"] is None or e["effu"] is None else f"{e['eff0']:.4f} -> {e['effu']:.4f}")
            print(f"  {x['robot']} | {r['pose']} | {x['H']:.2f} | {x['phi']:.1f} | {r['axis']} | {e['bind']} | "
                  f"{f(e['Mt'], e['t'])} | {f(e['Mu'], e['u'])} | {ef}")
    print("\n## C. Uniform escalation summary: margins used (counts) | worst |y|, |z|, |y_d|, |z_d| (mm) | flips | "
          "leg effort ratio median [min, max]")
    us = [e for _, e in allesc if e["Mu"] is not None]
    mc = {}
    for e in us:
        mc[e["Mu"]] = mc.get(e["Mu"], 0) + 1
    wu = worst([e["u"] for e in us])
    ratios = [e["effu"] / e["eff0"] for e in us if e["eff0"] and e["effu"] is not None]
    rs = (f"{np.median(ratios):.3f} [{min(ratios):.3f}, {max(ratios):.3f}]" if ratios else "-")
    print("  " + ", ".join(f"{k:.2f}: {v}" for k, v in sorted(mc.items())) + " | "
          + ", ".join(f"{wu[a]:.4f}" for a in AX) + f" | {sum(e['u']['flips'] for e in us)} | {rs}")
    print("\n## D. Hypotheses (registered in LOG.md before this run)")
    D = {}
    n_un = len(allesc)
    ok = [e for _, e in allesc if e["Mu"] is not None and e["Mu"] <= CAP + 1e-12]
    spec_ok = all(e["u"][a] <= SPEC + 1e-12 for e in ok for a in AX)
    D["H235"] = n_un > 0 and len(ok) == n_un and spec_ok
    print(f"H235 (uniform preload at most {CAP} N m plans every unplanned case, inside {SPEC} mm at both points both "
          f"ways): unplanned {n_un}, planned at <= {CAP} {len(ok)}, all in spec {spec_ok} -> "
          f"{'held' if D['H235'] else 'refuted'}")
    nt_all = sum(e["Mt"] is not None for _, e in allesc)
    nu_all = sum(e["Mu"] is not None for _, e in allesc)
    D["H236"] = nt_all < nu_all
    print(f"H236 (the binding joint alone plans fewer cases than the uniform raise): targeted {nt_all}, uniform "
          f"{nu_all} -> {'held' if D['H236'] else 'refuted'}")
    fl = sum(e["u"]["flips"] for e in us)
    D["H237"] = len(us) > 0 and fl == 0
    print(f"H237 (no uniform-escalated plan has a flip between plan and robot): plans {len(us)}, flips {fl} -> "
          f"{'held' if D['H237'] else 'refuted'}")
    out["S"] = S
    out["D"] = D
    json.dump(out, open(os.path.join(HERE, "results.json"), "w"), separators=(",", ":"), default=float)
    print(f"\n(run time {time.time() - T0:.0f} s; python {platform.python_version()}, numpy {np.__version__}, "
          f"mujoco {M1.mujoco.__version__})")
