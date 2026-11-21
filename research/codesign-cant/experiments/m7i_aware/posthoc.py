"""Milestone 7i post-hoc (written after results.txt was read): across all 24 designs per geometry (7e, 7h free and both
lever-aware arms, 6 seeds each), rank correlation of held-out divergences at the 20 deg limit, levers 2 and 3, with each design's
torque limit, mass, hover power and thrust-to-weight. Exploratory: the designs are not independent draws. Reads results.json."""
import json, os
from scipy.stats import spearmanr

HERE = os.path.dirname(os.path.abspath(__file__))
runs = json.load(open(os.path.join(HERE, "results.json")))["runs"]
L = ["Milestone 7i post hoc: Spearman rank correlation, 24 designs per geometry (7e, 7h free, aware TWR=2.0, aware TWR free; 6 seeds each).",
     "dead = held-out flights diverged of 64 at the 20 deg tilt-command limit. Exploratory, written after results.txt was read.", ""]
for g in ("above", "below"):
    rs = [r for r in runs if r["geom"] == g]
    for k in ("tau_max", "mass", "power", "twr"):
        for lev in (2, 3):
            rho, p = spearmanr([r[k] for r in rs], [r[f"dead_20_{lev}"] for r in rs])
            L.append(f"[{g}] {k:8s} vs dead at lever {lev}: rho {rho:+.2f} (p {p:.3f}, n {len(rs)})")
    heavy = [r for r in rs if r["mass"] >= 1.9]
    L.append(f"""[{g}] designs at mass >= 1.9 kg: {len(heavy)} ({', '.join(f'{r["label"]} s{r["seed"]}' for r in heavy)}); """
             f"dead at lever 2 {[r['dead_20_2'] for r in heavy]}, lever 3 {[r['dead_20_3'] for r in heavy]}; hover W {[round(r['power']) for r in heavy]}")
    L.append("")
open(os.path.join(HERE, "posthoc.txt"), "w").write("\n".join(L) + "\n")
print("\n".join(L))
