"""Milestone 51: milestone 48's dropped sweep cases against milestone 50's drag limits (a hose-drag envelope).

Milestone 48's section D sweep (its sides, preload, 'braked' gaps, |e| 0.2 N on the 6 sensor axes, S 10 N, 0 / 5 /
20 N of hose drag in 8 directions) drops a (pose, load, sensor error) case when there is no plan; a calibration
pose (milestone 30's, 1.0 m, 0) with no plan drops every pose of that case. Milestone 50's section A gives the
largest drag each pose tolerates per direction (25 and 50 N both balance, current lean). A pose-case is in the
envelope when its drag is at most that limit at the pose and at the calibration pose.
A. Every case: calibration plans?, each pose plans?, residual. B. Every dropped case re-run with an exact sensor.
C. Hypotheses H208-H210 (LOG.md, registered before the run). M51_PROCS sets the pool (default 4).
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

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
T0 = time.time()
spec = importlib.util.spec_from_file_location("m48p", os.path.join(HERE, "..", "m48_loadside", "posthoc.py"))
PH = importlib.util.module_from_spec(spec)
sys.modules["m48p"] = PH
spec.loader.exec_module(PH)                      # milestone 48's run with its S_H sides installed
R, M1, R45, R43 = PH.R, PH.M1, PH.R45, PH.R43
RES50 = json.load(open(os.path.join(HERE, "..", "m50_relean", "results.json")))
TOL = {(a["robot"],) + tuple(a["pose"]): a["H"] for a in RES50["A"]}   # per direction (M1.PHIS order), N
SPEC = 0.03                                      # mm, the residual spec along the wall
EPS = 1e-9


def ref_key(n):
    return (n,) + M1.REF if hasattr(M1, "REF") else (n, 1.0, 0.0)


def tol(key, i):
    t = TOL.get(key)
    return None if t is None else t[i]


def inside(key, n, H, i):
    """In the envelope: drag at most the tolerated drag at this direction at the pose and the calibration pose."""
    if H == 0:
        return True
    for k in (key, ref_key(n)):
        t = tol(k, i)
        if t is None or H > t + EPS:
            return False
    return True


def task(args):
    n, H = args
    R.R47.set_tier(True)
    M1.GAPR = R43.gaps(M1, n, "braked")
    keys = sorted(k for k in M1.KEYS if k[0] == n)
    ref = ref_key(n)
    rows = []
    for i in M1.phis_for(H):
        phi = M1.PHIS[i] if H > 0 else 0.0
        for ai, a in enumerate(M1.AXES):
            e = R45.B_E * a
            rg = M1.residuals(n, H, phi, e, R45.S_STAR)
            ref_ok = M1.joint_err(ref, M1.hose_f(ref, H, phi), e, R45.S_STAR) is not None
            per = {}
            for k in keys:
                per[str(list(k[1:]))] = None if k not in rg else abs(rg[k]["y"][0]) / M1.MM
            ex = None
            if not ref_ok or any(v is None for v in per.values()):
                # section B: the same load with an exact sensor
                z = np.zeros(3)
                rz = M1.residuals(n, H, phi, z, R45.S_STAR)
                ex = {"ref": M1.joint_err(ref, M1.hose_f(ref, H, phi), z, R45.S_STAR) is not None,
                      "planned": sorted(str(list(k[1:])) for k in rz)}
            rows.append({"H": H, "i": i, "phi": round(math.degrees(phi)), "axis": ai, "ref_ok": ref_ok,
                         "y": per, "exact": ex})
    return {"robot": n, "H": H, "rows": rows}


if __name__ == "__main__":
    procs = int(os.environ.get("M51_PROCS", "4"))
    jobs = [(n, H) for n in ("g1", "h1") for H in R45.HB]
    with M1.mp.get_context("fork").Pool(procs) as pool:
        res = pool.map(task, jobs, chunksize=1)
    out = {"versions": {"python": platform.python_version(), "numpy": np.__version__,
                        "mujoco": M1.mujoco.__version__}, "spec_mm": SPEC, "runs": res}
    print("# Milestone 51: milestone 48's sweep against milestone 50's drag limits (envelope = drag at most the "
          "tolerated drag at the pose and the calibration pose)")
    print(f"calibration pose: {[ref_key(n) for n in ('g1', 'h1')]}")
    print("## A. robot | H | pose-cases | dropped | dropped with the calibration pose failing | inside the envelope | "
          "dropped inside | worst |y| inside (mm, at) | worst |y| all planned (mm)")
    summ = {}
    drops_in = []
    for x in res:
        n, H = x["robot"], x["H"]
        tot = drp = drp_ref = ins = drp_in = 0
        wi, wa, wat = 0.0, 0.0, None
        for r in x["rows"]:
            for p, y in r["y"].items():
                key = (n,) + tuple(json.loads(p))
                tot += 1
                inn = inside(key, n, H, r["i"])
                ins += inn
                if y is None:
                    drp += 1
                    drp_ref += not r["ref_ok"]
                    if inn:
                        drp_in += 1
                        drops_in.append((n, H, p, r["phi"], r["axis"], r["ref_ok"]))
                    continue
                wa = max(wa, y)
                if inn and y > wi:
                    wi, wat = y, (p, r["phi"])
        summ[(n, H)] = {"cases": tot, "dropped": drp, "dropped_ref": drp_ref, "inside": ins,
                        "dropped_inside": drp_in, "worst_inside": wi, "at": wat, "worst_all": wa}
        print(f"  {n} | {H:4.1f} | {tot} | {drp} | {drp_ref} | {ins} | {drp_in} | {wi:.4f} ({wat}) | {wa:.4f}")
    for n in ("g1", "h1"):
        t = sum(v["cases"] for k, v in summ.items() if k[0] == n)
        d = sum(v["dropped"] for k, v in summ.items() if k[0] == n)
        i_ = sum(v["inside"] for k, v in summ.items() if k[0] == n)
        di = sum(v["dropped_inside"] for k, v in summ.items() if k[0] == n)
        print(f"  {n}: {d} of {t} pose-cases dropped (milestone 48 post hoc: g1 258/1530, h1 41/1938); "
              f"{i_} inside the envelope ({100 * i_ / t:.1f}%), {di} of them dropped")
    print("\n## A2. Dropped pose-cases inside the envelope: robot | H | pose | phi | sensor axis | calibration plans")
    for d in drops_in[:80]:
        print("  " + " | ".join(str(v) for v in d))
    if len(drops_in) > 80:
        print(f"  ... {len(drops_in) - 80} more")

    print("\n## B. Dropped cases (calibration failing, or any pose dropped) re-run with an exact sensor: robot | H | "
          "phi | sensor axis | calibration plans (with error / exact) | poses dropped (with error / exact)")
    nb = {}
    for x in res:
        n = x["robot"]
        npos = len(next(iter(x["rows"]))["y"])
        for r in x["rows"]:
            if r["exact"] is None:
                continue
            dw = sum(v is None for v in r["y"].values())
            de = npos - len(r["exact"]["planned"])
            nb.setdefault((n, x["H"]), []).append((r["ref_ok"], r["exact"]["ref"]))
            print(f"  {n} | {x['H']:4.1f} | {r['phi']} | {r['axis']} | {r['ref_ok']} / {r['exact']['ref']} | {dw} / {de}")

    print("\n## C. Hypotheses (registered in LOG.md before this run)")
    C = {}
    C["H208"] = not drops_in
    print(f"H208 (every dropped pose-case lies outside the envelope): {len(drops_in)} inside -> "
          f"{'held' if C['H208'] else 'refuted'}")
    w = {k: v["worst_inside"] for k, v in summ.items()}
    C["H209"] = all(v <= SPEC + 1e-12 for v in w.values())
    print("H209 (worst residual inside the envelope at most 0.03 mm): "
          + ", ".join(f"{n} {H:g} N {v:.4f}" for (n, H), v in sorted(w.items()))
          + f" -> {'held' if C['H209'] else 'refuted'}")
    five = [ex for (n, H), v in nb.items() if H == 5.0 for (ok, ex) in v if not ok]
    C["H210"] = all(five) if five else None
    print(f"H210 (each 5 N case whose calibration fails plans there with an exact sensor): {sum(five)} of "
          f"{len(five)} -> " + ("not tested (no such case)" if not five else ('held' if C['H210'] else 'refuted')))
    out["summary"] = {f"{n} {H:g}": v for (n, H), v in summ.items()}
    out["drops_inside"] = drops_in
    out["C"] = C
    json.dump(out, open(os.path.join(HERE, "results.json"), "w"), indent=1, default=float)
    print(f"\n(run time {time.time() - T0:.0f} s; python {platform.python_version()}, numpy {np.__version__}, "
          f"mujoco {M1.mujoco.__version__})")
