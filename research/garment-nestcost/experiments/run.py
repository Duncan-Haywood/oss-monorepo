"""Experiments for garment-nestcost. Writes experiments/results.txt. Run: PYTHONPATH=src python experiments/run.py"""
import os, sys, time
import numpy as np
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
from garment_nestcost import shell_pieces, lining_pieces, net_area_m2, cost_with_markers
from garment_nestcost import _paths  # noqa: F401
from dataclasses import replace
from garment_nesting.raster import anneal_raster, nest_raster, polygon_area
from garment_teardown.model import TRENCH, SCENARIOS, replica

OUT = []
def say(s=""):
    print(s, flush=True); OUT.append(s)

WIDTHS = [110, 140, 150]
SEEDS = range(5)
EVALS = 150
ALLOW = [0.0, 1.5]
t0 = time.time()

def marker(pieces, W):
    """Best-of-seeds annealed marker length (cm) and the per-seed lengths."""
    lens = []
    for sd in SEEDS:
        (order, flips), _ = anneal_raster(pieces, W, evals=EVALS, seed=sd)
        _, L, occ = nest_raster(pieces, W, order, flips)
        assert occ.max() <= 1.0 + 1e-6  # no overlap
        lens.append(L)
    return min(lens), lens

net_shell, net_lin = net_area_m2(shell_pieces()), net_area_m2(lining_pieces())
say("garment-nestcost: stylised lined coat (my own shapes), one ply, one size, grain kept (180-degree turns only), 2 cm raster.")
say(f"   net piece area: shell {net_shell:.3f} m^2 (10 pieces), lining {net_lin:.3f} m^2 (5 pieces). garment-teardown assumed 2.9 and 2.2 m^2 for its trench coat.")
say(f"   annealing: {EVALS} decodes, best of {len(list(SEEDS))} seeds. efficiency = NET piece area / (fabric width x marker length), the quantity garment-teardown calls marker_efficiency.")
say()
res = {}
say("A. Marker length and efficiency")
say("   part     W  allowance | marker length (best; all seeds)   | efficiency")
for part, fn, net in [("shell", shell_pieces, net_shell), ("lining", lining_pieces, net_lin)]:
    for W in WIDTHS:
        for a in ALLOW:
            L, lens = marker(fn(a), W)
            eff = net * 1e4 / (W * L)
            res[(part, W, a)] = (L, eff)
            say(f"   {part:6s} {W:4d}  {a:4.1f} cm  | {L:6.1f} cm ({', '.join(f'{x:.0f}' for x in lens)}) | {eff:.3f}")
say()
say("B. Cost of the teardown trench coat with the measured efficiencies (mid-wage scenario; all other inputs are garment-teardown's assumptions)")
s = SCENARIOS["mid-wage"]
base = cost_with_markers(TRENCH, s, TRENCH.marker_efficiency, TRENCH.marker_efficiency)
say(f"   garment-teardown as published: eff 0.80 both, FOB ${base['fob']:.0f}, model retail ${base['retail']:.0f}")
say("   scenario: our measured net areas (shell, lining) and efficiencies, seam allowance 1.5 cm")
say("   W     eff shell  eff lining | fabric $   lining $ |  FOB $  | model retail $ | FOB vs teardown")
g_meas = replace(TRENCH, piece_area_m2=net_shell, lining_area_m2=net_lin)
for W in WIDTHS:
    es, el = res[("shell", W, 1.5)][1], res[("lining", W, 1.5)][1]
    c = cost_with_markers(g_meas, s, es, el)
    say(f"   {W:4d}   {es:.3f}     {el:.3f}     | {c['fabric']:6.1f}  {c['lining']:6.1f}  | {c['fob']:6.1f}  | {c['retail']:8.0f}      | {100*(c['fob']/base['fob']-1):+.1f}%")
say()
say("   scenario: garment-teardown's own areas (2.9 m^2 shell, 2.2 m^2 lining) with the measured efficiencies transplanted")
for W in WIDTHS:
    es, el = res[("shell", W, 1.5)][1], res[("lining", W, 1.5)][1]
    c = cost_with_markers(TRENCH, s, es, el)
    say(f"   {W:4d}   {es:.3f}     {el:.3f}     | {c['fabric']:6.1f}  {c['lining']:6.1f}  | {c['fob']:6.1f}  | {c['retail']:8.0f}      | {100*(c['fob']/base['fob']-1):+.1f}%")
say()
say("C. Replica ($7/m^2 shell, $3/m^2 lining, $8 trims, 60% of sewing minutes; mid-wage) with measured areas and efficiencies")
rep0 = replica(TRENCH)
rb = cost_with_markers(rep0, s, 0.80, 0.80)
say(f"   garment-teardown replica as published (eff 0.80, areas 2.9/2.2): ${rb['fob']:.0f}")
rep = replica(g_meas)
for W in WIDTHS:
    for a in ALLOW:
        es, el = res[("shell", W, a)][1], res[("lining", W, a)][1]
        c = cost_with_markers(rep, s, es, el)
        say(f"   W={W:3d} allowance {a:3.1f} cm: shell eff {es:.3f}, lining eff {el:.3f}: cloth ${c['fabric']+c['lining']:5.1f}, total ${c['fob']:5.1f}")
say()
say("D. Shell cloth consumed at each fabric width (1.5 cm allowance)")
Ls = {W: res[('shell', W, 1.5)][0] for W in WIDTHS}
cons = {W: W * Ls[W] / 1e4 for W in WIDTHS}
for W in WIDTHS:
    say(f"   W={W}: {cons[W]:.3f} m^2 of shell cloth ({W} cm x {Ls[W]:.0f} cm)")
say(f"   spread (max-min)/min = {100*(max(cons.values())/min(cons.values())-1):.1f}%")
say(f"\nruntime {time.time()-t0:.0f} s")
with open(os.path.join(os.path.dirname(__file__), "results.txt"), "w") as f:
    f.write("\n".join(OUT) + "\n")
