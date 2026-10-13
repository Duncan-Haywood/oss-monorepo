"""Experiments for simdesign-fidelity. Writes experiments/results.txt and fidelity.png."""
import os, sys, time
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
import numpy as np
from simdesign_fidelity.models import Material, Case, MODELS
from simdesign_fidelity.design import size_h, evaluate_design

HERE = os.path.dirname(__file__)
out = open(os.path.join(HERE, "results.txt"), "w")
def P(*a):
    s = " ".join(str(x) for x in a); print(s, flush=True); out.write(s + "\n"); out.flush()

mat = Material(); F = 100.0
t0 = time.time()

P("# E1. Response ratio to the 3D model (n=3 over depth). F=100 N, E=3000 MPa, nu=0.36")
P("# columns: L/h, b/h, 3D tip (mm), then tip ratio euler, timoshenko, fe2d; stress ratio (all models read the same top-fibre stress)")
P(f"{'L/h':>5} {'b/h':>5} {'3D tip':>9} {'EB':>7} {'Timo':>7} {'2D':>7} | {'3D sig':>7} {'EB sig':>7} {'2D sig':>7}")
for lh in (3, 5, 10, 20):
    for bh in (0.5, 2, 6):
        h = 10.0; L = lh * h; b = bh * h
        d3, s3 = MODELS["fe3d"](L, h, b, F, mat, 3)
        row = {m: MODELS[m](L, h, b, F, mat, 8 if m == "fe2d" else None) for m in ("euler", "timoshenko", "fe2d")}
        P(f"{lh:5d} {bh:5.1f} {d3:9.4f} {row['euler'][0]/d3:7.3f} {row['timoshenko'][0]/d3:7.3f} {row['fe2d'][0]/d3:7.3f} | {s3:7.3f} {row['euler'][1]/s3:7.3f} {row['fe2d'][1]/s3:7.3f}")

P("\n# E2. 3D discretisation: tip deflection (mm) and stress (MPa) vs elements over depth n")
for (L, h, b) in ((40, 8, 20), (80, 16, 60)):
    P(f"L={L} h={h} b={b}:", "; ".join(f"n={n}: {MODELS['fe3d'](L,h,b,F,mat,n)[0]:.5f}, {MODELS['fe3d'](L,h,b,F,mat,n)[1]:.3f}" for n in (2, 3, 4)))
    P(f"   2D n=4/8/16:", "; ".join(f"{MODELS['fe2d'](L,h,b,F,mat,n)[0]:.5f}" for n in (4, 8, 16)))

P("\n# E3. Minimum-depth design under tip deflection <= L/50 and top-fibre stress <= 20 MPa")
P("# h_model = chosen depth (mm); util = the 3D model's utilisation of each limit at that depth (>1 violates); regret = mass(model)/mass(3D) - 1")
P(f"{'L':>5} {'b':>4} | {'h3D':>6} (gov) | " + " | ".join(f"{m:>10} h  d_util s_util regret" for m in ("euler", "timoshenko", "fe2d")))
rows = []
for L in (20, 40, 80, 160):
    for b in (5, 20, 60):
        c = Case(L=L, b=b, F=F); dm = L / 50
        h3, hd3, hs3, _ = size_h("fe3d", c, dm, mat, 2)
        gov = "defl" if hd3 >= hs3 else "stress"
        cells = []
        for m in ("euler", "timoshenko", "fe2d"):
            h, hd, hs, _ = size_h(m, c, dm, mat)
            ev = evaluate_design(h, c, dm, mat, "fe3d", 2)
            cells.append((m, h, ev["defl_util"], ev["stress_util"], h / h3 - 1))
        rows.append((L, b, h3, gov, h3 / L, cells))
        P(f"{L:5d} {b:4d} | {h3:6.2f} ({gov:>6}) | " + " | ".join(f"{h:10.2f} {du:7.3f} {su:6.3f} {r:+7.1%}" for _, h, du, su, r in cells))
        P(f"      [{time.time()-t0:.0f} s elapsed]")

P("\n# E4. How much does the 3D answer move with mesh? Re-evaluate the E3 3D designs with n=3 (utilisation of the 3D n=2 optimum)")
for L, b, h3, gov, _, _ in rows[::3]:
    c = Case(L=L, b=b, F=F)
    ev = evaluate_design(h3, c, L / 50, mat, "fe3d", 3)
    P(f"L={L} b={b} h={h3:.2f}: n=3 defl util {ev['defl_util']:.3f}, stress util {ev['stress_util']:.3f}")

# figure
import matplotlib; matplotlib.use("Agg")
import matplotlib.pyplot as plt
fig, ax = plt.subplots(1, 3, figsize=(11, 3.4), sharey=True)
for j, b in enumerate((5, 20, 60)):
    sub = [r for r in rows if r[1] == b]
    for k, m in enumerate(("euler", "timoshenko", "fe2d")):
        ax[j].plot([r[0] for r in sub], [r[5][k][4] * 100 for r in sub], "o-", label=m)
    ax[j].axhline(0, color="k", lw=0.5); ax[j].set_xscale("log"); ax[j].set_title(f"width b = {b} mm"); ax[j].set_xlabel("length L (mm)")
ax[0].set_ylabel("depth vs 3D-optimal (%)"); ax[0].legend()
fig.tight_layout(); fig.savefig(os.path.join(HERE, "fidelity.png"), dpi=130)
P(f"\ntotal {time.time()-t0:.0f} s")
