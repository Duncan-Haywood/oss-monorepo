"""Accuracy vs MAC-lane cells from results.txt; prints the Pareto front and writes accuracy_vs_cells.svg."""
import os
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

here = os.path.dirname(__file__)
rows = []
for ln in open(os.path.join(here, "results.txt")):
    if ln.startswith("#"):
        if "float" in ln:
            fl = float(ln.split("mean")[1].split()[0])
        continue
    t = ln.split()
    rows.append((int(t[0]), int(t[1]), float(t[2]), int(t[5])))
front = [r for r in rows if not any(o[3] <= r[3] and o[2] >= r[2] and (o[3], o[2]) != (r[3], r[2]) for o in rows)]
front.sort(key=lambda r: r[3])
print("pareto (wb ab acc cells):")
for r in front:
    print(*r)
for tol in (0.01, 0.02):
    ok = min((r for r in rows if r[2] >= fl - tol), key=lambda r: r[3])
    print(f"cheapest within {tol*100:.0f} pt of float {fl:.4f}: wb={ok[0]} ab={ok[1]} acc={ok[2]:.4f} cells={ok[3]}")
fig, ax = plt.subplots(figsize=(6.4, 4))
ax.scatter([r[3] for r in rows], [r[2] for r in rows], s=14, c="#999")
ax.step([r[3] for r in front], [r[2] for r in front], where="post", c="#1f77b4", label="Pareto front")
for r in front:
    ax.annotate(f"W{r[0]}A{r[1]}", (r[3], r[2]), fontsize=7, xytext=(3, -9), textcoords="offset points")
ax.axhline(fl, ls=":", c="k", lw=1, label="float32 model")
ax.set_ylim(0.85, 0.98); ax.set_xlabel("MAC-lane gate count (Yosys + ABC, generic gates)"); ax.set_ylabel("test accuracy (mean of 5 splits)")
ax.legend(fontsize=8); ax.set_title("sklearn digits, 64-16-10 MLP: accuracy vs lane area", fontsize=9)
fig.tight_layout(); fig.savefig(os.path.join(here, "accuracy_vs_cells.svg"))
