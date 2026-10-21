"""Check Horowitz-derived constants, then re-cost accel-kws's sweep with array-size-aware read energy."""
import json
import math
import os
import sys

H = os.path.dirname(__file__)
sys.path.insert(0, os.path.join(H, "..", "src"))
from accel_horowitzcheck import audit, horowitz as hz  # noqa: E402

KWS = os.path.join(H, "..", "..", "accel-kws")
sys.path.insert(0, os.path.join(KWS, "src"))
from accel_kws import cost  # noqa: E402

ACT_BYTES = 256          # activation buffer: assumption, small
ACT_BITS = 8
OUT = 11


def pareto(pts):
    """Indices not dominated in (accuracy up, energy down)."""
    keep = []
    for i, (a, e) in enumerate(pts):
        if not any((a2 >= a and e2 <= e) and (a2 > a or e2 < e) for j, (a2, e2) in enumerate(pts) if j != i):
            keep.append(i)
    return keep


def energy_nj(row, mode):
    macs, b = row["macs"], row["wbits"]
    mult = cost.E_MULT_8X8_PJ * (b * ACT_BITS) / 64
    add = cost.E_ADD_32_PJ * 24 / 32
    if mode == "as_built":
        rd = cost.E_SRAM_PJ_PER_BIT * (b + ACT_BITS)
    else:
        w_bytes = row["storage_kbit"] * 1000 / 8
        rd = hz.sram_pj_per_bit(w_bytes, mode) * b + hz.sram_pj_per_bit(ACT_BYTES, mode) * ACT_BITS
    return macs * (mult + add + rd) / 1000.0, macs * rd / 1000.0


def spearman(x, y):
    def rk(v):
        o = sorted(range(len(v)), key=lambda i: v[i])
        r = [0.0] * len(v)
        for p, i in enumerate(o):
            r[i] = p
        return r
    a, b = rk(x), rk(y)
    n = len(x)
    return 1 - 6 * sum((p - q) ** 2 for p, q in zip(a, b)) / (n * (n * n - 1))


def main():
    out = {"audit": audit.audit()}
    out["fits"] = {"add_int_width_exponent": hz.loglog_exponent(hz.ADD_INT_PJ),
                   "mult_int_width_exponent": hz.loglog_exponent(hz.MULT_INT_PJ),
                   "sram_size_exponent_8k_32k": math.log(2) / math.log(4),
                   "sram_size_exponent_8k_1m": hz.loglog_exponent(hz.CACHE_64B_PJ)}
    out["scaling_rules"] = [
        {"rule": "16-bit add = 0.1 pJ x 16/32 (accel-frontend)", "used": 0.05, "paper_interp": round(hz.interp(hz.ADD_INT_PJ, 16), 4)},
        {"rule": "16x16 multiply = 0.2 pJ x (16*16)/64 (accel-frontend)", "used": 0.8, "paper_interp": round(hz.MULT_INT_PJ[8] * 2 ** hz.loglog_exponent(hz.MULT_INT_PJ), 4)},
        {"rule": "24-bit add = 0.1 pJ x 24/32 (accel-kws)", "used": 0.075, "paper_interp": round(hz.interp(hz.ADD_INT_PJ, 24), 4)},
    ]
    rows = json.load(open(os.path.join(KWS, "experiments", "results.json")))["rows"]
    rebuilt = max(abs(energy_nj(r, "as_built")[0] - r["energy_nj"]) for r in rows)
    out["as_built_reproduces_max_abs_nj"] = rebuilt
    acc = [r["test_mean"] for r in rows]
    modes = ["as_built", "floor", "paper"]
    res = {}
    for m in modes:
        e = [energy_nj(r, m)[0] for r in rows]
        share = [energy_nj(r, m)[1] / energy_nj(r, m)[0] for r in rows]
        res[m] = {"energy": e, "read_share": share, "front": pareto(list(zip(acc, e)))}
    out["n_designs"] = len(rows)
    out["modes"] = {}
    base = res["as_built"]
    for m in modes:
        e = res[m]["energy"]
        ratio = [a / b for a, b in zip(e, base["energy"])]
        out["modes"][m] = {
            "ratio_min": min(ratio), "ratio_max": max(ratio),
            "read_share_min": min(res[m]["read_share"]), "read_share_max": max(res[m]["read_share"]),
            "front_size": len(res[m]["front"]),
            "front_same_as_built": sorted(res[m]["front"]) == sorted(base["front"]),
            "front_overlap": len(set(res[m]["front"]) & set(base["front"])),
            "spearman_vs_as_built": spearman(e, base["energy"]),
            "front": [(rows[i]["segments"], rows[i]["hidden"], rows[i]["wbits"]) for i in res[m]["front"]],
        }
    out["designs"] = [{"hidden": r["hidden"], "wbits": r["wbits"], "segments": r["segments"], "acc": r["test_mean"],
                       "kbyte": r["storage_kbit"] * 1000 / 8 / 1024, **{m: res[m]["energy"][i] for m in modes}}
                      for i, r in enumerate(rows)]
    out["max_weight_array_kbyte"] = max(r["storage_kbit"] for r in rows) * 1000 / 8 / 1024
    out["designs_over_8kB"] = sum(1 for r in rows if r["storage_kbit"] * 1000 / 8 > 8192)
    json.dump(out, open(os.path.join(H, "results.json"), "w"), indent=1)
    with open(os.path.join(H, "results.txt"), "w") as fh:
        fh.write("Fig. 1.1.9 fits (log-log slope): " + ", ".join(f"{k}={v:.2f}" for k, v in out["fits"].items()) + "\n")
        fh.write("constants found in research/accel-*/src (value / paper):\n")
        for a in out["audit"]:
            fh.write(f"  {a['project']:18s} {a['name']:18s} {a['value']:<7} paper {a['paper']}  ratio {a['ratio']}\n")
        for r in out["scaling_rules"]:
            fh.write(f"scaling rule: {r['rule']}: used {r['used']} pJ, Fig. 1.1.9 interpolation {r['paper_interp']} pJ\n")
        fh.write(f"as-built model reproduces accel-kws energies to within {rebuilt:.2e} nJ over {len(rows)} designs\n")
        fh.write(f"largest weight array {out['max_weight_array_kbyte']:.1f} KB; {out['designs_over_8kB']} designs exceed 8 KB\n")
        for m, v in out["modes"].items():
            fh.write(f"{m:9s} energy/as-built {v['ratio_min']:.2f}..{v['ratio_max']:.2f}  read share {v['read_share_min']:.2f}..{v['read_share_max']:.2f}  "
                     f"front {v['front_size']} (overlap {v['front_overlap']})  spearman {v['spearman_vs_as_built']:.3f}\n")
    print(open(os.path.join(H, "results.txt")).read())


if __name__ == "__main__":
    main()
