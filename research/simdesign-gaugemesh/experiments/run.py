"""Is the narrow gauge-2 feasible region of the laser-cut bracket a mesh artefact?

Takes the gauge-2 designs that `simdesign-gaugescatter` found feasible on the search mesh (h = 2.5 mm), 19 with the
laser rules and 20 for the no-rules steel-sheet twin (its experiments/miss_rate.json), and re-solves each on finer
meshes, h = 2.5, 1.5, 1.0, 0.75 mm. Records peak von Mises stress, tip deflection, feasibility and where the peak is.
Writes results.json and results.txt.
"""
import json, os, sys
from multiprocessing import Pool
import numpy as np
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
from simdesign_gaugemesh import PROCESSES, FREE, evaluate, Params, analysis_params

OUT = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(OUT, "..", "..", "simdesign-gaugescatter", "experiments", "miss_rate.json")
HS = (2.5, 1.5, 1.0, 0.75)
KINDS = {"rules": PROCESSES["laser cutting"], "free": FREE["steel sheet"]}


def one(d):
    proc = KINDS[d["kind"]]
    p = Params(w=d["w"], r=d["r"], b=d["b"])
    rows = []
    for h in HS:
        e = evaluate(proc, p, h=h, measure="peak")
        fe = e["fe"]
        free = fe["free"]
        i = int(np.argmax(np.where(free, fe["vm"], -1)))
        rows.append({"h": h, "peak_mpa": fe["peak_mpa"], "tip_mm": fe["tip_deflection_mm"], "feasible": bool(e["feasible"]),
                     "peak_xy": [float(fe["cen"][i][0]), float(fe["cen"][i][1])]})
    return {**{k: d[k] for k in ("kind", "seed", "w", "r", "b", "mass_g")}, "rows": rows}


def main():
    src = [d for d in json.load(open(SRC)) if d["feasible"]]
    with Pool(4) as pool:
        res = pool.map(one, src, chunksize=1)
    json.dump(res, open(os.path.join(OUT, "results.json"), "w"), indent=1)
    L = [f"gauge-2 feasible designs from simdesign-gaugescatter (h=2.5 mm), re-solved at h in {HS}; limit 100 MPa, tip limit 4 mm"]
    for k in ("rules", "free"):
        r = [x for x in res if x["kind"] == k]
        L.append(f"{k}: n={len(r)}")
        for j, h in enumerate(HS):
            pk = np.array([x["rows"][j]["peak_mpa"] for x in r])
            nf = sum(x["rows"][j]["feasible"] for x in r)
            L.append(f"  h={h}: feasible {nf}/{len(r)}; peak MPa min {pk.min():.1f} median {np.median(pk):.1f} max {pk.max():.1f}")
        ratio = np.array([x["rows"][-1]["peak_mpa"] / x["rows"][0]["peak_mpa"] for x in r])
        L.append(f"  peak(h=0.75)/peak(h=2.5): min {ratio.min():.2f} median {np.median(ratio):.2f} max {ratio.max():.2f}")
    L.append("per design (kind seed w r mass | peak MPa at each h | peak location x,y at h=0.75)")
    for x in res:
        L.append(f"  {x['kind']} {x['seed']:2d} w={x['w']:.1f} r={x['r']:.1f} {x['mass_g']:.2f} g | " +
                 " ".join(f"{y['peak_mpa']:.1f}" for y in x["rows"]) + f" | ({x['rows'][-1]['peak_xy'][0]:.1f}, {x['rows'][-1]['peak_xy'][1]:.1f})")
    open(os.path.join(OUT, "results.txt"), "w").write("\n".join(L) + "\n"); print("\n".join(L))


if __name__ == "__main__":
    main()
