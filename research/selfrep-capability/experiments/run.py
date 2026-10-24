import pathlib, sys
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1] / "src"))
from selfrep_capability import capability as K

K.check()
g = K.L.gains()
fmt = lambda s: ", ".join(sorted(s)) or "(none)"
total = sum(K.CAPS.values())
out = [f"{len(K.CAPS)} assumed capabilities (total effort {total:.0f}); {sum(r is not None for r in K.REQ.values())} of {len(K.REQ)} imported lines reachable, "
       "controller electronics never", ""]
for m in ("mass", "cost"):
    out.append(f"== efficient capability sets by {m} closure (exact, all {2**len(K.CAPS)} subsets): effort, points gained, set")
    for b, v, s in K.frontier(m):
        out.append(f"  {b:5.1f}  +{v*100:5.1f}  {fmt(s)}")
    out.append("")
out.append("== closure points gained at a budget: exact capability optimum vs line-by-line rules (same real cost, sharing paid once)")
out.append(f"{'metric':<6}{'budget':>7}{'optimum':>9}{'ratio rule':>12}{'raw-gain rule':>15}")
for m in ("mass", "cost"):
    for b in (5, 8, 12, 16, 24):
        o = K.best_for_budget(m, b)[1]
        r = K.line_rule(m, b, "ratio")[1]
        w = K.line_rule(m, b, "gain")[1]
        out.append(f"{m:<6}{b:>7}{o*100:9.1f}{r*100:12.1f}{w*100:15.1f}")
out.append("")
out.append("== stability: every capability's effort scaled 0.5x to 2x (2000 draws); nominal choice vs each draw's optimum")
out.append(f"{'metric':<6}{'budget':>7}  {'still optimal':>13}{'unaffordable':>14}{'mean regret (pts)':>19}")
for m in ("mass", "cost"):
    for b in (8, 16):
        same, reg, over = K.stability(m, b)
        out.append(f"{m:<6}{b:>7}  {same*100:12.0f}%{over*100:13.0f}%{reg*100:19.2f}")
out.append("")
out.append("== closure (points) vs budget, best capability set for each metric")
out.append("budget    mass    cost")
for b in range(0, 41, 4):
    out.append(f"{b:<8}" + "".join(f"{K.best_for_budget(m, b)[1]*100:8.1f}" for m in ("mass", "cost")))
pathlib.Path(__file__).with_name("results.txt").write_text("\n".join(out) + "\n")
print("\n".join(out))
