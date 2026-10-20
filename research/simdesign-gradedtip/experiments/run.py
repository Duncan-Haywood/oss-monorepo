"""Does the element-centroid peak stress at the fillet tangent point converge under local grading?

Four fixed designs (w, r, b in mm; steel, F = 100 N), each solved with the element size at the tangent point
(w, w + r) refined from hmin = 1.5 down to 0.025 mm, far-field size h0 = 1.5 mm, for three fillet discretisations
(24, 96, 384 facets) and two grading rates (0.3 and 0.15). Writes results.json and results.txt.
"""
import json, os, sys
from multiprocessing import Pool
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
from simdesign_gradedtip import Params, solve_graded
from simdesign_gradedtip.dfm import STEEL_SHEET

OUT = os.path.dirname(os.path.abspath(__file__))
DESIGNS = [(14.0, 10.0, 2.0), (14.0, 14.0, 2.0), (16.0, 15.0, 2.0), (12.0, 6.0, 15.0)]
HMINS = (1.5, 0.75, 0.4, 0.2, 0.1, 0.05, 0.025)
NARCS = (24, 96, 384)
GRADES = (0.3, 0.15)


def one(a):
    d, n_arc, grade, hmin = a
    w, r, b = DESIGNS[d]
    s = solve_graded(Params(w=w, r=r, b=b), STEEL_SHEET, hmin, grade=grade, n_arc=n_arc)
    return {"design": d, "n_arc": n_arc, "grade": grade, "hmin": hmin, "peak": s["peak_mpa"], "peak_xy": s["peak_xy"],
            "tip": s["tip_deflection_mm"], "n_el": s["n_elements"], "min_edge": s["min_edge"]}


if __name__ == "__main__":
    jobs = [(d, n, g, h) for d in range(len(DESIGNS)) for n in NARCS for g in GRADES for h in HMINS]
    with Pool(4) as pool:
        res = pool.map(one, jobs, chunksize=1)
    json.dump(res, open(os.path.join(OUT, "results.json"), "w"), indent=1)
    L = ["peak element-centroid von Mises (MPa) at the fillet tangent point vs local element size hmin (mm); h0 = 1.5 mm"]
    for d, (w, r, b) in enumerate(DESIGNS):
        for g in GRADES:
            for n in NARCS:
                rr = [x for x in res if x["design"] == d and x["grade"] == g and x["n_arc"] == n]
                L.append(f"w={w} r={r} b={b} grade={g} facets={n}: " + " ".join(f"{x['peak']:.1f}" for x in rr) +
                         f" | elements {rr[0]['n_el']}..{rr[-1]['n_el']} | tip {rr[0]['tip']:.4f}..{rr[-1]['tip']:.4f}")
    L.append("columns: hmin = " + " ".join(map(str, HMINS)))
    open(os.path.join(OUT, "results.txt"), "w").write("\n".join(L) + "\n"); print("\n".join(L))
