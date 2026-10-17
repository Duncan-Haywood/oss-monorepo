"""Mesh convergence of pointwise-peak and patch-averaged Kt_gross for a hole in a tension strip.

Patch radius is a fraction of the hole radius a. Kirsch columns give the infinite-plate disc
averages of the same patch (no finite-width effect), for comparison at small d/W.
"""
import os, sys, json
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
from simdesign_holepatch import plate_field, patch_peak, kirsch_patch
from simdesign_holepatch.field import Plate

RATIOS = [0.05, 0.1, 0.2, 0.4]      # d / W
NS = [48, 96, 192, 384, 768]        # points around the hole
FR = [0.0, 0.1, 0.25, 0.5]          # patch radius / hole radius (0 = pointwise peak)
W = 60.0

if __name__ == "__main__":
    out, lines = {}, []
    lines.append("Kirsch (infinite plate) disc average of sigma_xx/sigma, patch radius/a = " +
                 ", ".join(f"{f:g}: {kirsch_patch(1.0, f):.3f}" for f in FR if f > 0) + "; pointwise 3.000")
    for dw in RATIOS:
        d = dw * W
        lines.append(f"d/W = {dw:g} (d = {d:g} mm, W = {W:g} mm): Kt_gross = measure / (T/(W t))")
        lines.append("  n_hole elems  " + "  ".join(f"rho/a={f:g}" for f in FR))
        rows = []
        for n in NS:
            fd = plate_field(Plate(W=W, d=d, n_hole=n))
            vals = [patch_peak(fd, f * d / 2) / fd["gross"] for f in FR]
            rows.append({"n_hole": n, "elements": fd["n_elements"], "kt": dict(zip(map(str, FR), vals))})
            lines.append(f"  {n:6d} {fd['n_elements']:6d}  " + "  ".join(f"{v:8.3f}" for v in vals))
            print(lines[-1], flush=True)
        chg = [abs(rows[-1]["kt"][str(f)] - rows[-2]["kt"][str(f)]) / rows[-1]["kt"][str(f)] for f in FR]
        lines.append("  last-step change " + "  ".join(f"{100*c:7.1f}%" for c in chg))
        out[str(dw)] = {"rows": rows, "last_step_change": chg}
    d_ = os.path.dirname(__file__)
    open(os.path.join(d_, "results.txt"), "w").write("\n".join(lines) + "\n")
    json.dump(out, open(os.path.join(d_, "results.json"), "w"), indent=1)
