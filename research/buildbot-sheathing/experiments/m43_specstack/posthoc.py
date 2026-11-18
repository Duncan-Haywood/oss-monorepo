"""Post hoc (not registered), milestone 43: why two re-leaned H1 poses keep a 'hold-min' solution but lose the spec plan.

Milestone 38's ``plan`` needs, at both window ends (25 and 50 N), the 'hold-min' QP and then a leg preload margin of
m = 0.1 N m (``preload.solve_margin``, which first asks ``margin_lp`` for the largest margin t the stance allows).
This prints, at every re-leaned pose and at milestone 32's lean for the same pose, whether the hold QP solves and
the largest leg preload margin t, so a failure is located (hold or preload) and sized. Also: the G1's worst-pose
change over the poses both lean sets can plan (like for like). Writes posthoc.txt. Imports run.py (about 90 s)."""
import importlib.util
import json
import os
import sys

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
spec = importlib.util.spec_from_file_location("m43", os.path.join(HERE, "run.py"))
R43 = importlib.util.module_from_spec(spec)
sys.modules["m43"] = R43
spec.loader.exec_module(R43)
M0, M1, A = R43.M0, R43.M1, R43.A
L = ["(1) leg preload margin at the window ends (zero hose force, exact sensor): robot | pose | lean | "
     f"F (N) | hold QP | largest margin t (N m; the spec needs {M1.M_LEG:g} + slack {M1.PL.SLACK:g})"]
for key in sorted(A.LEAN):
    for lean, M in (("m32", M0), ("zero", M1)):
        if key not in M.KEYS:
            L.append(f"  {key[0]} {list(key[1:])} | {lean} | - | not in the set (no 'hold-min' solution)")
            continue
        n = key[0]
        r, names, legs = M.ROB[n]
        q = M.POSE[key].qpos
        for F in (M.F_HI / 2, M.F_HI):
            cm = M.contact(r, q, F, M.TOOL_KG, np.zeros(3))
            fn, _ = M.GQ.solve(cm, "hold", legs, M.SIGNS[n], M.TAUF, hold_idx=M.light(n))
            if fn is None:
                L.append(f"  {n} {list(key[1:])} | {lean} | {F:g} | none | -")
                continue
            rows, kap, d = M.PL.margin_rows(cm.tau(fn), legs, M.TAUF)
            t, _ = M.PL.margin_lp(cm, rows, kap, d)
            L.append(f"  {n} {list(key[1:])} | {lean} | {F:g} | ok | " + ("LP infeasible" if t is None else f"{t:.4f}"))
L.append("")
res = json.load(open(os.path.join(HERE, "results.json")))
S = {(r["lean"], r["case"], r["robot"], tuple(r["pose"])): r["spec"] for r in res["rows"]}
L.append("(2) like for like: worst spec stack over the poses both lean sets can plan: robot | case | m32 lean | "
         "zero-press lean | change (points) | poses")
for n in ("g1", "h1"):
    for c in ("stock", "braked"):
        both = [k[3] for k in S if k[:3] == ("m32", c, n) and S[k] is not None and S.get(("zero", c, n, k[3]))
                is not None]
        a = min((S[("m32", c, n, p)], p) for p in both)
        b = min((S[("zero", c, n, p)], p) for p in both)
        L.append(f"  {n} {c:6s} | {a[0]:.4f} at {list(a[1])} | {b[0]:.4f} at {list(b[1])} | "
                 f"{100 * (b[0] - a[0]):+.2f} | {len(both)}")
open(os.path.join(HERE, "posthoc.txt"), "w").write("\n".join(L) + "\n")
print("\n".join(L))
