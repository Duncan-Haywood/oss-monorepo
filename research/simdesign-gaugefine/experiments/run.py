"""Does the minimum-mass design of the laser-cut bracket settle with the mesh when the rule is the patch measure?

For laser-cut steel sheet (rules) and the no-rules steel-sheet twin, at gauges b = 1.5, 2 and 3 mm, a deterministic
NG x NG grid over (w, r) is evaluated on the search mesh (h = 2.5 mm) and, for every cell whose search-mesh patch
stress is at most 1.3x the limit, on a fine mesh (h = 1.0 mm). From one solve per cell we get both the element-centroid
peak and the rho = 3 mm patch measure, so both rules are applied to the same fields. Reported per gauge and rule:
the least mass of any feasible cell on each mesh. Writes results.json and results.txt.
"""
import json, os, sys
from multiprocessing import Pool
import numpy as np
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
from simdesign_gaugefine import PROCESSES, FREE, evaluate, Params
from simdesign_gaugefine.dfm import BOUNDS, TIP_LIMIT_MM

OUT = os.path.dirname(os.path.abspath(__file__))
NG = 20
GAUGES = (1.5, 2, 3)
HS = (2.5, 1.0)
KINDS = {"rules": PROCESSES["laser cutting"], "free": FREE["steel sheet"]}
SIG = 100.0
SCREEN = 1.3


def cell(t):
    kind, b, w, r = t
    proc = KINDS[kind]
    p = Params(w=float(w), r=float(r), b=float(b))
    e = evaluate(proc, p, h=HS[0])
    if e["fe"] is None:                      # geometric rule violated: no FE
        return {"kind": kind, "b": b, "w": w, "r": r, "rule_ok": False}
    out = {"kind": kind, "b": b, "w": w, "r": r, "rule_ok": True, "mass_g": e["mass_g"], "by_h": {}}
    for h in HS:
        if h != HS[0]:
            if out["by_h"][str(HS[0])]["patch"] > SCREEN * SIG:
                continue
            e = evaluate(proc, p, h=h)
        fe = e["fe"]
        out["by_h"][str(h)] = {"peak": fe["peak_mpa"], "patch": fe["patch_mpa"], "tip": fe["tip_deflection_mm"]}
    return out


def best(cells, h, measure):
    """Least mass among rule-feasible cells that pass stress (measure) and tip limits on mesh h; None if none."""
    ok = [c for c in cells if c["rule_ok"] and str(h) in c["by_h"] and c["by_h"][str(h)][measure] <= SIG
          and c["by_h"][str(h)]["tip"] <= TIP_LIMIT_MM]
    return min(ok, key=lambda c: c["mass_g"]) if ok else None


def main():
    ws = np.linspace(*BOUNDS["w"], NG)
    rs = np.linspace(*BOUNDS["r"], NG)
    tasks = [(k, b, w, r) for k in KINDS for b in GAUGES for w in ws for r in rs]
    with Pool(4) as pool:
        res = pool.map(cell, tasks, chunksize=8)
    json.dump(res, open(os.path.join(OUT, "results.json"), "w"))
    L = [f"{NG}x{NG} grid over (w, r) per gauge; stress limit {SIG} MPa, tip limit {TIP_LIMIT_MM} mm; meshes h = {HS} mm",
         "least feasible mass in g (w, r in mm) by measure and mesh; '-' = no feasible cell (or not re-solved on the fine mesh)"]
    for k in KINDS:
        for b in GAUGES:
            cs = [c for c in res if c["kind"] == k and c["b"] == b]
            row = []
            for measure in ("peak", "patch"):
                for h in HS:
                    c = best(cs, h, measure)
                    row.append(f"{measure}@{h}: " + (f"{c['mass_g']:.2f} (w={c['w']:.1f}, r={c['r']:.1f})" if c else "-"))
            L.append(f"{k:5s} b={b}: " + " | ".join(row))
    open(os.path.join(OUT, "results.txt"), "w").write("\n".join(L) + "\n"); print("\n".join(L))


if __name__ == "__main__":
    main()
