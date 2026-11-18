"""Milestone 43: the spec's own clean-sheet stack on milestone 41's zero-press poses.

Milestones 41 and 42 costed the zero-press stance with milestone 38's 'hold-min' torques (no leg preload, no
squeeze); milestone 40's section D, the stack the spec quotes, takes each pose's torques from the spec's plan
(leg preload 0.1 N m, squeeze chosen over [-10, 10] N). Here milestone 42's import (milestone 41's run, so M0 on
milestone 32's leans and M1 on the re-leans are the same objects) gives both setups; for each pose with a
'hold-min' solution and each waist case ('stock', 'braked') the spec plan at zero hose force and an exact sensor
(milestone 38's ``plan``) is computed and the no-hose stack with loose joints uniform, milestone 40 section D's
'uniform' column. A. Per pose, both leans, both conventions. B. Worst pose. C. Hypotheses H165-H169
(registered in LOG.md before the run).

M43_SMOKE=1 runs a fast code check (numbers not results); M43_PROCS sets the pool (default 4).
"""
import os as _os
for _v in ("OMP_NUM_THREADS", "OPENBLAS_NUM_THREADS", "MKL_NUM_THREADS"):
    _os.environ.setdefault(_v, "1")
import importlib.util
import json
import os
import platform
import sys
import time

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
SMOKE = bool(os.environ.get("M43_SMOKE"))
if SMOKE:
    os.environ["M42_SMOKE"] = "1"
T0 = time.time()
spec = importlib.util.spec_from_file_location("m42", os.path.join(HERE, "..", "m42_sides", "run.py"))
X = importlib.util.module_from_spec(spec)
sys.modules["m42"] = X
spec.loader.exec_module(X)                       # builds M0 and M1 as milestone 42 did; its __main__ does not run
M0, M1, A = X.M0, X.M1, X.A
from buildbot_sheathing import waist as WA  # noqa: E402

LEANS = {"m32": M0, "zero": M1}
CASES = ("stock", "braked")
S_STAR = 10.0                                    # milestone 38's S*, the spec's squeeze bound (N)
WORST_POSE = (1.2, 0.0)


def gaps(M, n, case):
    names = M.ROB[n][1]
    wi = [j for j in range(len(names)) if M.kind(n, j) == "waist"]
    return WA.case_gaps(names, wi, M.GAP * M.AM, case)


def stack_of(M, key, t, case):
    held = M.B.held(t[0], t[1], M.TAUF)
    jp, jr = M.POSE[key].rows[:2]
    return float(M.stack(M.B.from_rows(jp, jr, M.B.joint_sigmas(M.T.quant_sigma(12), gaps(M, key[0], case), ~held),
                                       M.L0))), int(np.sum(held))


def task(args):
    """Spec-plan and 'hold-min' stacks at one pose, one lean, one waist case."""
    lean, case, key = args
    M = LEANS[lean]
    z = np.zeros(3)
    p = M.plan(key, z, z, S_STAR)
    h = M.torques(key[0], key, M.SIGNS[key[0]])
    r = {"lean": lean, "case": case, "robot": key[0], "pose": list(key[1:]), "spec": None, "holdmin": None}
    if p is not None:
        r["spec"], r["n_held_spec"] = stack_of(M, key, p[0], case)
        r["squeeze"] = float(p[2])
    if h is not None:
        r["holdmin"], r["n_held_holdmin"] = stack_of(M, key, h, case)
    return r


