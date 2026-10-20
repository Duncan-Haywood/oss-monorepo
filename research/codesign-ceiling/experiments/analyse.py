"""Read reach.json; write results.txt and unreachable.svg (scenes by mass and object friction, reachable or not)."""
import json, os, sys
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "src"))
import numpy as np
import matplotlib; matplotlib.use("Agg")
import matplotlib.pyplot as plt
from codesign_ceiling.analysis import CONDITIONS, oracle_reach, per_design_best, per_design_oracle, reach_by_bins

R = json.load(open(os.path.join(HERE, "reach.json")))
D, scenes, nt = R["designs"], R["scenes"], R["n_test"]
L = [f"{len(D)} feasible Sobol designs x {len(scenes)} scenes ({nt} test + {len(scenes) - nt} fresh), forces {R['grid']} N plus each design's cap"]
reach = {}
for name, cond in CONDITIONS.items():
    r = oracle_reach(D, cond); reach[name] = r
    te, fr = per_design_best(D, cond, nt); orc = per_design_oracle(D, cond)
    i = int(np.argmax(te))
    L += ["", name,
          f"  scenes held by some design at some force: test {r[:nt].mean():.3f} ({int((~r[:nt]).sum())} not held), fresh {r[nt:].mean():.3f} ({int((~r[nt:]).sum())} not held)",
          f"  best single design, one force, chosen on test: test {te[i]:.3f}, fresh {fr[i]:.3f}; median design test {np.median(te):.3f}",
          f"  best design with a per-scene force oracle (all {len(scenes)} scenes): {orc.max():.3f}; median design {np.median(orc):.3f}"]
rA = reach[list(CONDITIONS)[0]]
L += ["", "Reachable share in condition A by object mass (g) and by object friction"]
for lo, hi, n, s in reach_by_bins(scenes, rA, "mass_g", [0, 300, 600, 1000, 1600]): L.append(f"  mass {lo:>4}-{hi:<4} n={n:3d} reachable {s:.2f}")
for lo, hi, n, s in reach_by_bins(scenes, rA, "mu_obj", [0.15, 0.25, 0.35, 0.451]): L.append(f"  mu_obj {lo:.2f}-{hi:.2f} n={n:3d} reachable {s:.2f}")
for k in ("cyl", "sphere", "box"):
    m = np.array([s["kind"] == k for s in scenes]); L.append(f"  {k:6s} n={int(m.sum()):3d} reachable {rA[m].mean():.2f}")
miss = [s for s, r in zip(scenes, rA) if not r]
L += ["", "Scenes not held in A (kind, size mm, mass g, mu_obj, dy mm, dz mm):"]
for s in sorted(miss, key=lambda s: -s["mass_g"]):
    L.append(f"  {s['kind']:6s} {s['size']:5.1f} {s['mass_g']:7.0f} {s['mu_obj']:.2f} {s['dy_mm']:6.1f} {s['dz_mm']:5.1f}")
open(os.path.join(HERE, "results.txt"), "w").write("\n".join(L) + "\n"); print("\n".join(L))

fig, ax = plt.subplots(figsize=(6, 4), dpi=110)
m = np.array([s["mass_g"] for s in scenes]); u = np.array([s["mu_obj"] for s in scenes])
ax.scatter(m[rA], u[rA], s=18, c="#2a7ab0", label="held by some design")
ax.scatter(m[~rA], u[~rA], s=34, marker="x", c="#c0392b", label="held by none")
ax.set_xscale("log"); ax.set_xlabel("object mass (g)"); ax.set_ylabel("object surface friction")
ax.set_title("Which grasp scenes can any of %d printable grippers hold?" % len(D), fontsize=9); ax.legend(fontsize=8, loc="lower left")
fig.tight_layout(); fig.savefig(os.path.join(HERE, "unreachable.svg"))
