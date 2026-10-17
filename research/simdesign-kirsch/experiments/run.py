"""Mesh convergence of centroid and vertex stress at a circular hole against Kirsch's exact peak (3 * sigma)."""
import os, sys, json
import numpy as np
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
from simdesign_kirsch import solve, kirsch_stress

NS = [4, 8, 16, 32, 64, 128]

if __name__ == "__main__":
    rows = [solve(n) for n in NS]
    # exact radial gradient of sigma_theta_theta along x = 0 at the hole edge: sigma/2 (2 + a^2/y^2 + 3 a^4/y^4)
    y, dy = 1.0, 1e-6
    f = lambda y: kirsch_stress(np.array(0.0 + 1e-300), np.array(y))[0]
    slope = (f(y + dy) - f(y)) / dy
    lines = [f"exact peak von Mises = sigma_xx(0, a) = 3 sigma; exact radial slope there = {slope:.3f} sigma/a (analytic -7)",
             "n_theta elements   h/a   centroid  err%   vertex   err%   exact@centroid  relL2(vm,centroid)  bias/(slope*h)"]
    for r in rows:
        ec = 100 * (r["peak_centroid"] - 3) / 3
        ev = 100 * (r["peak_vertex"] - 3) / 3
        r["err_centroid_pct"], r["err_vertex_pct"] = ec, ev
        r["bias_over_slope_h"] = (3 - r["peak_centroid"]) / (7 * r["h_hole"])
        lines.append(f"{r['n_theta']:5d} {r['elements']:8d} {r['h_hole']:6.3f} {r['peak_centroid']:9.4f} {ec:6.2f} {r['peak_vertex']:8.4f} {ev:6.3f} "
                     f"{r['exact_at_peak_centroid']:12.4f} {r['rel_l2_vm']:16.2e} {r['bias_over_slope_h']:12.3f}")
    # observed order of accuracy from successive halvings
    for key, name in (("peak_centroid", "centroid"), ("peak_vertex", "vertex")):
        e = [abs(r[key] - 3) for r in rows]
        p = [float(np.log2(e[i] / e[i + 1])) for i in range(len(e) - 1)]
        lines.append(f"observed order, {name} peak error (halving h): " + ", ".join(f"{x:.2f}" for x in p))
    e = [r["rel_l2_vm"] for r in rows]
    lines.append("observed order, centroid-field relative L2 error: " + ", ".join(f"{float(np.log2(e[i] / e[i + 1])):.2f}" for i in range(len(e) - 1)))
    lines.append("knock-down needed so that centroid peak x factor = exact peak (3 / centroid): " + ", ".join(f"{3 / r['peak_centroid']:.3f}" for r in rows))
    open(os.path.join(os.path.dirname(__file__), "results.txt"), "w").write("\n".join(lines) + "\n")
    json.dump({"slope": slope, "rows": rows}, open(os.path.join(os.path.dirname(__file__), "results.json"), "w"), indent=1)
    print("\n".join(lines))
