"""Mesh convergence of the stress constraint for every design in results.json, and a thickened repair.

Added by the 2026-11-18 quality fix (portfolio/quality/audits/2026-11-17-simdesign-filletfloor.json, defect 0):
the designs were searched at h = 2.5 mm, where the fillet peak reads low. Each design is re-solved at
h = 2.5, 1.25, 0.8, 0.55, 0.4, 0.3 and 0.25 mm. The converged peak is estimated by fitting
sigma(h) = s_inf + C h^q to the four finest meshes (least squares; q free); where the fit is not sane
(q pinned at a bound, or s_inf outside [0.98, 1.25] x the finest value) the finest-mesh peak is used, a lower
bound because the peaks rise as h falls. `--refit` re-fits the stored peaks without re-solving. Repair: in this model (2D plane
stress, load F spread over the end face, mesh independent of the depth b) every stress scales exactly as 1/b,
so the smallest depth that meets the limit on the converged peak is b * s_inf / limit; laser designs round
up to the next stock gauge and must still satisfy web >= thickness, the free twin is continuous. Mass scales
with b. This is a minimal repair (thicken only), not a re-optimisation. Writes convergence.json / .txt.
"""
import json, os, sys, statistics as st
from dataclasses import replace
from multiprocessing import Pool
import numpy as np
from scipy.optimize import curve_fit
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
from simdesign_filletfloor import PROCESSES, FREE, Params, evaluate

OUT = os.path.dirname(os.path.abspath(__file__))
HS = (2.5, 1.25, 0.8, 0.55, 0.4, 0.3, 0.25)
FIT_HS = HS[-4:]


def proc_for(floor):
    return FREE["steel sheet"] if floor is None else replace(PROCESSES["laser cutting"], r_min=floor)


def extrapolate(hs, sig):
    """Fit sigma = s_inf + C h^q on the given meshes; returns (s_inf, q) or (None, None) if the fit is not sane."""
    hs, sig = np.asarray(hs, float), np.asarray(sig, float)
    try:
        (s, c, q), _ = curve_fit(lambda h, s, c, q: s + c * h ** q, hs, sig, p0=(sig[-1], sig[0] - sig[-1], 1.0),
                                 bounds=([0, -np.inf, 0.3], [np.inf, np.inf, 4.0]), maxfev=20000)
    except RuntimeError:
        return None, None
    # sane: converging towards the finest value from below, within 25% of it, and q not stuck at a bound
    # (a q pinned at 0.3 or 4 means four points cannot pin the rate; the finest value is used instead,
    # which is a lower bound on the converged peak here because the peaks rise as h falls)
    if not (sig[-1] * 0.98 <= s <= sig[-1] * 1.25) or not (0.31 < q < 3.99):
        return None, None
    return float(s), float(q)


def repair_depth(proc, w, b, sigma, limit):
    need = b * sigma / limit
    if not proc.b_stock:
        return need, True
    ok = [g for g in proc.b_stock if g >= need - 1e-12 and g <= proc.b_max]
    if not ok:
        return None, False
    g = ok[0]
    return g, (proc.b_min_ratio_w == 0 or w >= proc.b_min_ratio_w * g)


def task(r, peaks=None, patches=None):
    proc = proc_for(r["floor"])
    p = Params(w=r["w"], r=r["r"], b=r["b"])
    if peaks is None:
        peaks, patches = [], []
        for h in HS:
            fe = evaluate(proc, p, h=h)["fe"]
            peaks.append(fe["peak_mpa"]); patches.append(fe["patch_mpa"])
    s_inf, q = extrapolate(FIT_HS, peaks[-4:])
    sigma = s_inf if s_inf is not None else peaks[-1]
    b_new, rules_ok = repair_depth(proc, r["w"], r["b"], sigma, r["limit"])
    return {k: r[k] for k in ("measure", "floor", "seed", "w", "r", "b", "mass_g", "limit")} | {
        "hs": HS, "peak": peaks, "patch": patches, "peak_inf": s_inf, "q": q, "sigma_used": sigma,
        "b_repaired": b_new, "repair_rules_ok": rules_ok,
        "mass_repaired_g": None if b_new is None else r["mass_g"] * b_new / r["b"]}


