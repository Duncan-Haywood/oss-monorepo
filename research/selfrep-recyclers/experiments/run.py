"""Writes results.txt: payback of recycling machines (assumed part lists) in the three seed shops."""
import math, os, random, sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
from selfrep_recyclers import machines as M
from selfrep_recyclers.machines import MACHINES, PLASTIC_PAIR, SHOPS, machine_mass_kg, paybacks, per_copy_saving, with_params

OUT = os.path.join(os.path.dirname(__file__), "results.txt")
L = []
w = L.append
CASES = [("printer", "lm8uu"), ("printer+cnc+laser", "lm8uu"), ("printer+cnc+laser+casting", "lm8uu")]
fmt = lambda x: "never" if x is None else f"{x:.0f}"

w("== machine masses (ASSUMED part lists), kg: vitamins / made in shop, by shop ==")
for n in MACHINES:
    tot = sum(p.qty * p.mass_g for p in MACHINES[n]) / 1000
    cells = []
    for sh, _ in CASES:
        v, m = machine_mass_kg([n], SHOPS[sh])
        cells.append(f"{sh}: {v:.2f}/{m:.2f}")
    w(f"{n:9s} total {tot:.2f} kg | " + " | ".join(cells))
w("")
w("== copies needed to repay the recyclers' own imports (base parameters; own scrap only, eol=0) ==")
for sh, var in CASES:
    for name, (imp, sav, n) in paybacks(var, sh).items():
        w(f"{sh:28s} {name:18s} imports {imp:5.2f} kg, saves {sav:.3f} kg/copy -> payback {fmt(n)} copies")
w("")
w("== plastic pair payback vs retired plastic per copy (eol), shop printer+cnc+laser ==")
for eol in (0.0, 0.5, 1.0, 2.0):
    for phi in (0.3, 0.8):
        imp, sav, n = paybacks("lm8uu", "printer+cnc+laser", with_params(eol=eol, phi=phi))["shredder+extruder"]
        w(f"eol={eol:3.1f} phi={phi}: saves {sav:.3f} kg/copy -> payback {fmt(n)} copies")
w("")
w("== Monte Carlo: machine part masses scaled by independent log-uniform factors in [0.5, 2]; 2000 draws, seed 0 ==")
rng = random.Random(0)
orig = {k: list(v) for k, v in MACHINES.items()}
for sh, var in CASES[1:]:
    for eol in (0.0, 1.0):
        res = {}
        for _ in range(2000):
            for k in MACHINES:
                MACHINES[k] = [type(p)(p.name, p.qty, p.kind, p.mass_g * math.exp(rng.uniform(math.log(.5), math.log(2))),
                                       p.cost, p.makers, p.why, p.variant, p.feedstock) for p in orig[k]]
            for name, (_, _, n) in paybacks(var, sh, with_params(eol=eol)).items():
                res.setdefault(name, []).append(n)
        for name, xs in res.items():
            xs = sorted(xs)
            q = lambda f: xs[int(f * (len(xs) - 1))]
            w(f"{sh:28s} eol={eol} {name:18s} payback copies 5/50/95%: {q(.05):.0f} / {q(.5):.0f} / {q(.95):.0f}")
for k in MACHINES:
    MACHINES[k] = orig[k]
w("")
w("== one more copy of the shop's own machines (printer + recyclers): imported mass share that is vitamins ==")
for sh, var in CASES:
    procs = SHOPS[sh]
    names = PLASTIC_PAIR + (("furnace",) if "cast" in procs else ())
    v, m = machine_mass_kg(names, procs)
    w(f"{sh:28s} recyclers {', '.join(names)}: {v:.2f} kg vitamins, {m:.2f} kg made ({100*v/(v+m):.0f}% vitamin)")
open(OUT, "w").write("\n".join(L) + "\n")
print("\n".join(L))
