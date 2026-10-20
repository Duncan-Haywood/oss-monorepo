import pathlib, sys
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1] / "src"))
from selfrep_capsequence import seq as S

S.K.check()
total = sum(S.CAPS.values())
out = [f"{len(S.CAPS)} assumed capabilities, total effort {total:.0f} weeks; all {9*8*7*6*5*4*3*2} orders scored by closure-weeks", ""]
rules = {"optimal": None, "frontier": S.frontier_order, "lookahead": lambda m, h: S.lookahead_order(m), "myopic": lambda m, h: S.greedy_next(m, h)}
for m in ("mass", "cost"):
    for h in (24, 40, 60):
        out.append(f"== {m} closure, horizon {h} weeks: point-weeks of closure and order")
        best, bv = S.best_orders_fast(m, h)
        for name, f in rules.items():
            o = best if f is None else (f(m, h) if name in ("myopic", "lookahead") else f(m))
            v = S.area(o, m, h)
            out.append(f"  {name:<9}{v*100:8.1f}  ({v/bv*100:5.1f}% of optimal)  {' > '.join(o)}")
        out.append("")
out.append("== stability: efforts scaled 0.5x to 2x (1000 draws); nominal optimal order vs each draw's optimum")
out.append(f"{'metric':<6}{'horizon':>8}  {'within 1%':>10}{'mean shortfall':>16}")
for m in ("mass", "cost"):
    for h in (24, 40):
        c, s = S.stability(m, h)
        out.append(f"{m:<6}{h:>8}  {c*100:9.0f}%{s*100:15.2f}%")
out.append("")
out.append("== cost closure (points) vs week: weeks, optimal, lookahead, frontier, myopic")
orders = [S.best_orders_fast("cost", 40)[0], S.lookahead_order("cost"), S.frontier_order("cost"), S.greedy_next("cost", 40)]
curves = [S.curve(o, "cost") for o in orders]
for w in range(0, 41, 2):
    out.append(f"{w:4d}" + "".join(f"{max(v for t, v in c if t <= w)*100:10.1f}" for c in curves))
text = "\n".join(out) + "\n"
print(text)
(pathlib.Path(__file__).parent / "results.txt").write_text(text)
