"""Experiments for house-climatesweep. Deterministic, a few seconds.

    PYTHONPATH=src:../house-energy/src:../house-framing/src python experiments/run.py   (from research/house-climatesweep)
"""
from pathlib import Path

from house_energy import CLIMATES, SYSTEMS, Prices, baseline, evaluate, optimise
from house_climatesweep import DIMENSIONS, cdd_line, hdd_line, optimum_at, transitions

HERE = Path(__file__).resolve().parent
out = []
P = out.append
GAS, HP = "gas furnace + AC", "heat pump"
NAME = {"slab_r": "slab edge R-10", "attic_r": "attic", "ach50": "air tightness", "window_u": "windows", "wall": "wall"}


def show(t):
    x, d, a, b = t
    return f"{x:7,.0f}  {NAME[d]:15s} {a} -> {b}"


P("model: house-energy unchanged (640 packages, exact optimum at every climate); climate is the axis, (HDD65, CDD65) continuous")
P("optimum is found exactly as min over 640 linear functions of (HDD, CDD); scan step 25 degree-days, switches bisected to 0.5")

P("\nA. every upgrade switch along heating degree-days, CDD fixed at 500 (HDD 0 to 12,000)")
for s in (GAS, HP):
    P(f"{s}:   HDD    upgrade")
    for t in transitions(hdd_line(500), 0, 12000, s):
        P("  " + show(t))

P("\nB. every upgrade switch along cooling degree-days, HDD fixed at 500 (CDD 0 to 6,000)")
for s in (GAS, HP):
    P(f"{s}:   CDD    upgrade")
    for t in transitions(cdd_line(500), 0, 6000, s):
        P("  " + show(t))

P("\nC. saving of the cost-optimal package over the house-energy baseline, CDD 500 (USD, 30-year NPC)")
P(f"{'HDD':>6} {'gas':>8} {'heat_pump':>10}")
b = baseline()
for h in range(0, 12001, 1000):
    row = []
    for s in (GAS, HP):
        _, npc = optimum_at(h, 500, s)
        row.append(evaluate(b, (h, 500), s)["npc"] - npc)
    P(f"{h:6d} {row[0]:8.0f} {row[1]:10.0f}")

P("\nD. the same switches against the price of energy (gas furnace, CDD 500, HDD axis): HDD at which each switch happens")
keys = [("slab_r", 0, 10), ("ach50", 7.0, 5.0), ("ach50", 5.0, 3.0), ("attic_r", 19, 30), ("attic_r", 30, 38)]
P(f"{'energy x':>9} " + " ".join(f"{NAME[d][:7]} {a}>{c}".rjust(15) for d, a, c in keys))
for m in (0.5, 1.0, 2.0, 4.0):
    ts = transitions(hdd_line(500), 0, 12000, GAS, Prices(energy_mult=m), step=50)
    cells = []
    for d, a, c in keys:
        hit = [t[0] for t in ts if t[1] == d and t[2] == a and t[3] == c]
        cells.append(f"{hit[0]:,.0f}" if hit else "never")
    P(f"{m:9.1f} " + " ".join(c.rjust(15) for c in cells))

P("\nE. consistency: the sweep's optimum equals house-energy's exhaustive search in all 16 city/system cases")
ok = 0
for c, hc in CLIMATES.items():
    for s in SYSTEMS:
        bp, e = optimise(c, s)
        sp, npc = optimum_at(*hc, s)
        ok += (bp == sp) and abs(e["npc"] - npc) < 1e-6
P(f"  {ok} of 16 identical (package and NPC)")

P("\nF. where the eight cities sit: upgrades each city's optimum already has (gas furnace)")
for c, hc in CLIMATES.items():
    p = optimum_at(*hc, GAS)[0]
    P(f"  {c:18s} HDD {hc[0]:5d} CDD {hc[1]:5d}  attic R-{p.attic_r}, {p.ach50:g} ACH50, slab {'R-10' if p.slab_r else 'bare'}, wall {p.wall}, window U {p.window_u:.2f}")

(HERE / "results.txt").write_text("\n".join(out) + "\n")
print("\n".join(out))