def summarise(res):
    L = [f"check meshes h = {HS} mm; converged peak fitted on h = {FIT_HS}; limit 100 MPa; mm, g, MPa",
         "measure floor seed | b | peak at h=2.5 .. 0.25 | fitted s_inf (q) | over limit | repaired b | rules ok | repaired mass"]
    for r in res:
        fl = "free" if r["floor"] is None else r["floor"]
        si = "n/a" if r["peak_inf"] is None else f"{r['peak_inf']:.1f} ({r['q']:.2f})"
        L.append(f"{r['measure']} {fl} {r['seed']} | {r['b']:.2f} | " + " ".join(f"{x:.1f}" for x in r["peak"])
                 + f" | {si} | {100 * (r['sigma_used'] / r['limit'] - 1):+.0f}% | "
                 + ("none" if r["b_repaired"] is None else f"{r['b_repaired']:.2f}") + f" | {r['repair_rules_ok']} | "
                 + ("-" if r["mass_repaired_g"] is None else f"{r['mass_repaired_g']:.2f}"))
    over = [r for r in res if r["sigma_used"] > r["limit"]]
    fin = [r["peak"][-1] for r in res]
    L.append(f"finest-mesh (h={HS[-1]}) peak over the limit: {sum(f > 100 for f in fin)} of {len(res)} "
             f"(lowest {min(fin):.1f} MPa); fit accepted for {sum(r['peak_inf'] is not None for r in res)} of {len(res)}")
    L.append(f"designs over the limit on the converged peak: {len(over)} of {len(res)}; "
             f"over by {min(100 * (r['sigma_used'] / r['limit'] - 1) for r in res):.0f}% to "
             f"{max(100 * (r['sigma_used'] / r['limit'] - 1) for r in res):.0f}%")
    L.append("repaired prices (rules repaired mass / free repaired mass, same measure and seed):")
    for m in ("peak", "patch"):
        free = {r["seed"]: r for r in res if r["measure"] == m and r["floor"] is None}
        for fl in (0.2, 1.0, 3.175):
            ru = {r["seed"]: r for r in res if r["measure"] == m and r["floor"] == fl}
            ss = sorted(s for s in set(ru) & set(free) if ru[s]["mass_repaired_g"] and ru[s]["repair_rules_ok"])
            pr = [ru[s]["mass_repaired_g"] / free[s]["mass_repaired_g"] for s in ss]
            bad = sorted(set(ru) - set(ss))
            txt = " ".join(f"{x:.3f}" for x in pr)
            if len(pr) >= 2:
                txt += f" | mean {st.mean(pr):.3f} sd {st.stdev(pr):.3f} range {max(pr) - min(pr):.3f}"
            L.append(f"{m} {fl} | seeds {ss} | {txt}" + (f" | seeds {bad} cannot be repaired by thickening within the rules" if bad else ""))
    return L


def main():
    if "--refit" in sys.argv:  # re-fit and re-summarise the stored FE peaks without re-solving
        res = [task(r, r["peak"], r["patch"]) for r in json.load(open(os.path.join(OUT, "convergence.json")))]
    else:
        designs = [r for r in json.load(open(os.path.join(OUT, "results.json"))) if r["feasible"]]
        with Pool(4) as pool:
            res = pool.map(task, designs, chunksize=1)
    json.dump(res, open(os.path.join(OUT, "convergence.json"), "w"), indent=1)
    lines = summarise(res)
    open(os.path.join(OUT, "convergence.txt"), "w").write("\n".join(lines) + "\n")
    print("\n".join(lines))


if __name__ == "__main__":
    main()
