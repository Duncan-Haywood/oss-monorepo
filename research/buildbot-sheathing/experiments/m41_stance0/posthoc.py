"""Post hoc (not registered), milestone 41: the grip-height ceiling for a stance that stands at zero press and
still balances at the top of the press window, from the rigid-body width the run checked against the simulation:
h_max = (m + m_tool) g sole / F_hi. Reads results.json; writes posthoc.txt."""
import json
import os

HERE = os.path.dirname(os.path.abspath(__file__))
R = json.load(open(os.path.join(HERE, "results.json")))
lines = []
for n in ("g1", "h1"):
    xs = [x for x in R["A"] if x["robot"] == n]
    k = min(x["width_analytic"] * x["grip"] for x in xs)
    lines.append(f"{n}: mass {xs[0]['mass']:.2f} kg, sole {min(x['sole'] for x in xs):.3f} m, (m + tool) g sole "
                 f"{k:.2f} N m; ceiling for 0-{R['F_hi']} N: grip height {k / R['F_hi']:.3f} m")
    for x in xs:
        if x["relean"] and x["w1"]:
            lines.append(f"  z {x['z']:.1f} dy {x['dy']:+.2f}: grip {x['grip']:.3f} m, top {x['w1'][1]:.1f} N, "
                         f"margin above {R['F_hi']} N {x['w1'][1] - R['F_hi']:.1f} N")
open(os.path.join(HERE, "posthoc.txt"), "w").write("\n".join(lines) + "\n")
print("\n".join(lines))
