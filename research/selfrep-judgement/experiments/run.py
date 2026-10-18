import pathlib, sys
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1] / "src"))
from selfrep_judgement.judge import SHOP, drop_one, add_one, monte_carlo, score, base_makeable

pc = lambda x: f"{100*x:+.1f}"
out = [f"shop: {SHOP} (selfrep-closure BOM; masses/costs are its assumed placeholders, held fixed)", ""]
for variant in ("lm8uu", "brass"):
    s0, rows = drop_one(variant)
    out.append(f"== {variant}: baseline lines {100*s0['lines']:.1f}%  mass {100*s0['mass']:.1f}%  cost {100*s0['cost']:.1f}%")
    out.append("-- buy instead of make (change in points)")
    out.append(f"{'line':26}{'lines':>8}{'mass':>8}{'cost':>8}")
    for n, d in sorted(rows, key=lambda r: r[1]["mass"]):
        out.append(f"{n:26}{pc(d['lines']):>8}{pc(d['mass']):>8}{pc(d['cost']):>8}")
    allbuy = dict(base_makeable(variant))
    from selfrep_judgement.judge import JUDGED
    for n in JUDGED:
        allbuy[n] = False
    a = score(variant, allbuy)
    out.append(f"all judged lines bought: lines {100*a['lines']:.1f}%  mass {100*a['mass']:.1f}%  cost {100*a['cost']:.1f}%")
    _, adds = add_one(variant)
    out.append("-- top 8 vitamins by mass closure gained if made in-house (points)")
    for n, k, d in sorted(adds, key=lambda r: -r[2]["mass"])[:8]:
        out.append(f"{n:26}{k:>12}{pc(d['lines']):>8}{pc(d['mass']):>8}{pc(d['cost']):>8}")
    out.append("-- top 5 by cost closure gained")
    for n, k, d in sorted(adds, key=lambda r: -r[2]["cost"])[:5]:
        out.append(f"{n:26}{k:>12}{pc(d['lines']):>8}{pc(d['mass']):>8}{pc(d['cost']):>8}")
    out.append("-- Monte Carlo (5000 draws, seed 0): judged lines kept w.p. 0.5; arguable vitamins (fastener/rod/belt/other) made w.p. 0.1")
    mc = monte_carlo(variant)
    for k, t in mc.items():
        out.append(f"{k:6} 5-50-95%: " + " - ".join(f"{100*x:.1f}" for x in t))
    out.append("")
text = "\n".join(out)
print(text)
(pathlib.Path(__file__).parent / "results.txt").write_text(text + "\n")