if __name__ == "__main__":
    out = {"versions": {"python": platform.python_version(), "numpy": np.__version__,
                        "mujoco": M0.mujoco.__version__}, "S": S_STAR, "m_leg": M1.M_LEG, "cases": list(CASES)}
    print(f"# Milestone 43: the spec's stack (leg preload {M1.M_LEG:g} N m, squeeze over [-{S_STAR:g}, {S_STAR:g}] N) "
          "on the zero-press poses")
    jobs = [(lean, c, key) for lean, M in LEANS.items() for c in CASES for key in sorted(M.KEYS)
            if not (SMOKE and (key[0] == "h1" or c == "stock"))]
    procs = int(os.environ.get("M43_PROCS", "4"))
    with M1.mp.get_context("fork").Pool(procs) as pool:
        res = pool.map(task, jobs, chunksize=1)
    out["rows"] = res
    R = {(r["lean"], r["case"], r["robot"], tuple(r["pose"])): r for r in res}
    rel = {k for k in A.LEAN}
    f = lambda v: "   -  " if v is None else f"{v:.4f}"  # noqa: E731

    m40 = json.load(open(os.path.join(HERE, "..", "m40_liftoff", "results.json")))
    M40 = {(r["case"], r["robot"], tuple(r["pose"])): r["uniform"] for r in m40["D"]}
    chk = 0.0
    for (c, n, p), v in M40.items():
        x = R.get(("m32", c, n, p))
        if x is not None and x["spec"] is not None:
            chk = max(chk, abs(x["spec"] - v))
    out["check_m40"] = chk
    print(f"check: milestone 32's leans reproduce milestone 40's section D stacks to {chk:.1e} (expect 0)")
    m42 = json.load(open(os.path.join(HERE, "..", "m42_sides", "results.json")))
    M42 = {(r["robot"], tuple(r["pose"])): r["stack"] for r in m42["cells"] if r["lean"] == "zero" and r["sides"] == "m41"}
    chk2 = max([abs(R[("zero", "braked", n, p)]["holdmin"] - v) for (n, p), v in M42.items()
                if v is not None and R.get(("zero", "braked", n, p)) and R[("zero", "braked", n, p)]["holdmin"]
                is not None] or [0.0])
    out["check_m42"] = chk2
    print(f"check: 'hold-min' on the re-leans reproduces milestone 42's 'braked' cells to {chk2:.1e} (expect 0)")
    print()

    for c in CASES:
        print(f"## A. No-hose clean-sheet stack, '{c}': robot | pose | spec m32 lean (milestone 40) | spec zero-press "
              "lean | change (points) | 'hold-min' change (milestone 42) | squeeze (N) | re-leaned")
        for n in ("g1", "h1"):
            for p in sorted({k[3] for k in R if k[1] == c and k[2] == n}):
                a = R.get(("m32", c, n, p), {}).get("spec")
                b = R.get(("zero", c, n, p), {}).get("spec")
                ha = R.get(("m32", c, n, p), {}).get("holdmin")
                hb = R.get(("zero", c, n, p), {}).get("holdmin")
                ch = "   -  " if None in (a, b) else f"{100 * (b - a):+.2f}"
                hc = "   -  " if None in (ha, hb) else f"{100 * (hb - ha):+.2f}"
                sq = R.get(("zero", c, n, p), {}).get("squeeze")
                print(f"  {n} {list(p)} | {f(a)} | {f(b)} | {ch} | {hc} | "
                      + ("-" if sq is None else f"{sq:+.2f}") + (" | yes" if (n,) + p in rel else ""))
        print()

    print("## B. Worst pose over the set (spec convention): robot | case | lean | worst | at | poses with a plan")
    W = {}
    for n in ("g1",) if SMOKE else ("g1", "h1"):
        for c in CASES:
            for lean in LEANS:
                vals = [(r["spec"], tuple(r["pose"])) for k, r in R.items() if k[:3] == (lean, c, n) and r["spec"]
                        is not None]
                if not vals:
                    continue
                v, at = min(vals)
                W[(n, c, lean)] = (v, at)
                print(f"  {n} {c:6s} {lean:4s} | {v:.4f} | {list(at)} | {len(vals)}")
            if (n, c, "m32") in W and (n, c, "zero") in W:
                print(f"  {n} {c:6s} worst-pose change from the re-lean (positive = more clean sheets): "
                      f"{100 * (W[(n, c, 'zero')][0] - W[(n, c, 'm32')][0]):+.2f} points")
    out["worst"] = [{"robot": k[0], "case": k[1], "lean": k[2], "stack": v[0], "at": list(v[1])} for k, v in W.items()]
    print()

    print("## C. Hypotheses (registered in LOG.md before this run)")
    E = {}
    g = R.get(("zero", "braked", "g1", WORST_POSE), {}).get("spec")
    d = None if g is None else 100 * abs(g - 0.9030)
    E["H165"] = d is not None and d <= 0.10
    print(f"H165 ('braked': the G1's re-leaned spec stack at (1.2, 0) within 0.10 points of 'hold-min' 0.9030): "
          f"{f(g)}, {'-' if d is None else f'{d:.2f}'} points -> {'held' if E['H165'] else 'refuted'}")
    wb = W.get(("g1", "braked", "zero"), (None,))[0]
    E["H166"] = wb is not None and wb >= 0.9010 - 1e-12
    print(f"H166 ('braked': the G1's worst re-leaned spec stack at least 0.9010): {f(wb)} -> "
          f"{'held' if E['H166'] else 'refuted'}")
    if not SMOKE:
        loss = []
        for k in sorted(rel):
            if k[0] != "h1":
                continue
            b = R.get(("zero", "braked", "h1", k[1:]), {}).get("spec")
            a = M40.get(("braked", "h1", k[1:]))
            if a is not None and b is not None:
                loss.append((100 * (a - b), list(k[1:])))
        mx = max(loss) if loss else None
        E["H167"] = mx is not None and mx[0] <= 0.5
        print(f"H167 ('braked': every re-leaned H1 pose with a plan loses at most 0.5 points): largest loss "
              + ("-" if mx is None else f"{mx[0]:+.2f} at {mx[1]}") + f" over {len(loss)} poses -> "
              f"{'held' if E['H167'] else 'refuted'}")
        ws = W.get(("g1", "stock", "zero"), (None,))[0]
        ls = None if ws is None else 100 * (0.9081 - ws)
        E["H168"] = ls is not None and ls <= 1.5
        print(f"H168 ('stock': the G1's worst re-leaned spec stack loses at most 1.5 points against 0.9081): "
              f"{f(ws)}, loss {'-' if ls is None else f'{ls:+.2f}'} (negative = a gain) -> {'held' if E['H168'] else 'refuted'}")
    noplan = sorted({k[2:] for k, r in R.items() if k[0] == "zero" and (k[2],) + k[3] in rel and r["holdmin"]
                     is not None and r["spec"] is None})
    E["H169"] = not noplan
    print(f"H169 (every re-leaned pose with a 'hold-min' solution has a spec plan): "
          + (f"none at {[[n] + list(p) for n, p in noplan]}" if noplan else "all") + f" -> "
          f"{'held' if E['H169'] else 'refuted'}")
    out["E"] = E
    if not SMOKE:
        json.dump(out, open(os.path.join(HERE, "results.json"), "w"), indent=1, default=float)
    print(f"\n(run time {time.time() - T0:.0f} s; python {platform.python_version()}, numpy {np.__version__}, "
          f"mujoco {M0.mujoco.__version__})")
