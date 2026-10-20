"""How much of J is the per-design policy search and how much is the design? Re-runs the policy search for fixed
designs with 30 different seeds, and sweeps pad width. Writes noise.txt."""
import os, statistics as st, sys
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "src"))
from codesign_agri import agri as A

lines = ["J for one fixed design over 30 policy-search seeds (same test fruit): min / median / max"]
for name, x in (("agent best  [26, 0.15, 3.4, 50, 0.77]", [26, 0.15, 3.4, 50, 0.77]),
                ("baseline best [4.48, 0.06, 3.08, 47.73, 0.78]", [4.48, 0.06, 3.08, 47.73, 0.78])):
    js = [A._score(x, A.learn_policy(x, s), A.make_fruit(777))[0] / 20 for s in range(30)]
    lines.append(f"{name}: {min(js):.3f} / {st.median(js):.3f} / {max(js):.3f}")
lines += ["", "Pad width sweep at E 0.1 MPa, F 3.2 N, S 50 mm, V 0.77 m/s: W mm | J | bruised share | mean pressure kPa | cost USD"]
for W in (4, 6, 8, 14, 20, 28):
    r = A.evaluate([W, 0.1, 3.2, 50, 0.77])
    lines.append(f"{W} | {r['J']:.3f} | {r['bruised']:.2f} | {r['mean_pressure_kpa']:.1f} | {r['cost']:.1f}")
open(os.path.join(HERE, "noise.txt"), "w").write("\n".join(lines) + "\n")
print("\n".join(lines))
