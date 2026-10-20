"""simdesign-loadrobust: how much does a nominal-load topology design lose when the load direction is off?

Cantilever 48x24, volume fraction 0.4, p = 3, sensitivity filter radius 2 elements, unit tip load at
mid-height. Designs: nominal (load straight down) and multi-load designs over symmetric angle sets.
Each design is evaluated on load directions it was NOT trained on (every 15 degrees from -90 to 90),
and compared with the design optimised for that single direction ("own optimum", the regret baseline).
Deterministic; each setting run once.
"""
import os, sys, time
HERE = os.path.dirname(__file__)
sys.path.insert(0, os.path.join(HERE, "..", "src"))
import numpy as np
import matplotlib; matplotlib.use("Agg")
import matplotlib.pyplot as plt
from simdesign_loadrobust import multiload_simp, angle_sweep

NX, NY, VF, RMIN = 48, 24, 0.4, 2.0
TEST = list(range(-90, 91, 15))
out = []
def say(s=""):
    print(s); out.append(s)

t0 = time.time()
own = {}
for a in TEST:
    if -a in own:  # a load and its mirror image about the beam axis need mirrored designs
        own[a] = own[-a][::-1]; continue
    own[a] = multiload_simp(NX, NY, VF, 3.0, RMIN, [a])["x"]
own_c = np.array([angle_sweep(own[a], [a])[0] for a in TEST])

sets = {"nominal (0)": [0.0], "0, +-15": [-15.0, 0.0, 15.0], "0, +-30": [-30.0, 0.0, 30.0],
        "0, +-45": [-45.0, 0.0, 45.0], "0, +-60": [-60.0, 0.0, 60.0], "0, +-90": [-90.0, 0.0, 90.0]}
designs, curves = {}, {}
for name, angs in sets.items():
    r = multiload_simp(NX, NY, VF, 3.0, RMIN, angs)
    designs[name] = r["x"]; curves[name] = angle_sweep(r["x"], TEST)

say(f"== cantilever {NX}x{NY}, vf {VF}, p 3, filter radius {RMIN}; unit tip load; "
    f"compliance in dimensionless units")
say("regret = compliance of the design under the load / compliance of that load's own optimum")
say("angle  own-opt   " + "  ".join(f"{n:>11s}" for n in sets))
for i, a in enumerate(TEST):
    say(f"{a:5d} {own_c[i]:8.1f}   " + "  ".join(f"{curves[n][i]/own_c[i]:11.2f}" for n in sets))
say()
say("== summary over the 13 test directions")
say("design         nominal-regret  mean-regret  worst-regret  worst-angle  volume")
for n in sets:
    rg = curves[n] / own_c
    say(f"{n:14s} {rg[TEST.index(0)]:14.3f} {rg.mean():12.3f} {rg.max():13.3f} {TEST[int(rg.argmax())]:11d}"
        f" {designs[n].mean():12.3f}")
say(f"(total {time.time()-t0:.0f} s)")
open(os.path.join(HERE, "results.txt"), "w").write("\n".join(out) + "\n")

fig, ax = plt.subplots(1 + len(sets), 1, figsize=(6, 1.5 * (1 + len(sets))))
for a, (k, x) in zip(ax[:len(sets)], designs.items()):
    a.imshow(1 - x, cmap="gray", vmin=0, vmax=1); a.set_title(k, fontsize=8); a.axis("off")
for n in sets:
    ax[-1].plot(TEST, curves[n] / own_c, label=n)
ax[-1].set_yscale("log"); ax[-1].set_xlabel("load angle from vertical (deg)", fontsize=8)
ax[-1].set_ylabel("regret", fontsize=8); ax[-1].legend(fontsize=6)
fig.tight_layout(); fig.savefig(os.path.join(HERE, "designs.png"), dpi=110)
