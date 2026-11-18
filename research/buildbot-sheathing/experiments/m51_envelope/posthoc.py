"""Milestone 51 post hoc (after the run; not registered): what the dropped pose-cases inside the envelope are.

Reads results.json only. Each dropped pose-case inside the envelope is put in one of four classes: the calibration
pose fails (so every pose of that case drops) or the pose itself fails; and with an exact sensor (section B) it
plans ('sensor error') or still has no plan ('plan limit': the stance balances by milestone 50's section A, but the
hold sides and leg preload have no solution). Also the coverage inside the envelope and the drags these failures
sit at, as a fraction of the pose's tolerated drag.
"""
import json
import os

HERE = os.path.dirname(os.path.abspath(__file__))
RES = json.load(open(os.path.join(HERE, "results.json")))
T50 = {(a["robot"],) + tuple(a["pose"]): a["H"] for a in json.load(
    open(os.path.join(HERE, "..", "m50_relean", "results.json")))["A"]}
PHI = [0, 45, 90, 135, 180, 225, 270, 315]

idx = {}
for x in RES["runs"]:
    for r in x["rows"]:
        idx[(x["robot"], x["H"], r["phi"], r["axis"])] = r
cls = {}
groups = {}
for n, H, p, phi, ax, ref_ok in RES["drops_inside"]:
    r = idx[(n, H, phi, ax)]
    exact_ok = r["exact"]["ref"] if not ref_ok else p in r["exact"]["planned"]
    c = ("calibration" if not ref_ok else "own pose") + ", " + ("sensor error" if exact_ok else "plan limit")
    cls.setdefault((n, c), 0)
    cls[(n, c)] += 1
    g = (n, H, phi, "calib" if not ref_ok else p, c)
    groups[g] = groups.get(g, 0) + 1
print("# Milestone 51 post hoc: dropped pose-cases inside the envelope")
print("## 1. robot | class | pose-cases")
for (n, c), v in sorted(cls.items()):
    print(f"  {n} | {c} | {v}")
print("## 2. robot | H | phi | where it fails | class | pose-cases | tolerated drag there (milestone 50 section A, N)")
for (n, H, phi, w, c), v in sorted(groups.items()):
    key = (n, 1.0, 0.0) if w == "calib" else (n,) + tuple(json.loads(w))
    t = T50[key][PHI.index(phi)]
    print(f"  {n} | {H:g} | {phi} | {'calibration pose ' + str(list(key[1:])) if w == 'calib' else w} | {c} | {v} | "
          f"{t:.1f} ({100 * H / t:.0f}% of it)")
print("## 3. Coverage: robot | pose-cases | planned (all) | inside the envelope | planned inside | outside the envelope")
for n in ("g1", "h1"):
    s = [v for k, v in RES["summary"].items() if k.startswith(n)]
    t = sum(v["cases"] for v in s)
    d = sum(v["dropped"] for v in s)
    i = sum(v["inside"] for v in s)
    di = sum(v["dropped_inside"] for v in s)
    print(f"  {n} | {t} | {t - d} ({100 * (t - d) / t:.1f}%) | {i} | {i - di} ({100 * (i - di) / i:.1f}%) | {t - i}")
