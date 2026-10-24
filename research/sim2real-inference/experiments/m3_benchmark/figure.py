"""results/e_vs_rho.png: measured effective-sample multiplier E against the paired correlation, with the closed form
E = 1 / (1 - rho^2 (1 - n/N)) (n = 30, N = 300), and the 95% coverage of real-only and cv. python3 figure.py"""
import csv
import numpy as np
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

h2 = list(csv.DictReader(open("results/h2.csv")))
cov = list(csv.DictReader(open("results/coverage.csv")))
rho = np.array([float(r["rho"]) for r in h2])
Ep = np.array([float(r["E_paired"]) for r in h2])
Eu = np.array([float(r["E_unpaired"]) for r in h2])
fig, ax = plt.subplots(1, 2, figsize=(10, 4))
x = np.linspace(0, 0.95, 100)
ax[0].plot(x, 1 / (1 - x ** 2 * 0.9), "k-", lw=1, label="closed form, n=30, N=300")
ax[0].plot(rho, Ep, "o", color="#1b6ca8", label="paired twin runs")
ax[0].plot(rho, Eu, "s", color="#c0392b", ms=4, label="unpaired twin runs")
ax[0].axhline(1, color="grey", lw=0.6)
ax[0].set_xlabel("paired correlation rho"); ax[0].set_ylabel("effective-sample multiplier E"); ax[0].legend(fontsize=8)
ax[0].set_title("Value of the twin (21 MuJoCo pairs)")
for meth, c in (("real_only", "grey"), ("cv", "#1b6ca8"), ("ppi_pp", "#e67e22")):
    pts = {r["pair"]: (float(r["coverage_pct"])) for r in cov if r["n"] == "30" and r["twin_runs"] == "paired" and r["method"] == meth}
    ax[1].plot(rho, [pts[r["pair"]] for r in h2], "o", color=c, ms=4, label=meth)
ax[1].axhline(95, color="k", lw=0.6); ax[1].axhline(93, color="k", ls="--", lw=0.6)
ax[1].set_xlabel("paired correlation rho"); ax[1].set_ylabel("coverage of 95% interval, %"); ax[1].legend(fontsize=8)
ax[1].set_title("Coverage at n=30 (dashed: H1 floor 93%)")
fig.tight_layout(); fig.savefig("results/e_vs_rho.png", dpi=130)
print("wrote results/e_vs_rho.png")
