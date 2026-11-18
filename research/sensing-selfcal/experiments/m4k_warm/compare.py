"""Milestone 4k, step 3 (post hoc, computed after the scored run): the warm and cold solve of every
subset side by side.

    python3 experiments/m4k_warm/compare.py      # seconds; writes compare.json

Per unit and set size: how many subsets land on the same f from both starts (to 1e-4), how many
reach a lower cost from one start than the other, and for each cold solve milestone 4j called far
(6 views, more than 5% from the median) the warm solve's f and the fit's rms. The 13-view solves too.
"""
import gzip, json, os
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
COLD = os.path.join(HERE, "..", "m4j_tum", "results.json.gz")
WARM = os.path.join(HERE, "results.json.gz")
CAMS = ("fr1", "fr3")


def load(path):
    with gzip.open(path, "rt") as fh:
        return {(r["cam"], tuple(r["views"])): r["sol"] for r in json.load(fh)["solutions"]}


def ok(s):
    return s is not None and s["status"] > 0 and np.isfinite(s["f"])


def compare(W, C):
    out = {}
    for cam in CAMS:
        o = {}
        for n in range(3, 8):
            ks = [k for k in W if k[0] == cam and len(k[1]) == n]
            both = [k for k in ks if ok(W[k]) and ok(C[k])]
            same = sum(1 for k in both if abs(W[k]["f"] / C[k]["f"] - 1) < 1e-4)
            o[n] = dict(total=len(ks), both_converged=len(both), same_f=same,
                        warm_lower_cost=sum(1 for k in ks if ok(W[k]) and (not ok(C[k]) or W[k]["cost"] < C[k]["cost"] * (1 - 1e-6))),
                        cold_lower_cost=sum(1 for k in ks if ok(C[k]) and (not ok(W[k]) or C[k]["cost"] < W[k]["cost"] * (1 - 1e-6))))
        med = np.median([C[k]["f"] for k in C if k[0] == cam and len(k[1]) == 6 and ok(C[k])])
        far = [k for k in C if k[0] == cam and len(k[1]) == 6 and ok(C[k]) and abs(C[k]["f"] / med - 1) > 0.05]
        o["far6"] = [dict(views=list(k[1]), f_cold=C[k]["f"], f_warm=W[k]["f"] if W[k] else None,
                          rms_cold=C[k]["rms"]) for k in far]
        o["far6_same_from_warm"] = sum(1 for d in o["far6"] if d["f_warm"] and abs(d["f_warm"] / d["f_cold"] - 1) < 1e-4)
        o["far6_median_rms"] = float(np.median([d["rms_cold"] for d in o["far6"]]))
        k13 = (cam, tuple(range(13)))
        o["13"] = {tag: {x: S[k13][x] for x in ("f", "cost", "rms", "k1", "cx", "cy")} for tag, S in (("warm", W), ("cold", C))}
        out[cam] = o
    return out


def main():
    out = compare(load(WARM), load(COLD))
    with open(os.path.join(HERE, "compare.json"), "w") as fh:
        json.dump(out, fh, indent=1)
    for cam in CAMS:
        o = out[cam]
        print(cam, {n: (o[n]["same_f"], o[n]["both_converged"], o[n]["warm_lower_cost"], o[n]["cold_lower_cost"]) for n in range(3, 8)})
        print("  far 6-view cold solves:", len(o["far6"]), "same f from warm:", o["far6_same_from_warm"],
              "median rms", round(o["far6_median_rms"], 3))
        print("  13 views:", {t: (round(v["f"], 2), round(v["rms"], 4)) for t, v in o["13"].items()})


if __name__ == "__main__":
    main()
