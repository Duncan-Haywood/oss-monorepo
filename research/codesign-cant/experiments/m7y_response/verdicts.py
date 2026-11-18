"""Milestone 7y: verdicts Y1-Y6 from results.json, as fixed in ../../LOG.md. Per-set statistic: median over the six seeds of each
design's median over 64 episodes. A flight that never settles within 6 s counts as settling after 6 s (censored, +inf), so a
design that never settles sorts last instead of dropping out of the median (results.txt's nanmedian drops it)."""
import json, os
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
R = json.load(open(os.path.join(HERE, "results.json")))
runs = R["runs"]
LAWS, GEOMS = list(R["laws"]), ("above", "below")
SETS = ["aware lag39", "aware lag45", "aware lag52", "aware lag60"]


def stat(test, law, g, s, key, censor=False):
    rs = sorted((r for r in runs if r["test"] == test and r["law_name"] == law and r["geom"] == g and r["set"] == s), key=lambda r: r["seed"])
    per = []
    for r in rs:
        v = np.asarray(r[key], float)
        if censor:
            v = np.where(np.isnan(v), np.inf, v)
        per.append(float(np.median(v)))
    return float(np.median(per)), per


L = [" ".join(__doc__.split()), ""]
cells = [(law, g) for law in LAWS for g in GEOMS]
st = {(c, s): stat("step", *c, s, "settle", True)[0] for c in cells for s in SETS}
ov = {(c, s): stat("step", *c, s, "over")[0] for c in cells for s in SETS}
pk = {(c, s): stat("wind6", *c, s, "peak")[0] for c in cells for s in SETS}
rise = {(c, s): stat("step", *c, s, "rise")[0] for c in cells for s in SETS}
for c in cells:
    L.append(f"{c[0]:>15} {c[1]:>5}: settle (censored) " + ", ".join(f"{s.split()[1]} {st[(c, s)]:.3f}" for s in SETS)
             + " s | rise90 " + ", ".join(f"{rise[(c, s)]:.3f}" for s in SETS)
             + " s | overshoot " + ", ".join(f"{ov[(c, s)] * 100:.1f}" for s in SETS)
             + " cm | wind6 peak " + ", ".join(f"{pk[(c, s)] * 100:.2f}" for s in SETS) + " cm")
L.append("")
n1 = sum(st[(c, "aware lag60")] > st[(c, "aware lag45")] for c in cells)
L.append(f"Y1 (lag60 settles slower than lag45 in >= 5 of 6 cells): {n1} of 6 -> {'held' if n1 >= 5 else 'refuted'}")
y2 = all(st[(c, "aware lag60")] <= 1.25 * st[(c, "aware lag45")] for c in cells)
L.append(f"Y2 (lag60 settle <= 1.25 x lag45 in every cell): ratios " + ", ".join(f"{st[(c, 'aware lag60')] / st[(c, 'aware lag45')]:.2f}" for c in cells)
         + f" -> {'held' if y2 else 'refuted'}")
n3 = sum(pk[(c, "aware lag60")] > pk[(c, "aware lag45")] for c in cells)
L.append(f"Y3 (lag60 drifts further than lag45 after the 6 m/s step in >= 5 of 6 cells): {n3} of 6 -> {'held' if n3 >= 5 else 'refuted'}")
n4 = sum(ov[(c, "aware lag60")] < ov[(c, "aware lag45")] for c in cells)
L.append(f"Y4 (lag60 overshoots less than lag45 in >= 5 of 6 cells): {n4} of 6 -> {'held' if n4 >= 5 else 'refuted'}")
dead = sum(r["dead"] for r in runs if r["test"] in ("step", "wind3"))
L.append(f"Y5 (no flight diverges in the step or the 3 m/s wind test): {dead} diverged -> {'held' if dead == 0 else 'refuted'}")
n6 = sum(all(st[(c, a)] <= st[(c, b)] for a, b in zip(SETS, SETS[1:])) for c in cells)
L.append(f"Y6 (settle time monotone lag39 <= lag45 <= lag52 <= lag60 in >= 4 of 6 cells): {n6} of 6 -> {'held' if n6 >= 4 else 'refuted'}")
L.append("")
L.append("Not predicted (read off the same table): rise time to 90% monotone in the floor in "
         f"{sum(all(rise[(c, a)] <= rise[(c, b)] for a, b in zip(SETS, SETS[1:])) for c in cells)} of 6 cells; "
         f"overshoot monotone decreasing in {sum(all(ov[(c, a)] >= ov[(c, b)] for a, b in zip(SETS, SETS[1:])) for c in cells)} of 6.")
open(os.path.join(HERE, "verdicts.txt"), "w").write("\n".join(L) + "\n")
print("\n".join(L))
