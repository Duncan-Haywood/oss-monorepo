"""Run the study; writes results.txt, results.json and kt.png next to this file."""
import json, os, sys
import numpy as np
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
from simdesign_holes.fem import Plate, MATERIALS, solve_plate
from simdesign_holes.design import PROCESSES, FREE, MODELS, size_plate, check_fe, kt_table, T_LOAD, W_MAX

HERE = os.path.dirname(__file__)
out, lines = {}, []
P = lambda s="": lines.append(s)

# 1. FE concentration factor against d/W, with mesh convergence and two reference values
P("1. Net-section stress concentration Kt_net from FE (W = 30 mm, steel properties; linear model, so material-independent)")
P("   d/W    n_hole=48  96    192   384   |  fit(*)  |  Kirsch limit 3")
conv = []
for dw in (0.05, 0.1, 0.2, 0.4, 0.6, 0.8):
    row = [solve_plate(Plate(W=30, d=30 * dw, n_hole=n), MATERIALS["steel sheet"])["kt_net"] for n in (48, 96, 192, 384)]
    fit = 3.0 - 3.14 * dw + 3.667 * dw ** 2 - 1.527 * dw ** 3
    conv.append({"d_over_W": dw, "kt_by_n_hole": row, "fit": fit})
    P(f"   {dw:4.2f}   " + "  ".join(f"{k:5.3f}" for k in row) + f"   |  {fit:5.3f}")
P("   (*) polynomial fit as recalled from the literature for a hole in a finite-width strip; coefficients NOT re-checked against the source")
out["kt_convergence"] = conv

# 2. Sizing under three stress models, each design re-checked by FE
P()
P(f"2. Lightest plate for a required hole d; load {T_LOAD:.0f} N, length 100 mm, width at most {W_MAX:.0f} mm. Utilisation = FE peak stress / working stress (>1 fails)")
rows = []
for pn, proc in PROCESSES.items():
    P(f"   {pn} ({proc.material})")
    P("     d    model         W      t     mass(g)  binding         util(FE)")
    for d in (4, 6, 8, 10, 12, 16):
        for model in MODELS:
            s = size_plate(proc, d, model, rules=True)
            if not s["feasible"]:
                P(f"    {d:3d}  {model:12s}  infeasible: {s['why']}")
                rows.append({"process": pn, "d": d, "model": model, **s})
                continue
            c = check_fe(proc, d, s)
            P(f"    {d:3d}  {model:12s} {s['W']:6.2f} {s['t']:5.2f} {s['mass_g']:8.2f}  {s['binding']:14s}  {c['utilisation']:5.2f}")
            rows.append({"process": pn, "d": d, "model": model, **s, **c})
out["sizing"] = rows

# 3. Mass price of the hole rules (FE model): same material, rules on vs off
P()
P("3. Mass price of hole rules (FE stress model): mass with process rules / mass with only the shared guards (same material)")
price = []
for pn, proc in PROCESSES.items():
    free = FREE[proc.material]
    for d in (6, 8, 10, 12, 16):
        a = size_plate(proc, d, "FE", rules=True)
        b = size_plate(free, d, "FE", rules=False)
        if a["feasible"] and b["feasible"]:
            price.append({"process": pn, "d": d, "price": a["mass_g"] / b["mass_g"], "binding": a["binding"], "mass_rules": a["mass_g"], "mass_free": b["mass_g"]})
            P(f"   {pn:14s} d={d:2d}  {a['mass_g']:6.2f} / {b['mass_g']:6.2f} = {a['mass_g'] / b['mass_g']:5.3f}   binding: {a['binding']}")
        else:
            P(f"   {pn:14s} d={d:2d}  infeasible ({(a if not a['feasible'] else b).get('why')})")
out["price"] = price

with open(os.path.join(HERE, "results.txt"), "w") as f:
    f.write("\n".join(lines) + "\n")
with open(os.path.join(HERE, "results.json"), "w") as f:
    json.dump(out, f, indent=1, default=float)
print("\n".join(lines))

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
x, y = kt_table()
fig, ax = plt.subplots(figsize=(5, 3.2))
ax.plot(x, y, "o-", label="FE (n_hole=192)")
ax.axhline(3.0, ls="--", c="grey", label="Kt = 3 (large plate)")
ax.axhline(1.0, ls=":", c="grey", label="net section")
ax.set_xlabel("d / W"); ax.set_ylabel("Kt on net-section stress"); ax.legend(); fig.tight_layout()
fig.savefig(os.path.join(HERE, "kt.png"), dpi=120)
