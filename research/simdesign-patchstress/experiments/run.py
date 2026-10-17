"""Mesh convergence of peak vs patch-averaged von Mises stress at the inner fillet of the L-bracket."""
import os, sys, json
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
from simdesign_patchstress import Params, Material, solve, patch_max, nominal_bending_mpa

MAT = Material(E=69000.0, nu=0.33, density=2.70e-3, sigma_allow=100.0)  # assumed aluminium plate, as simdesign-dfm
DESIGNS = {"w12 r2": Params(w=12, r=2, b=5), "w12 r6": Params(w=12, r=6, b=5), "w12 r12": Params(w=12, r=12, b=5),
           "w8 r6": Params(w=8, r=6, b=5)}
HS = [2.5, 1.8, 1.2, 0.8, 0.55]
RHOS = [1.0, 2.0, 3.0]

if __name__ == "__main__":
    out, lines = {}, []
    for name, p in DESIGNS.items():
        nom = nominal_bending_mpa(p.F, p.L, p.w, p.b)
        lines.append(f"{name}: nominal bending stress {nom:.1f} MPa")
        lines.append("  h(mm) elems  peak  " + "  ".join(f"patch{r:g}" for r in RHOS))
        rows = []
        for h in HS:
            f = solve(p, MAT, h=h, return_field=True)
            row = {"h": h, "elements": int(len(f["vm"])), "peak": f["max_vm_mpa"], **{f"patch{r:g}": patch_max(f, r) for r in RHOS}}
            rows.append(row)
            lines.append(f"  {h:5.2f} {row['elements']:6d} {row['peak']:6.1f} " + "  ".join(f"{row[f'patch{r:g}']:6.1f}" for r in RHOS))
            print(lines[-1], flush=True)
        # drift = change in the last refinement step, relative to the finest value
        d = {k: abs(rows[-1][k] - rows[-2][k]) / rows[-1][k] for k in ["peak"] + [f"patch{r:g}" for r in RHOS]}
        lines.append("  last-step change: " + "  ".join(f"{k} {100*v:.1f}%" for k, v in d.items()))
        out[name] = {"nominal_mpa": nom, "rows": rows, "last_step_change": d}
    open(os.path.join(os.path.dirname(__file__), "results.txt"), "w").write("\n".join(lines) + "\n")
    json.dump(out, open(os.path.join(os.path.dirname(__file__), "results.json"), "w"), indent=1)
