"""Does a fixed-radius patch-average stress converge with the mesh where the element-centroid peak does not?

Takes the 39 gauge-2 designs of `simdesign-gaugescatter` (19 laser-rules, 20 no-rules steel twin; the same
designs as `simdesign-gaugemesh`), re-solves each at h = 2.5, 1.5, 1.0, 0.75 mm and records the centroid peak and
the patch measure (largest area-weighted mean of element-centroid von Mises stress over a disc of radius rho) for
rho = 1, 2, 3 and 5 mm, plus feasibility under the patch measure with rho = 3 mm (the repository's PATCH_RHO).
Writes results.json and results.txt.
"""
import json, os, sys
from multiprocessing import Pool
import numpy as np
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
from simdesign_gaugepatch import PROCESSES, FREE, evaluate, Params, patch_max

OUT = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(OUT, "..", "..", "simdesign-gaugescatter", "experiments", "miss_rate.json")
HS = (2.5, 1.5, 1.0, 0.75)
RHOS = (1.0, 2.0, 3.0, 5.0)
KINDS = {"rules": PROCESSES["laser cutting"], "free": FREE["steel sheet"]}


def one(d):
    proc = KINDS[d["kind"]]
    p = Params(w=d["w"], r=d["r"], b=d["b"])
    rows = []
    for h in HS:
        e = evaluate(proc, p, h=h, measure="patch")
        fe = e["fe"]
        rows.append({"h": h, "peak": fe["peak_mpa"], "patch": {str(r): patch_max(fe, r) for r in RHOS},
                     "feasible_patch3": bool(e["feasible"]), "tip_mm": fe["tip_deflection_mm"]})
    return {**{k: d[k] for k in ("kind", "seed", "w", "r", "b", "mass_g")}, "rows": rows}


def main():
    src = [d for d in json.load(open(SRC)) if d["feasible"]]
    with Pool(4) as pool:
        res = pool.map(one, src, chunksize=1)
    json.dump(res, open(os.path.join(OUT, "results.json"), "w"), indent=1)
    L = [f"gauge-2 feasible designs from simdesign-gaugescatter, re-solved at h in {HS} mm; stress limit 100 MPa"]
    for k in ("rules", "free"):
        r = [x for x in res if x["kind"] == k]
        L.append(f"{k}: n={len(r)}")
        for name, get in [("centroid peak", lambda y: y["peak"])] + [(f"patch rho={q} mm", (lambda q: lambda y: y["patch"][str(q)])(q)) for q in RHOS]:
            med = [np.median([get(x["rows"][j]) for x in r]) for j in range(len(HS))]
            ch = np.array([get(x["rows"][3]) / get(x["rows"][2]) for x in r])
            L.append(f"  {name:18s} median MPa by h: " + " ".join(f"{m:6.1f}" for m in med) +
                     f" | h0.75/h1.0 ratio min {ch.min():.3f} median {np.median(ch):.3f} max {ch.max():.3f}")
        for j, h in enumerate(HS):
            L.append(f"  h={h}: feasible under patch(rho=3): {sum(x['rows'][j]['feasible_patch3'] for x in r)}/{len(r)}")
    open(os.path.join(OUT, "results.txt"), "w").write("\n".join(L) + "\n"); print("\n".join(L))


if __name__ == "__main__":
    main()
