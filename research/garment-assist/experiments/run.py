"""Sweeps for garment-assist. Writes experiments/results.txt."""
import os, sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
from garment_assist.model import Body, evaluate, break_even_mass

out = []
P = lambda *a: out.append(" ".join(str(x) for x in a))
b = Body()
r0 = evaluate("none", 0)
P(f"baseline ankle metabolic power {r0['base_w']:.1f} W; whole body (ankle share {b.ankle_share}) {r0['base_w']/b.ankle_share:.0f} W")
P("\nActive suit, torque = gain x biological torque, timing 0")
for g in (0.1, 0.2, 0.3, 0.4, 0.5):
    r = evaluate("active", g)
    P(f"gain {g:.1f}: ankle {r['dankle_pct']:+.1f}%  whole {r['dwhole_pct']:+.1f}%  suit power {r['suit_w']:.1f} W  break-even mass (sens 1%/kg) {break_even_mass('active', g):.2f} kg")
P("\nTiming error (gain 0.3), fraction of cycle late")
for t in (0.0, 0.03, 0.06, 0.1, 0.15, 0.25):
    r = evaluate("active", 0.3, timing=t)
    P(f"delay {t:.2f}: ankle {r['dankle_pct']:+.1f}%  whole {r['dwhole_pct']:+.1f}%")
P("\nElastic (passive) suit, stiffness scale gain")
for g in (0.1, 0.3, 0.5, 1.0):
    r = evaluate("elastic", g)
    P(f"gain {g:.1f}: ankle {r['dankle_pct']:+.1f}%  whole {r['dwhole_pct']:+.1f}%  suit power {r['suit_w']:.1f} W")
P("\nNet whole-body change (%) for the active gain-0.3 suit: added mass (kg) x mass sensitivity (fraction of whole-body power per kg)")
sens = (0.005, 0.01, 0.02, 0.05)
P("mass kg  " + "  ".join(f"s={s:.3f}" for s in sens))
for m in (0.0, 0.5, 1.0, 2.0, 3.0):
    P(f"{m:6.1f}   " + "  ".join(f"{evaluate('active', 0.3, mass_added=m, mass_sens=s)['dwhole_pct']:+8.1f}" for s in sens))
P("\nBreak-even added mass (kg), active gain 0.3, vs sensitivity")
for s in sens:
    P(f"sens {s:.3f}: {break_even_mass('active', 0.3, mass_sens=s):.2f} kg")
P("\nSensitivity of the gain-0.3 whole-body result to ankle share (assumed 0.25)")
for sh in (0.15, 0.25, 0.35):
    bb = Body(ankle_share=sh)
    P(f"share {sh:.2f}: whole {evaluate('active', 0.3, b=bb)['dwhole_pct']:+.1f}%")
txt = "\n".join(out)
print(txt)
open(os.path.join(os.path.dirname(__file__), "results.txt"), "w").write(txt + "\n")
