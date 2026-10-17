import sys, pathlib
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1] / "src"))
from selfrep_closure.bom import SHOPS
from selfrep_closure.closure import closure, sensitivity, vitamins, feedstock

out = []
for variant in ("lm8uu", "brass"):
    out.append(f"== bearing variant: {variant}")
    out.append(f"{'shop':28} lines  units  mass(assumed, 5-50-95%)      cost(assumed, 5-50-95%)")
    for shop, procs in SHOPS.items():
        c, tot = closure(variant, procs)
        s = sensitivity(variant, procs)
        f = lambda t: "-".join(f"{100*x:.0f}" for x in t)
        out.append(f"{shop:28} {100*c['lines']:4.1f}% {100*c['units']:5.1f}%  {100*c['mass']:4.1f}% [{f(s['mass'])}]%   {100*c['cost']:4.1f}% [{f(s['cost'])}]%")
    out.append(f"totals: {int(tot['lines'])} lines, {int(tot['units'])} units")
    out.append("feedstock imported (largest shop): " + ", ".join(feedstock(variant, SHOPS['printer+cnc+laser+casting'])))
    out.append("vitamins (largest shop): " + "; ".join(f"{p.qty}x {p.name}" for p in vitamins(variant, SHOPS['printer+cnc+laser+casting'])))
    out.append("")
text = "\n".join(out)
print(text)
(pathlib.Path(__file__).parent / "results.txt").write_text(text + "\n")
