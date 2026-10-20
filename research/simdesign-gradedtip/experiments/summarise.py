"""Reads results.json; writes summary.txt: plateau test per design/grade/fillet discretisation and peak location."""
import json, os
import numpy as np

OUT = os.path.dirname(os.path.abspath(__file__))
DESIGNS = [(14.0, 10.0, 2.0), (14.0, 14.0, 2.0), (16.0, 15.0, 2.0), (12.0, 6.0, 15.0)]


def main():
    res = json.load(open(os.path.join(OUT, "results.json")))
    L = ["per design / grade (facets = 384): peak at hmin = 1.5, 0.1, 0.05, 0.025; spread of the last three = (max-min)/mean;",
         "plateau/h1.5 = mean of last three / value at hmin = 1.5; distance from the peak element to the tangent point (w, w+r), mm, at hmin = 0.025"]
    for d, (w, r, b) in enumerate(DESIGNS):
        for g in (0.3, 0.15):
            rr = sorted([x for x in res if x["design"] == d and x["grade"] == g and x["n_arc"] == 384], key=lambda x: -x["hmin"])
            pk = np.array([x["peak"] for x in rr])
            last = pk[-3:]
            spread = (last.max() - last.min()) / last.mean()
            xy = rr[-1]["peak_xy"]
            dist = float(np.hypot(xy[0] - w, xy[1] - (w + r)))
            L.append(f"w={w} r={r} b={b} grade={g}: {pk[0]:.1f} {pk[-3]:.1f} {pk[-2]:.1f} {pk[-1]:.1f} | spread {100*spread:.1f}% | "
                     f"plateau/h1.5 {last.mean()/pk[0]:.3f} | peak {dist:.2f} mm from tangent point")
    for n in (24, 96, 384):
        rr = [x for x in res if x["n_arc"] == n and x["hmin"] == 0.025]
        base = {(x["design"], x["grade"]): x["peak"] for x in res if x["n_arc"] == 384 and x["hmin"] == 0.025}
        dv = [abs(x["peak"] / base[(x["design"], x["grade"])] - 1) for x in rr]
        L.append(f"facets={n}: largest |peak(hmin=0.025)/peak(384 facets) - 1| over designs and grades: {100*max(dv):.1f}%")
    gr = []
    for d in range(len(DESIGNS)):
        a = [x["peak"] for x in res if x["design"] == d and x["grade"] == 0.3 and x["n_arc"] == 384 and x["hmin"] == 0.025][0]
        c = [x["peak"] for x in res if x["design"] == d and x["grade"] == 0.15 and x["n_arc"] == 384 and x["hmin"] == 0.025][0]
        gr.append(c / a - 1)
    L.append("grade 0.15 vs 0.3 at hmin = 0.025, 384 facets: " + ", ".join(f"{100*x:+.1f}%" for x in gr))
    open(os.path.join(OUT, "summary.txt"), "w").write("\n".join(L) + "\n"); print("\n".join(L))


if __name__ == "__main__":
    main()
