import pathlib, sys
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1] / "src"))
from selfrep_learnfirst import learn as L

METRICS = ("lines", "units", "mass", "cost")
g = L.gains()
base = L.C.closure(L.VARIANT, L.SHOP)[0]
out = [f"shop printer+cnc+laser, bearing variant {L.VARIANT}; {len(g)} imported lines of {len(L.C.parts_for(L.VARIANT))}",
       "nominal closure: " + ", ".join(f"{m} {base[m]*100:.1f}%" for m in METRICS), ""]
for m in METRICS:
    r = L.ranking(g, m)
    out.append(f"== top 6 vitamin lines to learn, by {m} gain (percentage points of {m} closure)")
    out += [f"  {i+1}. {n:<34} +{g[n][m]*100:5.1f}" for i, n in enumerate(r[:6])]
    out.append("")
out.append("== lines to learn, best first, to reach +10 / +25 / +50 points of closure (None = vitamins cannot reach it)")
out.append(f"{'metric':<8}{'+10':>6}{'+25':>6}{'+50':>6}   ceiling (all vitamins made)")
for m in METRICS:
    out.append(f"{m:<8}" + "".join(f"{str(L.lines_to_reach(g, m, t)):>6}" for t in (.10, .25, .50)) + f"   +{sum(v[m] for v in g.values())*100:.1f}")
out.append("")
out.append("== agreement between rankings (Kendall tau over the imported lines)")
rs = {m: L.ranking(g, m) for m in METRICS}
for i, a in enumerate(METRICS):
    for b in METRICS[i + 1:]:
        out.append(f"  {a} vs {b}: {L.kendall_tau(rs[a], rs[b]):+.2f}")
out.append("")
for m in ("mass", "cost"):
    wins, tau = L.top_stability(m)
    out.append(f"== stability of the {m} ranking, 2000 draws, every assumed mass and cost scaled 0.5x to 2x")
    out.append("  rank-1 line share: " + "; ".join(f"{n} {p*100:.0f}%" for n, p in list(wins.items())[:5]))
    out.append(f"  mean Kendall tau to nominal ranking: {tau:.2f}")
    out.append("")
out.append("== cumulative closure (points) from learning the k best lines, each metric ranked by itself")
out.append("k    units    mass    cost")
cums = {m: L.cumulative(g, m) for m in ("units", "mass", "cost")}
for k in range(1, 11):
    out.append(f"{k:<4}" + "".join(f"{cums[m][k-1][1]*100:8.1f}" for m in ("units", "mass", "cost")))
out.append("")
out.append("== learning a whole kind of vitamin (points of closure)")
for k, v in sorted(L.by_kind().items(), key=lambda kv: -kv[1]["mass"]):
    out.append(f"  {k:<12}" + "".join(f"{m} +{v[m]*100:5.1f}  " for m in METRICS))
pathlib.Path(__file__).with_name("results.txt").write_text("\n".join(out) + "\n")
print("\n".join(out))
