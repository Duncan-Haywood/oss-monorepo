"""Milestone 64 post-hoc diagnostic (not a registered hypothesis): does the reference calibration flip?

The four-row residual is compensated by the reference calibration made under the same bias (``m55.robust_rule`` at
the robot's reference pose). ``flips`` in run.py counts flips at the press pose only. For every balance-envelope case
the run planned, this recomputes the calibration under the case's bias and counts the flips between the calibration
plan and the robot there. Reads results.json; writes diag.out.
"""
import os as _os
for _v in ("OMP_NUM_THREADS", "OPENBLAS_NUM_THREADS", "MKL_NUM_THREADS"):
    _os.environ.setdefault(_v, "1")
import importlib.util
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
D = json.load(open(os.path.join(HERE, "results.json")))
os.environ["M64_N"] = "1"
spec = importlib.util.spec_from_file_location("m64", os.path.join(HERE, "run.py"))
E64 = importlib.util.module_from_spec(spec)
sys.modules["m64"] = E64
spec.loader.exec_module(E64)
np, M1, E51, C, B, SPEC = E64.np, E64.M1, E64.E51, E64.C, E64.B, E64.SPEC


def task(args):
    n, items = args
    C.setup(n)
    ref = E51.ref_key(n)
    f_slack = M1.hose_f(ref, 0.0, 0.0)
    out = {}
    for key, e in items:
        r = E64.E63.E55.robust_rule(ref, f_slack, np.asarray(e, float))
        out[key] = r[3]
    return n, out


if __name__ == "__main__":
    cases = {"g1": {}, "h1": {}}
    rows = []
    for x in D["runs"]:
        for rec in x["rows"]:
            u = np.asarray(rec["adv"]["u"])
            for c, r in rec["cases"].items():
                oc = E64.E63.outcome(r)
                if not oc or not oc[0]:
                    continue
                beta, sg = float(c[1:-1]), (1 if c[-1] == "+" else -1)
                e = tuple(np.round(sg * beta * B * u, 12))
                cases[x["robot"]][e] = None
                rows.append((x["robot"], beta, e, oc[1] > SPEC + 1e-12, (oc[2] or 0) > 0))
    jobs = []
    for n in ("g1", "h1"):
        ks = list(cases[n])
        for i in range(4):
            jobs.append((n, [(k, k) for k in ks[i::4]]))
    with M1.mp.get_context("fork").Pool(4) as pool:
        for n, o in pool.map(task, jobs, chunksize=1):
            cases[n].update(o)
    lines = ["# Milestone 64 diagnostic: calibration flips under the case's bias (post hoc, not registered)",
             "robot | beta | planned | over spec | over spec, press flip | over spec, no press flip, calibration flip | "
             "over spec, no flip at either | within spec with a calibration flip"]
    for n in ("g1", "h1"):
        for b in D["betas"]:
            rr = [(ov, pf, (cases[n][e] or 0) > 0) for rn, bb, e, ov, pf in rows if rn == n and bb == b]
            lines.append(f"  {n} | {b:g} | {len(rr)} | {sum(o for o, _, _ in rr)} | {sum(o and p for o, p, _ in rr)} | "
                         f"{sum(o and not p and c for o, p, c in rr)} | {sum(o and not p and not c for o, p, c in rr)} | "
                         f"{sum((not o) and c for o, _, c in rr)}")
    open(os.path.join(HERE, "diag.out"), "w").write("\n".join(lines) + "\n")
    print("\n".join(lines))
