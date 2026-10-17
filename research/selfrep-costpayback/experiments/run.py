"""Writes results.txt: cost-weighted payback of the recycling machines (all prices ASSUMED)."""
import math, os, random, sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
from selfrep_costpayback.cost import Prices, breakeven_filament_price, cost_paybacks, with_params
from selfrep_recyclers.machines import paybacks

OUT = os.path.join(os.path.dirname(__file__), "results.txt")
L = []
w = L.append
CASES = ["printer", "printer+cnc+laser", "printer+cnc+laser+casting"]
fmt = lambda x: "never" if x is None else f"{x:.0f}"

w("== payback in copies: by imported mass (selfrep-recyclers) vs by assumed cost; base parameters, eol=0 ==")
for sh in CASES:
    mp = paybacks("lm8uu", sh)
    for name, (cost, vshare, sav, n) in cost_paybacks("lm8uu", sh).items():
        w(f"{sh:28s} {name:18s} by mass {fmt(mp[name][2]):>4s} | by cost {fmt(n):>4s} (machines cost {cost:6.1f}, {100*vshare:.0f}% vitamins; saves {sav:.3f}/copy)")
w("")
w("== plastic pair, shop printer+cnc+laser: payback in copies by cost vs retired plastic (eol) and phi ==")
for eol in (0.0, 1.0):
    for phi in (0.3, 0.8):
        n = cost_paybacks("lm8uu", "printer+cnc+laser", with_params(eol=eol, phi=phi))["shredder+extruder"][3]
        w(f"eol={eol:.1f} phi={phi}: {fmt(n)} copies")
w("")
w("== filament price at which the plastic pair repays in N copies (eol=0, phi=0.3), shop printer+cnc+laser ==")
for N in (50, 20, 10):
    w(f"N={N:3d} copies: breakeven filament price {breakeven_filament_price('lm8uu', 'printer+cnc+laser', N):7.1f} per kg (base assumption 20)")
w("")
w("== Monte Carlo: filament, sheet, aluminium price and the vitamin price scale each log-uniform in [0.5, 2]; 2000 draws, seed 0 ==")
rng = random.Random(0)
f = lambda: math.exp(rng.uniform(math.log(.5), math.log(2)))
for sh in CASES[1:]:
    for eol in (0.0, 1.0):
        res = {}
        for _ in range(2000):
            pr = Prices(filament=20 * f(), sheet=3 * f(), aluminium=6 * f(), vitamin_scale=f())
            for name, (_, _, _, n) in cost_paybacks("lm8uu", sh, with_params(eol=eol), pr).items():
                res.setdefault(name, []).append(n)
        for name, xs in res.items():
            xs = sorted(xs)
            q = lambda p: xs[int(p * (len(xs) - 1))]
            w(f"{sh:28s} eol={eol:.0f} {name:18s} payback copies 5/50/95%: {q(.05):.0f} / {q(.5):.0f} / {q(.95):.0f}")
open(OUT, "w").write("\n".join(L) + "\n")
print("\n".join(L))
