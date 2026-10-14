"""Experiments for garment-markercost. Writes experiments/results.txt.
Run: PYTHONPATH=src:../garment-nesting/src:../garment-teardown/src python experiments/run.py"""
import os, time
from garment_markercost import *
from garment_teardown.model import TRENCH, COAT

OUT = []
def say(s=""):
    print(s, flush=True); OUT.append(s)

EVALS, SEEDS = 120, (0, 1, 2)
t0 = time.time()
say("garment-markercost: stylised pieces, 2 cm raster, annealing %d decodes x seeds %s (best kept)" % (EVALS, SEEDS))

say("\nExperiment A: seam allowance. Efficiency = finished-pattern area / (width x marker length).")
say("garment  width  allowance  marker_cm  efficiency  cloth_m2")
effA = {}
for name, fn in (("shirt", shirt), ("skirt", skirt)):
    pat = fn()
    for W in (140,):
        for d in (0.0, 1.0, 1.5):
            L = marker(with_allowance(pat, d), W, EVALS, SEEDS)
            e = efficiency(pat, L, W); effA[(name, W, d)] = e
            say("%-7s %5d  %9.1f  %9.0f  %10.3f  %8.3f" % (name, W, d, L, e, W * L / 1e4))

say("\nExperiment B: mixed sizes. Three shirts at linear scale 0.94 / 1.00 / 1.06, 1 cm allowance, width 140.")
sizes = [scaled(shirt(), s) for s in (0.94, 1.0, 1.06)]
W, d = 140, 1.0
sep = [marker(with_allowance(p, d), W, EVALS, SEEDS) for p in sizes]
allp = [q for p in sizes for q in p]
comb = marker(with_allowance(allp, d), W, EVALS, SEEDS)
area = pattern_area_m2(allp)
say("separate markers: %s cm, total %.0f cm, efficiency %.3f" % ([round(x) for x in sep], sum(sep), area / (W * sum(sep) / 1e4)))
say("one combined marker: %.0f cm, efficiency %.3f" % (comb, area / (W * comb / 1e4)))
say("length saved by mixing: %.1f%%" % (100 * (1 - comb / sum(sep))))

say("\nExperiment C: what the measured efficiencies do to teardown's fabric cost (what-if on the two coats).")
say("These are the coats' assumed areas and prices with the shirt/skirt efficiencies swapped in; the coats'")
say("own markers were not nested, so this is sensitivity, not a measurement of coat cloth use.")
say("garment                                   eff   fabric_cost_usd")
for g, price in ((TRENCH, TRENCH.shell_price_per_m2), (COAT, COAT.shell_price_per_m2), (TRENCH, 7.0)):
    for lab, e in (("assumed", g.marker_efficiency), ("shirt 1cm seam", effA[("shirt", 140, 1.0)]),
                   ("skirt 1cm seam", effA[("skirt", 140, 1.0)]), ("mixed-size shirt", area / (W * comb / 1e4))):
        say("%-34s %-17s %.3f   %7.2f" % ((g.name[:30] + " $%g/m2" % price), lab, e, fabric_cost_per_garment(g, e, price)))
say("\nelapsed %.0f s" % (time.time() - t0))
open(os.path.join(os.path.dirname(__file__), "results.txt"), "w").write("\n".join(OUT) + "\n")
