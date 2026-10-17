"""Forward-load checks at the four reversed-load roots. Writes results.txt.
Coarse mesh (2, 18, 14, 1) and a finer in-plane mesh (4, 36, 28, 1) for stress and deflection."""
import os, sys, time
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "src"))
from simdesign_fwdcheck import check as ck

OUT = os.path.join(HERE, "results.txt")
lines = ["Forward load 100 N (downward on the end of the horizontal arm), steel E = 200 GPa, nu = 0.3.",
         "Limits: peak von Mises <= 100 MPa, end deflection <= 4 mm, forward buckling factor >= 3 (critical load / 100 N), wall >= 1.2 mm.",
         "b_mm w_mm mass_g fwd_factor nominal_MPa peak_coarse_MPa peak_fine_MPa defl_coarse_mm defl_fine_mm seconds"]
for b, w in ck.ROOTS.items():
    t = time.time()
    f = ck.forward_factor(w, b)
    pc, _, dc = ck.static(w, b)
    pf, _, df = ck.static(w, b, mesh=(4, 36, 28, 1))
    lines.append(f"{b} {w} {ck.mass_g(w, b):.1f} {f:.3f} {ck.nominal_stress(w, b):.1f} {pc:.1f} {pf:.1f} {dc:.3f} {df:.3f} {time.time()-t:.0f}")
    print(lines[-1], flush=True)
    open(OUT, "w").write("\n".join(lines) + "\n")
